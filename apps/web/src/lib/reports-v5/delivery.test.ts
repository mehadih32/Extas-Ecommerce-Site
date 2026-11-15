// PR 797 — the Delivery & returns report's sums from the parcel rows: success, average days, by courier, zone, district and the grid.
import { describe, expect, it } from 'vitest';
import { deliveryFromRows, type ParcelRow } from './delivery';

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const p = (id: string, over: Partial<ParcelRow> = {}): ParcelRow => ({ id, number: id, courierId: 'c1', courier: 'Pathao', zoneKey: 'dhaka', zoneEn: 'Dhaka', zoneBn: null, promiseDays: 2, district: 'Dhaka', status: 'DELIVERED', placedAt: day(1), deliveredAt: day(3), totalMinor: 1000, ...over });

describe('Delivery report sums (PR 797)', () => {
  const rows = [p('a'), p('b'), p('c', { status: 'RETURNED', deliveredAt: null }), p('d', { courierId: 'c2', courier: 'Steadfast', zoneKey: 'out', zoneEn: 'Outside', status: 'DELIVERED', deliveredAt: day(6) }), p('e', { status: 'IN_TRANSIT', deliveredAt: null })];
  const f = deliveryFromRows(rows);

  it('counts finished, delivered, returned and on the way apart', () => {
    expect(f).toMatchObject({ sent: 5, finished: 4, delivered: 3, returned: 1, onTheWay: 1 });
    expect(f.success).toBeCloseTo(75);
    expect(f.avgDays).toBeCloseTo((2 + 2 + 5) / 3);
  });
  it('ranks couriers by success and averages days per zone', () => {
    expect(f.byCourier.map((x) => [x.name, Math.round(x.success)])).toEqual([['Steadfast', 100], ['Pathao', 67]]);
    expect(f.byZone.find((z) => z.key === 'dhaka')).toMatchObject({ n: 2, days: 2, promise: 2 });
  });
  it('builds the courier-and-zone grid and keeps small districts out of the list', () => {
    expect(f.grid).toHaveLength(2);
    expect(f.grid.find((g) => g.courierId === 'c1')).toMatchObject({ n: 3, d: 2, rt: 1 });
    expect(f.byDistrict).toEqual([{ name: 'Dhaka', finished: 4, returned: 1, rate: 25 }]);
    expect(deliveryFromRows(rows.slice(0, 2)).byDistrict).toEqual([]);
  });
  it('says nothing when no parcel has finished', () => {
    expect(deliveryFromRows([p('x', { status: 'IN_TRANSIT', deliveredAt: null })])).toMatchObject({ finished: 0, success: null, avgDays: null });
  });
});
