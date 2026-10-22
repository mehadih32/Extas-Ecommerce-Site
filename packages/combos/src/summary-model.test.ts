// PR 96 — the set summary without a database: which product page and bag look a combo uses (D8.4), and the one set
// price with its saving and the struck "was" price, which is never invented (CN-009). Made-up test prices.
import { describe, expect, it } from 'vitest';
import { setPricing } from './model';
import { priceWords } from './set-words';
import { bagTemplateFor, listTemplateFor, pageTemplateFor, setPrice } from './summary-model';

const R = { stepMinor: 1000, direction: 'down' as const };
const page = (over: Partial<Parameters<typeof pageTemplateFor>[0]> = {}) => pageTemplateFor({ combo: null, rule: null, shop: 'auto', mixed: false, pairs: 0, longListPairs: 28, ...over });

describe('PR 96 · which page and bag look', () => {
  it('"auto": P3 for a mixed set, P1 for a same-product pack, P2 once a rule makes a very long list', () => {
    expect(page({ mixed: true, pairs: 400 })).toBe('P3');
    expect(page()).toBe('P1');
    expect(page({ pairs: 28 })).toBe('P1');
    expect(page({ pairs: 29 })).toBe('P2');
    expect(page({ pairs: 29, longListPairs: 40 })).toBe('P1');
  });

  it('the combo wins over its rule, the rule over the shop; anything unknown is P1', () => {
    expect(page({ combo: 'P5', rule: 'P2', shop: 'P4' })).toBe('P5');
    expect(page({ rule: 'P2', shop: 'P4' })).toBe('P2');
    expect(page({ shop: 'P4' })).toBe('P4');
    expect(page({ combo: 'P9' })).toBe('P1');
    expect(bagTemplateFor({ combo: null, rule: 'B2', shop: 'B5' })).toBe('B2');
    expect(bagTemplateFor({ combo: null, rule: null, shop: 'B5' })).toBe('B5');
    expect(listTemplateFor({ combo: 'L4', rule: 'L2', shop: 'L1' })).toBe('L4');
  });
});

describe('PR 96 · the set price', () => {
  const pieces = [
    { priceMinor: 120000, quantity: 1 },
    { priceMinor: 100000, quantity: 1 },
  ];

  it('the saving against buying separately, and "each" for display', () => {
    const p = setPrice(setPricing({ mode: 'FIXED', setMinor: 190000 }, pieces, R), 2, { allowed: true, live: true });
    expect(p).toMatchObject({ regularMinor: 220000, payMinor: 190000, savingMinor: 30000, savingPercent: 13, offer: true, eachMinor: 95000, pieces: 2 });
  });

  it('the struck price is the separate prices\' sum, only when switched on and live — never made up', () => {
    const offer = setPricing({ mode: 'FIXED', setMinor: 190000 }, pieces, R);
    expect(setPrice(offer, 2, { allowed: true, live: true })).toMatchObject({ wasMinor: 220000, wasReason: 'SHOWN' });
    expect(setPrice(offer, 2, { allowed: false, live: true })).toMatchObject({ wasMinor: null, wasReason: 'NOT_CHOSEN' });
    expect(setPrice(offer, 2, { allowed: null, live: true })).toMatchObject({ wasMinor: null, wasReason: 'NOT_CHOSEN' });
    expect(setPrice(offer, 2, { allowed: true, live: false })).toMatchObject({ wasMinor: null, wasReason: 'NOT_LIVE' });
  });

  it('a set price at or above the regular total charges the regular total and shows no saving or struck price', () => {
    const p = setPrice(setPricing({ mode: 'FIXED', setMinor: 250000 }, pieces, R), 2, { allowed: true, live: true });
    expect(p).toMatchObject({ payMinor: 220000, savingMinor: 0, offer: false, reason: 'NOT_LOWER', wasMinor: null, wasReason: 'NOT_HIGHER' });
  });

  it('a "% off" pair is priced from the picks\' own prices and rounded; no price → nothing to show', () => {
    const p = setPrice(setPricing({ mode: 'PERCENT', percentOff: 10 }, pieces, R), 2, { allowed: true, live: true });
    expect(p).toMatchObject({ payMinor: 198000, savingMinor: 22000, wasMinor: 220000 });
    const none = setPrice(setPricing({ mode: 'FIXED', setMinor: null }, pieces, R), 2, { allowed: true, live: true });
    expect(none).toMatchObject({ payMinor: null, eachMinor: null, wasMinor: null, wasReason: 'NO_PRICE' });
    const noPiece = setPrice(setPricing({ mode: 'FIXED', setMinor: 100000 }, [{ priceMinor: null, quantity: 1 }], R), 1, { allowed: true, live: true });
    expect(noPiece).toMatchObject({ payMinor: null, reason: 'PIECE_NO_PRICE', wasMinor: null });
  });
});

describe('PR 96 · the price words come from the same price', () => {
  const money = (m: number) => `BDT ${(m / 100).toLocaleString('en-GB')}`;
  it('line, saving, cash on delivery and the button all carry the one set price', () => {
    const p = setPrice(setPricing({ mode: 'FIXED', setMinor: 190000 }, [{ priceMinor: 120000, quantity: 1 }, { priceMinor: 100000, quantity: 1 }], R), 2, { allowed: true, live: true });
    expect(priceWords('en', p, money)).toEqual({ line: '2 pcs BDT 2,200 → BDT 1,900', save: 'Save BDT 300', cod: 'Pay BDT 1,900 when it arrives', button: 'Add both to bag · BDT 1,900' });
    const bn = priceWords('bn', p, (m) => `৳${(m / 100).toLocaleString('bn-BD')}`, (n) => n.toLocaleString('bn-BD'));
    for (const v of [bn.line, bn.cod, bn.button]) expect(v).toContain('৳১,৯০০');
    expect(bn.save).toContain('৳৩০০');
  });
  it('no offer: no line and no saving; no price: no words at all', () => {
    const flat = setPrice(setPricing({ mode: 'FIXED', setMinor: 300000 }, [{ priceMinor: 120000, quantity: 1 }, { priceMinor: 100000, quantity: 1 }], R), 2, { allowed: true, live: true });
    expect(priceWords('en', flat, money)).toMatchObject({ line: null, save: null, button: 'Add both to bag · BDT 2,200' });
    const none = setPrice(setPricing({ mode: 'FIXED', setMinor: null }, [{ priceMinor: 1, quantity: 1 }], R), 1, { allowed: true, live: true });
    expect(priceWords('en', none, money)).toEqual({ line: null, save: null, cod: null, button: null });
  });
});
