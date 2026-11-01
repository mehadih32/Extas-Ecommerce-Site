// S16 · PR 504 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): profit by category and by style — each
// delivered order's profit spread over its counted lines (Sales by line totals, own cost snapshot, the order's delivery
// charge and costs and its ad share by Sales share), a group carrying everything under it, an order without a cost
// left out of profit and shown as "no cost yet", lines with no group last. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { profitByGroup } from './group-profit';
import type { ProfitInputs } from './order-profit';
import { profitAndLoss } from './pnl';

const base: ProfitInputs = { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: 1_000, gatewayFee: () => null, ads: { allocate: false, basis: 'month' } };
const days = { from: '2026-10-01', to: '2026-10-31' };

describe.skipIf(!HAS_TEST_DB)('PR 504 · profit by category and style on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let n = 0;
  const ids: Record<string, string> = {};

  async function order(o: { discount?: number; delivery?: number; lines: { product: string | null; total: number; qty?: number; cost: number | null }[] }) {
    n += 1;
    const sub = o.lines.reduce((s, l) => s + l.total, 0);
    const row = await t.prisma.order.create({
      data: { storeId: S, number: `L504-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-10-01T04:00:00Z'), deliveredAt: new Date('2026-10-10T06:00:00Z'), subtotalMinor: sub, discountMinor: o.discount ?? 0, deliveryChargeMinor: o.delivery ?? 0, totalMinor: sub - (o.discount ?? 0) + (o.delivery ?? 0), paymentMethod: 'COD', idempotencyKey: `l504-${n}` },
    });
    for (const l of o.lines)
      await t.prisma.orderItem.create({ data: { storeId: S, orderId: row.id, productId: l.product, sku: `SKU-504-${n}`, productName: 'Sample', quantity: l.qty ?? 1, unitPriceMinor: l.total, lineTotalMinor: l.total, unitCostMinor: l.cost, status: 'ACTIVE' } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-group-profit');
    [S] = await seedSampleStores(t.prisma);
    const shirts = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-shirts', nameEn: 'Shirts' } });
    const formal = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-formal', nameEn: 'Formal', parentId: shirts.id } });
    const caps = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-caps', nameEn: 'Caps' } });
    const polo = await t.prisma.styleGroup.create({ data: { storeId: S, level: 1, path: 'Polo', name: 'Polo', ancestorIds: [] } });
    const rl = await t.prisma.styleGroup.create({ data: { storeId: S, level: 2, path: 'Polo / Sample polo', name: 'Sample polo', parentId: polo.id, ancestorIds: [polo.id] } });
    const solid = await t.prisma.styleGroup.create({ data: { storeId: S, level: 3, path: 'Polo / Sample polo / Solid', name: 'Solid', parentId: rl.id, ancestorIds: [polo.id, rl.id] } });
    Object.assign(ids, { shirts: shirts.id, formal: formal.id, caps: caps.id, polo: polo.id, rl: rl.id, solid: solid.id });
    ids.shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-shirt', nameEn: 'Shirt', categoryId: formal.id, styleGroupId: solid.id } })).id;
    ids.cap = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-cap', nameEn: 'Cap', categoryId: caps.id } })).id;
    // goods 90,000 → 72,000 / 18,000; delivery 10,000 − packaging 1,000 = 9,000 → 7,200 / 1,800
    await order({ discount: 10_000, delivery: 10_000, lines: [{ product: ids.shirt, total: 80_000, qty: 2, cost: 25_000 }, { product: ids.cap, total: 20_000, cost: 8_000 }] });
    await order({ lines: [{ product: ids.shirt, total: 40_000, cost: null }] }); // no cost yet
    await order({ lines: [{ product: null, total: 10_000, cost: 3_000 }] }); // no group; packaging 1,000
  });
  afterAll(async () => t?.drop());

  it('by category: each group with everything under it, tree order, no group last; the total matches Profit & loss', async () => {
    const r = await profitByGroup(t.prisma, S, days, 'category', base);
    expect(r.rows.map((x) => [x.name, x.depth, x.orders, x.pieces, x.salesMinor, x.uncostedSalesMinor, x.grossProfitMinor, x.orderCostsMinor, x.profitMinor])).toEqual([
      ['Shirts', 0, 2, 3, 112_000, 40_000, 22_000, 7_200, 29_200],
      ['Formal', 1, 2, 3, 112_000, 40_000, 22_000, 7_200, 29_200],
      ['Caps', 0, 1, 1, 18_000, 0, 10_000, 1_800, 11_800],
      [null, 0, 1, 1, 10_000, 0, 7_000, -1_000, 6_000],
    ]);
    expect(r.total).toMatchObject({ orders: 3, salesMinor: 140_000, uncostedSalesMinor: 40_000, profitMinor: 47_000, missingLines: 0 });
    const pnl = await profitAndLoss(t.prisma, S, days, base);
    expect(r.total.salesMinor).toBe(pnl.salesMinor);
    expect(r.total.profitMinor).toBe(pnl.contributionMinor);
  });

  it('by style: Polo → Sample polo → Solid; with ad spend spread over the month’s delivered orders', async () => {
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-504', name: 'Sample ads', currency: 'BDT' } });
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, date: new Date('2026-10-05T00:00:00Z'), platform: 'META', spendMinor: 30_000, currency: 'BDT' } });
    const r = await profitByGroup(t.prisma, S, days, 'style', { ...base, ads: { allocate: true, basis: 'month' } });
    expect(r.rows.map((x) => [x.name, x.depth, x.salesMinor, x.adsMinor, x.profitMinor])).toEqual([
      ['Polo', 0, 112_000, 8_000, 21_200],
      ['Sample polo', 1, 112_000, 8_000, 21_200],
      ['Solid', 2, 112_000, 8_000, 21_200],
      [null, 0, 28_000, 12_000, 5_800], // the cap (11,800 − 2,000) and the line with no product (6,000 − 10,000)
    ]);
    expect(r.total.profitMinor).toBe(47_000 - 20_000);
  });

  it('a part not known yet is left out and counted; an empty period has no rows', async () => {
    const r = await profitByGroup(t.prisma, S, days, 'category', { ...base, packagingMinor: null });
    expect(r.rows[0]).toMatchObject({ name: 'Shirts', orderCostsMinor: 8_000, missingLines: 1 });
    const none = await profitByGroup(t.prisma, S, { from: '2026-09-01', to: '2026-09-30' }, 'style', base);
    expect(none.rows).toEqual([]);
    expect(none.total.salesMinor).toBe(0);
  });
});
