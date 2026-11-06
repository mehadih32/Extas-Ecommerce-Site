// S13 · PR 282 — Marketing › Calendar on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL), through the real
// admin API (sign-in, permissions) and the settings resolver: off as shipped (nothing read, plan lines refused, setting
// aside allowed), the card and its audit line, every lane read from what the other pages keep (a campaign, an ad, a
// message send, a seasonal window, a festive rule's band days, a blog post, a social post) and nothing outside the view,
// the owner's plan lines (checks, change with its version, set aside and brought back, never deleted, audited), and the
// hook: another module's CalendarEntry row shows in its lane, once. Every date and name is a test value.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import * as rl from '@extas/rules';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { calendarHandler, type CalendarOverview } from './calendar';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = Date.parse('2027-03-01T06:00:00Z'); // 12:00 on 1 Mar on the shop's clock (Asia/Dhaka)

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.52', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/calendar'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Marketing › Calendar on PostgreSQL (PR 282)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = CalendarOverview & { ok: boolean; id?: string; error?: string; details?: string[]; cards?: { calendar: CalendarOverview['card'] } };
  const api = async (method: string, body?: unknown, o: { cookie?: string; path?: string } = {}) => {
    const res = await calendarHandler(req(method, { body, cookie: o.cookie ?? owner, ...(o.path ? { path: o.path } : {}) }), admin, () => new Date(T0));
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_marketing_calendar');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Calendar desk', nameBn: 'ক্যালেন্ডার ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  let planId = '';

  it('is off as shipped: reads nothing, refuses a plan line; reading and changing keys', async () => {
    const g = await api('GET', undefined, { cookie: desk });
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ settings: { enabled: false, days: 60 }, timeZone: 'Asia/Dhaka', today: '2027-03-01', range: { from: '2027-03-01', to: '2027-04-29', days: 60 }, items: [], plans: [] });
    expect((await api('PUT', { key: 'calendar', value: { enabled: true, days: 60 }, version: g.a.card.version }, { cookie: desk })).status).toBe(403);
    expect((await api('POST', { action: 'plan.add', title: 'Eid', starts: '2027-03-08' })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
  });

  it('checks and saves the card, audited', async () => {
    const v = (await api('GET')).a.card.version;
    expect((await api('PUT', { key: 'calendar', value: { enabled: true, days: 3 }, version: v })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['days'] });
    expect((await api('PUT', { key: 'calendar', value: { enabled: true, days: 30 }, version: 'old' })).a).toMatchObject({ ok: false, error: 'STALE' });
    const on = await api('PUT', { key: 'calendar', value: { enabled: true, days: 30 }, version: v });
    expect(on.a.cards!.calendar.value).toEqual({ enabled: true, days: 30 });
    expect(await t.prisma.auditLog.count({ where: { action: 'marketingCalendar.settings' } })).toBe(1);
  });

  it('keeps the owner’s plan lines: checks, adds, changes with its version, sets aside and brings back — audited, never deleted', async () => {
    expect((await api('POST', { action: 'plan.add', title: '', starts: '2027-03-12', ends: '2027-03-08' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['title', 'ends'] });
    expect((await api('POST', { action: 'plan.add', title: 'Eid', starts: '2027-03-08' }, { cookie: desk })).status).toBe(403);
    const add = await api('POST', { action: 'plan.add', title: 'Eid', titleBn: 'ঈদ', starts: '2027-03-08', ends: '2027-03-12', note: 'Hero and SMS' });
    planId = add.a.id!;
    const g = await api('GET');
    expect(g.a.items.find((i) => i.id === `plan:${planId}`)).toMatchObject({ lane: 'plan', title: { en: 'Eid', bn: 'ঈদ' }, starts: '2027-03-08', ends: '2027-03-12', state: 'scheduled', own: { note: 'Hero and SMS', archived: false } });
    const plan = g.a.plans.find((p) => p.id === planId)!;
    expect((await api('POST', { action: 'plan.update', id: planId, version: 'old', title: 'Eid ul-Fitr', starts: '2027-03-08' })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await api('POST', { action: 'plan.update', id: planId, version: plan.version, title: 'Eid ul-Fitr', titleBn: 'ঈদুল ফিতর', starts: '2027-03-09', ends: '2027-03-13', note: '' })).a.ok).toBe(true);
    expect((await api('POST', { action: 'plan.archive', id: planId })).a.ok).toBe(true);
    expect((await api('POST', { action: 'plan.archive', id: planId })).a).toMatchObject({ ok: false, error: 'SET_ASIDE' });
    const aside = await api('GET');
    expect(aside.a.items.some((i) => i.id === `plan:${planId}`)).toBe(false);
    expect(aside.a.setAside).toMatchObject([{ id: planId, title: 'Eid ul-Fitr', titleBn: 'ঈদুল ফিতর', starts: '2027-03-09', ends: '2027-03-13', note: null }]);
    expect((await api('POST', { action: 'plan.restore', id: planId })).a.ok).toBe(true);
    expect(await t.prisma.calendarEntry.count({ where: { id: planId, archivedAt: null } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: { startsWith: 'marketingCalendar.plan.' } } })).toBe(4);
  });

  it('reads every lane from what the other pages keep, only inside the view, and shows another module’s row once', async () => {
    const at = (s: string) => new Date(s);
    const camp = await t.prisma.campaign.create({ data: { storeId: S, name: 'Eid push', status: 'SCHEDULED', startsAt: at('2027-03-05T00:00:00+06:00'), endsAt: at('2027-03-15T00:00:00+06:00'), channels: ['meta', 'sms'] } });
    await t.prisma.campaign.create({ data: { storeId: S, name: 'No dates yet', status: 'DRAFT' } });
    await t.prisma.campaign.create({ data: { storeId: S, name: 'Long gone', status: 'ENDED', startsAt: at('2027-01-01T00:00:00+06:00'), endsAt: at('2027-01-10T00:00:00+06:00') } });
    const acct = await t.prisma.adAccount.create({ data: { storeId: S, platform: 'META', externalId: 'act_sample', name: 'Sample ads', currency: 'USD' } });
    const ad = await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acct.id, campaignId: camp.id, externalId: 'c1', name: 'Eid reach', status: 'ACTIVE', currency: 'USD' } });
    await t.prisma.adCampaign.create({ data: { storeId: S, adAccountId: acct.id, externalId: 'c2', name: 'Paused one', status: 'PAUSED', currency: 'USD' } });
    const send = await t.prisma.broadcast.create({ data: { storeId: S, name: 'Eid SMS', channel: 'SMS', status: 'SCHEDULED', scheduledAt: at('2027-03-07T10:00:00+06:00'), kind: 'blast' } });
    await t.prisma.broadcast.create({ data: { storeId: S, name: 'Draft send', channel: 'SMS', status: 'DRAFT', scheduledAt: at('2027-03-07T10:00:00+06:00') } });
    const look = await t.prisma.layoutSnapshot.create({ data: { storeId: S, name: 'Eid look', payload: { scope: 'home', settings: {} } } });
    const win = await t.prisma.scheduledLayoutSwitch.create({ data: { storeId: S, snapshotId: look.id, applyAt: at('2027-03-06T00:00:00+06:00'), revertAt: at('2027-03-14T00:00:00+06:00'), status: 'SCHEDULED' } });
    await t.prisma.scheduledLayoutSwitch.create({ data: { storeId: S, snapshotId: look.id, applyAt: at('2027-03-02T00:00:00+06:00'), revertAt: null, status: 'STOPPED', stoppedAt: new Date(T0) } });
    const post = await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: 'eid-style', title: 'Eid style guide', status: 'SCHEDULED', scheduledAt: at('2027-03-04T09:00:00+06:00') } });
    await t.prisma.blogPost.create({ data: { storeId: S, locale: 'en', slug: 'later', title: 'Too late', status: 'SCHEDULED', scheduledAt: at('2027-06-04T09:00:00+06:00') } });
    const sa = await t.prisma.socialAccount.create({ data: { storeId: S, platform: 'INSTAGRAM', externalId: 'ig1', name: 'Sample IG', requireApproval: true } });
    const sp = await t.prisma.socialPost.create({ data: { storeId: S, accountId: sa.id, kind: 'reel', caption: 'Hoodie reel', status: 'scheduled', scheduledAt: at('2027-03-03T18:00:00+06:00') } });
    // the hook: PR 245 writing its own row for the same post (shown once), and a row of its own
    await t.prisma.calendarEntry.create({ data: { storeId: S, kind: 'content', refType: 'BlogPost', refId: post.id, title: 'Eid style guide', status: 'SCHEDULED', date: new Date('2027-03-04T00:00:00Z') } });
    await t.prisma.calendarEntry.create({ data: { storeId: S, kind: 'social', title: 'Live Q&A', status: 'PLANNED', date: new Date('2027-03-10T00:00:00Z') } });
    // a festive rule from the PR 214 template, switched on
    const staff = await t.prisma.staffUser.findFirstOrThrow({ where: { email: 'owner@example.com' } });
    const who: rl.Who = { actor: { staffUserId: staff.id }, storeId: S };
    const rdeps: rl.RulesDeps = { db: t.prisma, settings: admin.resolver };
    const r = await rl.createRule(rdeps, who, { templateId: 'festive' });
    const times: Record<string, string> = { cutoffDhakaCity: '2027-03-06T23:59:00+06:00', cutoffOutsideDhaka: '2027-03-03T23:59:00+06:00' };
    await rl.saveDraft(rdeps, who, r.id, { content: { ...r.live!, params: r.live!.params.map((p) => (times[p.key] ? { ...p, value: times[p.key] } : p)), status: 'ACTIVE' } });
    await rl.publishRule(rdeps, who, r.id);

    const g = await api('GET', undefined, { cookie: desk });
    const by = new Map(g.a.items.map((i) => [i.id, i]));
    expect(by.get(`campaign:${camp.id}`)).toMatchObject({ lane: 'campaign', starts: '2027-03-05', ends: '2027-03-14', state: 'scheduled', detail: 'meta · sms', counts: { pages: 0, orders: 0, delivered: 0 }, href: `/admin/marketing/campaigns/${camp.id}` });
    expect(by.get(`ads:${ad.id}`)).toMatchObject({ lane: 'ads', starts: '2027-03-05', ends: '2027-03-14', detail: 'meta' });
    expect(by.get(`message:${send.id}`)).toMatchObject({ lane: 'message', starts: '2027-03-07', ends: null, state: 'scheduled', detail: 'sms', href: '/admin/messages/campaigns' });
    expect(by.get(`home:${win.id}`)).toMatchObject({ lane: 'home', title: { en: 'Eid look' }, starts: '2027-03-06', ends: '2027-03-13', state: 'scheduled', href: '/admin/marketing/seasonal' });
    expect(by.get(`festive:${r.key}`)).toMatchObject({ lane: 'festive', starts: '2027-03-03', ends: '2027-03-06', state: 'live', href: '/admin/marketing/festive' });
    expect(by.get(`festive:${r.key}`)!.marks!.map((m) => m.day)).toEqual(['2027-03-03', '2027-03-06', '2027-03-06']);
    expect(by.get(`content:${post.id}`)).toMatchObject({ lane: 'content', starts: '2027-03-04', state: 'scheduled', detail: 'en', href: null });
    expect(by.get(`social:${sp.id}`)).toMatchObject({ lane: 'social', title: { en: 'Hoodie reel' }, starts: '2027-03-03', detail: 'instagram' });
    expect(g.a.items.filter((i) => i.title.en === 'Eid style guide')).toHaveLength(1);
    expect(g.a.items.find((i) => i.title.en === 'Live Q&A')).toMatchObject({ lane: 'social', starts: '2027-03-10' });
    const names = g.a.items.map((i) => i.title.en);
    for (const gone of ['Long gone', 'No dates yet', 'Paused one', 'Draft send', 'Too late']) expect(names).not.toContain(gone);
    expect(g.a.undated).toBe(1);
    expect(g.a.lanes).toMatchObject({ plan: 1, campaign: 1, ads: 1, message: 1, home: 1, festive: 1, content: 1, social: 2 });
    // the list is day by day
    const days = g.a.items.map((i) => (i.marks?.[0]?.day ?? i.starts) < g.a.range.from ? g.a.range.from : (i.marks?.[0]?.day ?? i.starts));
    expect([...days].sort()).toEqual(days);
    // another view: later, from an asked day
    const later = await api('GET', undefined, { path: '/api/admin/marketing/calendar?from=2027-05-20' });
    expect(later.a.range).toEqual({ from: '2027-05-20', to: '2027-06-18', days: 30 });
    expect(later.a.items.map((i) => i.title.en)).toEqual(['Too late']);
  });

  it('follow-up 656: a plan line names its campaign (this shop\'s, not archived), shown with it; the month view is the whole month', async () => {
    const eid = await t.prisma.campaign.findFirstOrThrow({ where: { storeId: S, name: 'Eid push' }, select: { id: true } });
    const gone = await t.prisma.campaign.create({ data: { storeId: S, name: 'Old push', status: 'ENDED', archivedAt: new Date(T0) } });
    const g0 = (await api('GET')).a;
    expect(g0.campaigns.map((c) => c.name)).toContain('Eid push');
    expect(g0.campaigns.map((c) => c.name)).not.toContain('Old push');
    const line = { action: 'plan.add', title: 'Eid sale', starts: '2027-03-08', ends: '2027-03-12' };
    expect((await api('POST', { ...line, campaignId: gone.id })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['campaignId'] });
    expect((await api('POST', { ...line, campaignId: 'eid' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['campaignId'] });
    const added = await api('POST', { ...line, campaignId: eid.id });
    expect(added.a.ok).toBe(true);
    expect(await t.prisma.calendarEntry.findUnique({ where: { id: added.a.id! } })).toMatchObject({ kind: 'plan', refType: 'Campaign', refId: eid.id });
    const g = (await api('GET')).a;
    expect(g.items.find((i) => i.id === `plan:${added.a.id}`)).toMatchObject({ detail: 'Eid push', href: `/admin/marketing/campaigns/${eid.id}`, own: { campaign: { id: eid.id, name: 'Eid push' } } });
    const row = g.plans.find((p) => p.id === added.a.id)!;
    expect(row.campaignId).toBe(eid.id);
    // taken off again
    expect((await api('POST', { action: 'plan.update', id: row.id, version: row.version, title: 'Eid sale', starts: '2027-03-08', ends: '2027-03-12', campaignId: null })).a.ok).toBe(true);
    expect(await t.prisma.calendarEntry.findUnique({ where: { id: row.id } })).toMatchObject({ refType: null, refId: null });
    expect(await t.prisma.auditLog.count({ where: { action: 'marketingCalendar.plan.add', after: { path: ['campaignId'], equals: eid.id } } })).toBe(1);
    // the month view: 1–31 March whatever the days setting; another month by an asked day
    const m = (await api('GET', undefined, { path: '/api/admin/marketing/calendar?view=month' })).a;
    expect(m).toMatchObject({ view: 'month', range: { from: '2027-03-01', to: '2027-03-31', days: 31 } });
    expect(m.items.some((i) => i.title.en === 'Eid sale')).toBe(true);
    const may = (await api('GET', undefined, { path: '/api/admin/marketing/calendar?view=month&from=2027-05-20' })).a;
    expect(may.range).toEqual({ from: '2027-05-01', to: '2027-05-31', days: 31 });
    expect((await api('GET', undefined, { path: '/api/admin/marketing/calendar?view=weird' })).a.view).toBe('bars');
    await api('POST', { action: 'plan.archive', id: row.id });
  });

  it('sets a plan line aside while off, but refuses to bring it back', async () => {
    const v = (await api('GET')).a.card.version;
    await api('PUT', { key: 'calendar', value: { enabled: false, days: 30 }, version: v });
    expect((await api('POST', { action: 'plan.archive', id: planId })).a.ok).toBe(true);
    expect((await api('POST', { action: 'plan.restore', id: planId })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    expect((await api('POST', { action: 'plan.archive', id: '00000000-0000-0000-0000-000000000000' })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });
});
