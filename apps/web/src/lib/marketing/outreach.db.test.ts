// S13 · PR 279 — Marketing › SEO outreach on a real PostgreSQL: off as shipped (nothing added while off); a site by its
// address, kept once as its bare host; moved along the pipeline (asked sets the follow-up day by itself, a day that has
// come is "due", "link live" needs a page on that site and keeps when it went live); the counts per stage; set aside,
// never deleted; seeing needs `marketing.campaigns.read`, changing `marketing.campaigns.write`; audited. The pure
// helpers: the site, the live link, the e-mail in a contact line and the `mailto:` link (nothing is sent by the shop).
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { emailOf, fillPitch, liveLinkOf, outreachHandler, pitchMailto, siteOf, type OutreachOverview } from './outreach';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;
const T0 = Date.parse('2026-11-06T09:00:00Z');

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.48', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/marketing/outreach'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe('SEO outreach helpers (pure)', () => {
  it('reads a site from its address, a live link on that site, the e-mail in a contact line; builds the mailto', () => {
    for (const v of ['https://www.Blog.Example.com/style/polo?x=1', 'blog.example.com', 'www.blog.example.com/', 'http://blog.example.com']) expect(siteOf(v)).toBe('blog.example.com');
    for (const v of ['', 'not a site', 'localhost', 'https://', '1.2.3.4', 'ftp:/x']) expect(siteOf(v)).toBeNull();
    expect(liveLinkOf('https://blog.example.com/best-polos', 'blog.example.com')).toBe('https://blog.example.com/best-polos');
    expect(liveLinkOf('https://www.example.com/a', 'example.com')).toBe('https://www.example.com/a');
    expect(liveLinkOf('https://news.example.com/a', 'example.com')).toBe('https://news.example.com/a');
    for (const v of ['https://other.test/a', 'javascript:alert(1)', 'blog.example.com/a', 'https://badexample.com/a']) expect(liveLinkOf(v, 'example.com')).toBeNull();
    expect(emailOf('Sample editor, editor@blog.example.com')).toBe('editor@blog.example.com');
    expect(emailOf('a page on Facebook')).toBeNull();
    expect(fillPitch('Hello {site}, see {shop}', { site: 'blog.example.com', shop: 'https://shop.example.test' })).toBe('Hello blog.example.com, see https://shop.example.test');
    expect(pitchMailto('editor@blog.example.com', 'A link?', 'Hi & thanks')).toBe('mailto:editor@blog.example.com?subject=A%20link%3F&body=Hi%20%26%20thanks');
    expect(pitchMailto('editor@blog.example.com', '', '')).toBe('mailto:editor@blog.example.com');
  });
});

describe.skipIf(!HAS_TEST_DB)('Marketing › SEO outreach on PostgreSQL (PR 279)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let owner = '';
  let desk = '';
  let now = T0;
  const ids: Record<string, string> = {};
  type Answer = OutreachOverview & { ok: boolean; error?: string; details?: string[]; id?: string; cards?: { outreach: OutreachOverview['card'] } };
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const res = await outreachHandler(req(method, { body, cookie }), admin, () => new Date(now));
    return { status: res.status, a: (await res.json()) as Answer };
  };
  const row = async (id: string) => (await api('GET')).a.prospects.find((p) => p.id === id)!;

  beforeAll(async () => {
    t = await createTestDatabase('web_outreach');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    admin = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Outreach desk', nameBn: 'আউটরিচ ডেস্ক', permissions: ['marketing.campaigns.read'] } }), admin);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(req('POST', { path: '/api/admin/staff', cookie: owner, body: { email: 'desk@example.com', displayName: 'Sample desk', password: 'first password from the owner' } }), admin);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(req('POST', { path: `/api/admin/staff/${staffId}/roles`, cookie: owner, body: { action: 'assign', roleId, storeId: S } }), admin, staffId);
    const once = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'desk@example.com', password: 'first password from the owner' } }), admin));
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is off as shipped: the page reads, nothing is added; seeing needs the read key, changing the write key', async () => {
    const g = await api('GET', undefined, desk);
    expect(g.status).toBe(200);
    expect(g.a).toMatchObject({ settings: { enabled: false, followUpDays: 7, pitchSubject: null, pitchBody: null }, prospects: [], totals: { all: 0, due: 0, byStage: { FOUND: 0, LIVE: 0 } } });
    expect((await api('POST', { action: 'prospect.add', site: 'blog.example.com' })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    expect((await api('PUT', { key: 'outreach', value: { ...g.a.settings, enabled: true }, version: g.a.card.version }, desk)).status).toBe(403);
    expect((await api('PUT', { key: 'outreach', value: { ...g.a.settings, enabled: true, followUpDays: -2 }, version: g.a.card.version })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['followUpDays'] });
    expect((await api('PUT', { key: 'outreach', value: { ...g.a.settings, enabled: true }, version: 'old' })).a).toMatchObject({ ok: false, error: 'STALE' });
    const on = await api('PUT', { key: 'outreach', value: { ...g.a.settings, enabled: true, pitchBody: { en: 'Hello {site}', bn: 'হ্যালো {site}' } }, version: g.a.card.version });
    expect(on.a.cards!.outreach.value).toMatchObject({ enabled: true, pitchBody: { en: 'Hello {site}' } });
    expect(await t.prisma.auditLog.count({ where: { action: 'outreach.settings' } })).toBe(1);
  });

  it('adds a site once by its bare host; a bad address or a second copy is refused; audited', async () => {
    expect((await api('POST', { action: 'prospect.add', site: 'not a site' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['site'] });
    expect((await api('POST', { action: 'prospect.add', site: 'blog.example.com' }, desk)).status).toBe(403);
    const a = await api('POST', { action: 'prospect.add', site: 'https://www.blog.example.com/style', contact: 'Sample editor, editor@blog.example.com', notes: 'Writes about menswear' });
    expect(a.a.ok).toBe(true);
    ids.blog = a.a.id!;
    expect((await api('POST', { action: 'prospect.add', site: 'BLOG.example.com' })).a).toMatchObject({ ok: false, error: 'EXISTS', details: ['site'] });
    ids.news = (await api('POST', { action: 'prospect.add', site: 'news.example.org' })).a.id!;
    const g = await api('GET', undefined, desk);
    expect(g.a.prospects.find((p) => p.id === ids.blog)).toMatchObject({ site: 'blog.example.com', status: 'FOUND', email: 'editor@blog.example.com', notes: 'Writes about menswear', nextStepOn: null, due: false, archived: false });
    expect(g.a.totals).toMatchObject({ all: 2, due: 0, byStage: { FOUND: 2 } });
    expect(await t.prisma.auditLog.count({ where: { action: 'outreach.prospect.add' } })).toBe(2);
  });

  it('the pipeline: asked sets the follow-up day; the day comes and it is due; live needs a page on that site and keeps its moment', async () => {
    const base = { action: 'prospect.update', id: ids.blog, contact: 'Sample editor, editor@blog.example.com', notes: 'Writes about menswear', linkUrl: '', nextStepOn: '' };
    expect((await api('POST', { ...base, status: 'MAYBE' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['status'] });
    expect((await api('POST', { ...base, status: 'ASKED', nextStepOn: '2026-02-30' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['nextStepOn'] });
    expect((await api('POST', { ...base, status: 'ASKED' })).a.ok).toBe(true);
    expect(await row(ids.blog!)).toMatchObject({ status: 'ASKED', nextStepOn: '2026-11-13', due: false });
    now = Date.parse('2026-11-13T00:00:00Z');
    expect((await api('GET')).a.totals.due).toBe(1);
    // answered with his own day; then live — not without a page, not on another site
    expect((await api('POST', { ...base, status: 'ANSWERED', nextStepOn: '2026-11-20' })).a.ok).toBe(true);
    expect(await row(ids.blog!)).toMatchObject({ status: 'ANSWERED', nextStepOn: '2026-11-20', due: false });
    expect((await api('POST', { ...base, status: 'LIVE' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['linkUrl'] });
    expect((await api('POST', { ...base, status: 'LIVE', linkUrl: 'https://other.example.net/post' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['linkUrl'] });
    expect((await api('POST', { ...base, status: 'LIVE', linkUrl: 'https://blog.example.com/best-polos' })).a.ok).toBe(true);
    const live = await row(ids.blog!);
    expect(live).toMatchObject({ status: 'LIVE', linkUrl: 'https://blog.example.com/best-polos', liveAt: '2026-11-13T00:00:00.000Z', nextStepOn: null, due: false });
    now += 86_400_000;
    await api('POST', { ...base, status: 'LIVE', linkUrl: 'https://blog.example.com/best-polos', notes: 'Linked to the polo page' });
    expect((await row(ids.blog!)).liveAt).toBe('2026-11-13T00:00:00.000Z');
    // follow-up gap 0: asked sets no day
    const card = (await api('GET')).a.card;
    await api('PUT', { key: 'outreach', value: { ...card.value, followUpDays: 0 }, version: card.version });
    await api('POST', { action: 'prospect.update', id: ids.news, status: 'ASKED', contact: '', notes: '', linkUrl: '', nextStepOn: '' });
    expect(await row(ids.news!)).toMatchObject({ status: 'ASKED', nextStepOn: null });
    expect((await api('GET')).a.totals.byStage).toEqual({ FOUND: 0, ASKED: 1, ANSWERED: 0, LIVE: 1, DECLINED: 0 });
    expect(await t.prisma.auditLog.count({ where: { action: 'outreach.prospect.update' } })).toBe(5);
  });

  it('set aside, never deleted; brought back; setting aside works while the pipeline is off', async () => {
    await api('POST', { action: 'prospect.archive', id: ids.news });
    let g = await api('GET');
    expect(g.a.prospects.find((p) => p.id === ids.news)).toMatchObject({ archived: true });
    expect(g.a.totals.all).toBe(1);
    expect((await api('POST', { action: 'prospect.update', id: ids.news, status: 'FOUND' })).a).toMatchObject({ ok: false, error: 'NOT_FOUND' });
    await api('POST', { action: 'prospect.restore', id: ids.news });
    const card = (await api('GET')).a.card;
    await api('PUT', { key: 'outreach', value: { ...card.value, enabled: false }, version: card.version });
    expect((await api('POST', { action: 'prospect.archive', id: ids.blog })).a.ok).toBe(true);
    expect((await api('POST', { action: 'prospect.restore', id: ids.blog })).a).toMatchObject({ ok: false, error: 'SWITCHED_OFF' });
    g = await api('GET');
    expect(g.a.totals.all).toBe(1);
    expect(await t.prisma.outreachProspect.count()).toBe(2);
  });
});
