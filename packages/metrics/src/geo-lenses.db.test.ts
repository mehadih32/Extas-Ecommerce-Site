// S29 · PR 758, 759 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL; written without being run — no database on
// the machine it was made on): the risk and money-and-stock lenses (PR 758, 759) of Reports › Geography map read the
// shop's own records, by area, for a period; counts only, store-scoped, archived orders left out. Made-up values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { geoMoney, MONEY_PARTS, type MoneyPart } from './geo-money';
import { geoRisk, RISK_PARTS, type RiskPart } from './geo-risk';

const TZ = 'Asia/Dhaka';
const DAYS = { from: '2026-10-01', to: '2026-10-31' };

describe.skipIf(!HAS_TEST_DB)('PR 758, 759 · the Geography map lenses on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const g: Record<string, string> = {};
  const ids: Record<string, string> = {};

  async function place(key: string, level: 'DIVISION' | 'DISTRICT' | 'UPAZILA' | 'THANA' | 'AREA', nameEn: string, parent: string | null) {
    const up = parent ? await t.prisma.geoArea.findUniqueOrThrow({ where: { id: g[parent]! } }) : null;
    g[key] = (await t.prisma.geoArea.create({ data: { level, nameEn, code: `test.lens.${key}`, parentId: up?.id ?? null, ancestorIds: up ? [...up.ancestorIds, up.id] : [], aliases: [], postcodes: [] } })).id;
  }

  async function order(o: {
    area: string | null;
    status?: 'DELIVERED' | 'RETURNED' | 'CANCELLED' | 'PLACED';
    store?: number;
    archived?: boolean;
    customer?: string | null;
    placed?: string;
    at?: string;
    charge?: number;
    cancelReason?: string;
    riskBand?: string;
    product?: string | null;
    total?: number;
    qty?: number;
  }): Promise<string> {
    n += 1;
    const status = o.status ?? 'DELIVERED';
    const at = new Date(o.at ?? '2026-10-10T06:00:00Z');
    const total = o.total ?? 1000;
    const row = await t.prisma.order.create({
      data: {
        storeId: o.store ?? S,
        number: `L758-${n}`,
        source: 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: new Date(o.placed ?? '2026-10-05T06:00:00Z'),
        deliveredAt: status === 'DELIVERED' ? at : null,
        returnedAt: status === 'RETURNED' ? at : null,
        cancelledAt: status === 'CANCELLED' ? at : null,
        cancelReasonCode: o.cancelReason ?? null,
        archivedAt: o.archived ? new Date() : null,
        customerId: o.customer ?? null,
        areaId: o.area ? g[o.area]! : null,
        subtotalMinor: total,
        deliveryChargeMinor: o.charge ?? 100,
        totalMinor: total + (o.charge ?? 100),
        paymentMethod: 'COD',
        riskScore: o.riskBand ? 80 : null,
        riskBand: o.riskBand ?? null,
        idempotencyKey: `l758-${n}`,
      },
    });
    if (o.product !== undefined)
      await t.prisma.orderItem.create({ data: { storeId: o.store ?? S, orderId: row.id, productId: o.product, sku: `SKU-758-${n}`, productName: 'Sample', quantity: o.qty ?? 1, unitPriceMinor: total, lineTotalMinor: total, status: 'ACTIVE' } });
    return row.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-geo-lenses');
    [S, O] = await seedSampleStores(t.prisma);
    await place('rajDiv', 'DIVISION', 'Rajshahi', null);
    await place('bogura', 'DISTRICT', 'Bogura', 'rajDiv');
    await place('gabtali', 'UPAZILA', 'Gabtali', 'bogura');
    await place('sherpur', 'UPAZILA', 'Sherpur', 'bogura');
    const cat = await t.prisma.category.create({ data: { storeId: S, slug: 'lens-polo', nameEn: 'Polo' } });
    ids.polo = (await t.prisma.product.create({ data: { storeId: S, slug: 'lens-polo-1', nameEn: 'Polo shirt', categoryId: cat.id } })).id;
    ids.tee = (await t.prisma.product.create({ data: { storeId: S, slug: 'lens-tee-1', nameEn: 'Tee', categoryId: cat.id } })).id;
    ids.old = (await t.prisma.customer.create({ data: { storeId: S, phone: '+8801700007580', name: 'Sample old' } })).id; // hardcode-ok: a made-up test number
    ids.fresh = (await t.prisma.customer.create({ data: { storeId: S, phone: '+8801700007581', name: 'Sample new' } })).id; // hardcode-ok: a made-up test number

    // risk
    const back = await order({ area: 'gabtali', status: 'RETURNED', at: '2026-10-12T06:00:00Z' });
    await order({ area: 'gabtali' });
    await order({ area: 'gabtali', status: 'CANCELLED', cancelReason: 'changed-mind' });
    await order({ area: 'gabtali', status: 'PLACED', riskBand: 'high' });
    await order({ area: 'sherpur', status: 'PLACED', riskBand: 'low' });
    await order({ area: 'gabtali', status: 'CANCELLED', cancelReason: 'x', archived: true });
    await order({ area: 'gabtali', status: 'CANCELLED', cancelReason: 'x', store: O });
    await t.prisma.returnRecord.create({ data: { storeId: S, orderId: back, kind: 'REFUSED_AT_DOOR', ourFault: false, createdAt: new Date('2026-10-12T08:00:00Z') } });
    await t.prisma.returnRecord.create({ data: { storeId: S, orderId: back, kind: 'REFUSED_AT_DOOR', ourFault: true, createdAt: new Date('2026-10-12T09:00:00Z') } });
    await t.prisma.ticket.create({ data: { storeId: S, orderId: back, subject: 'Where is it', status: 'OPEN', createdAt: new Date('2026-10-13T06:00:00Z') } });
    await t.prisma.ticket.create({ data: { storeId: S, subject: 'No order', status: 'OPEN', createdAt: new Date('2026-10-13T06:00:00Z') } });

    // money and stock: delivered orders with a product
    await order({ area: 'gabtali', product: ids.polo, total: 3000, qty: 3, charge: 60 });
    await order({ area: 'sherpur', product: ids.polo, total: 1000, qty: 1, charge: 0 });
    await order({ area: 'sherpur', product: ids.tee, total: 2000, qty: 2, charge: 100 });
  });
  afterAll(async () => t?.drop());

  it('risk: returns, refusals (the shop\'s own fault apart), cancels with their reasons, risk and tickets, by upazila', async () => {
    const r = await geoRisk(t.prisma, S, DAYS, { timeZone: TZ, level: 'upazila', minOrders: 1, warnReturnPct: 10, topBandKey: 'high', parts: new Set<RiskPart>(RISK_PARTS) });
    const gab = r.rows.find((x) => x.nameEn === 'Gabtali')!;
    expect(gab.figures).toMatchObject({ returned: 1, refusedAtDoor: 1, refusedOurFault: 1, cancelled: 1, scored: 1, highRisk: 1, tickets: 1 });
    expect(gab.flags).toEqual(expect.arrayContaining(['returnHotspot', 'riskArea']));
    expect(r.extras.cancelReasons).toEqual([{ key: 'changed-mind', count: 1 }]); // the archived and the other store's are never read
    expect(r.extras.ticketsWithoutOrder).toBe(1);
    expect(r.rows.find((x) => x.nameEn === 'Sherpur')!.figures).toMatchObject({ highRisk: 0, scored: 1 });
  });

  it('risk: a part the viewer may not see is null and is not even read', async () => {
    const r = await geoRisk(t.prisma, S, DAYS, { timeZone: TZ, level: 'district', minOrders: 1, warnReturnPct: 10, topBandKey: 'high', parts: new Set<RiskPart>(['returns']) });
    expect(r.rows[0]!.figures).toMatchObject({ refusedAtDoor: null, tickets: null, highRisk: null });
    expect(r.hidden).toEqual(['refusals', 'cancels', 'risk', 'claims', 'tickets']);
  });

  it('money and stock: delivery charge collected and the styles that sell in each area; no courier charge is never 0', async () => {
    const profit = { currency: 'BDT', timeZone: TZ, packagingMinor: null, gatewayFee: () => null, ads: { allocate: false, basis: 'month' as const } };
    const r = await geoMoney(t.prisma, S, DAYS, { profit, level: 'upazila', minOrders: 1, topProducts: 3, parts: new Set<MoneyPart>(MONEY_PARTS) });
    const sher = r.rows.find((x) => x.nameEn === 'Sherpur')!;
    expect(sher.figures).toMatchObject({ deliveryChargeMinor: 100, freeDeliveryOrders: 1, pieces: 3 });
    expect(sher.figures.courierMinor).toBeNull(); // the parcels have no courier charge yet
    const stock = r.extras.stock as Record<string, { productId: string; pieces: number; nameEn: string }[]>;
    expect(stock[sher.areaId]!.map((e) => [e.nameEn, e.pieces])).toEqual([['Tee', 2], ['Polo shirt', 1]]);
    expect(r.total.salesMinor).toBeGreaterThan(0);
  });

  it('money: without books.read there is no money in any row', async () => {
    const profit = { currency: 'BDT', timeZone: TZ, packagingMinor: null, gatewayFee: () => null, ads: { allocate: false, basis: 'month' as const } };
    const r = await geoMoney(t.prisma, S, DAYS, { profit, level: 'district', minOrders: 1, topProducts: 3, parts: new Set<MoneyPart>(['stock']) });
    expect(r.rows[0]!.figures).toMatchObject({ salesMinor: null, deliveryChargeMinor: null, adSpendMinor: null });
    expect(r.hidden).toEqual(['delivery', 'ads']);
  });
});
