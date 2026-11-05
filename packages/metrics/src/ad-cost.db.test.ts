// S13 · PR 267 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): ad spend per order and per delivered order
// by platform campaign, by platform and for the shop — orders on their placed day, delivered on their delivered day,
// returned on their returned day; a dollar day with no rate makes the spend unknown, never zero; another store and
// days outside the period are never read — and the owner's alert rules held against the figures. Values made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { adAlertHits, adCostPerOrder, type AdCost } from './ad-cost';

const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));
const days = { from: '2026-10-01', to: '2026-10-31' };
const opts = { currency: 'BDT', timeZone: 'Asia/Dhaka', rules: { paidMediums: ['cpc'], platforms: [{ platform: 'GOOGLE' as const, sources: ['google'] }] } };

describe('PR 267 · alert rules against the figures', () => {
  const row = (key: string, x: Partial<AdCost['total']>) => ({ key, platform: null, spendMinor: 0, platformPurchases: 0, orders: 0, delivered: 0, returned: 0, perOrderMinor: null, perDeliveredMinor: null, ...x });
  const cost: AdCost = {
    from: days.from,
    to: days.to,
    campaigns: [row('c1', { spendMinor: 90_000, orders: 3, delivered: 1, perOrderMinor: 30_000, perDeliveredMinor: 90_000 })],
    platforms: [row('META', { spendMinor: 90_000, orders: 3, delivered: 1, perOrderMinor: 30_000, perDeliveredMinor: 90_000 }), row('TIKTOK', { spendMinor: 20_000 }), row('GOOGLE', { spendMinor: null, orders: 1 })],
    total: row('total', { spendMinor: 110_000, orders: 3, delivered: 1, perOrderMinor: 36_667, perDeliveredMinor: 110_000 }),
  };
  it('over the limit, nothing counted while the spend is over it, fine, and unknown spend never alerts', () => {
    const hits = adAlertHits(
      [
        { id: 'a', metric: 'costPerDelivered', scope: { adCampaignId: 'c1' }, thresholdMinor: 50_000 },
        { id: 'b', metric: 'costPerOrder', scope: { adCampaignId: 'c1' }, thresholdMinor: 50_000 },
        { id: 'c', metric: 'costPerOrder', scope: { platform: 'TIKTOK' }, thresholdMinor: 15_000 },
        { id: 'd', metric: 'costPerOrder', scope: { platform: 'TIKTOK' }, thresholdMinor: 25_000 },
        { id: 'e', metric: 'costPerOrder', scope: { platform: 'GOOGLE' }, thresholdMinor: 1 },
        { id: 'f', metric: 'costPerDelivered', scope: null, thresholdMinor: 100_000 },
        { id: 'g', metric: 'costPerOrder', scope: { platform: 'YOUTUBE' }, thresholdMinor: 1 },
      ],
      cost,
    );
    expect(hits.map((h) => [h.ruleId, h.state])).toEqual([
      ['a', 'over'],
      ['b', 'ok'],
      ['c', 'noOrders'],
      ['d', 'ok'],
      ['e', 'unknown'],
      ['f', 'over'],
      ['g', 'ok'],
    ]);
    expect(hits[0]).toMatchObject({ valueMinor: 90_000, spendMinor: 90_000, counted: 1, thresholdMinor: 50_000 });
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 267 · cost per order on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  let metaCamp = '';
  let googleCamp = '';

  async function order(x: { store?: number; status?: 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'DRAFT'; placed?: Date; delivered?: Date; adPlatform?: string; campaign?: string; utmSource?: string; utmMedium?: string }) {
    n += 1;
    const status = x.status ?? 'DELIVERED';
    await t.prisma.order.create({
      data: { storeId: x.store ?? S, number: `H267-${n}`, source: 'WEBSITE', currency: 'BDT', status, placedAt: x.placed ?? at(5), deliveredAt: status === 'DELIVERED' ? (x.delivered ?? at(10)) : null, returnedAt: status === 'RETURNED' ? at(12) : null, subtotalMinor: 100_000, deliveryChargeMinor: 0, totalMinor: 100_000, paymentMethod: 'COD', adPlatform: x.adPlatform ?? null, adCampaignId: x.campaign ?? null, utmSource: x.utmSource ?? null, utmMedium: x.utmMedium ?? null, idempotencyKey: `h267-${n}` },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-ad-cost');
    [S, O] = await seedSampleStores(t.prisma);
    const meta = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-267', name: 'Sample Meta', currency: 'BDT' } });
    const google = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'GOOGLE', externalId: 'g-267', name: 'Sample Google', currency: 'USD' } });
    const tiktok = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'TIKTOK', externalId: 't-267', name: 'Sample TikTok', currency: 'BDT' } });
    metaCamp = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: meta.id, externalId: 'c-267', name: 'Sample Meta campaign', status: 'ACTIVE', currency: 'BDT' } })).id;
    googleCamp = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: google.id, externalId: 'gc-267', name: 'Sample Google campaign', status: 'ACTIVE', currency: 'USD' } })).id;
    // Meta campaign: 4 placed in the period (2 delivered, 1 still on the road, 1 came back), 1 placed in September but delivered in the period, 1 draft
    await order({ campaign: metaCamp });
    await order({ campaign: metaCamp });
    await order({ campaign: metaCamp, status: 'IN_TRANSIT' });
    await order({ campaign: metaCamp, status: 'RETURNED' });
    await order({ campaign: metaCamp, placed: new Date(Date.UTC(2026, 8, 28, 6)) });
    await order({ campaign: metaCamp, status: 'DRAFT' });
    await order({ adPlatform: 'META', status: 'IN_TRANSIT' }); // the pixel's tag, no campaign: Meta's, not the campaign's
    await order({ utmMedium: 'cpc', utmSource: 'google', status: 'IN_TRANSIT' }); // the owner's UTM words: Google
    await order({}); // organic: not counted
    await order({ store: O, campaign: metaCamp });
    const spend = (adAccountId: string, adCampaignId: string | null, platform: 'META' | 'GOOGLE' | 'TIKTOK', day: string, minor: number, currency: string, storeMinor: number | null, purchases = 0) =>
      t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId, adCampaignId, date: new Date(`${day}T00:00:00Z`), platform, spendMinor: minor, currency, spendStoreMinor: storeMinor, purchases } });
    await spend(meta.id, metaCamp, 'META', '2026-10-08', 120_000, 'BDT', null, 6);
    await spend(meta.id, metaCamp, 'META', '2026-09-30', 999_000, 'BDT', null); // outside the period
    await spend(meta.id, null, 'META', '2026-10-09', 30_000, 'BDT', null); // account-level spend: Meta's, no campaign
    await spend(google.id, googleCamp, 'GOOGLE', '2026-10-08', 1_000, 'USD', 120_000);
    await spend(google.id, googleCamp, 'GOOGLE', '2026-10-09', 1_000, 'USD', null); // no rate for this day yet
    await spend(tiktok.id, null, 'TIKTOK', '2026-10-08', 25_000, 'BDT', null); // spend with no order
  });
  afterAll(async () => t?.drop());

  it('per campaign, per platform and for the shop; unknown spend stays unknown', async () => {
    const r = await adCostPerOrder(t.prisma, S, days, opts);
    expect(r.campaigns.find((x) => x.key === metaCamp)).toMatchObject({ platform: 'META', spendMinor: 120_000, platformPurchases: 6, orders: 4, delivered: 3, returned: 1, perOrderMinor: 30_000, perDeliveredMinor: 40_000 });
    expect(r.campaigns.find((x) => x.key === googleCamp)).toMatchObject({ platform: 'GOOGLE', spendMinor: null, orders: 0, perOrderMinor: null });
    expect(r.platforms.map((x) => x.key)).toEqual(['META', 'TIKTOK', 'GOOGLE']);
    expect(r.platforms[0]).toMatchObject({ spendMinor: 150_000, orders: 5, delivered: 3, perOrderMinor: 30_000, perDeliveredMinor: 50_000 });
    expect(r.platforms[1]).toMatchObject({ spendMinor: 25_000, orders: 0, perOrderMinor: null, perDeliveredMinor: null });
    expect(r.platforms[2]).toMatchObject({ spendMinor: null, orders: 1 });
    expect(r.total).toMatchObject({ spendMinor: null, orders: 6, delivered: 3, returned: 1, perOrderMinor: null });
    const hits = adAlertHits([{ id: 'x', metric: 'costPerDelivered', scope: { adCampaignId: metaCamp }, thresholdMinor: 35_000 }, { id: 'y', metric: 'costPerOrder', scope: { platform: 'TIKTOK' }, thresholdMinor: 20_000 }], r);
    expect(hits.map((h) => h.state)).toEqual(['over', 'noOrders']);
  });
});
