// PR 798 — Customers report sums: new against returning, repeat rate, quiet buyers, grades and cohorts.
import { describe, expect, it } from 'vitest';
import { cohorts, customerFacts, gradeRows, whoOrdered, type Buyer, type CustOrder } from './customers';

const D = 86_400_000;
const T0 = Date.UTC(2026, 10, 12, 6); // 12 Nov 2026
const o = (id: string, customerId: string, daysAgo: number, over: Partial<CustOrder> = {}): CustOrder => ({ id, number: id, customerId, at: T0 - daysAgo * D, day: '', status: 'DELIVERED', totalMinor: 1000, district: 'Dhaka', area: 'Mirpur', ...over });
const b = (id: string, over: Partial<Buyer> = {}): Buyer => ({ id, name: id, phone: null, orders: 1, delivered: 1, spentMinor: 1000, lastOrderAt: T0 - 5 * D, gradeRank: 1, grade: 'Silver', ...over });

describe('Customers report sums (PR 798)', () => {
  const cur = [o('1', 'a', 2), o('2', 'b', 3), o('3', 'b', 1), o('4', 'c', 4, { status: 'CANCELLED' })];
  const first = new Map([['a', cur[0]!.at], ['b', T0 - 40 * D], ['c', cur[3]!.at]]);
  it('splits the customers who ordered into new and returning, leaving cancelled orders out', () => {
    expect(whoOrdered(cur, first)).toEqual({ n: 2, nw: 1, ret: 1 });
  });
  it('works the repeat rate, the average value and the quiet buyers', () => {
    const buyers = [b('a'), b('b', { orders: 3, spentMinor: 5000 }), b('c', { orders: 2, spentMinor: 3000, lastOrderAt: T0 - 70 * D }), b('d', { orders: 0 })];
    const f = customerFacts(cur, buyers, first, T0, 60);
    expect(f.repeat).toBeCloseTo(66.67, 1);
    expect(f.avgValue).toBe(3000);
    expect(f.atRisk.map((x) => x.id)).toEqual(['c']);
    expect(f.topCustomers.find((x) => x.customerId === 'b')).toMatchObject({ n: 2, v: 2000, isNew: false });
    expect(f.byDistrict).toEqual([expect.objectContaining({ d: 'Dhaka', n: 2, o: 3, v: 3000 })]);
  });
  it('groups sales by grade, best grade first, and keeps the no-grade group', () => {
    const buyers = [b('a', { gradeRank: 2, grade: 'Gold' }), b('b'), b('c', { gradeRank: -1, grade: null })];
    const rows = gradeRows(cur, buyers);
    expect(rows.map((r) => [r.name, r.sales])).toEqual([['Gold', 1000], ['Silver', 2000], [null, 0]]);
  });
  it('builds the cohort rows: who ordered again in the same month, the next, the one after', () => {
    const tz = 'UTC';
    const orders = [
      { customerId: 'a', at: Date.UTC(2026, 8, 20) },
      { customerId: 'a', at: Date.UTC(2026, 9, 5) },
      { customerId: 'z', at: Date.UTC(2026, 8, 22) },
    ];
    const f = new Map([['a', Date.UTC(2026, 8, 20)], ['z', Date.UTC(2026, 8, 22)]]);
    const rows = cohorts(orders, f, new Map([['a', 4000], ['z', 2000]]), tz, T0, 6);
    expect(rows).toEqual([{ month: '2026-09', customers: 2, back: [0, 50, 0], avgValue: 3000 }]);
    expect(cohorts(orders, new Map([['a', Date.UTC(2026, 10, 1)]]), new Map(), tz, T0, 6)[0]!.back).toEqual([0, null, null]);
  });
});
