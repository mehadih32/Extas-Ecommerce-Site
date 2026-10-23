// PR 58 — Find My Size, rule-based: the demo's answers on the sample charts, the chart as the only source of a size,
// the length line, and the SIM-F-012 acceptance test (a size question in Bengali, Banglish or English gets the size
// Find My Size gives, never "I don't have the answer").
import { describe, expect, it } from 'vitest';
import { answerSizeText, bodyModelFor, canRecommend, parseBodyText, recommendSize, westernDigits, type FinderChart, type FinderRules } from '../src/size-finder';

// the `pdp.finder` defaults (the demo's recommendSize and PDP_LEN)
const RULES: FinderRules = {
  body: [
    { field: 'chest', kind: 'top', baseCm: 52, perKgCm: 0.55, perHeightCm: 0.035 },
    { field: 'waist', kind: 'bottom', baseCm: 26, perKgCm: 0.7, perHeightCm: 0.02 },
  ],
  toleranceInch: 0.5,
  length: { field: 'length', toleranceInch: 1, topRatio: 0.42, bottomRatio: 0.59, byGarment: { polo: 0.42, panjabi: 0.6, trouser: 0.59 } },
};

// the sample "Polo · Regular fit" (ease 4) and "Chino · Slim" (ease 1)
const polo: FinderChart = {
  fields: [{ key: 'chest' }, { key: 'length' }, { key: 'shoulder' }, { key: 'sleeve' }],
  rows: [
    { size: 's', inch: [38, 27, 16.5, 7.5] },
    { size: 'm', inch: [40, 28, 17, 8] },
    { size: 'l', inch: [42, 29, 18, 8.25] },
    { size: 'xl', inch: [44, 30, 19, 8.5] },
    { size: 'xxl', inch: [46, 31, 20, 8.75] },
  ],
  easeInch: 4,
};
const chino: FinderChart = {
  fields: [{ key: 'waist' }, { key: 'hip' }, { key: 'thigh' }, { key: 'length' }, { key: 'legOpening' }],
  rows: [
    { size: 'w30', inch: [30, 39, 23, 40, 13] },
    { size: 'w32', inch: [32, 41, 24, 40.5, 13.5] },
    { size: 'w34', inch: [34, 43, 25, 41, 14] },
    { size: 'w36', inch: [36, 45, 26, 41.5, 14.5] },
  ],
  easeInch: 1,
};

describe('recommendSize', () => {
  it('gives the demo answer: 5\'7" and 66 kg on the regular polo is L, with the numbers it says', () => {
    const r = recommendSize(polo, 67, 66, RULES, 'polo')!;
    expect(r.size).toBe('l');
    expect(r.next).toBe('xl');
    expect(r).toMatchObject({ field: 'chest', kind: 'top', value: 42, need: 41.1, body: 37.1, ease: 4, covered: true });
    expect(r.length).toEqual({ value: 29, verdict: 'ok', more: 1 });
  });

  it('takes the smallest size that covers the need, within the half-inch tolerance', () => {
    expect(recommendSize(polo, 64, 55, RULES)!.size).toBe('m');
    expect(recommendSize(polo, 60, 45, RULES)!.size).toBe('s');
  });

  it('answers the largest size, marked not covered, when nothing is big enough', () => {
    const r = recommendSize(polo, 72, 120, RULES)!;
    expect(r).toMatchObject({ size: 'xxl', next: null, covered: false });
  });

  it('reads a bottom by its waist, with its own ease and length ratio', () => {
    const r = recommendSize(chino, 67, 70, RULES, 'trouser')!;
    expect(r).toMatchObject({ size: 'w32', field: 'waist', kind: 'bottom' });
    expect(r.length?.verdict).toBe('ok');
  });

  it('says long or short against the height', () => {
    expect(recommendSize(polo, 60, 70, RULES)!.length?.verdict).toBe('long');
    expect(recommendSize(polo, 78, 50, RULES)!.length).toMatchObject({ verdict: 'short' });
  });

  it('never invents a size: no chart, no usable measure or no answer means null', () => {
    expect(recommendSize(null, 67, 66, RULES)).toBeNull();
    const socks: FinderChart = { fields: [{ key: 'footLength' }], rows: [{ size: 'one', inch: [10] }], easeInch: 0 };
    expect(canRecommend(socks, RULES)).toBe(false);
    expect(recommendSize(socks, 67, 66, RULES)).toBeNull();
    expect(recommendSize({ ...polo, rows: polo.rows.map((r) => ({ ...r, inch: [null, ...r.inch.slice(1)] })) }, 67, 66, RULES)).toBeNull();
    expect(recommendSize(polo, 0, 66, RULES)).toBeNull();
  });

  it('skips the rows the chart has no value for and uses the first model the chart can answer', () => {
    expect(bodyModelFor(chino, RULES)?.model.field).toBe('waist');
    const gaps: FinderChart = { ...polo, rows: polo.rows.map((r) => (r.size === 'l' ? { ...r, inch: [null, 29, 18, 8.25] } : r)) };
    expect(recommendSize(gaps, 67, 66, RULES)!.size).toBe('xl');
  });

  it('follows the owner\'s rules: a roomier ease or a larger tolerance moves the answer', () => {
    expect(recommendSize({ ...polo, easeInch: 6 }, 67, 66, RULES)!.size).toBe('xl');
    expect(recommendSize(polo, 67, 66, { ...RULES, toleranceInch: 1.5 })!.size).toBe('m');
  });
});

describe('parseBodyText (SIM-F-012)', () => {
  it.each([
    ['উচ্চতা ৫ ফুট ৬, ওজন ৬৫', 66, 65],
    ['amar height 5 feet 8 inch weight 70', 68, 70],
    ["5'6\" 65kg", 66, 65],
    ['ami 5.7, 68 kg', 67, 68],
    ['170 cm 72 kg', 67, 72],
    ['৫ ফুট ১০ ইঞ্চি, ৮০ কেজি — কোন সাইজ?', 70, 80],
    ['height 5.4 ojon 58', 64, 58],
  ])('%s', (text, h, w) => {
    expect(parseBodyText(text)).toEqual({ heightIn: h, weightKg: w });
  });

  it('asks instead of guessing when a number is missing or impossible', () => {
    expect(parseBodyText('what size should I take?')).toBeNull();
    expect(parseBodyText('5 feet 7')).toBeNull();
    expect(parseBodyText('65 kg')).toBeNull();
    expect(parseBodyText('9 ft 2, 65 kg')).toBeNull();
  });

  it('reads Bengali digits', () => {
    expect(westernDigits('৫ ফুট ৬')).toBe('5 ফুট 6');
  });

  it('answers the simulation\'s Bengali size question with the size Find My Size gives (L)', () => {
    const a = answerSizeText('উচ্চতা ৫ ফুট ৬, ওজন ৬৫', polo, RULES, 'polo');
    expect(a).not.toBeNull();
    expect(a!.rec.size).toBe('l');
    expect(a!.rec.size).toBe(recommendSize(polo, 66, 65, RULES, 'polo')!.size);
    expect(answerSizeText('cancel korte chai', polo, RULES)).toBeNull();
  });
});
