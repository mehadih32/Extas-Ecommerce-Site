// PR 155 — the KPI definition without a database: which status counts where, shop days in the shop's time zone, and
// how order lines add up.
import { describe, expect, it } from 'vitest';
import { BASIS_RULE, counts, dayStart, daysBetween, daysPeriod, groupLines, lastDays, nextDay, sumLines, ymdIn, type LineRow } from './pure';

const STATUSES = ['DRAFT', 'PLACED', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED'];

describe('the one KPI definition', () => {
  it('Sales = delivered orders only; PLACED and every other state is never Sales', () => {
    expect(STATUSES.filter((s) => counts('sales', s))).toEqual(['DELIVERED']);
    expect(counts('sales', 'PLACED')).toBe(false);
  });

  it('Ordered value = every placed order (all but DRAFT), cancelled and returned ones too', () => {
    expect(STATUSES.filter((s) => !counts('ordered', s))).toEqual(['DRAFT']);
    for (const s of ['PLACED', 'CANCELLED', 'RETURNED', 'DELIVERED']) expect(counts('ordered', s)).toBe(true);
  });

  it('Sales counts on the delivered day, Ordered value on the placed day', () => {
    expect(BASIS_RULE.sales.at).toBe('deliveredAt');
    expect(BASIS_RULE.ordered.at).toBe('placedAt');
  });
});

describe('shop days', () => {
  const TZ = 'Asia/Dhaka'; // a sample zone (UTC+6, no clock change); the real one is the store's setting

  it('a shop day starts at local midnight', () => {
    expect(dayStart('2026-10-23', TZ).toISOString()).toBe('2026-10-22T18:00:00.000Z');
    expect(dayStart('2026-10-23', 'UTC').toISOString()).toBe('2026-10-23T00:00:00.000Z');
    // A zone with a clock change still lands on its own midnight.
    expect(dayStart('2026-03-29', 'Europe/London').toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(dayStart('2026-07-01', 'Europe/London').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(() => dayStart('23-10-2026', TZ)).toThrow(RangeError);
  });

  it('a moment belongs to the shop day of its own time zone', () => {
    expect(ymdIn(new Date('2026-10-22T18:30:00Z'), TZ)).toBe('2026-10-23');
    expect(ymdIn(new Date('2026-10-22T17:59:59Z'), TZ)).toBe('2026-10-22');
  });

  it('days and periods, both ends included', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    const p = daysPeriod('2026-10-20', '2026-10-23', TZ);
    expect([p.from.toISOString(), p.to.toISOString()]).toEqual(['2026-10-19T18:00:00.000Z', '2026-10-23T18:00:00.000Z']);
    expect(() => daysPeriod('2026-10-23', '2026-10-20', TZ)).toThrow(RangeError);
  });

  it('the last N days end today, in the shop time zone', () => {
    const now = new Date('2026-10-22T19:00:00Z'); // already 23 Oct in Dhaka
    expect(lastDays(1, now, TZ)).toMatchObject({ from: '2026-10-23', to: '2026-10-23' });
    const week = lastDays(7, now, TZ);
    expect([week.from, week.to]).toEqual(['2026-10-17', '2026-10-23']);
    expect(week.period.to.getTime() - week.period.from.getTime()).toBe(7 * 86_400_000);
    expect(() => lastDays(0, now, TZ)).toThrow(RangeError);
  });
});

describe('adding up order lines', () => {
  const line = (o: string, q: number, unit: number, total: number, extra: Partial<LineRow> = {}): LineRow => ({
    orderId: o,
    productId: null,
    comboId: null,
    comboGroupKey: null,
    quantity: q,
    unitPriceMinor: unit,
    lineTotalMinor: total,
    day: '2026-10-23',
    ...extra,
  });

  it('orders are distinct, money is whole poisha, the saving is never negative', () => {
    expect(sumLines([])).toEqual({ orders: 0, units: 0, valueMinor: 0, regularMinor: 0, savedMinor: 0 });
    const s = sumLines([line('a', 2, 100_000, 180_000), line('a', 1, 50_000, 50_000), line('b', 1, 70_000, 75_000)]);
    expect(s).toEqual({ orders: 2, units: 4, valueMinor: 305_000, regularMinor: 320_000, savedMinor: 20_000 });
  });

  it('groups by any key and leaves out rows without one', () => {
    const g = groupLines([line('a', 1, 1, 1, { comboId: 'x' }), line('b', 1, 1, 1), line('c', 1, 1, 1, { comboId: 'x' })], (r) => r.comboId);
    expect([...g.keys()]).toEqual(['x']);
    expect(g.get('x')!.map((r) => r.orderId)).toEqual(['a', 'c']);
  });
});
