// PR 799 — the Couriers report's sums: comparison per courier, best of a column, weekly success, districts and the routing saving.
import { describe, expect, it } from 'vitest';
import { bestOf, courierStats, districtRows, inSpan, routingSavings, weeklySuccess } from './couriers';
import type { ParcelRow } from './delivery';

const d = (s: string) => new Date(`${s}T10:00:00Z`);
const p = (id: string, courierId: string, status: string, over: Partial<ParcelRow> = {}): ParcelRow => ({
  id, number: id, courierId, courier: courierId, zoneKey: 'inside', zoneEn: 'Inside Dhaka', zoneBn: null, promiseDays: 2, district: 'Dhaka', status, placedAt: d('2026-11-01'), deliveredAt: status === 'DELIVERED' ? d('2026-11-03') : null, totalMinor: 1000, ...over,
});
const couriers = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];

describe('courier comparison', () => {
  const rows = [p('1', 'a', 'DELIVERED'), p('2', 'a', 'DELIVERED'), p('3', 'a', 'RETURNED'), p('4', 'b', 'DELIVERED'), p('5', 'b', 'IN_TRANSIT')];
  const charge = new Map([['1', 100], ['2', 100], ['3', 100], ['4', 50]]);
  const s = courierStats(couriers, rows, charge, new Map([['a', 5000]]), new Map([['b', 2]]));
  it('works success, returned share, days and cost per finished parcel', () => {
    expect(s[0]).toMatchObject({ parcels: 3, delivered: 2, returned: 1, held: 5000, openClaims: 0 });
    expect(s[0]!.success).toBeCloseTo(66.67, 1);
    expect(s[0]!.avgDays).toBeCloseTo(2, 5);
    expect(s[0]!.perParcel).toBe(100);
    expect(s[1]).toMatchObject({ parcels: 2, delivered: 1, success: 100, perParcel: 50, openClaims: 2 });
  });
  it('marks the best of a column: highest success, lowest of the rest', () => {
    expect(bestOf(s, 'success')).toBe(100);
    expect(bestOf(s, 'perParcel')).toBe(50);
    expect(bestOf(s, 'returnPct')).toBe(0);
    expect(bestOf([], 'success')).toBeNull();
  });
});

describe('weekly success', () => {
  it('keeps the last figure for a week with too few parcels and starts at 90', () => {
    const rows = [p('1', 'a', 'DELIVERED'), p('2', 'a', 'DELIVERED'), p('3', 'a', 'RETURNED')];
    const w = weeklySuccess([couriers[0]!], rows, '2026-11-07');
    expect(w.labels).toHaveLength(8);
    expect(w.series[0]!.values).toHaveLength(8);
    expect(w.series[0]!.values[0]).toBe(90);
    expect(w.series[0]!.values[7]).toBeCloseTo(66.7, 1);
  });
});

describe('districts and routing', () => {
  it('lists the districts with the most parcels and each courier there', () => {
    const rows = [p('1', 'a', 'DELIVERED'), p('2', 'b', 'RETURNED'), p('3', 'a', 'DELIVERED', { district: 'Sylhet' })];
    const r = districtRows(couriers, rows, 5);
    expect(r[0]).toMatchObject({ district: 'Dhaka', n: 2 });
    expect(r[0]!.by.get('b')).toEqual({ n: 1, success: 0 });
    expect(r[1]!.by.get('b')).toEqual({ n: 0, success: null });
  });
  it('counts only a charge above the cheapest courier of the zone', () => {
    const rows = [p('1', 'a', 'DELIVERED'), p('2', 'a', 'DELIVERED'), p('3', 'a', 'RETURNED')];
    const r = routingSavings(rows, new Map([['1', 120], ['2', 80], ['3', 500]]), new Map([['inside', { fee: 100, name: 'Beta' }]]));
    expect(r.total).toBe(20);
    expect(r.rows[0]).toMatchObject({ zone: 'inside', parcels: 2, best: 'Beta', fee: 100, save: 20 });
  });
  it('cuts a window to the shop days of the span', () => {
    const rows = [p('1', 'a', 'DELIVERED', { placedAt: d('2026-11-01') }), p('2', 'a', 'DELIVERED', { placedAt: d('2026-11-09') })];
    expect(inSpan(rows, '2026-11-05', '2026-11-10', 'Asia/Dhaka').map((x) => x.id)).toEqual(['2']);
  });
});
