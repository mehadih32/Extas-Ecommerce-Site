import { describe, expect, it } from 'vitest';
import { marginOf } from '../src/offers-service';

// PR 823 — the "Margin after discount" tile on Offers: from the orders that used a code, with the ERP buying cost of each line.
describe('margin after discount', () => {
  const order = (subtotalMinor: number, discountMinor: number, items: { quantity: number; unitCostMinor: number | null }[]) => ({ subtotalMinor, discountMinor, items });
  it('is what is left of the price after the discount and the buying cost', () => {
    // sold 2 pieces for 100000 minor, 10000 off, bought for 30000 each: net 90000, cost 60000
    expect(marginOf([order(100000, 10000, [{ quantity: 2, unitCostMinor: 30000 }])])).toEqual({ pct: 33, profitMinor: 30000 });
  });
  it('adds orders together', () => {
    expect(marginOf([order(100000, 0, [{ quantity: 1, unitCostMinor: 50000 }]), order(100000, 0, [{ quantity: 1, unitCostMinor: 70000 }])])).toEqual({ pct: 40, profitMinor: 80000 });
  });
  it('is not known while any line has no cost, and with no orders', () => {
    expect(marginOf([order(100000, 0, [{ quantity: 1, unitCostMinor: null }])])).toBeNull();
    expect(marginOf([])).toBeNull();
  });
});
