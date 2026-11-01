// S16 · PR 568 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): Sales and returns by area — delivered
// orders of the period by their delivered day, returned orders by their returned day, rolled up to district, upazila/
// thana or the areas inside Dhaka City; a category (with its sub-categories) or a product takes only its lines' share;
// no area → unknown; outside Dhaka City counted apart; another store's and archived orders never read. Made-up values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { salesByArea } from './areas';
import { profitAndLoss } from './pnl';

const TZ = 'Asia/Dhaka';

describe.skipIf(!HAS_TEST_DB)('PR 568 · sales by area on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const g: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function place(key: string, level: 'DIVISION' | 'DISTRICT' | 'UPAZILA' | 'THANA' | 'AREA', nameEn: string, parent: string | null, extra: { cityCorporation?: string; lat?: number; lng?: number } = {}) {
    const up = parent ? await t.prisma.geoArea.findUniqueOrThrow({ where: { id: g[parent]! } }) : null;
    g[key] = (await t.prisma.geoArea.create({ data: { level, nameEn, code: `test.${key}`, parentId: up?.id ?? null, ancestorIds: up ? [...up.ancestorIds, up.id] : [], aliases: [], postcodes: [], ...extra } })).id;
  }

  async function order(o: { area?: string | null; status?: 'DELIVERED' | 'RETURNED'; at?: string; store?: number; archived?: boolean; discount?: number; lines: { product: string | null; total: number; qty?: number }[] }) {
    n += 1;
    const storeId = o.store ?? S;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const at = new Date(o.at ?? '2026-10-10T06:00:00Z');
    const status = o.status ?? 'DELIVERED';
    const row = await t.prisma.order.create({
      data: {
        storeId,
        number: `L568-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date('2026-10-01T04:00:00Z'),
        deliveredAt: status === 'DELIVERED' ? at : null,
        returnedAt: status === 'RETURNED' ? at : null,
        archivedAt: o.archived ? new Date() : null,
        areaId: o.area === undefined ? null : o.area === null ? null : g[o.area]!,
        subtotalMinor: sub,
        discountMinor: o.discount ?? 0,
        deliveryChargeMinor: 0,
        totalMinor: sub - (o.discount ?? 0),
        paymentMethod: 'COD',
        idempotencyKey: `l568-${n}`,
      },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, productId: l.product, sku: `SKU-568-${n}`, productName: 'Sample', quantity: l.qty ?? 1, unitPriceMinor: l.total, lineTotalMinor: l.total, status: 'ACTIVE' } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-areas');
    [S, O] = await seedSampleStores(t.prisma);
    await place('dhkDiv', 'DIVISION', 'Dhaka', null);
    await place('dhk', 'DISTRICT', 'Dhaka', 'dhkDiv');
    await place('mirpur', 'THANA', 'Mirpur', 'dhk', { cityCorporation: 'DNCC', lat: 23.8223, lng: 90.3654 });
    await place('mirpur10', 'AREA', 'Mirpur 10', 'mirpur');
    await place('savar', 'UPAZILA', 'Savar', 'dhk');
    await place('rajDiv', 'DIVISION', 'Rajshahi', null);
    await place('bogura', 'DISTRICT', 'Bogura', 'rajDiv');
    await place('gabtali', 'UPAZILA', 'Gabtali', 'bogura');
    const shirts = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-shirts', nameEn: 'Shirts' } });
    const formal = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-formal', nameEn: 'Formal', parentId: shirts.id } });
    const caps = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-caps', nameEn: 'Caps' } });
    ids.shirts = shirts.id;
    ids.shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-shirt', nameEn: 'Shirt', categoryId: formal.id } })).id;
    ids.cap = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-cap', nameEn: 'Cap', categoryId: caps.id } })).id;
    await order({ area: 'mirpur10', discount: 10_000, lines: [{ product: ids.shirt, total: 80_000, qty: 2 }, { product: ids.cap, total: 20_000 }] }); // goods 90,000
    await order({ area: 'savar', lines: [{ product: ids.cap, total: 30_000, qty: 3 }] });
    await order({ area: 'gabtali', lines: [{ product: ids.shirt, total: 50_000 }] });
    await order({ area: 'bogura', lines: [{ product: ids.shirt, total: 40_000 }] }); // district only
    await order({ area: null, lines: [{ product: ids.cap, total: 10_000 }] });
    await order({ area: 'gabtali', status: 'RETURNED', lines: [{ product: ids.shirt, total: 50_000 }] });
    await order({ area: 'mirpur', status: 'RETURNED', at: '2026-10-11T19:00:00Z', lines: [{ product: ids.cap, total: 20_000 }] }); // 12 Oct in Dhaka
    await order({ area: 'gabtali', at: '2026-10-25T06:00:00Z', lines: [{ product: ids.shirt, total: 99_000 }] }); // outside the period
    await order({ area: 'gabtali', archived: true, lines: [{ product: ids.shirt, total: 99_000 }] });
    await order({ area: 'gabtali', store: O, lines: [{ product: null, total: 99_000 }] });
  });
  afterAll(async () => t?.drop());

  const days = { from: '2026-10-10', to: '2026-10-12' };

  it('by district: Sales of delivered orders, pieces, returns and the return rate; the total matches Profit & loss', async () => {
    const r = await salesByArea(t.prisma, S, days, { timeZone: TZ, level: 'district' });
    expect(r.rows.map((x) => [x.nameEn, x.delivered, x.salesMinor, x.pieces, x.returned])).toEqual([
      ['Dhaka', 2, 120_000, 6, 1],
      ['Bogura', 2, 90_000, 2, 1],
    ]);
    expect(r.rows[0]!.returnRate).toBeCloseTo(1 / 3);
    expect(r.rows[0]!.parentNameEn).toBeNull();
    // Dhaka district has no point of its own: the middle of its orders' points (Mirpur's, for Mirpur 10 and Mirpur)
    expect(r.rows[0]!.lat).toBeCloseTo(23.8223);
    expect(r.rows[1]!.lat).toBeNull();
    expect(r.unknown).toMatchObject({ delivered: 1, salesMinor: 10_000, returned: 0 });
    expect(r.total).toMatchObject({ delivered: 5, salesMinor: 220_000, returned: 2 });
    const pnl = await profitAndLoss(t.prisma, S, days, { timeZone: TZ, currency: 'BDT', packagingMinor: null, gatewayFee: () => null });
    expect(r.total.salesMinor).toBe(pnl.salesMinor);
  });

  it('by upazila/thana with the district beside it; a district-only address is unknown at this level', async () => {
    const r = await salesByArea(t.prisma, S, days, { timeZone: TZ, level: 'upazila' });
    expect(r.rows.map((x) => [x.nameEn, x.parentNameEn, x.delivered, x.salesMinor, x.returned])).toEqual([
      ['Mirpur', 'Dhaka', 1, 90_000, 1],
      ['Gabtali', 'Bogura', 1, 50_000, 1],
      ['Savar', 'Dhaka', 1, 30_000, 0],
    ]);
    expect(r.rows[0]!.lat).toBeCloseTo(23.8223);
    expect(r.rows[1]!.returnRate).toBe(0.5);
    expect(r.unknown).toMatchObject({ delivered: 2, salesMinor: 50_000 });
  });

  it('inside Dhaka City by the order’s own area; the rest counted as outside', async () => {
    const r = await salesByArea(t.prisma, S, days, { timeZone: TZ, level: 'dhaka' });
    expect(r.rows.map((x) => [x.nameEn, x.delivered, x.returned])).toEqual([
      ['Mirpur 10', 1, 0],
      ['Mirpur', 0, 1],
    ]);
    expect(r.outside).toMatchObject({ delivered: 3, salesMinor: 120_000, returned: 1 });
    expect(r.unknown).toMatchObject({ delivered: 1 });
  });

  it('a category with its sub-categories, or one product, takes only its lines’ share of the goods', async () => {
    const shirts = await salesByArea(t.prisma, S, days, { timeZone: TZ, level: 'district', categoryId: ids.shirts });
    // order 1: 90,000 over 80,000 / 20,000 → 72,000 for the shirts, 2 pieces
    expect(shirts.rows.map((x) => [x.nameEn, x.delivered, x.salesMinor, x.pieces, x.returned])).toEqual([
      ['Bogura', 2, 90_000, 2, 1],
      ['Dhaka', 1, 72_000, 2, 0],
    ]);
    expect(shirts.unknown.delivered).toBe(0);
    const cap = await salesByArea(t.prisma, S, days, { timeZone: TZ, level: 'district', productId: ids.cap, categoryId: ids.shirts });
    expect(cap.total).toMatchObject({ delivered: 3, salesMinor: 18_000 + 30_000 + 10_000, pieces: 5, returned: 1 });
  });

  it('an empty period is all zero with no rate', async () => {
    const r = await salesByArea(t.prisma, S, { from: '2026-09-01', to: '2026-09-02' }, { timeZone: TZ, level: 'district' });
    expect(r.rows).toEqual([]);
    expect(r.total).toEqual({ delivered: 0, salesMinor: 0, pieces: 0, returned: 0, returnRate: null });
  });
});
