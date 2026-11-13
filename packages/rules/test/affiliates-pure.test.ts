// S28 · PR 695 — the affiliate sums: commission only on delivered goods value, the hold days, the ledger.
import { describe, expect, it } from 'vitest';
import { cleanAffiliateCode, commissionOf, goodsValue, isAffiliateCode, pastHold, standing, toBp } from '../src/affiliates-pure';

const D = (iso: string) => new Date(iso);
const order = (status: string, deliveredAt: string | null, subtotalMinor = 100000, discountMinor = 10000) => ({ status, deliveredAt: deliveredAt ? D(deliveredAt) : null, subtotalMinor, discountMinor });

describe('affiliate sums (PR 695)', () => {
  it('cleans a code to upper-case letters and digits', () => {
    expect(cleanAffiliateCode(' tanvir-10 ')).toBe('TANVIR10');
    expect(isAffiliateCode('AB')).toBe(false);
    expect(isAffiliateCode('DSD10')).toBe(true);
    expect(toBp(7.5)).toBe(750);
  });
  it('counts the goods value: subtotal less the discount, never below zero', () => {
    expect(goodsValue({ subtotalMinor: 100000, discountMinor: 10000 })).toBe(90000);
    expect(goodsValue({ subtotalMinor: 1000, discountMinor: 5000 })).toBe(0);
  });
  it('earns only on a delivered order: returned, cancelled and shipped earn nothing', () => {
    expect(commissionOf(order('DELIVERED', '2026-11-01T00:00:00Z'), 800)).toBe(7200);
    for (const s of ['RETURNED', 'CANCELLED', 'IN_TRANSIT', 'PLACED']) expect(commissionOf(order(s, '2026-11-01T00:00:00Z'), 800)).toBe(0);
    expect(commissionOf(order('DELIVERED', null), 800)).toBe(0);
  });
  it('waits the hold days after delivery', () => {
    expect(pastHold(D('2026-11-01T00:00:00Z'), 7, D('2026-11-07T23:00:00Z'))).toBe(false);
    expect(pastHold(D('2026-11-01T00:00:00Z'), 7, D('2026-11-08T00:00:00Z'))).toBe(true);
    expect(pastHold(null, 0, D('2026-11-08T00:00:00Z'))).toBe(false);
  });
  it('owes what is earned past the hold less what the ledger paid (a reversal is negative)', () => {
    const now = D('2026-11-13T00:00:00Z');
    const orders = [order('DELIVERED', '2026-11-01T00:00:00Z'), order('DELIVERED', '2026-11-10T00:00:00Z'), order('RETURNED', '2026-11-02T00:00:00Z')];
    const s = standing(orders, 1000, 7, [], now);
    expect(s).toMatchObject({ earnedMinor: 18000, onHoldMinor: 9000, dueMinor: 9000, deliveredOrders: 2 });
    expect(standing(orders, 1000, 7, [5000], now).dueMinor).toBe(4000);
    expect(standing(orders, 1000, 7, [5000, -5000], now).dueMinor).toBe(9000);
    expect(standing(orders, 1000, 7, [20000], now).dueMinor).toBe(0);
  });
});
