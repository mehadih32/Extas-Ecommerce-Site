// S13 · PR 269 — Marketing › Ad platforms › Growth agent on a real PostgreSQL: off as shipped with every proposal kind off
// (a run reads, flags and proposes nothing); only the owner sets the limits; a run proposes from delivered ROAS and puts
// each proposal once in the owner's approval list (kind `ads.growth.proposal`); only `marketing.ads.approve` decides,
// after the confirm, once; an approved budget change needs the campaign controls on and goes through them (the practice
// writer: nothing real changes; the campaign must still be as the proposal saw it); a rejected or run-out proposal
// changes nothing. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values; no platform is called.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockCampaignOutbox } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, storeTarget, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { growthAgentHandler, runGrowthDaily, type GrowthDeps, type GrowthOverview } from './growth-agent';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = new Date('2026-11-05T08:00:00Z');

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.44', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/ad-platforms/growth'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms · growth agent on PostgreSQL (PR 269)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  const c: Record<string, string> = {};
  let n = 0;
  let now = T0;
  type Answer = GrowthOverview & { ok: boolean; error?: string; details?: string[]; made?: number; status?: string; cards?: { growth: GrowthOverview['card'] } };
  const api = async (method: string, body?: unknown, cookie = owner, extra: Partial<GrowthDeps> = {}) => {
    const res = await growthAgentHandler(req(method, { body, cookie }), admin, { now: () => now, ...extra });
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const order = async (campaign: string, total: number) => {
    n += 1;
    await t.prisma.order.create({ data: { storeId: S, number: `G269-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'DELIVERED', placedAt: new Date('2026-11-01T06:00:00Z'), deliveredAt: new Date('2026-11-03T06:00:00Z'), subtotalMinor: total, deliveryChargeMinor: 0, totalMinor: total, paymentMethod: 'COD', adCampaignId: campaign, idempotencyKey: `g269-${n}` } });
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Ads desk', nameBn: 'বিজ্ঞাপন ডেস্ক', permissions: ['marketing.campaigns.read', 'marketing.ads.control'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'ads@example.com', displayName: 'Sample ads desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const first = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'ads@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_269', name: 'Sample Meta', currency: 'BDT' } });
    const camp = (key: string, name: string) => t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc.id, externalId: `269-${key}`, name, status: 'ACTIVE', dailyBudgetMinor: 100_000, currency: 'BDT' } });
    c.good = (await camp('good', 'Sample winner')).id;
    c.poor = (await camp('poor', 'Sample loser')).id;
    c.none = (await camp('none', 'Sample nothing delivered')).id;
    const spend = (adCampaignId: string, minor: number) => t.prisma.adSpendDaily.create({ data: { storeId: S, adAccountId: acc.id, adCampaignId, date: new Date('2026-11-02T00:00:00Z'), platform: 'META', spendMinor: minor, currency: 'BDT' } });
    await spend(c.good, 100_000);
    await spend(c.poor, 100_000);
    await spend(c.none, 90_000);
    for (const _ of [1, 2, 3]) await order(c.good, 200_000); // 600 000 back for 100 000: ROAS 600 %
    for (const _ of [1, 2, 3]) await order(c.poor, 40_000); // 120 000 back: ROAS 120 %
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('off as shipped: a run reads and flags, but proposes nothing; only the owner sets the limits', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.a.card.value.on).toBe(false);
    expect(g.a.now.campaigns.find((r) => r.key === c.good)).toMatchObject({ roasPercent: 600, delivered: 3 });
    expect(g.a.flagged.map((r) => r.key)).toEqual([c.none]);
    expect((await api('POST', { action: 'run' }, desk)).a).toMatchObject({ ok: true, made: 0 });
    expect(await runGrowthDaily({ db: t.prisma, resolver: admin.resolver, now: () => now })).toBeNull();
    const limits = { ...g.a.card.value, goodRoasPercent: 400, poorRoasPercent: 150, noDeliveredSpend: 500, approvalHours: 24 };
    expect((await api('PUT', { key: 'growth', value: limits, version: g.a.card.version }, desk)).status).toBe(403);
    const set = await api('PUT', { key: 'growth', value: limits, version: g.a.card.version });
    expect(set.a.cards!.growth.value).toMatchObject({ goodRoasPercent: 400, on: false });
  });

  it('a run proposes from the limits, each once; the desk cannot decide', async () => {
    const r = await api('POST', { action: 'run' }, desk);
    expect(r.a.made).toBe(3);
    expect((await api('POST', { action: 'run' }, desk)).a.made).toBe(0);
    const g = await api('GET', undefined, desk);
    expect(g.a.waiting.map((p) => [p.type, p.refId])).toEqual([
      ['pause', c.none],
      ['lowerBudget', c.poor],
      ['raiseBudget', c.good],
    ]);
    expect(g.a.waiting[2]).toMatchObject({ fromDailyMinor: 100_000, toDailyMinor: 120_000, name: 'Sample winner' });
    const asks = await t.prisma.aiApprovalRequest.findMany({ where: { kind: 'ads.growth.proposal' } });
    expect(asks.every((a) => a.agentKey === 'tirondaj' && a.status === 'PENDING' && a.expiresAt!.getTime() === T0.getTime() + 24 * 3_600_000)).toBe(true);
    expect((await api('POST', { action: 'decide', id: g.a.waiting[0]!.id, decision: 'approve', confirm: true }, desk)).status).toBe(403);
  });

  it('approve: needs the confirm and the campaign controls on, goes through them (practice), once', async () => {
    const g = await api('GET');
    const [pause, , raise] = g.a.waiting;
    expect((await api('POST', { action: 'decide', id: raise!.id, decision: 'approve' })).a.details).toEqual(['confirm']);
    expect((await api('POST', { action: 'decide', id: raise!.id, decision: 'approve', confirm: true })).a.error).toBe('CONTROL_OFF');
    expect((await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: raise!.id } })).status).toBe('PENDING');
    await admin.resolver.set('ads.campaignControl', { on: true, approvalHours: 48 }, storeTarget(S), { actorId: null, reason: 'test' });
    mockCampaignOutbox.clear();
    const ok = await api('POST', { action: 'decide', id: raise!.id, decision: 'approve', confirm: true });
    expect(ok.a).toMatchObject({ ok: true, status: 'PRACTICE' });
    expect(mockCampaignOutbox.all().map((x) => x.change)).toEqual([{ kind: 'budget', dailyBudgetMinor: 120_000 }]);
    expect((await t.prisma.adCampaign.findUniqueOrThrow({ where: { id: c.good } })).dailyBudgetMinor).toBe(100_000);
    const cr = await t.prisma.adChangeRequest.findFirstOrThrow({ where: { approvalRequestId: raise!.id } });
    expect(cr).toMatchObject({ status: 'PRACTICE', requestedByAgent: 'tirondaj', action: 'budget' });
    expect((await api('POST', { action: 'decide', id: raise!.id, decision: 'approve', confirm: true })).a.error).toBe('DECIDED');
    // the campaign moved on since the proposal: approved, nothing sent
    await t.prisma.adCampaign.update({ where: { id: c.none }, data: { status: 'PAUSED' } });
    expect((await api('POST', { action: 'decide', id: pause!.id, decision: 'approve', confirm: true })).a.error).toBe('CHANGED');
    expect(await t.prisma.adChangeRequest.count({ where: { approvalRequestId: pause!.id } })).toBe(0);
  });

  it('not decided in its hours it runs out; proposed again, rejected it changes nothing and is not proposed again', async () => {
    now = new Date(T0.getTime() + 25 * 3_600_000);
    const g = await api('GET');
    expect(g.a.waiting).toEqual([]);
    const lower = g.a.recent.find((p) => p.type === 'lowerBudget')!;
    expect(lower.status).toBe('EXPIRED');
    expect((await api('POST', { action: 'decide', id: lower.id, decision: 'approve', confirm: true })).a.error).toBe('DECIDED');
    expect((await api('POST', { action: 'run' }, desk)).a.made).toBe(1); // the lower again; the approved two are not
    const again = (await api('GET')).a.waiting[0]!;
    expect(again.type).toBe('lowerBudget');
    expect((await api('POST', { action: 'decide', id: again.id, decision: 'reject', confirm: true })).a).toMatchObject({ ok: true, status: 'REJECTED' });
    expect(await t.prisma.adChangeRequest.count({ where: { approvalRequestId: again.id } })).toBe(0);
    expect((await api('POST', { action: 'run' }, desk)).a.made).toBe(0);
    const audits = await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'marketing.growth.' } }, select: { action: true } });
    expect(new Set(audits.map((a) => a.action))).toEqual(new Set(['marketing.growth.settings', 'marketing.growth.run', 'marketing.growth.decide']));
  });
});
