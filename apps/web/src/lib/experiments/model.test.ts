// S02 · PR 83 — the A/B test's pure rules: version B never touches money (prices, offers, payment, delivery), a test is
// checked whole, a visitor always sees the same version in the right share, B lies over the settings without touching
// anything else, two tests never change the same thing, and the result is only as sure as the numbers say.
import { describe, expect, it } from 'vitest';
import { EYE_TOGGLES } from '@extas/settings';
import { WORD_KEYS, defaultWord } from '../website/words';
import { bucket, checkB, clash, keysOf, merged, moneyText, overlay, parseTest, storedB, TESTABLE_EYE, testableEye, testableWord, verdict } from './model';

const NOTE = 'pdp.colour:note';
const WA = 'shell.header:icons.#whatsapp.on';
const word = WORD_KEYS.find((k) => testableWord(k) && !/\{/.test(defaultWord('en', k)))!;

describe('A/B tests never touch money (CLAUDE.md rule 6)', () => {
  it('leaves out every eye-toggle about prices, offers, payment or delivery', () => {
    const out = EYE_TOGGLES.filter((t) => !TESTABLE_EYE.includes(t)).map((t) => t.id);
    expect(out).toEqual(expect.arrayContaining(['pdp.price:payLine.on', 'pdp.price:discountAfterBar', 'pdp.sweep:freeDelivery', 'bag.freeProgress.enabled:', 'account.offerBanner:enabled']));
    expect(testableEye(NOTE)).toBe(true);
    expect(testableEye('no.such:thing')).toBe(false);
    expect(TESTABLE_EYE.length).toBeGreaterThan(80);
  });

  it('knows money words in both languages, numbers and amount slots', () => {
    for (const s of ['Free delivery', 'Save 20%', '৳ 500', 'Cash on delivery', 'ক্যাশ অন ডেলিভারি', '২০০ টাকা ছাড়', 'Over {freeOver}', '{n} items', 'Pay now', 'অফার'])
      expect(moneyText(s), s).toBe(true);
    for (const s of ['New in', 'Add to bag', 'ব্যাগে নিন', 'Shop the look', 'Size guide', 'সাইজ গাইড', 'Hello {name}']) expect(moneyText(s), s).toBe(false);
  });

  it('refuses a word whose shop word or new word speaks of money', () => {
    const money = WORD_KEYS.find((k) => moneyText(defaultWord('en', k)))!;
    expect(testableWord(money)).toBe(false);
    expect(checkB({ words: { [money]: { en: 'Something else' } } }).bad).toEqual([`words.${money}`]);
    expect(checkB({ words: { [word]: { en: 'Now 50% off' } } }).bad).toEqual([`words.${word}.en`]);
    expect(checkB({ words: { [word]: { bn: 'ফ্রি ডেলিভারি' } } }).bad).toEqual([`words.${word}.bn`]);
    expect(checkB({ eye: { 'pdp.price:discountAfterBar': true } }).bad).toEqual(['eye.pdp.price:discountAfterBar']);
  });
});

describe('writing a test', () => {
  const good = { name: 'Colour note on the product page', goal: 'addToBag', shareB: 50, endsOn: null, note: '', b: { eye: { [NOTE]: true }, words: { [word]: { en: 'A calmer word' } } } };

  it('takes a whole test and names every bad field', () => {
    const ok = parseTest(good);
    expect(ok.bad).toEqual([]);
    expect(ok.input.b).toEqual({ eye: { [NOTE]: true }, words: { [word]: { en: 'A calmer word' } } });
    const bad = parseTest({ ...good, name: ' ', goal: 'clicks', shareB: 100, endsOn: '2026-13-45', b: { eye: { 'x:y': true }, words: {} } });
    expect(bad.bad).toEqual(['name', 'goal', 'shareB', 'endsOn', 'eye.x:y']);
    expect(parseTest({ ...good, b: { eye: {}, words: {} } }).bad).toEqual(['b']);
  });

  it('refuses a new {slot}, a word as the shop has it, and too many changes', () => {
    expect(checkB({ words: { [word]: { en: 'Hello {name}' } } }).bad).toEqual([`words.${word}.en`]);
    expect(checkB({ words: { [word]: { en: defaultWord('en', word) } } }).bad).toEqual([`words.${word}`]);
    const many = Object.fromEntries(TESTABLE_EYE.slice(0, 21).map((t) => [t.id, false]));
    expect(checkB({ eye: many }).bad).toContain('eye');
  });

  it('reads back only what is still testable', () => {
    expect(storedB({ b: { eye: { [NOTE]: true, 'pdp.price:payLine.on': false }, words: {} } })).toEqual({ eye: { [NOTE]: true }, words: {} });
    expect(storedB(null)).toEqual({ eye: {}, words: {} });
  });

  it('finds two tests that change the same thing, and the settings B touches', () => {
    const x = { eye: { [NOTE]: true }, words: { [word]: { en: 'One' } } };
    expect(clash(x, { eye: { [NOTE]: false }, words: {} })).toEqual([NOTE]);
    expect(clash(x, { eye: { [WA]: false }, words: {} })).toEqual([]);
    expect(keysOf(x).sort()).toEqual(['language.labels', 'pdp.colour']);
  });
});

describe('which version a visitor sees', () => {
  it('is the same every time and B for about its share', () => {
    expect(bucket('t1', 'visitor-aaaaaaaaaaaaaaaa', 30)).toBe(bucket('t1', 'visitor-aaaaaaaaaaaaaaaa', 30));
    let b = 0;
    for (let i = 0; i < 4000; i++) if (bucket('t1', `v${i}-xxxxxxxxxxxxxxxx`, 30) === 'b') b++;
    expect(b / 4000).toBeGreaterThan(0.27);
    expect(b / 4000).toBeLessThan(0.33);
    expect(bucket('t1', 'anyone-xxxxxxxxxxxx', 0)).toBe('a');
  });

  it('lays B over a setting without touching its other values', () => {
    const header = { icons: [{ id: 'whatsapp', on: true }, { id: 'search', on: true }], logo: 'x' };
    const out = overlay({ eye: { [WA]: false }, words: {} }, 'shell.header', header) as typeof header;
    expect(out.icons).toEqual([{ id: 'whatsapp', on: false }, { id: 'search', on: true }]);
    expect(out.logo).toBe('x');
    expect(header.icons[0]!.on).toBe(true);
    expect(overlay({ eye: { [WA]: false }, words: {} }, 'pdp.colour', { note: true })).toEqual({ note: true });
    const labels = overlay({ eye: {}, words: { [word]: { bn: 'নতুন' } } }, 'language.labels', { [word]: { en: 'Mine' }, other: { en: 'Kept' } });
    expect(labels).toEqual({ [word]: { en: 'Mine', bn: 'নতুন' }, other: { en: 'Kept' } });
    expect(overlay({ eye: {}, words: { [word]: { en: 'X' } } }, 'language.labels', null)).toEqual({ [word]: { en: 'X' } });
    expect(merged([{ eye: { [NOTE]: true }, words: {} }, { eye: {}, words: { [word]: { en: 'X' } } }])).toEqual({ eye: { [NOTE]: true }, words: { [word]: { en: 'X' } } });
  });
});

describe('how sure a result is', () => {
  it('says nothing before each version has its visitors', () => {
    const v = verdict({ n: 50, c: 5 }, { n: 50, c: 15 }, 95, 100);
    expect(v.enough).toBe(false);
    expect(v.confidence).toBeNull();
    expect(v.winner).toBeNull();
    expect(v.lift).toBeCloseTo(2);
  });

  it('names a winner only at the owner\'s confidence', () => {
    const clear = verdict({ n: 1000, c: 100 }, { n: 1000, c: 140 }, 95, 100);
    expect(clear.confidence!).toBeGreaterThan(0.99);
    expect(clear.winner).toBe('b');
    const worse = verdict({ n: 1000, c: 140 }, { n: 1000, c: 100 }, 95, 100);
    expect(worse.winner).toBe('a');
    const close = verdict({ n: 1000, c: 100 }, { n: 1000, c: 108 }, 95, 100);
    expect(close.confidence!).toBeLessThan(0.95);
    expect(close.winner).toBeNull();
    expect(verdict({ n: 1000, c: 100 }, { n: 1000, c: 108 }, 80, 100).confidence).toBeCloseTo(close.confidence!);
    expect(verdict({ n: 200, c: 0 }, { n: 200, c: 0 }, 95, 100).winner).toBeNull();
  });
});
