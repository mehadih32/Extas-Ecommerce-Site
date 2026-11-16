// S29 · PR 751 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the figures of Reports › Geography map.
// Orders by the placed day, Delivered and Sales by the delivered day, Returned by the returned day, rolled up to
// division, district, upazila/thana or the areas inside Dhaka City; parts add up to the whole (unknown and outside
// counted apart); a drill-down reads only what lies under the parent; a category or a product takes only its lines'
// share; the second period (previous, last year, own days) with a missing area counted as zero there; no Sales figure
// without the money permission; another store's and archived orders never read. Made-up values. The large-sample speed
// test runs only with GEO_PERF=1 (about 100,000 orders over 6 months at the upazila level).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { geoAreaDetail, geoByArea } from './geo';
import { salesByArea } from './areas';
import type { GeoQuery } from './geo-types';

const TZ = 'Asia/Dhaka';
const at = (s: string) => new Date(s);

describe.skipIf(!HAS_TEST_DB)('PR 751 · geoByArea on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const g: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function place(key: string, level: 'DIVISION' | 'DISTRICT' | 'UPAZILA' | 'THANA' | 'AREA', nameEn: string, parent: string | null, extra: { cityCorporation?: string; lat?: number; lng?: number } = {}) {
    const up = parent ? await t.prisma.geoArea.findUniqueOrThrow({ where: { id: g[parent]! } }) : null;
    g[key] = (await t.prisma.geoArea.create({ data: { level, nameEn, code: `test.geo.${key}`, parentId: up?.id ?? null, ancestorIds: up ? [...up.ancestorIds, up.id] : [], aliases: [], postcodes: [], ...extra } })).id;
  }

  async function order(o: { area: string | null; status?: 'DELIVERED' | 'RETURNED'; placed?: string; at: string; store?: number; archived?: boolean; discount?: number; lines: { product: string | null; total: number; qty?: number }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const status = o.status ?? 'DELIVERED';
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `L751-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: at(o.placed ?? '2026-10-01T04:00:00Z'),
        deliveredAt: status === 'DELIVERED' ? at(o.at) : null,
        returnedAt: status === 'RETURNED' ? at(o.at) : null,
        archivedAt: o.archived ? new Date() : null,
        areaId: o.area === null ? null : g[o.area]!,
        subtotalMinor: sub,
        discountMinor: o.discount ?? 0,
        deliveryChargeMinor: 0,
        totalMinor: sub - (o.discount ?? 0),
        paymentMethod: 'COD',
        idempotencyKey: `l751-${n}`,
      },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, productId: l.product, sku: `SKU-751-${n}`, productName: 'Sample', quantity: l.qty ?? 1, unitPriceMinor: l.total, lineTotalMinor: l.total, status: 'ACTIVE' } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-geo');
    [S, O] = await seedSampleStores(t.prisma);
    await place('dhkDiv', 'DIVISION', 'Dhaka', null);
    await place('dhk', 'DISTRICT', 'Dhaka', 'dhkDiv');
    await place('mirpur', 'THANA', 'Mirpur', 'dhk', { cityCorporation: 'DNCC', lat: 23.8223, lng: 90.3654 });
    await place('mirpur10', 'AREA', 'Mirpur 10', 'mirpur');
    await place('savar', 'UPAZILA', 'Savar', 'dhk');
    await place('dhamrai', 'UPAZILA', 'Dhamrai', 'dhk');
    await place('rajDiv', 'DIVISION', 'Rajshahi', null);
    await place('bogura', 'DISTRICT', 'Bogura', 'rajDiv');
    await place('gabtali', 'UPAZILA', 'Gabtali', 'bogura');
    const shirts = await t.prisma.category.create({ data: { storeId: S, slug: 'geo-shirts', nameEn: 'Shirts' } });
    const formal = await t.prisma.category.create({ data: { storeId: S, slug: 'geo-formal', nameEn: 'Formal', parentId: shirts.id } });
    const caps = await t.prisma.category.create({ data: { storeId: S, slug: 'geo-caps', nameEn: 'Caps' } });
    ids.shirts = shirts.id;
    ids.formal = formal.id;
    ids.caps = caps.id;
    ids.shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'geo-shirt', nameEn: 'Shirt', categoryId: formal.id } })).id;
    ids.cap = (await t.prisma.product.create({ data: { storeId: S, slug: 'geo-cap', nameEn: 'Cap', categoryId: caps.id } })).id;
    // the period under test is 10–12 Oct 2026; the previous period is 7–9 Oct
    await order({ area: 'mirpur10', placed: '2026-10-09T06:00:00Z', at: '2026-10-10T06:00:00Z', discount: 10_000, lines: [{ product: ids.shirt!, total: 80_000, qty: 2 }, { product: ids.cap!, total: 20_000 }] }); // A: goods 90,000
    await order({ area: 'savar', placed: '2026-10-11T06:00:00Z', at: '2026-10-11T06:00:00Z', lines: [{ product: ids.cap!, total: 30_000, qty: 3 }] }); // B
    await order({ area: 'gabtali', placed: '2026-10-10T06:00:00Z', at: '2026-10-10T06:00:00Z', lines: [{ product: ids.shirt!, total: 50_000 }] }); // C
    await order({ area: 'bogura', placed: '2026-10-10T06:00:00Z', at: '2026-10-10T06:00:00Z', lines: [{ product: ids.shirt!, total: 40_000 }] }); // D: district only
    await order({ area: null, placed: '2026-10-10T06:00:00Z', at: '2026-10-10T06:00:00Z', lines: [{ product: ids.cap!, total: 10_000 }] }); // E: no area
    await order({ area: 'gabtali', status: 'RETURNED', placed: '2026-10-10T06:00:00Z', at: '2026-10-10T06:00:00Z', lines: [{ product: ids.shirt!, total: 50_000 }] }); // F
    await order({ area: 'mirpur', status: 'RETURNED', placed: '2026-10-08T06:00:00Z', at: '2026-10-11T19:00:00Z', lines: [{ product: ids.cap!, total: 20_000 }] }); // G: returned 12 Oct in Dhaka
    await order({ area: 'gabtali', placed: '2026-10-25T06:00:00Z', at: '2026-10-25T06:00:00Z', lines: [{ product: ids.shirt!, total: 99_000 }] }); // H: outside every period
    await order({ area: 'gabtali', archived: true, placed: '2026-10-10T06:00:00Z', at: '2026-10-10T06:00:00Z', lines: [{ product: ids.shirt!, total: 99_000 }] }); // I: archived
    await order({ area: 'gabtali', store: O, placed: '2026-10-10T06:00:00Z', at: '2026-10-10T06:00:00Z', lines: [{ product: null, total: 99_000 }] }); // J: another store
    await order({ area: 'gabtali', placed: '2026-10-08T06:00:00Z', at: '2026-10-08T06:00:00Z', lines: [{ product: ids.shirt!, total: 60_000 }] }); // K: previous period
    await order({ area: 'mirpur10', placed: '2026-10-09T06:00:00Z', at: '2026-10-09T06:00:00Z', lines: [{ product: ids.cap!, total: 20_000 }] }); // L: previous period
    await order({ area: 'dhamrai', placed: '2026-10-09T06:00:00Z', at: '2026-10-09T06:00:00Z', lines: [{ product: ids.cap!, total: 10_000 }] }); // N: previous period only
  });
  afterAll(async () => t?.drop());

  const base = (over: Partial<GeoQuery> = {}): GeoQuery => ({ storeId: S, timeZone: TZ, days: { from: '2026-10-10', to: '2026-10-12' }, level: 'district', includeMoney: true, ...over });

  it('by district: orders by the placed day, delivered and Sales by the delivered day, returned by the returned day', async () => {
    const r = await geoByArea(t.prisma, base());
    expect(r.rows.map((x) => [x.nameEn, x.current.orders, x.current.delivered, x.current.salesMinor, x.current.pieces, x.current.returned])).toEqual([
      ['Dhaka', 1, 2, 120_000, 6, 1],
      ['Bogura', 3, 2, 90_000, 2, 1],
    ]);
    expect(r.rows[0]!.current.returnRate).toBeCloseTo(1 / 3);
    expect(r.rows[1]!.current.returnRate).toBeCloseTo(1 / 3);
    expect(r.rows[0]!.previous).toBeNull();
    expect(r.rows[0]!.delta).toBeNull();
    expect(r.rows[0]!.code).toBe('test.geo.dhk');
    expect(r.rows[0]!.parentNameEn).toBe('Dhaka'); // the division above the district
    expect(r.rows[0]!.lat).toBeCloseTo(23.8223); // the middle of its orders' points
    expect(r.rows[1]!.lat).toBeNull();
    expect(r.unknown).toMatchObject({ orders: 1, delivered: 1, salesMinor: 10_000, returned: 0 });
    expect(r.total).toMatchObject({ orders: 5, delivered: 5, salesMinor: 220_000, returned: 2 });
    expect(r.unknownShare).toBeCloseTo(1 / 5);
    expect(r.totalPrevious).toBeNull();
  });

  it('keeps the rules of Sales by area: the same Sales, delivered, pieces and returns on the same days', async () => {
    const geo = await geoByArea(t.prisma, base({ level: 'upazila' }));
    const old = await salesByArea(t.prisma, S, { from: '2026-10-10', to: '2026-10-12' }, { timeZone: TZ, level: 'upazila' });
    expect(geo.rows.map((x) => [x.nameEn, x.current.delivered, x.current.salesMinor, x.current.pieces, x.current.returned]).sort()).toEqual(
      old.rows.map((x) => [x.nameEn, x.delivered, x.salesMinor, x.pieces, x.returned]).sort(),
    );
    expect(geo.total).toMatchObject({ delivered: old.total.delivered, salesMinor: old.total.salesMinor, returned: old.total.returned });
  });

  it('by division, and parts always add up to the whole at every level', async () => {
    const div = await geoByArea(t.prisma, base({ level: 'division' }));
    expect(div.rows.map((x) => [x.nameEn, x.current.orders, x.current.delivered])).toEqual([
      ['Dhaka', 1, 2],
      ['Rajshahi', 3, 2],
    ]);
    expect(div.rows[0]!.parentNameEn).toBeNull();
    for (const level of ['division', 'district', 'upazila', 'area'] as const) {
      const r = await geoByArea(t.prisma, base({ level }));
      for (const k of ['orders', 'delivered', 'salesMinor', 'pieces', 'returned'] as const) {
        const parts = r.rows.reduce((s, x) => s + (x.current[k] ?? 0), 0) + (r.unknown[k] ?? 0) + (r.outside[k] ?? 0);
        expect(parts, `${level} ${k}`).toBe(r.total[k]);
      }
    }
  });

  it('by upazila/thana with the district beside it; a district-only address is unknown at this level', async () => {
    const r = await geoByArea(t.prisma, base({ level: 'upazila' }));
    expect(r.rows.map((x) => [x.nameEn, x.parentNameEn, x.current.orders, x.current.delivered, x.current.salesMinor, x.current.returned])).toEqual([
      ['Mirpur', 'Dhaka', 0, 1, 90_000, 1],
      ['Gabtali', 'Bogura', 2, 1, 50_000, 1],
      ['Savar', 'Dhaka', 1, 1, 30_000, 0],
    ]);
    expect(r.unknown).toMatchObject({ orders: 2, delivered: 2, salesMinor: 50_000 }); // D (district only) and E (no area)
  });

  it('inside Dhaka City by the order’s own area; the rest counted as outside', async () => {
    const r = await geoByArea(t.prisma, base({ level: 'area' }));
    expect(r.rows.map((x) => [x.nameEn, x.current.delivered, x.current.returned])).toEqual([
      ['Mirpur 10', 1, 0],
      ['Mirpur', 0, 1],
    ]);
    expect(r.outside).toMatchObject({ orders: 4, delivered: 3, returned: 1 });
    expect(r.unknown).toMatchObject({ orders: 1, delivered: 1 });
  });

  it('a drill-down reads only what lies under the parent; an order with no area is not under anything', async () => {
    const dhk = await geoByArea(t.prisma, base({ level: 'upazila', parentAreaId: g.dhk! }));
    expect(dhk.rows.map((x) => x.nameEn)).toEqual(['Mirpur', 'Savar']);
    expect(dhk.unknown.orders).toBe(0);
    expect(dhk.total).toMatchObject({ orders: 1, delivered: 2, salesMinor: 120_000, returned: 1 });
    expect(dhk.query.parentAreaId).toBe(g.dhk);
    const bog = await geoByArea(t.prisma, base({ level: 'upazila', parentAreaId: g.bogura! }));
    expect(bog.rows.map((x) => x.nameEn)).toEqual(['Gabtali']);
    expect(bog.unknown).toMatchObject({ delivered: 1, salesMinor: 40_000 }); // D sits on the district itself
    const div = await geoByArea(t.prisma, base({ level: 'district', parentAreaId: g.rajDiv! }));
    expect(div.rows.map((x) => x.nameEn)).toEqual(['Bogura']);
    expect(div.total.delivered).toBe(2);
  });

  it('every row names its top category by pieces of delivered lines', async () => {
    const r = await geoByArea(t.prisma, base());
    expect(r.rows[0]!.topCategory).toMatchObject({ nameEn: 'Caps', pieces: 4 }); // Dhaka: cap 1 + 3, formal 2
    expect(r.rows[1]!.topCategory).toMatchObject({ nameEn: 'Formal', pieces: 2 });
  });

  it('a category (with its sub-categories) or one product takes only its lines’ share', async () => {
    const shirts = await geoByArea(t.prisma, base({ categoryId: ids.shirts! }));
    expect(shirts.rows.map((x) => [x.nameEn, x.current.orders, x.current.delivered, x.current.salesMinor, x.current.pieces, x.current.returned])).toEqual([
      ['Bogura', 3, 2, 90_000, 2, 1],
      ['Dhaka', 0, 1, 72_000, 2, 0], // order A's goods 90,000 spread 80,000 : 20,000
    ]);
    expect(shirts.total).toMatchObject({ delivered: 3, salesMinor: 162_000 });
    const cap = await geoByArea(t.prisma, base({ productId: ids.cap! }));
    expect(cap.rows[0]).toMatchObject({ nameEn: 'Dhaka' });
    expect(cap.rows[0]!.current).toMatchObject({ orders: 1, delivered: 2, salesMinor: 48_000, pieces: 4, returned: 1 });
    expect(cap.unknown).toMatchObject({ delivered: 1, salesMinor: 10_000 });
  });

  it('compares with the previous period; an area with no figure in one period is zero there, not missing', async () => {
    const r = await geoByArea(t.prisma, base({ level: 'upazila', compare: 'previous' }));
    expect(r.query.compareDays).toEqual({ from: '2026-10-07', to: '2026-10-09' });
    const by = Object.fromEntries(r.rows.map((x) => [x.nameEn, x]));
    expect(Object.keys(by).sort()).toEqual(['Dhamrai', 'Gabtali', 'Mirpur', 'Savar']);
    expect(by.Dhamrai!.current).toMatchObject({ orders: 0, delivered: 0, salesMinor: 0 });
    expect(by.Dhamrai!.previous).toMatchObject({ orders: 1, delivered: 1, salesMinor: 10_000 });
    expect(by.Dhamrai!.delta).toMatchObject({ orders: -1, delivered: -1, salesMinor: -10_000 });
    expect(by.Savar!.previous).toMatchObject({ orders: 0, delivered: 0, salesMinor: 0 });
    expect(by.Savar!.delta).toMatchObject({ orders: 1, delivered: 1, salesMinor: 30_000 });
    expect(by.Mirpur!.previous).toMatchObject({ orders: 3, delivered: 1, salesMinor: 20_000, returned: 0 });
    expect(by.Gabtali!.previous).toMatchObject({ orders: 1, delivered: 1, salesMinor: 60_000 });
    expect(r.totalPrevious).toMatchObject({ orders: 5, delivered: 3, salesMinor: 90_000 });
  });

  it('compares with the same days last year and with the caller’s own days', async () => {
    const ly = await geoByArea(t.prisma, base({ compare: 'lastYear' }));
    expect(ly.query.compareDays).toEqual({ from: '2025-10-10', to: '2025-10-12' });
    expect(ly.totalPrevious).toMatchObject({ orders: 0, delivered: 0 });
    const own = await geoByArea(t.prisma, base({ compare: 'custom', compareDays: { from: '2026-10-08', to: '2026-10-08' } }));
    expect(own.totalPrevious).toMatchObject({ delivered: 1, salesMinor: 60_000 }); // K on 8 Oct
    await expect(geoByArea(t.prisma, base({ compare: 'custom' }))).rejects.toThrow(/own days/);
  });

  it('gives no Sales figure, and no difference of it, without the money permission', async () => {
    const r = await geoByArea(t.prisma, base({ compare: 'previous', includeMoney: false }));
    for (const x of r.rows) {
      expect(x.current.salesMinor).toBeNull();
      expect(x.previous!.salesMinor).toBeNull();
      expect(x.delta!.salesMinor).toBeNull();
    }
    expect(r.total.salesMinor).toBeNull();
    expect(r.unknown.salesMinor).toBeNull();
    expect(r.rows[0]!.current.delivered).toBeGreaterThan(0); // the counts stay
    expect(JSON.stringify(r)).not.toMatch(/"salesMinor":\d/);
  });

  it('flags the areas below the minimum orders and still gives their numbers', async () => {
    const r = await geoByArea(t.prisma, base({ minOrders: 2 }));
    expect(r.rows.map((x) => [x.nameEn, x.belowMinOrders])).toEqual([
      ['Dhaka', true],
      ['Bogura', false],
    ]);
    expect(r.rows[0]!.current.orders).toBe(1);
  });

  it('reads nothing of another store, an archived order or a day outside the period; it holds no customer data', async () => {
    const r = await geoByArea(t.prisma, base({ level: 'upazila' }));
    expect(r.rows.find((x) => x.nameEn === 'Gabtali')!.current.salesMinor).toBe(50_000); // H, I and J are not in it
    expect(JSON.stringify(r)).not.toMatch(/phone|customer|email/i);
    const none = await geoByArea(t.prisma, base({ days: { from: '2026-01-01', to: '2026-01-02' } }));
    expect(none.rows).toEqual([]);
    expect(none.unknownShare).toBeNull();
    expect(none.total).toMatchObject({ orders: 0, delivered: 0, returnRate: null });
  });

  it('one area on demand: its figures with everything under it, its top category and top products', async () => {
    const d = await geoAreaDetail(t.prisma, { ...base(), areaId: g.dhk!, topProducts: 5, compare: 'previous' });
    expect(d.level).toBe('district');
    expect(d.current).toMatchObject({ delivered: 2, salesMinor: 120_000, returned: 1, orders: 1 });
    expect(d.previous).toMatchObject({ delivered: 2, salesMinor: 30_000 });
    expect(d.topCategory).toMatchObject({ nameEn: 'Caps', pieces: 4 });
    expect(d.topProducts.map((p) => [p.nameEn, p.pieces, p.salesMinor])).toEqual([
      ['Cap', 4, 48_000],
      ['Shirt', 2, 72_000],
    ]);
    const one = await geoAreaDetail(t.prisma, { ...base(), areaId: g.dhk!, topProducts: 1 });
    expect(one.topProducts).toHaveLength(1);
    const noMoney = await geoAreaDetail(t.prisma, { ...base({ includeMoney: false }), areaId: g.gabtali!, topProducts: 3 });
    expect(noMoney.topProducts.every((p) => p.salesMinor === null)).toBe(true);
    expect(noMoney.current.salesMinor).toBeNull();
    await expect(geoAreaDetail(t.prisma, { ...base(), areaId: '00000000-0000-4000-8000-000000000000', topProducts: 3 })).rejects.toThrow(/no such area/);
  });

  it.skipIf(!process.env.GEO_PERF)('is fast enough on about 100,000 orders over 6 months at the upazila level', async () => {
    const N = 100_000;
    const places = ['mirpur10', 'savar', 'dhamrai', 'gabtali', 'bogura', 'mirpur'];
    const start = Date.UTC(2026, 3, 15);
    for (let from = 0; from < N; from += 5_000) {
      await t.prisma.order.createMany({
        data: Array.from({ length: Math.min(5_000, N - from) }, (_, k) => {
          const i = from + k;
          const day = new Date(start + (i % 180) * 86_400_000 + 6 * 3_600_000);
          return {
            storeId: S,
            number: `P751-${i}`,
            source: 'WEBSITE' as const,
            currency: 'BDT',
            status: i % 9 === 0 ? ('RETURNED' as const) : ('DELIVERED' as const),
            placedAt: day,
            deliveredAt: i % 9 === 0 ? null : day,
            returnedAt: i % 9 === 0 ? day : null,
            areaId: g[places[i % places.length]!]!,
            subtotalMinor: 100_000,
            discountMinor: 0,
            deliveryChargeMinor: 0,
            totalMinor: 100_000,
            paymentMethod: 'COD' as const,
            idempotencyKey: `p751-${i}`,
          };
        }),
      });
    }
    const t0 = Date.now();
    const r = await geoByArea(t.prisma, base({ level: 'upazila', days: { from: '2026-04-15', to: '2026-10-11' }, compare: 'previous' }));
    const ms = Date.now() - t0;
    console.log(`geoByArea, ${N} orders, upazila level, with compare: ${ms} ms`);
    expect(r.total.orders).toBeGreaterThan(N / 2);
    // the plan: over this the daily roll-up table is filed as its own PR
    expect(ms).toBeLessThan(5_000);
  }, 600_000);
});
