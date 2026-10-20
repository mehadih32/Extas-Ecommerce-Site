// PR 99 — the set tiers' price for the picks (pure): the engine's grouping, the next tier, unpriced tiers left out,
// and never more than the separate prices. Made-up test prices in poisha.
import { describe, expect, it } from 'vitest';
import { pricedTiers, tierEachMinor, tierQuote } from './tiers';

const TIERS = [
  { quantity: 2, priceMinor: 200000 },
  { quantity: 3, priceMinor: 280000 },
];

describe('PR 99 · set tier price', () => {
  it('nothing picked, then one: no set price yet; the first tier is next', () => {
    const q0 = tierQuote([], TIERS);
    expect(q0).toMatchObject({ count: 0, regularMinor: 0, payMinor: 0, applied: null, next: { quantity: 2, more: 2 }, min: 2, max: 3 });
    const q1 = tierQuote([120000], TIERS);
    expect(q1).toMatchObject({ payMinor: 120000, savingMinor: 0, applied: null, next: { quantity: 2, more: 1 } });
  });

  it('two and three pieces get their tier; the next tier says how many more', () => {
    expect(tierQuote([120000, 110000], TIERS)).toMatchObject({ regularMinor: 230000, payMinor: 200000, savingMinor: 30000, applied: { quantity: 2 }, next: { quantity: 3, more: 1 } });
    expect(tierQuote([120000, 110000, 100000], TIERS)).toMatchObject({ payMinor: 280000, savingMinor: 50000, applied: { quantity: 3 }, next: null });
  });

  it('more pieces than the largest tier: the best grouping, as the bag does (dearest into sets)', () => {
    // 4 × 1,000: two sets of 2 (1,500 + 1,500) beat a set of 3 and a single (2,400 + 1,000)
    expect(tierQuote([100000, 100000, 100000, 100000], [{ quantity: 2, priceMinor: 150000 }, { quantity: 3, priceMinor: 240000 }]).payMinor).toBe(300000);
    // 3 pieces with only a 2-tier: the two dearest in the set, the cheapest at its own price
    expect(tierQuote([50000, 120000, 110000], [{ quantity: 2, priceMinor: 200000 }]).payMinor).toBe(250000);
  });

  it('a tier not lower than the separate prices is no offer; an unpriced tier is not offered', () => {
    const q = tierQuote([50000, 50000], TIERS);
    expect(q).toMatchObject({ payMinor: 100000, savingMinor: 0, applied: null });
    expect(pricedTiers([{ quantity: 3, priceMinor: null }, { quantity: 2, priceMinor: 200000 }, { quantity: 2, priceMinor: 1 }])).toEqual([{ quantity: 2, priceMinor: 200000 }]);
    expect(tierQuote([120000, 110000], [{ quantity: 2, priceMinor: null }])).toMatchObject({ payMinor: 230000, min: null, max: null, next: null, tiers: [] });
  });

  it('"each" is the tier price over its pieces, rounded down (display only)', () => {
    expect(tierEachMinor({ quantity: 3, priceMinor: 280000 })).toBe(93333);
  });
});
