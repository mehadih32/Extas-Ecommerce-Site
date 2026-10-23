// PR 58 — Find My Size on the page: offered only with a chart it can read, the store's rules from `pdp.finder`, the
// kept answer, the steppers' range, and the reasons in English and Bengali with the numbers in bold. SIM-F-012: the
// Bengali size question from the simulation gets the size the page's own finder gives on the sample chart.
import { describe, expect, it } from 'vitest';
import { answerSizeText } from '@extas/catalogue/size-finder';
import { registry } from '@extas/settings';
import sample from '../../../../../packages/seed/data/sample-catalogue.json';
import { shopT } from './dict';
import { digitsOf, type PdpChart, type PdpModel } from './product-model';
import {
  bodyWords,
  canStep,
  clampBody,
  feetInches,
  finderChart,
  finderOffered,
  finderRules,
  fitCookieValue,
  heightCm,
  readFit,
  reasonLines,
  sizeFor,
  startBody,
  stepBody,
  type ReasonWords,
} from './pdp-finder';

const F = registry['pdp.finder'].default;

/** A sample chart as the page reads it (inches; cm only for the cm line). */
function chartOf(key: string): PdpChart {
  const c = sample.sizeCharts.find((x) => x.key === key)!;
  return {
    name: c.name,
    easeInch: c.easeInch!,
    fields: c.columns.map((k) => ({ key: k, label: k[0]!.toUpperCase() + k.slice(1), howTo: null })),
    rows: c.rows.map((r) => ({ size: r.size, inch: r.values, cm: r.values.map((v) => Math.round(v * 2.54)) })),
  };
}
const polo = chartOf('polo-regular');
const chino = chartOf('chino-slim');
const sizes = (keys: string[]) => keys.map((k) => ({ key: k, label: k.toUpperCase() }));
const model = (chart: PdpChart | null, garment: string | null, keys = chart?.rows.map((r) => r.size) ?? ['os']) =>
  ({ chart, garment, sizes: sizes(keys), onSale: true }) as Pick<PdpModel, 'chart' | 'garment' | 'sizes' | 'onSale'>;

function words(lang: 'en' | 'bn', unit: 'inch' | 'cm' = 'inch', garment: string | null = 'polo'): Omit<ReasonWords, 'height' | 'weight'> {
  const t = shopT(lang);
  return {
    w: (k, v) => t(k.startsWith('finder.') ? k : `pdp.${k}`, v),
    has: (k) => t.has(k),
    num: (n) => digitsOf(n, lang === 'bn'),
    unit,
    label: (s) => s.toUpperCase(),
    low: (l) => (lang === 'bn' ? l : l.toLowerCase()),
    garment,
    lengthField: F.length.field,
  };
}

describe('Find My Size on the product page (PR 58)', () => {
  it('is offered only with a chart it can answer from, more than one size, on sale, and switched on', () => {
    expect(finderOffered(model(polo, 'polo'), F)).toBe(true);
    expect(finderOffered(model(null, 'socks'), F)).toBe(false);
    expect(finderOffered(model(polo, 'polo', ['l']), F)).toBe(false);
    expect(finderOffered({ ...model(polo, 'polo'), onSale: false }, F)).toBe(false);
    expect(finderOffered(model(polo, 'polo'), { ...F, on: false })).toBe(false);
    // a chart with neither chest nor waist: no answer, so no finder (never an invented size)
    const hips: PdpChart = { ...polo, fields: [{ key: 'hip', label: 'Hip', howTo: null }], rows: polo.rows.map((r) => ({ ...r, inch: [r.inch[0]!], cm: [r.cm[0]!] })) };
    expect(finderOffered(model(hips, 'polo'), F)).toBe(false);
  });

  it("gives the demo's answers from the owner's chart and its own ease", () => {
    expect(sizeFor(model(polo, 'polo'), F, { heightIn: 67, weightKg: 66 })?.size).toBe('l');
    expect(sizeFor(model(chino, 'trouser'), F, { heightIn: 67, weightKg: 70 })?.size).toBe('w32');
    // a bigger body than the chart: its largest size, said to be close
    const big = sizeFor(model(polo, 'polo'), F, { heightIn: 72, weightKg: 150 })!;
    expect([big.size, big.covered, big.next]).toEqual(['xxl', false, null]);
    // the length line off in the setting: no length verdict
    expect(sizeFor(model(polo, 'polo'), { ...F, length: { ...F.length, on: false } }, { heightIn: 67, weightKg: 66 })?.length).toBeNull();
    expect(finderRules(F).length.field).toBe('length');
    expect(finderChart(null)).toBeNull();
  });

  it('keeps the answer as two whole numbers, in range, and reads back only a sound one', () => {
    expect(fitCookieValue({ heightIn: 67, weightKg: 66 })).toBe('67.66');
    expect(readFit('67.66', F)).toEqual({ heightIn: 67, weightKg: 66 });
    expect(readFit('67.150', F)).toEqual({ heightIn: 67, weightKg: 150 });
    expect(readFit('99.66', F)).toBeNull();
    expect(readFit('67.20', F)).toBeNull();
    expect(readFit('x', F)).toBeNull();
    expect(readFit(undefined, F)).toBeNull();
    expect(startBody(null, F)).toEqual({ heightIn: 67, weightKg: 66 });
    expect(startBody({ heightIn: 70, weightKg: 80 }, F)).toEqual({ heightIn: 70, weightKg: 80 });
    expect(clampBody({ heightIn: 100, weightKg: 10 }, F)).toEqual({ heightIn: 84, weightKg: 35 });
  });

  it('steps a foot, an inch or a kilogram, and stops at the ends of the range', () => {
    const b = { heightIn: 67, weightKg: 66 };
    expect(stepBody(b, 'ft', 1, F)).toEqual({ heightIn: 79, weightKg: 66 });
    expect(stepBody(b, 'in', -1, F)).toEqual({ heightIn: 66, weightKg: 66 });
    expect(stepBody(b, 'kg', 1, F)).toEqual({ heightIn: 67, weightKg: 67 });
    expect(stepBody({ heightIn: 80, weightKg: 66 }, 'ft', 1, F).heightIn).toBe(84);
    expect(canStep({ heightIn: 84, weightKg: 66 }, 'in', 1, F)).toBe(false);
    expect(canStep({ heightIn: 54, weightKg: 35 }, 'kg', -1, F)).toBe(false);
    expect(canStep({ heightIn: 54, weightKg: 35 }, 'kg', 1, F)).toBe(true);
    expect(feetInches(67)).toEqual({ ft: 5, inch: 7 });
    expect(heightCm(67)).toBe(170);
  });

  it('says why in plain English: the chest it needs, the room for this fit, and the length for the height', () => {
    const b = { heightIn: 67, weightKg: 66 };
    const rec = sizeFor(model(polo, 'polo'), F, b)!;
    const t = shopT('en');
    const lines = reasonLines(rec, polo, { ...words('en'), ...bodyWords(b, (k, v) => t(k, v), (n) => String(n)) });
    expect(lines).toEqual([
      '**Chest 42"** — for 5\'7" and 66 kg you need about 41.1" (chest about 37.1" + 4" room for this fit). L is the closest size that covers it.',
      '**Length 29"** — right for 5\'7": ends at mid-hip.',
    ]);
    const cm = reasonLines(rec, polo, { ...words('en', 'cm'), ...bodyWords(b, (k, v) => t(k, v), (n) => String(n)) });
    expect(cm[0]).toContain('**Chest 107 cm**');
    expect(cm[0]).toContain('about 104 cm');
  });

  it('the largest size says it may feel close; a garment with no words of its own gets the plain length line', () => {
    const b = { heightIn: 67, weightKg: 150 };
    const rec = sizeFor(model(polo, 'polo'), F, b)!;
    const t = shopT('en');
    const lines = reasonLines(rec, polo, { ...words('en', 'inch', 'kurta'), ...bodyWords(b, (k, v) => t(k, v), (n) => String(n)) });
    expect(lines[0]).toContain('XXL is our biggest size in this fit');
    expect(lines[1]).not.toContain(':');
  });

  it('says it in Bengali with Bengali digits', () => {
    const b = { heightIn: 67, weightKg: 66 };
    const rec = sizeFor(model(polo, 'polo'), F, b)!;
    const t = shopT('bn');
    const num = (n: number | string) => digitsOf(n, true);
    const bnNames: Record<string, string> = { chest: 'বুক', length: 'লম্বা', shoulder: 'কাঁধ', sleeve: 'হাতা' };
    const poloBn: PdpChart = { ...polo, fields: polo.fields.map((f) => ({ ...f, label: bnNames[f.key] ?? f.key })) };
    const lines = reasonLines(rec, poloBn, { ...words('bn'), label: (s) => s.toUpperCase(), ...bodyWords(b, (k, v) => t(k, v), num) });
    expect(lines[0]).toContain('৫\'৭"');
    expect(lines[0]).toContain('৬৬ কেজি');
    expect(lines[0]).toContain('৪১.১"');
    expect(lines[0]).toContain('**বুক ৪২"**');
    expect(lines[0]).not.toMatch(/[A-Za-z]{2,}/);
    expect(lines[1]).toContain('কোমরের একটু নিচে');
  });
});

describe('SIM-F-012 · a size question in chat gets the size Find My Size gives (PR 58 acceptance)', () => {
  const rules = finderRules(F);
  const chart = finderChart(polo);
  it.each([
    ['উচ্চতা ৫ ফুট ৬, ওজন ৬৫', 'l'],
    ["5'7\" 66kg", 'l'],
    ['ami 5.7, 68 kg, kon size nibo?', 'l'],
    ['height 5 feet 4 inch weight 58', 'm'],
    ['170 cm 72 kg', 'l'],
    ['5 ft 10 in, 80kg', 'xl'],
  ])('%s → %s', (text, size) => {
    const a = answerSizeText(text, chart, rules, 'polo');
    expect(a?.rec.size).toBe(size);
    // the chat answer and the page's finder give the same size for the same body
    expect(sizeFor(model(polo, 'polo'), F, { heightIn: a!.heightIn, weightKg: a!.weightKg })?.size).toBe(size);
  });

  it('a question with no height or no weight gets no size (the drafter asks for it instead of guessing)', () => {
    expect(answerSizeText('which size should I take?', chart, rules, 'polo')).toBeNull();
    expect(answerSizeText('ওজন ৬৫', chart, rules, 'polo')).toBeNull();
    expect(answerSizeText('উচ্চতা ৫ ফুট ৬, ওজন ৬৫', finderChart(null), rules, 'socks')).toBeNull();
  });
});
