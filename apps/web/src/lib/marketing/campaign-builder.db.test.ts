// S13 · PR 531 — full campaign control on a real PostgreSQL: the builder is off as shipped and only the owner switches
// it on; drafts with a schedule on the shop's clock (a past start, an end before the start refused; versions checked);
// a duplicate of a platform campaign (its objective, budget and campaign kept, the copy remembered); a launch never
// starts anything — it always waits for the owner, the draft locked meanwhile; approved through a stand-in live writer
// the campaign is created (row kept), through the practice writer nothing is kept; rejected or run out nothing is
// created and the draft can be launched again; a schedule on a running campaign also waits for the owner. A throwaway
// database (skipped without TEST_DATABASE_ADMIN_URL). Sample values; no real platform is called.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockCampaignOutbox, type CampaignChangeInput, type CampaignCreateInput, type CampaignWriter } from '@extas/adapters';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { campaignBuilderHandler, type BuilderOverview } from './campaign-builder';
import { campaignControlHandler, type ControlDeps } from './campaign-control';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = new Date('2026-11-06T08:00:00Z');
const BUILD = '/api/admin/marketing/ad-platforms/campaigns';
const CONTROL = '/api/admin/marketing/ad-platforms/control';

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
  return new Request(`https://${HOST}${o.path ?? BUILD}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

type A = BuilderOverview & { ok: boolean; error?: string; details?: string[]; id?: string; requestId?: string; status?: string; cards?: Record<string, { value: unknown; version: string }>; card?: { version: string } };

describe.skipIf(!HAS_TEST_DB)('Marketing › Ad platforms › New campaigns on PostgreSQL (PR 531)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  let acc = '';
  let camp = '';
  let shopCampaign = '';
  let now = T0;
  const made: CampaignCreateInput[] = [];
  const changed: CampaignChangeInput[] = [];
  // a stand-in live writer: records what it was asked, never calls a platform
  const live: CampaignWriter = {
    provider: 'metaCampaigns',
    platform: 'meta',
    practice: false,
    change: async (o) => (changed.push(o), { ok: true, value: { done: true } }),
    create: async (o) => (made.push(o), { ok: true, value: { externalId: `120531${made.length}` } }),
  };
  const call = async (handler: typeof campaignBuilderHandler, path: string, method: string, body?: unknown, cookie = owner, extra: Partial<ControlDeps> = {}) => {
    const res = await handler(req(method, { body, cookie, path }), admin, { now: () => now, ...extra });
    return { status: res.status, a: (await res.json()) as A };
  };
  const build = (method: string, body?: unknown, cookie = desk) => call(campaignBuilderHandler, BUILD, method, body, cookie);
  const control = (body: unknown, cookie = owner, extra: Partial<ControlDeps> = {}) => call(campaignControlHandler, CONTROL, 'POST', body, cookie, extra);
  const draft = (o: Record<string, unknown> = {}) => ({ action: 'draft.save', adAccountId: acc, name: 'Winter jackets', objective: 'sales', dailyBudgetMinor: 150_000, startAt: '2026-11-10T10:00', endAt: '2026-11-30T22:00', ...o });
  const row = (id: string) => t.prisma.adCampaignDraft.findUniqueOrThrow({ where: { id } });
  const decide = (id: string, decision: string, extra: Partial<ControlDeps> = {}) => control({ action: 'decide', id, decision, confirm: true }, owner, extra);

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
    const staff = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'ads@example.com', displayName: 'Sample ads desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await staff.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const first = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'ads@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
    acc = (await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_531', name: 'Sample Meta', currency: 'BDT' } })).id;
    shopCampaign = (await t.prisma.campaign.create({ data: { storeId: S, name: 'Winter 2026' } })).id;
    camp = (await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acc, campaignId: shopCampaign, externalId: '120500', name: 'Eid polo', status: 'ACTIVE', objective: 'OUTCOME_TRAFFIC', dailyBudgetMinor: 80_000, currency: 'BDT' } })).id;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('off as shipped; only the owner switches it on', async () => {
    expect((await build('POST', draft())).a.error).toBe('BUILDER_OFF');
    const g = await build('GET');
    expect(g.a.card.value).toEqual({ enabled: false });
    expect(g.a.controlOn).toBe(false);
    expect((await build('PUT', { key: 'builder', value: { enabled: true }, version: g.a.card.version })).status).toBe(403);
    expect((await build('PUT', { key: 'builder', value: { enabled: true }, version: g.a.card.version }, owner)).a.cards!.builder!.value).toEqual({ enabled: true });
  });

  it('a draft: the schedule on the shop clock, ahead and in order; a change needs its version', async () => {
    expect((await build('POST', draft({ startAt: '2026-11-01T10:00' }))).a.details).toEqual(['startAt']);
    expect((await build('POST', draft({ endAt: '2026-11-09T10:00' }))).a.details).toEqual(['endAt']);
    expect((await build('POST', draft({ dailyBudgetMinor: 0 }))).a.details).toEqual(['dailyBudgetMinor']);
    const ok = await build('POST', draft({ campaignId: shopCampaign }));
    expect(ok.status).toBe(200);
    const r = await row(ok.a.id!);
    expect(r).toMatchObject({ status: 'DRAFT', currency: 'BDT', dailyBudgetMinor: 150_000, campaignId: shopCampaign, startAt: new Date('2026-11-10T04:00:00Z'), endAt: new Date('2026-11-30T16:00:00Z') });
    expect((await build('POST', draft({ id: r.id, version: 'old', name: 'x' }))).a.error).toBe('STALE');
    expect((await build('POST', draft({ id: r.id, version: r.updatedAt.toISOString(), name: 'Winter jackets 2', startAt: null }))).status).toBe(200);
    expect(await row(r.id)).toMatchObject({ name: 'Winter jackets 2', startAt: null });
  });

  it('a duplicate of a platform campaign keeps its objective, budget and campaign, and remembers the copy', async () => {
    const d = await build('POST', { action: 'duplicate', adCampaignId: camp });
    expect(await row(d.a.id!)).toMatchObject({ name: 'Eid polo copy', objective: 'traffic', dailyBudgetMinor: 80_000, campaignId: shopCampaign, copyOfId: camp, startAt: null, status: 'DRAFT' });
    expect((await build('POST', { action: 'duplicate' })).a.error).toBe('INVALID_INPUT');
  });

  it('a launch never starts anything: it waits for the owner and the draft is locked; approved live it is created', async () => {
    const id = (await build('POST', draft({ name: 'Puja kurta' }))).a.id!;
    const noBudget = (await build('POST', draft({ name: 'No budget yet', dailyBudgetMinor: null }))).a.id!;
    expect((await build('POST', { action: 'launch', id, confirm: true })).a.error).toBe('CONTROL_OFF');
    const c = await call(campaignControlHandler, CONTROL, 'GET', undefined, owner);
    await call(campaignControlHandler, CONTROL, 'PUT', { key: 'control', value: { on: true, approvalHours: 24 }, version: (c.a as unknown as { card: { version: string } }).card.version }, owner);
    expect((await build('POST', { action: 'launch', id })).a.details).toEqual(['confirm']);
    expect((await build('POST', { action: 'launch', id: noBudget, confirm: true })).a.details).toEqual(['dailyBudgetMinor']);
    mockCampaignOutbox.clear();
    const l = await build('POST', { action: 'launch', id, confirm: true });
    expect(l.a).toMatchObject({ ok: true, status: 'WAITING' });
    expect(mockCampaignOutbox.all()).toEqual([]);
    expect(await row(id)).toMatchObject({ status: 'WAITING', changeRequestId: l.a.requestId });
    const ask = await t.prisma.aiApprovalRequest.findFirstOrThrow({ where: { refId: l.a.requestId } });
    expect(ask).toMatchObject({ kind: 'ads.campaign.change', status: 'PENDING', expiresAt: new Date(T0.getTime() + 24 * 3_600_000) });
    expect(ask.title).toContain('Puja kurta');
    const r = await row(id);
    expect((await build('POST', draft({ id, version: r.updatedAt.toISOString() }))).a.error).toBe('LOCKED');
    expect((await build('POST', { action: 'launch', id, confirm: true })).a.error).toBe('WAITING');
    expect((await build('POST', { action: 'archive', id })).a.error).toBe('LOCKED');
    expect((await control({ action: 'decide', id: l.a.requestId, decision: 'approve', confirm: true }, desk)).status).toBe(403);
    const before = await t.prisma.adCampaign.count();
    expect((await decide(l.a.requestId!, 'approve', { writers: { meta: live } })).a.status).toBe('APPLIED');
    expect(made.at(-1)).toMatchObject({ accountExternalId: 'act_531', name: 'Puja kurta', objective: 'sales', dailyBudgetMinor: 150_000, startAt: '2026-11-10T04:00:00.000Z', copyOfExternalId: null });
    const created = await t.prisma.adCampaign.findFirstOrThrow({ where: { externalId: `120531${made.length}` } });
    expect(created).toMatchObject({ name: 'Puja kurta', status: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudgetMinor: 150_000, startAt: new Date('2026-11-10T04:00:00Z') });
    expect(await t.prisma.adCampaign.count()).toBe(before + 1);
    expect(await row(id)).toMatchObject({ status: 'CREATED', adCampaignId: created.id });
  });

  it('a copy launched through the practice writer: nothing reaches the platform and nothing is kept', async () => {
    const copy = (await t.prisma.adCampaignDraft.findFirstOrThrow({ where: { copyOfId: camp } })).id;
    const l = await build('POST', { action: 'launch', id: copy, confirm: true });
    mockCampaignOutbox.clear();
    const before = await t.prisma.adCampaign.count();
    expect((await decide(l.a.requestId!, 'approve')).a.status).toBe('PRACTICE');
    expect(mockCampaignOutbox.all()).toEqual([expect.objectContaining({ platform: 'meta', campaignExternalId: '120500', change: { kind: 'create', name: 'Eid polo copy' }, payload: expect.objectContaining({ path: '/120500/copies' }) })]);
    expect(await t.prisma.adCampaign.count()).toBe(before);
    expect((await row(copy)).status).toBe('PRACTICE');
  });

  it('rejected or run out: nothing is created, and the draft can change and be launched again', async () => {
    const id = (await build('POST', draft({ name: 'Rejected one' }))).a.id!;
    const l = await build('POST', { action: 'launch', id, confirm: true });
    expect((await decide(l.a.requestId!, 'reject')).a.status).toBe('REJECTED');
    expect((await row(id)).status).toBe('REJECTED');
    const again = await build('POST', { action: 'launch', id, confirm: true });
    expect(again.a.status).toBe('WAITING');
    now = new Date(T0.getTime() + 25 * 3_600_000); // nobody answered in time
    const r = await row(id);
    expect((await build('POST', draft({ id, version: r.updatedAt.toISOString(), name: 'Changed after it ran out' }))).status).toBe(200);
    expect(await row(id)).toMatchObject({ status: 'DRAFT', name: 'Changed after it ran out' });
    expect((await t.prisma.adChangeRequest.findUniqueOrThrow({ where: { id: again.a.requestId! } })).status).toBe('EXPIRED');
    expect((await decide(again.a.requestId!, 'approve', { writers: { meta: live } })).a.error).toBe('DECIDED');
    now = T0;
  });

  it('a schedule on a running campaign waits for the owner (builder on); approved live it is kept on the row', async () => {
    const sch = { action: 'change', adCampaignId: camp, change: 'schedule', startAt: '2026-11-12T09:00', endAt: '2026-11-20T21:00', confirm: true };
    expect((await control({ ...sch, endAt: '2026-11-11T09:00' }, desk)).a.details).toEqual(['endAt']);
    const w = await control(sch, desk);
    expect(w.a.status).toBe('WAITING');
    expect(changed).toEqual([]);
    expect((await decide(w.a.id!, 'approve', { writers: { meta: live } })).a.status).toBe('APPLIED');
    expect(changed.at(-1)).toMatchObject({ campaignExternalId: '120500', change: { kind: 'schedule', startAt: '2026-11-12T03:00:00.000Z', endAt: '2026-11-20T15:00:00.000Z' } });
    expect(await t.prisma.adCampaign.findUniqueOrThrow({ where: { id: camp }, select: { startAt: true, endAt: true } })).toEqual({ startAt: new Date('2026-11-12T03:00:00Z'), endAt: new Date('2026-11-20T15:00:00Z') });
    const g = await build('GET');
    await build('PUT', { key: 'builder', value: { enabled: false }, version: g.a.card.version }, owner);
    expect((await control(sch, desk)).a.error).toBe('BUILDER_OFF');
  });

  it('set aside while off, brought back only while on; never deleted; every write audited', async () => {
    const id = (await t.prisma.adCampaignDraft.findFirstOrThrow({ where: { name: 'No budget yet' } })).id;
    expect((await build('POST', { action: 'archive', id })).status).toBe(200);
    expect((await build('POST', { action: 'restore', id })).a.error).toBe('BUILDER_OFF');
    const g = await build('GET');
    expect(g.a.setAside.map((r) => r.name)).toEqual(['No budget yet']);
    expect(g.a.drafts.map((r) => [r.name, r.status])).toEqual(expect.arrayContaining([['Puja kurta', 'CREATED'], ['Eid polo copy', 'PRACTICE'], ['Changed after it ran out', 'DRAFT']]));
    expect(g.a.drafts.find((r) => r.name === 'Winter jackets 2')).toMatchObject({ startWall: null, endWall: '2026-11-30T22:00', objective: 'sales' });
    expect(await t.prisma.adCampaignDraft.count()).toBe(5);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'marketing.adBuilder.' } } })).toBe(14);
  });
});
