// S13 · PR 268 — Marketing › Ad platforms' campaign controls on a real PostgreSQL: off as shipped (refused); only the
// owner's permission switches them on; every change needs the confirm step and `marketing.ads.control`; a pause or a
// lower budget is sent at once (the practice writer keeps it and nothing changes; a stand-in live writer updates the
// campaign's row); starting again or raising a budget waits in the owner's approval queue, one per campaign, and only
// `marketing.ads.approve` decides it — approved it is sent, rejected or run out nothing changes; a decision is taken
// once. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values; no real platform is called.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockCampaignOutbox, type CampaignChangeInput, type CampaignWriter } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { campaignControlHandler, isIncrease, type ControlDeps, type ControlOverview } from './campaign-control';

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
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.43', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/ad-platforms/control'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe('PR 268 · what counts as more spend', () => {
  it('starting again and a higher (or a first) daily budget; never a pause or a lower one', () => {
    expect(isIncrease({ kind: 'resume' }, 1)).toBe(true);
    expect(isIncrease({ kind: 'pause' }, null)).toBe(false);
    expect(isIncrease({ kind: 'budget', dailyBudgetMinor: 90_000 }, 80_000)).toBe(true);
    expect(isIncrease({ kind: 'budget', dailyBudgetMinor: 10_000 }, null)).toBe(true);
    expect(isIncrease({ kind: 'budget', dailyBudgetMinor: 70_000 }, 80_000)).toBe(false);
  });
});

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms · campaign controls on PostgreSQL (PR 268)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let controller = '';
  let camp = '';
  let now = T0;
  const sent: CampaignChangeInput[] = [];
  // a stand-in live writer: records what it was asked, never calls a platform
  const live: CampaignWriter = { provider: 'metaCampaigns', platform: 'meta', practice: false, change: async (o) => (sent.push(o), { ok: true, value: { done: true } }) };
  const api = async (method: string, body?: unknown, cookie = owner, extra: Partial<ControlDeps> = {}) => {
    const res = await campaignControlHandler(req(method, { body, cookie }), admin, { now: () => now, ...extra });
    return { status: res.status, a: (await res.json()) as ControlOverview & { ok: boolean; error?: string; details?: string[]; id?: string; status?: string; cards?: { control: ControlOverview['card'] } } };
  };
  const change = (o: Record<string, unknown>) => ({ action: 'change', adCampaignId: camp, confirm: true, ...o });
  const campaign = () => t.prisma.adCampaign.findUniqueOrThrow({ where: { id: camp }, select: { status: true, dailyBudgetMinor: true } });

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
    controller = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    const acc = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_268', name: 'Sample Meta', currency: 'BDT' } });
    camp = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc.id, externalId: '120268', name: 'Eid polo', status: 'ACTIVE', dailyBudgetMinor: 80_000, currency: 'BDT' } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('off as shipped; only the owner switches it on', async () => {
    expect((await api('POST', change({ change: 'pause' }), controller)).a).toMatchObject({ ok: false, error: 'OFF' });
    const g = await api('GET', undefined, controller);
    expect(g.a.card.value).toEqual({ on: false, approvalHours: 48 });
    expect((await api('PUT', { key: 'control', value: { on: true, approvalHours: 24 }, version: g.a.card.version }, controller)).status).toBe(403);
    const on = await api('PUT', { key: 'control', value: { on: true, approvalHours: 24 }, version: g.a.card.version });
    expect(on.a.cards!.control.value).toEqual({ on: true, approvalHours: 24 });
  });

  it('a pause or a lower budget: sent after the confirm (practice copy keeps it; a live writer changes the row)', async () => {
    expect((await api('POST', { ...change({ change: 'pause' }), confirm: false }, controller)).a.details).toEqual(['confirm']);
    expect((await api('POST', change({ change: 'budget' }), controller)).a.details).toEqual(['dailyBudgetMinor']);
    mockCampaignOutbox.clear();
    const paused = await api('POST', change({ change: 'pause' }), controller);
    expect(paused.a).toMatchObject({ ok: true, status: 'PRACTICE' });
    expect(mockCampaignOutbox.all()).toEqual([expect.objectContaining({ platform: 'meta', campaignExternalId: '120268', change: { kind: 'pause' } })]);
    expect(await campaign()).toEqual({ status: 'ACTIVE', dailyBudgetMinor: 80_000 }); // the practice copy changes nothing
    const lower = await api('POST', change({ change: 'budget', dailyBudgetMinor: 50_000 }), controller, { writers: { meta: live } });
    expect(lower.a.status).toBe('APPLIED');
    expect(sent.at(-1)).toMatchObject({ campaignExternalId: '120268', accountExternalId: 'act_268', change: { kind: 'budget', dailyBudgetMinor: 50_000 } });
    expect(await campaign()).toEqual({ status: 'ACTIVE', dailyBudgetMinor: 50_000 });
    expect(await t.prisma.aiApprovalRequest.count()).toBe(0);
  });

  it('a higher budget waits for the owner: approved it is sent, a decision is taken once', async () => {
    const before = sent.length;
    const up = await api('POST', change({ change: 'budget', dailyBudgetMinor: 120_000 }), controller, { writers: { meta: live } });
    expect(up.a.status).toBe('WAITING');
    expect(sent.length).toBe(before);
    expect(await campaign()).toEqual({ status: 'ACTIVE', dailyBudgetMinor: 50_000 });
    const ask = await t.prisma.aiApprovalRequest.findFirstOrThrow({ where: { kind: 'ads.campaign.change' } });
    expect(ask).toMatchObject({ storeId: S, status: 'PENDING', refType: 'AdChangeRequest', refId: up.a.id, expiresAt: new Date(T0.getTime() + 24 * 3_600_000) });
    expect(ask.title).toContain('Eid polo');
    expect((await api('POST', change({ change: 'pause' }), controller)).a.error).toBe('WAITING'); // one at a time
    const g = await api('GET', undefined, controller);
    expect(g.a.waiting.map((r) => [r.id, r.campaignName, r.change])).toEqual([[up.a.id, 'Eid polo', { kind: 'budget', dailyBudgetMinor: 120_000 }]]);
    const decide = { action: 'decide', id: up.a.id, decision: 'approve', confirm: true };
    expect((await api('POST', decide, controller)).status).toBe(403);
    expect((await api('POST', { ...decide, confirm: undefined })).a.details).toEqual(['confirm']);
    expect((await api('POST', decide, owner, { writers: { meta: live } })).a.status).toBe('APPLIED');
    expect(await campaign()).toEqual({ status: 'ACTIVE', dailyBudgetMinor: 120_000 });
    expect(await t.prisma.aiApprovalRequest.findUniqueOrThrow({ where: { id: ask.id } })).toMatchObject({ status: 'APPROVED', decidedAt: T0 });
    expect((await api('POST', decide)).a.error).toBe('DECIDED');
  });

  it('rejected or run out: nothing is sent and nothing changes', async () => {
    const before = sent.length;
    const resume = await api('POST', change({ change: 'resume' }), controller);
    expect(resume.a.status).toBe('WAITING');
    expect((await api('POST', { action: 'decide', id: resume.a.id, decision: 'reject', confirm: true })).a.status).toBe('REJECTED');
    const up = await api('POST', change({ change: 'budget', dailyBudgetMinor: 200_000 }), controller);
    now = new Date(T0.getTime() + 25 * 3_600_000);
    expect((await api('POST', { action: 'decide', id: up.a.id, decision: 'approve', confirm: true }, owner, { writers: { meta: live } })).a.error).toBe('EXPIRED');
    expect(sent.length).toBe(before);
    expect(await campaign()).toEqual({ status: 'ACTIVE', dailyBudgetMinor: 120_000 });
    const g = await api('GET');
    expect(g.a.waiting).toEqual([]);
    expect(g.a.recent.map((r) => r.status)).toEqual(['EXPIRED', 'REJECTED', 'APPLIED', 'APPLIED', 'PRACTICE']);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'marketing.adControl.' } } })).toBe(12);
  });
});
