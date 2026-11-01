// S16 · PR 355 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the period's delivered orders by channel —
// the platform's own tag, a campaign of one of the shop's ad accounts, a paid UTM medium with a platform's source (an
// unknown source = other ads), organic web orders, and every other order source on its own — with their returns, the
// contribution of costed orders (an uncosted order's Sales named), the parcels that came back in the period, the ad
// spend per platform (spend with no order still shown) and profit after ads. Another store is never read. Values made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { channelOf, profitByChannel, type ChannelRules } from './channels';
import { type ProfitInputs } from './order-profit';

const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));
const inputs: ProfitInputs = { currency: 'BDT', timeZone: 'Asia/Dhaka', packagingMinor: 0, gatewayFee: () => 0, ads: { allocate: true, basis: 'month' } };
const rules: ChannelRules = { paidMediums: ['cpc', 'paid'], platforms: [{ platform: 'META', sources: ['facebook', 'ig'] }, { platform: 'GOOGLE', sources: ['google'] }] };
const days = { from: '2026-10-01', to: '2026-10-31' };

describe('PR 355 · which channel an order is in', () => {
  const o = (x: Partial<Parameters<typeof channelOf>[0]>) => ({ source: 'WEBSITE', adPlatform: null, campaignPlatform: null, utmSource: null, utmMedium: null, ...x });
  it('the platform’s own tag first, then the campaign, then paid UTM words; web without them is organic', () => {
    expect(channelOf(o({ adPlatform: 'tiktok', utmMedium: 'cpc', utmSource: 'google' }), rules)).toBe('ads:TIKTOK');
    expect(channelOf(o({ campaignPlatform: 'GOOGLE' }), rules)).toBe('ads:GOOGLE');
    expect(channelOf(o({ utmMedium: ' CPC ', utmSource: 'IG' }), rules)).toBe('ads:META');
    expect(channelOf(o({ utmMedium: 'paid', utmSource: 'newsletter' }), rules)).toBe('ads:OTHER');
    expect(channelOf(o({ utmMedium: 'email', utmSource: 'facebook' }), rules)).toBe('organic');
    expect(channelOf(o({ source: 'LANDING_PAGE' }), rules)).toBe('organic');
    expect(channelOf(o({ source: 'MESSENGER' }), rules)).toBe('source:MESSENGER');
    expect(channelOf(o({ source: 'MESSENGER', adPlatform: 'META' }), rules)).toBe('ads:META');
    expect(channelOf(o({ adPlatform: 'snapchat' }), rules)).toBe('organic');
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 355 · profit by channel on PostgreSQL', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;

  async function order(x: { store?: number; source?: 'WEBSITE' | 'MESSENGER' | 'PHONE'; status?: 'DELIVERED' | 'RETURNED'; total: number; cost: number | null; adPlatform?: string; campaign?: string; utmSource?: string; utmMedium?: string }) {
    n += 1;
    const storeId = x.store ?? S;
    const status = x.status ?? 'DELIVERED';
    const row = await t.prisma.order.create({
      data: { storeId, number: `H355-${n}`, source: x.source ?? 'WEBSITE', currency: 'BDT', status, placedAt: at(5), deliveredAt: status === 'DELIVERED' ? at(10) : null, returnedAt: status === 'RETURNED' ? at(12) : null, subtotalMinor: x.total, deliveryChargeMinor: 5_000, totalMinor: x.total + 5_000, paymentMethod: 'COD', adPlatform: x.adPlatform ?? null, adCampaignId: x.campaign ?? null, utmSource: x.utmSource ?? null, utmMedium: x.utmMedium ?? null, idempotencyKey: `h355-${n}` },
    });
    await t.prisma.orderItem.create({ data: { storeId, orderId: row.id, sku: `SKU-355-${n}`, productName: 'Sample', quantity: 1, unitPriceMinor: x.total, lineTotalMinor: x.total, unitCostMinor: x.cost } });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-channels');
    [S, O] = await seedSampleStores(t.prisma);
    const meta = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-355', name: 'Sample Meta', currency: 'BDT' } });
    const google = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'GOOGLE', externalId: 'g-355', name: 'Sample Google', currency: 'USD' } });
    const tiktok = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'TIKTOK', externalId: 't-355', name: 'Sample TikTok', currency: 'BDT' } });
    const camp = await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: meta.id, externalId: 'c-355', name: 'Sample campaign', status: 'ACTIVE', currency: 'BDT' } });
    await order({ adPlatform: 'META', total: 100_000, cost: 50_000 });
    await order({ campaign: camp.id, source: 'MESSENGER', total: 60_000, cost: 30_000 });
    await order({ utmMedium: 'cpc', utmSource: 'google', total: 80_000, cost: null }); // Google, no cost yet
    await order({ total: 50_000, cost: 20_000 }); // organic
    await order({ source: 'PHONE', total: 40_000, cost: 25_000 });
    await order({ adPlatform: 'META', status: 'RETURNED', total: 70_000, cost: 35_000 }); // came back in the period
    await order({ store: O, adPlatform: 'META', total: 999_000, cost: 1 });
    const spend = (adAccountId: string, platform: 'META' | 'GOOGLE' | 'TIKTOK', minor: number, currency: string, storeMinor: number | null) =>
      t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId, date: new Date('2026-10-08T00:00:00Z'), platform, spendMinor: minor, currency, spendStoreMinor: storeMinor } });
    await spend(meta.id, 'META', 40_000, 'BDT', null);
    await spend(google.id, 'GOOGLE', 100, 'USD', null); // no taka amount yet: unknown
    await spend(tiktok.id, 'TIKTOK', 9_000, 'BDT', null); // spend with no order
  });
  afterAll(async () => t?.drop());

  it('each channel with Sales, contribution, returns, ad spend and profit after ads; the total adds up', async () => {
    const r = await profitByChannel(t.prisma, S, days, inputs, rules);
    const row = (k: string) => r.rows.find((x) => x.key === k)!;
    expect(r.rows.map((x) => x.key)).toEqual(['ads:META', 'ads:TIKTOK', 'ads:GOOGLE', 'organic', 'source:PHONE']);
    expect(row('ads:META')).toMatchObject({ orders: 2, salesMinor: 160_000, contributionMinor: 160_000 + 10_000 - 80_000, returnedOrders: 1, returnRatePct: 33.3, adSpendMinor: 40_000, profitMinor: 90_000 - 40_000 });
    expect(row('ads:GOOGLE')).toMatchObject({ orders: 1, salesMinor: 80_000, uncostedSalesMinor: 80_000, contributionMinor: 0, adSpendMinor: null, profitMinor: null });
    expect(row('ads:TIKTOK')).toMatchObject({ orders: 0, adSpendMinor: 9_000, profitMinor: -9_000, returnRatePct: null });
    expect(row('organic')).toMatchObject({ orders: 1, contributionMinor: 35_000, adSpendMinor: 0, profitMinor: 35_000 });
    expect(row('source:PHONE')).toMatchObject({ orders: 1, contributionMinor: 20_000, profitMinor: 20_000 });
    expect(r.total).toMatchObject({ key: 'total', orders: 5, salesMinor: 330_000, uncostedSalesMinor: 80_000, contributionMinor: 145_000, returnedOrders: 1, adSpendMinor: null, profitMinor: null });
    expect(r.adsImported).toBe(true);
  });
});
