// S13 · PR 269 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): delivered sales and delivered ROAS by
// platform campaign, product and district — only orders delivered in the period that carry a campaign; the campaign's
// spend shared out over its delivered orders and, inside an order, over its lines; a campaign with spend and no delivered
// order is unshared; a dollar day with no rate makes the spend unknown, never zero; another store is never read. Values
// made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { adDeliveredReturn } from './ad-return';

const days = { from: '2026-10-01', to: '2026-10-31' };
const opts = { currency: 'BDT', timeZone: 'Asia/Dhaka' };

describe.skipIf(!HAS_TEST_DB)('PR 269 · delivered ROAS by campaign, product and district (real PostgreSQL)', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const c: Record<string, string> = {};
  const p: Record<string, string> = {};
  const g: Record<string, string> = {};

  async function order(x: { campaign?: string; store?: number; status?: 'DELIVERED' | 'IN_TRANSIT'; delivered?: Date; area?: string; lines: { product: string; total: number }[] }) {
    n += 1;
    const storeId = x.store ?? S;
    const status = x.status ?? 'DELIVERED';
    const total = x.lines.reduce((a, l) => a + l.total, 0);
    const row = await t.prisma.order.create({
      data: { storeId, number: `H269-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: new Date(Date.UTC(2026, 9, 3, 6)), deliveredAt: status === 'DELIVERED' ? (x.delivered ?? new Date(Date.UTC(2026, 9, 8, 6))) : null, subtotalMinor: total, deliveryChargeMinor: 0, totalMinor: total, paymentMethod: 'COD', adCampaignId: x.campaign ?? null, areaId: x.area ? g[x.area]! : null, idempotencyKey: `h269-${n}` },
    });
    for (const l of x.lines) await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, productId: l.product, sku: `SKU-269-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: l.total, lineTotalMinor: l.total, status: 'ACTIVE' } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-ad-return');
    [S, O] = await seedSampleStores(t.prisma);
    const div = await t.prisma.geoArea.create({ data: { level: 'DIVISION', nameEn: 'Sample division', code: 'test.269.div', ancestorIds: [], aliases: [], postcodes: [] } });
    g.dist = (await t.prisma.geoArea.create({ data: { level: 'DISTRICT', nameEn: 'Sample district', code: 'test.269.dist', parentId: div.id, ancestorIds: [div.id], aliases: [], postcodes: [] } })).id;
    g.thana = (await t.prisma.geoArea.create({ data: { level: 'THANA', nameEn: 'Sample thana', code: 'test.269.thana', parentId: g.dist, ancestorIds: [div.id, g.dist], aliases: [], postcodes: [] } })).id;
    const meta = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-269', name: 'Sample Meta', currency: 'BDT' } });
    const google = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'GOOGLE', externalId: 'g-269', name: 'Sample Google', currency: 'USD' } });
    c.a = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: meta.id, externalId: 'a-269', name: 'Sample A', status: 'ACTIVE', currency: 'BDT' } })).id;
    c.b = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: meta.id, externalId: 'b-269', name: 'Sample B', status: 'ACTIVE', currency: 'BDT' } })).id;
    c.g = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: google.id, externalId: 'g-269', name: 'Sample G', status: 'ACTIVE', currency: 'USD' } })).id;
    p.shirt = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-269-shirt', nameEn: 'Shirt' } })).id;
    p.polo = (await t.prisma.product.create({ data: { storeId: S, slug: 'sample-269-polo', nameEn: 'Polo' } })).id;
    const spend = (adAccountId: string, adCampaignId: string, platform: 'META' | 'GOOGLE', day: string, minor: number, currency: string, storeMinor: number | null) =>
      t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId, adCampaignId, date: new Date(`${day}T00:00:00Z`), platform, spendMinor: minor, currency, spendStoreMinor: storeMinor } });
    await spend(meta.id, c.a, 'META', '2026-10-05', 100_000, 'BDT', null);
    await spend(meta.id, c.b, 'META', '2026-10-05', 40_000, 'BDT', null); // spend, no delivered order
    await spend(google.id, c.g, 'GOOGLE', '2026-10-05', 1_000, 'USD', null); // no rate yet
    // campaign A: two delivered (one in the thana under the district, one in the district itself), one on the road
    await order({ campaign: c.a, area: 'thana', lines: [{ product: p.shirt, total: 150_000 }, { product: p.polo, total: 50_000 }] });
    await order({ campaign: c.a, area: 'dist', lines: [{ product: p.polo, total: 100_000 }] });
    await order({ campaign: c.a, status: 'IN_TRANSIT', lines: [{ product: p.shirt, total: 999_000 }] });
    await order({ campaign: c.a, delivered: new Date(Date.UTC(2026, 10, 2, 6)), lines: [{ product: p.shirt, total: 999_000 }] }); // after the period
    await order({ campaign: c.g, lines: [{ product: p.polo, total: 80_000 }] }); // no district
    await order({ lines: [{ product: p.shirt, total: 500_000 }] }); // no campaign: not counted
    await order({ store: O, campaign: c.a, lines: [{ product: p.shirt, total: 500_000 }] }); // another store
  });
  afterAll(async () => t?.drop());

  it('by campaign: delivered sales ÷ spend, unknown spend stays unknown, spend with no delivered order is unshared', async () => {
    const r = await adDeliveredReturn(t.prisma, S, days, opts);
    expect(r.campaigns.find((x) => x.key === c.a)).toMatchObject({ platform: 'META', spendMinor: 100_000, delivered: 2, deliveredSalesMinor: 300_000, roasPercent: 300 });
    expect(r.campaigns.find((x) => x.key === c.b)).toMatchObject({ spendMinor: 40_000, delivered: 0, deliveredSalesMinor: 0, roasPercent: 0 });
    expect(r.campaigns.find((x) => x.key === c.g)).toMatchObject({ platform: 'GOOGLE', spendMinor: null, delivered: 1, roasPercent: null });
    expect(r.total).toMatchObject({ spendMinor: null, delivered: 3, deliveredSalesMinor: 380_000 });
    expect(r.unshared).toBe(40_000);
  });

  it('by product and district: each delivered order carries an equal part of its campaign, lines by their totals', async () => {
    const r = await adDeliveredReturn(t.prisma, S, days, opts);
    // A's 100 000 over two orders = 50 000 each; order 1 splits 3:1 (shirt 37 500, polo 12 500), order 2 all polo
    expect(r.products.find((x) => x.key === p.shirt)).toMatchObject({ spendMinor: 37_500, delivered: 1, deliveredSalesMinor: 150_000, roasPercent: 400 });
    expect(r.products.find((x) => x.key === p.polo)).toMatchObject({ spendMinor: null, delivered: 3, deliveredSalesMinor: 230_000, roasPercent: null });
    expect(r.districts.find((x) => x.key === g.dist)).toMatchObject({ spendMinor: 100_000, delivered: 2, deliveredSalesMinor: 300_000, roasPercent: 300 });
    expect(r.districts.find((x) => x.key === '')).toMatchObject({ spendMinor: null, delivered: 1 });
  });
});
