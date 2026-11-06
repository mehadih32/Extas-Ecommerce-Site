// S13 · PR 283 — Marketing › Report on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), through the real
// admin API (sign-in, permissions) and the settings resolver: off as shipped (no report read), the card and its audit
// line, then the report for a period: spend against Ordered value and Sales by channel and by campaign (named), the
// message sends, the period made safe (future, reversed, too long), and nothing written anywhere else. Values made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { reportHandler, type ReportOverview } from './report';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = Date.parse('2027-03-20T06:00:00Z'); // 12:00 on 20 Mar on the shop's clock (Asia/Dhaka)
const at = (d: number) => new Date(Date.UTC(2027, 2, d, 6));

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.53', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/report'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Report on PostgreSQL (PR 283)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = ReportOverview & { ok: boolean; error?: string; details?: string[]; cards?: { report: ReportOverview['card'] } };
  const api = async (method: string, body?: unknown, o: { cookie?: string; path?: string } = {}) => {
    const res = await reportHandler(req(method, { body, cookie: o.cookie ?? owner, ...(o.path ? { path: o.path } : {}) }), admin, () => new Date(T0));
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_marketing_report');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Report desk', nameBn: 'রিপোর্ট ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));

    const camp = await t.prisma.campaign.create({ data: { storeId: S, name: 'Sample Eid' } });
    const acct = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act-283w', name: 'Sample Meta', currency: 'BDT' } });
    const ad = await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acct.id, campaignId: camp.id, externalId: 'w1', name: 'Eid ads', status: 'ACTIVE', currency: 'BDT' } });
    await t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acct.id, adCampaignId: ad.id, date: new Date('2027-03-05T00:00:00Z'), platform: 'META', spendMinor: 10_000, currency: 'BDT' } });
    let n = 0;
    for (const o of [
      { total: 25_000, delivered: at(8) },
      { total: 5_000, delivered: null },
    ]) {
      n += 1;
      await t.prisma.order.create({
        data: { storeId: S, number: `W283-${n}`, source: 'WEBSITE', currency: 'BDT', status: o.delivered ? 'DELIVERED' : 'CONFIRMED', placedAt: at(6), deliveredAt: o.delivered, subtotalMinor: o.total, deliveryChargeMinor: 0, totalMinor: o.total, paymentMethod: 'COD', adCampaignId: ad.id, idempotencyKey: `w283-${n}` },
      });
    }
    await t.prisma.broadcast.create({ data: { storeId: S, name: 'Sample SMS', channel: 'SMS', status: 'SENT', startedAt: at(10), sentCount: 40, costMinor: 2_000 } });
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('is off as shipped: no report read; reading and changing keys', async () => {
    const g = await api('GET', undefined, { cookie: desk });
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ settings: { enabled: false, maxDays: 366, resultDays: 7 }, currency: 'BDT', today: '2027-03-20', report: null, campaigns: {} });
    expect(g.a.period.q).toMatchObject({ from: '2027-03-01', to: '2027-03-20' });
    expect((await api('PUT', { key: 'report', value: { enabled: true, maxDays: 366, resultDays: 7 }, version: g.a.card.version }, { cookie: desk })).status).toBe(403);
    expect((await api('DELETE')).status).toBe(405);
  });

  it('checks and saves the card, audited', async () => {
    const v = (await api('GET')).a.card.version;
    expect((await api('PUT', { key: 'report', value: { enabled: true, maxDays: 3, resultDays: 7 }, version: v })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['maxDays'] });
    expect((await api('PUT', { key: 'report', value: { enabled: true, maxDays: 30, resultDays: 7 }, version: 'old' })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await api('PUT', { key: 'other', value: {}, version: v })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['key'] });
    const on = await api('PUT', { key: 'report', value: { enabled: true, maxDays: 30, resultDays: 7 }, version: v });
    expect(on.a.cards!.report.value).toEqual({ enabled: true, maxDays: 30, resultDays: 7 });
    expect(await t.prisma.auditLog.count({ where: { action: 'marketingReport.settings' } })).toBe(1);
  });

  it('sets spend against Ordered value and Sales, by channel, by campaign and per send — and writes nothing', async () => {
    const before = { orders: await t.prisma.order.count(), campaigns: await t.prisma.campaign.findMany({ orderBy: { id: 'asc' } }), ads: await t.prisma.adCampaign.findMany({ orderBy: { id: 'asc' } }) };
    const g = await api('GET', undefined, { cookie: desk });
    const r = g.a.report!;
    expect(r.shop).toEqual({ orders: 2, orderedMinor: 30_000, delivered: 1, salesMinor: 25_000 });
    expect(r).toMatchObject({ adSpendMinor: 10_000, messageSpendMinor: 2_000, spendMinor: 12_000, roasPercent: 208 });
    expect(r.channels[0]).toMatchObject({ key: 'ads:META', orders: 2, orderedMinor: 30_000, delivered: 1, salesMinor: 25_000, spendMinor: 10_000, roasPercent: 250 });
    expect(r.campaigns).toHaveLength(1);
    expect(r.campaigns[0]).toMatchObject({ orders: 2, salesMinor: 25_000, spendMinor: 10_000, roasPercent: 250 });
    expect(g.a.campaigns[r.campaigns[0]!.id]).toEqual({ name: 'Sample Eid', status: 'DRAFT', archived: false });
    expect(r.sends).toEqual([expect.objectContaining({ name: 'Sample SMS', channel: 'SMS', costMinor: 2_000, sent: 40, orders: 0 })]);
    expect({ orders: await t.prisma.order.count(), campaigns: await t.prisma.campaign.findMany({ orderBy: { id: 'asc' } }), ads: await t.prisma.adCampaign.findMany({ orderBy: { id: 'asc' } }) }).toEqual(before);
  });

  it('makes the period safe: a quick period, a reversed one, the future and one longer than the longest', async () => {
    const q = async (s: string) => (await api('GET', undefined, { path: `/api/admin/marketing/report?${s}` })).a.period;
    expect((await q('period=week')).q).toMatchObject({ from: '2027-03-14', to: '2027-03-20' });
    expect(await q('from=2027-03-10&to=2027-03-02')).toMatchObject({ q: { from: '2027-03-02', to: '2027-03-10' }, notes: ['swapped'] });
    expect((await q('from=2027-03-02&to=2027-04-30')).notes).toContain('future');
    expect(await q('from=2026-12-01&to=2027-03-20')).toMatchObject({ q: { from: '2027-02-19', to: '2027-03-20' }, notes: ['tooLong'] });
    const outside = (await api('GET', undefined, { path: '/api/admin/marketing/report?from=2027-02-01&to=2027-02-28' })).a.report!;
    expect(outside).toMatchObject({ shop: { orders: 0, salesMinor: 0 }, adSpendMinor: 0, messageSpendMinor: 0, campaigns: [], sends: [] });
  });
});
