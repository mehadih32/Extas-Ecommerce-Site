// S05 · PR 155 follow-up 91 — Reports › Orders: the period, the rows shown and the average order.
import { describe, expect, it } from 'vitest';
import { NO_ORDERS, type KpiRow } from '@extas/metrics';
import { averageOf, daysOf, ranked } from './order-report';

const row = (key: string, ordered: [number, number], sales: [number, number] = [0, 0]): KpiRow => ({
  key,
  ordered: { ...NO_ORDERS, orders: ordered[0], valueMinor: ordered[1] },
  sales: { ...NO_ORDERS, orders: sales[0], valueMinor: sales[1] },
});

describe('orders report (follow-up 91)', () => {
  it('takes 7, 30 or 90 days, else 30', () => {
    expect(daysOf('7')).toBe(7);
    expect(daysOf('90')).toBe(90);
    expect(daysOf('14')).toBe(30);
    expect(daysOf(undefined)).toBe(30);
  });
  it('lists the rows with an order, the larger Ordered value first, then Sales', () => {
    const rows = ranked([row('COD', [2, 300000]), row('', [0, 0]), row('BKASH', [1, 300000], [1, 300000]), row('NAGAD', [0, 0], [1, 120000])]);
    expect(rows.map((r) => r.key)).toEqual(['BKASH', 'COD', 'NAGAD']);
  });
  it('the average order of the Ordered value, none without an order', () => {
    expect(averageOf({ ordered: { ...NO_ORDERS, orders: 3, valueMinor: 100000 }, sales: { ...NO_ORDERS } })).toBe(33333);
    expect(averageOf({ ordered: { ...NO_ORDERS }, sales: { ...NO_ORDERS, orders: 1, valueMinor: 5 } })).toBeNull();
  });
});
