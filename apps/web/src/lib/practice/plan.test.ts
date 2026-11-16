// PR 1068 — the big practice set follows the admin prototype v5's own numbers (All 861; Processing 5, Confirmed 9, Booked 2,
// Packed 5, Handed over 24, Delivered 25, Paid 673, Returned 75, Cancelled 43; 420 people, 44 incomplete, 3 claims, 64 reviews).
import { describe, expect, it } from 'vitest';
import { RICH, RICH_ADS, RICH_ORDER_TOTAL, RICH_PLAN } from './data';

const n = (kind: string) => RICH_PLAN.filter((p) => p.kind === kind).reduce((a, p) => a + p.count, 0);

describe('the big practice set matches the prototype', () => {
  it('has the prototype order count and status mix', () => {
    expect(RICH_ORDER_TOTAL).toBe(861);
    expect(n('PROCESSING')).toBe(5);
    expect(n('CONFIRMED')).toBe(9);
    expect(n('BOOKED')).toBe(2);
    expect(n('PACKED')).toBe(5);
    expect(n('HANDED_OVER') + n('IN_TRANSIT')).toBe(24);
    expect(n('DELIVERED')).toBe(25);
    expect(n('PAID')).toBe(673);
    expect(n('RETURNED')).toBe(75);
    expect(n('CANCELLED')).toBe(43);
  });
  it('has the prototype people, checkouts, claims, reviews and ad rows', () => {
    expect([RICH.customers, RICH.incomplete, RICH.claims, RICH.reviews]).toEqual([420, 44, 3, 64]);
    const campaigns = RICH_ADS.reduce((a, x) => a + x.campaigns.length, 0);
    expect(campaigns * RICH.adDays).toBe(336);
  });
  it('spreads orders over 70 days (about 12 a day) and keeps the open ones in the last days', () => {
    const oldest = Math.max(...RICH_PLAN.map((p) => p.age[1]));
    expect(oldest).toBe(70);
    for (const k of ['PROCESSING', 'CONFIRMED', 'BOOKED', 'PACKED']) expect(RICH_PLAN.find((p) => p.kind === k)!.age[1]).toBeLessThanOrEqual(2);
  });
});
