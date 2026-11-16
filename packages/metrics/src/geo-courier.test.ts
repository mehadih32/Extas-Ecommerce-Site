// S29 · PR 757 — the courier and coverage lens of the Geography map without a database: the numbers are built from the
// parcels, orders, places and mappings the loader reads (made-up values), so every rule is checked on small facts.
import { describe, expect, it } from "vitest";
import {
  buildCourierLens,
  rollUp,
  type CourierLensThresholds,
  type LensInput,
  type CourierPlace,
  type ParcelGroup,
} from "./geo-courier";

const place = (
  id: string,
  level: string,
  nameEn: string,
  ancestorIds: string[],
  cityCorporation: string | null = null,
): CourierPlace => ({
  id,
  level,
  ancestorIds,
  nameEn,
  nameBn: null,
  cityCorporation,
});
const places: CourierPlace[] = [
  place("dhkDiv", "DIVISION", "Dhaka division", []),
  place("dhk", "DISTRICT", "Dhaka", ["dhkDiv"]),
  place("mirpur", "THANA", "Mirpur", ["dhkDiv", "dhk"], "DNCC"),
  place("mirpur10", "AREA", "Mirpur 10", ["dhkDiv", "dhk", "mirpur"]),
  place("savar", "UPAZILA", "Savar", ["dhkDiv", "dhk"]),
  place("rajDiv", "DIVISION", "Rajshahi division", []),
  place("bogura", "DISTRICT", "Bogura", ["rajDiv"]),
  place("gabtali", "UPAZILA", "Gabtali", ["rajDiv", "bogura"]),
];
const g = (courierId: string, areaId: string | null, delivered: number, returned: number, hoursSum = 0, withPromise = 0, late = 0, promiseSum = 0): ParcelGroup => ({ courierId, areaId, delivered, returned, hoursSum, withPromise, late, promiseSum });
const TH: CourierLensThresholds = { minParcels: 5, lowSuccessPct: 70, lateWarnPct: 30, gapLimit: 20 };
const input = (o: Partial<LensInput> = {}): LensInput => ({
  level: 'district',
  parentAreaId: null,
  thresholds: TH,
  groups: [
    g('A', 'mirpur10', 8, 2, 240, 8, 2, 384),
    g('B', 'savar', 3, 3, 90, 3, 1, 144),
    g('A', 'savar', 9, 1, 180, 9, 0, 432),
    g('C', 'gabtali', 6, 4, 300),
    g('D', 'gabtali', 5, 0, 100),
    g('A', null, 7, 7), // no area: in no row
  ],
  placed: [
    { areaId: 'mirpur10', orders: 10 },
    { areaId: 'savar', orders: 6 },
    { areaId: 'gabtali', orders: 4 },
    { areaId: null, orders: 3 },
  ],
  places,
  mapped: new Map([['mirpur', 1]]),
  couriers: [{ id: 'A', name: 'Courier A' }, { id: 'B', name: 'Courier B' }, { id: 'C', name: 'Courier C' }, { id: 'D', name: 'Courier D' }, { id: 'Z', name: 'Unused' }],
  days: { from: '2026-11-01', to: '2026-11-15' },
  ...o,
});
const row = (r: ReturnType<typeof buildCourierLens>, id: string) => r.rows.find((x) => x.areaId === id)!;

describe('rollUp: the place a place belongs to at each level', () => {
  const by = new Map(places.map((p) => [p.id, p]));
  it('goes up to the level, or stops where the level is not reached', () => {
    expect(rollUp('division', by.get('mirpur10')!, by)?.id).toBe('dhkDiv');
    expect(rollUp('district', by.get('mirpur10')!, by)?.id).toBe('dhk');
    expect(rollUp('upazila', by.get('mirpur10')!, by)?.id).toBe('mirpur');
    expect(rollUp('upazila', by.get('savar')!, by)?.id).toBe('savar');
    expect(rollUp('district', by.get('dhkDiv')!, by)).toBeNull();
  });
  it('the area level is the places inside Dhaka City only', () => {
    expect(rollUp('area', by.get('mirpur10')!, by)?.id).toBe('mirpur10');
    expect(rollUp('area', by.get('savar')!, by)).toBeNull();
  });
});

describe('courierLens by district', () => {
  const r = buildCourierLens(input());
  it('success, delivery time and promise per district from the shop\'s own parcels', () => {
    const d = row(r, 'dhk').figures;
    expect(d.parcels).toBe(26);
    expect(d.delivered).toBe(20);
    expect(d.returned).toBe(6);
    expect(d.courierSuccessRate).toBeCloseTo(20 / 26);
    expect(d.avgHours).toBeCloseTo((240 + 90 + 180) / 20);
    expect(d.promiseHours).toBeCloseTo(48);
    expect(d.lateShare).toBeCloseTo(3 / 20);
    expect(d.couriersUsed).toBe(2);
  });
  it('a district with no promise has no late share and no promised hours, never 0', () => {
    const b = row(r, 'bogura').figures;
    expect(b.lateShare).toBeNull();
    expect(b.promiseHours).toBeNull();
    expect(b.courierSuccessRate).toBeCloseTo(11 / 15);
  });
  it('parcels with no area are in no row', () => {
    expect(r.rows.reduce((n, x) => n + (x.figures.parcels ?? 0), 0)).toBe(26 + 15);
  });
  it('rows come most orders first', () => {
    expect(r.rows.map((x) => x.areaId)).toEqual(['dhk', 'bogura']);
  });
  it('names only the couriers the details mention', () => {
    expect(r.couriers.map((c) => c.id).sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('the best courier (advice only)', () => {
  const r = buildCourierLens(input());
  it('is the best success among couriers with enough parcels, and the courier list is best first', () => {
    expect(r.details.dhk!.best).toEqual({ courierId: 'A', successRate: 0.85, parcels: 20 });
    expect(r.details.dhk!.couriers.map((c) => c.courierId)).toEqual(['A', 'B']);
    expect(r.details.bogura!.best).toEqual({ courierId: 'D', successRate: 1, parcels: 5 });
    expect(r.details.bogura!.mostUsedCourierId).toBe('C');
  });
  it('flags a better courier only when the most used one does worse', () => {
    expect(row(r, 'bogura').flags).toContain('betterCourier');
    expect(row(r, 'dhk').flags).not.toContain('betterCourier');
  });
  it('a courier under the minimum parcels is never "best"', () => {
    const t = buildCourierLens(input({ thresholds: { ...TH, minParcels: 6 } }));
    expect(t.details.bogura!.best?.courierId).toBe('C');
    expect(t.details.bogura!.best?.successRate).toBeCloseTo(0.6);
    expect(row(t, 'bogura').flags).not.toContain('betterCourier');
  });
  it('no courier has enough parcels: no best', () => {
    expect(buildCourierLens(input({ thresholds: { ...TH, minParcels: 50 } })).details.dhk!.best).toBeNull();
  });
});

describe('flags', () => {
  it('too few parcels, low success and late are three different flags, none of them hidden by the others', () => {
    const few = buildCourierLens(input({ thresholds: { ...TH, minParcels: 30 } }));
    expect(row(few, 'dhk').flags).toContain('tooFewParcels');
    expect(row(few, 'dhk').flags).not.toContain('lowSuccess');
    const low = buildCourierLens(input({ thresholds: { ...TH, lowSuccessPct: 80 } }));
    expect(row(low, 'dhk').flags).toContain('lowSuccess');
    const late = buildCourierLens(input({ thresholds: { ...TH, lateWarnPct: 10 } }));
    expect(row(late, 'dhk').flags).toContain('late');
    expect(buildCourierLens(input()).rows.every((x) => !x.flags.includes('late'))).toBe(true);
  });
  it('the rate flag is judged only with enough parcels', () => {
    const r = buildCourierLens(input({ groups: [g('A', 'savar', 1, 3)], thresholds: TH }));
    expect(row(r, 'dhk').flags).toEqual(expect.arrayContaining(['tooFewParcels']));
    expect(row(r, 'dhk').flags).not.toContain('lowSuccess');
  });
});

describe('coverage gaps', () => {
  const r = buildCourierLens(input());
  it('an area with orders and no courier mapped (itself or above it) is a gap; a mapping above covers', () => {
    // only Mirpur is mapped: Mirpur 10 (under it) is covered, Savar and Gabtali are not
    expect(r.gaps.map((x) => [x.areaId, x.orders])).toEqual([['savar', 6], ['gabtali', 4]]);
    expect(row(r, 'dhk').figures.gapOrders).toBe(6);
    expect(row(r, 'bogura').figures.gapOrders).toBe(4);
    expect(row(r, 'dhk').flags).toContain('coverageGap');
    const covered = buildCourierLens(input({ mapped: new Map([['dhk', 2], ['bogura', 1]]) }));
    expect(covered.gaps).toEqual([]);
    expect(covered.rows.every((x) => !x.flags.includes('coverageGap'))).toBe(true);
  });
  it('orders with no area are counted apart, not as a gap', () => {
    expect(r.unknownOrders).toBe(3);
  });
  it('the gap list is at most the setting, most orders first', () => {
    expect(buildCourierLens(input({ thresholds: { ...TH, gapLimit: 1 } })).gaps.map((x) => x.areaId)).toEqual(['savar']);
  });
  it('a place with orders but no parcels is still a row (that is where coverage matters)', () => {
    const t = buildCourierLens(input({ groups: [] }));
    expect(t.rows.map((x) => x.areaId).sort()).toEqual(['bogura', 'dhk']);
    expect(row(t, 'dhk').figures.courierSuccessRate).toBeNull();
    expect(row(t, 'dhk').flags).toContain('tooFewParcels');
  });
});

describe('levels and scope', () => {
  it('upazila / thana level splits Dhaka and keeps Mirpur 10 under Mirpur', () => {
    const r = buildCourierLens(input({ level: 'upazila' }));
    expect(r.rows.map((x) => x.areaId).sort()).toEqual(['gabtali', 'mirpur', 'savar']);
    expect(row(r, 'mirpur').figures.delivered).toBe(8);
    expect(row(r, 'savar').figures.delivered).toBe(12);
    expect(row(r, 'mirpur').flags).not.toContain('coverageGap');
  });
  it('area level is the places inside Dhaka City only', () => {
    const r = buildCourierLens(input({ level: 'area' }));
    expect(r.rows.map((x) => x.areaId)).toEqual(['mirpur10']);
  });
  it('a parent keeps only the places under it', () => {
    const r = buildCourierLens(input({ level: 'upazila', parentAreaId: 'rajDiv' }));
    expect(r.rows.map((x) => x.areaId)).toEqual(['gabtali']);
    expect(r.gaps.map((x) => x.areaId)).toEqual(['gabtali']);
  });
  it('carries the period and the thresholds it used', () => {
    const r = buildCourierLens(input());
    expect(r.days).toEqual({ from: '2026-11-01', to: '2026-11-15' });
    expect(r.thresholds).toEqual(TH);
    expect(r.lens).toBe('courier');
    expect(r.level).toBe('district');
  });
  it('shows nothing about a customer', () => {
    const text = JSON.stringify(buildCourierLens(input()));
    expect(text).not.toMatch(/phone|customerName|email|address/i);
  });
});
