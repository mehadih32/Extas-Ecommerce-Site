// PR 61 — the price block: the discount, and what follows the bar.
import { productSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { discountPct, payWords, priceSide } from './pdp-price';

const set = productSettings['pdp.price'].default;

describe('PR 61 · the price block', () => {
  it('the discount in whole per cent, only with an honest, higher struck price', () => {
    expect(discountPct(960, 1200)).toBe(20);
    expect(discountPct(1200, 1200)).toBe(0);
    expect(discountPct(1200, null)).toBe(0);
    expect(discountPct(1300, 1200)).toBe(0);
  });

  it('after the bar: the saving, else free delivery, else the payment line when it has something true to say', () => {
    expect(priceSide({ discounted: true, freeDelivery: true, payWords: ['COD'] }, set)).toBe('discount');
    expect(priceSide({ discounted: true, freeDelivery: true, payWords: [] }, { ...set, discountAfterBar: false })).toBe('free');
    expect(priceSide({ discounted: false, freeDelivery: false, payWords: ['COD'] }, set)).toBe('pay');
    expect(priceSide({ discounted: false, freeDelivery: false, payWords: [] }, set)).toBeNull();
    expect(priceSide({ discounted: false, freeDelivery: false, payWords: ['COD'] }, { ...set, payLine: { on: false, text: null } })).toBeNull();
  });

  it("CN-017: the owner's own words split on |, else only the methods switched on", () => {
    expect(payWords(' COD | bKash |  | Nagad ', false, 'Cash on Delivery')).toEqual(['COD', 'bKash', 'Nagad']);
    expect(payWords(null, true, 'Cash on Delivery')).toEqual(['Cash on Delivery']);
    expect(payWords('', false, 'Cash on Delivery')).toEqual([]);
  });
});
