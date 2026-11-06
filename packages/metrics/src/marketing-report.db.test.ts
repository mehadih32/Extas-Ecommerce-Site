// S13 · PR 283 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the marketing report — Ordered value
// (placed in the period) and Sales (delivered in the period) kept apart; every order in one channel; a campaign's orders
// through its ad campaigns or else its landing pages, once; its spend from its ad campaigns; a dollar day with no rate
// makes the spend unknown, never zero; message sends with their cost and their receivers' orders; another store and
// drafts never counted. Values made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { marketingReport, marketingSendsPage, roasOf } from './marketing-report';

const days = { from: '2026-10-01', to: '2026-10-31' };
const rules = { paidMediums: ['cpc', 'paid'], platforms: [{ platform: 'META' as const, sources: ['facebook'] }] };
const opts = { currency: 'BDT', timeZone: 'Asia/Dhaka', rules, resultDays: 7, sendsMax: 50 };
const at = (d: number, h = 6) => new Date(Date.UTC(2026, 9, d, h));

describe('roasOf', () => {
  it('is Sales × 100 ÷ spend, null without a known positive spend', () => {
    expect(roasOf(25_000, 10_000)).toBe(250);
    expect(roasOf(1, 3)).toBe(33);
    expect(roasOf(100, 0)).toBeNull();
    expect(roasOf(100, null)).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 283 · marketing report (real PostgreSQL)', () => {
  let t: TestDatabase;
  let S = 0;
  let O = 0;
  let n = 0;
  const id: Record<string, string> = {};

  async function order(x: { total: number; placed?: Date; delivered?: Date | null; status?: 'DELIVERED' | 'IN_TRANSIT' | 'DRAFT' | 'CONFIRMED'; ad?: string; page?: string; utmSource?: string; utmMedium?: string; source?: 'WEBSITE' | 'PHONE'; customer?: string; store?: number }) {
    n += 1;
    const status = x.status ?? (x.delivered ? 'DELIVERED' : 'CONFIRMED');
    await t.prisma.order.create({
      data: {
        storeId: x.store ?? S,
        number: `H283-${n}`,
        source: x.source ?? 'WEBSITE',
        currency: 'BDT',
        status,
        placedAt: x.placed ?? at(3),
        deliveredAt: x.delivered ?? null,
        subtotalMinor: x.total,
        deliveryChargeMinor: 0,
        totalMinor: x.total,
        paymentMethod: 'COD',
        adCampaignId: x.ad ? id[x.ad]! : null,
        landingPageId: x.page ? id[x.page]! : null,
        utmSource: x.utmSource ?? null,
        utmMedium: x.utmMedium ?? null,
        customerId: x.customer ? id[x.customer]! : null,
        idempotencyKey: `h283-${n}`,
      },
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase('metrics-marketing-report');
    [S, O] = await seedSampleStores(t.prisma);
    id.eid = (await t.prisma.campaign.create({ data: { storeId: S, name: 'Sample Eid' } })).id;
    id.winter = (await t.prisma.campaign.create({ data: { storeId: S, name: 'Sample winter' } })).id;
    const meta = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-283', name: 'Sample Meta', currency: 'BDT' } });
    const google = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'GOOGLE', externalId: 'g-283', name: 'Sample Google', currency: 'USD' } });
    id.metaEid = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: meta.id, campaignId: id.eid, externalId: 'm1', name: 'Eid ads', status: 'ACTIVE', currency: 'BDT' } })).id;
    id.metaLoose = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: meta.id, externalId: 'm2', name: 'Loose ads', status: 'ACTIVE', currency: 'BDT' } })).id;
    id.googleWinter = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: google.id, campaignId: id.winter, externalId: 'g1', name: 'Winter search', status: 'ACTIVE', currency: 'USD' } })).id;
    id.page = (await t.prisma.page.create({ data: { storeId: S, kind: 'LANDING', slug: 'h283-winter', titleEn: 'Sample winter page', campaignId: id.winter } })).id;
    const spend = (adAccountId: string, adCampaignId: string, d: number, minor: number, currency: string, store: number | null) =>
      t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId, adCampaignId, date: new Date(`2026-10-${String(d).padStart(2, '0')}T00:00:00Z`), platform: currency === 'BDT' ? 'META' : 'GOOGLE', spendMinor: minor, currency, spendStoreMinor: store } });
    await spend(meta.id, id.metaEid, 2, 10_000, 'BDT', null);
    await spend(meta.id, id.metaEid, 3, 10_000, 'BDT', null);
    await spend(meta.id, id.metaLoose, 4, 5_000, 'BDT', null);
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: meta.id, adCampaignId: id.metaEid, date: new Date('2026-11-02T00:00:00Z'), platform: 'META', spendMinor: 99_999, currency: 'BDT' } }); // outside the period
    await spend(google.id, id.googleWinter, 5, 300, 'USD', 36_000);
    id.cust = (await t.prisma.customer.create({ data: { storeId: S } })).id;

    // Eid: two through its ad campaign (one delivered), one through the winter page that also has the Eid ad (counted once, under Eid).
    await order({ total: 30_000, ad: 'metaEid', delivered: at(8) });
    await order({ total: 20_000, ad: 'metaEid' });
    await order({ total: 7_000, ad: 'metaEid', page: 'page', delivered: at(9) });
    // Winter: through its landing page; one delivered in the period but placed in September.
    await order({ total: 15_000, page: 'page', placed: new Date(Date.UTC(2026, 8, 28, 6)), delivered: at(2) });
    await order({ total: 9_000, page: 'page' });
    // Organic, a paid UTM click (META), a phone order and the message receiver's order.
    await order({ total: 12_000, delivered: at(10) });
    await order({ total: 4_000, utmSource: 'facebook', utmMedium: 'cpc', delivered: at(11) });
    await order({ total: 6_000, source: 'PHONE', customer: 'cust', placed: at(13), delivered: at(15) });
    // Never counted: a draft and the other store's order.
    await order({ total: 50_000, status: 'DRAFT', ad: 'metaEid' });
    await order({ total: 80_000, store: O, delivered: at(8) });

    const sms = await t.prisma.broadcast.create({ data: { storeId: S, name: 'Sample Eid SMS', channel: 'SMS', status: 'SENT', startedAt: at(12), sentCount: 1, costMinor: null } });
    await t.prisma.notificationLog.create({ data: { storeId: S, channel: 'SMS', recipient: '01700000000', dedupeKey: 'h283-1', status: 'SENT', sentAt: at(12), broadcastId: sms.id, customerId: id.cust, costMinor: 70 } });
    await t.prisma.broadcast.create({ data: { storeId: S, name: 'Sample e-mail', channel: 'EMAIL', status: 'SENT', startedAt: at(14), sentCount: 10, costMinor: 500 } });
    await t.prisma.broadcast.create({ data: { storeId: S, name: 'Sample draft', channel: 'SMS', status: 'DRAFT', scheduledAt: at(14), costMinor: 900 } });
  });
  afterAll(async () => t?.drop());

  it('keeps Ordered value and Sales apart, for the shop and per channel', async () => {
    const r = await marketingReport(t.prisma, S, days, opts);
    expect(r.shop).toEqual({ orders: 7, orderedMinor: 30_000 + 20_000 + 7_000 + 9_000 + 12_000 + 4_000 + 6_000, delivered: 6, salesMinor: 30_000 + 7_000 + 15_000 + 12_000 + 4_000 + 6_000 });
    const ch = new Map(r.channels.map((c) => [c.key, c]));
    expect(ch.get('ads:META')).toMatchObject({ orders: 4, orderedMinor: 61_000, delivered: 3, salesMinor: 41_000, spendMinor: 25_000, roasPercent: 164 });
    expect(ch.get('ads:GOOGLE')).toMatchObject({ orders: 0, salesMinor: 0, spendMinor: 36_000, roasPercent: 0 });
    expect(ch.get('organic')).toMatchObject({ orders: 2, orderedMinor: 21_000, delivered: 2, salesMinor: 27_000, spendMinor: 0, roasPercent: null });
    expect(ch.get('source:PHONE')).toMatchObject({ orders: 1, delivered: 1, salesMinor: 6_000 });
    expect(r.channels.map((c) => c.kind)).toEqual(['ads', 'ads', 'organic', 'other']);
    const sum = r.channels.reduce((a, c) => ({ o: a.o + c.orderedMinor, s: a.s + c.salesMinor }), { o: 0, s: 0 });
    expect(sum).toEqual({ o: r.shop.orderedMinor, s: r.shop.salesMinor });
  });

  it('gives each campaign its orders once and its ad campaigns’ spend', async () => {
    const r = await marketingReport(t.prisma, S, days, opts);
    const c = new Map(r.campaigns.map((x) => [x.id, x]));
    expect(c.get(id.eid!)).toEqual({ id: id.eid, orders: 3, orderedMinor: 57_000, delivered: 2, salesMinor: 37_000, spendMinor: 20_000, roasPercent: 185 });
    expect(c.get(id.winter!)).toEqual({ id: id.winter, orders: 1, orderedMinor: 9_000, delivered: 1, salesMinor: 15_000, spendMinor: 36_000, roasPercent: 42 });
    expect(r.untiedSpendMinor).toBe(5_000);
    expect(r.adSpendMinor).toBe(61_000);
    expect(r.adsImported).toBe(true);
  });

  it('lists the sends started in the period with their cost and their receivers’ orders', async () => {
    const r = await marketingReport(t.prisma, S, days, opts);
    expect(r.sends.map((s) => s.name)).toEqual(['Sample e-mail', 'Sample Eid SMS']);
    expect(r.sends[1]).toMatchObject({ channel: 'SMS', costMinor: 70, sent: 1, orders: 1, delivered: 1, salesMinor: 6_000 });
    expect(r.sends[0]).toMatchObject({ channel: 'EMAIL', costMinor: 500, orders: 0 });
    expect(r.messageSpendMinor).toBe(570);
    expect(r.spendMinor).toBe(61_570);
    expect(r.roasPercent).toBe(roasOf(r.shop.salesMinor, 61_570));
    const short = await marketingReport(t.prisma, S, days, { ...opts, resultDays: 1 });
    expect(short.sends.find((s) => s.channel === 'SMS')).toMatchObject({ orders: 0, salesMinor: 0 });
  });

  it('follow-up 657: the message spend and count cover every send, the list is one page; any page can be read', async () => {
    const one = await marketingReport(t.prisma, S, days, { ...opts, sendsMax: 1 });
    expect(one.sends.map((s) => s.name)).toEqual(['Sample e-mail']);
    expect(one).toMatchObject({ sendsTotal: 2, sendsOffset: 0, messageSpendMinor: 570, spendMinor: 61_570 });
    const two = await marketingReport(t.prisma, S, days, { ...opts, sendsMax: 1, sendsOffset: 1 });
    expect(two.sends.map((s) => s.name)).toEqual(['Sample Eid SMS']);
    expect(two).toMatchObject({ sendsTotal: 2, sendsOffset: 1, messageSpendMinor: 570 });
    expect((await marketingReport(t.prisma, S, days, { ...opts, sendsMax: 1, sendsOffset: 5 })).sends).toEqual([]);
    const page = await marketingSendsPage(t.prisma, S, days, { timeZone: 'Asia/Dhaka', resultDays: 7, offset: 1, max: 10 });
    expect(page).toEqual(two.sends);
  });

  it('makes the spend unknown, never zero, when a dollar day has no rate', async () => {
    await t.prisma.adSpendDaily.updateMany({ where: { storeId: S, currency: 'USD' }, data: { spendStoreMinor: null } });
    const r = await marketingReport(t.prisma, S, days, opts);
    expect(r.adSpendMinor).toBeNull();
    expect(r.spendMinor).toBeNull();
    expect(r.roasPercent).toBeNull();
    expect(r.channels.find((c) => c.key === 'ads:GOOGLE')!.spendMinor).toBeNull();
    expect(r.campaigns.find((c) => c.id === id.winter)!).toMatchObject({ spendMinor: null, roasPercent: null });
    expect(r.campaigns.find((c) => c.id === id.eid)!.spendMinor).toBe(20_000);
    await t.prisma.adSpendDaily.updateMany({ where: { storeId: S, currency: 'USD' }, data: { spendStoreMinor: 36_000 } });
  });

  it('reads nothing of another store', async () => {
    const r = await marketingReport(t.prisma, O, days, opts);
    expect(r.shop).toMatchObject({ orders: 1, delivered: 1, salesMinor: 80_000 });
    expect(r.campaigns).toEqual([]);
    expect(r.sends).toEqual([]);
    expect(r).toMatchObject({ sendsTotal: 0, messageSpendMinor: 0 });
    expect(r.adSpendMinor).toBe(0);
    expect(r.adsImported).toBe(false);
  });
});
