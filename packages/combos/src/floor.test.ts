// PR 609 (CN-028) — the selling-price floor is one formula everywhere (pure): the catalogue (a selling price, a combo's
// set price) and the rules engine (set tiers, discounts, coupons in the bag) both take the buying price plus the
// owner's lowest margin, rounded up, and both are off without either.
import { describe, expect, it } from 'vitest';
import { floorOf } from '@extas/catalogue';
import { floorMinorOf } from '@extas/rules/pure';

describe('PR 609 · one floor formula', () => {
  it('the catalogue floor and the rules engine floor agree', () => {
    for (const buy of [0, 1, 33333, 65000, 76000, 123457]) for (const pct of [0, 1, 15, 20, 33, 100]) expect(floorOf(buy, pct)).toBe(floorMinorOf(buy, pct));
    expect([floorOf(null, 20), floorOf(76000, null), floorMinorOf(null, 20), floorMinorOf(76000, null)]).toEqual([null, null, null, null]);
  });
});
