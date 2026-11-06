// S02 · PR 76 — Website › Page layouts on a real PostgreSQL: the page reads its sections (default = today's page); a save
// moves, hides and keeps sections to their screens; the shop reads it (`shownSections`); a save must name every
// section once, never hides a locked one, and is refused when someone saved in between; seeing needs `website.read`,
// saving `website.layout.write`; audited, nothing written when unchanged.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { HOME_SECTIONS, messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { shownSections } from '../shop/layouts';
import { layoutsHandler, type LayoutView } from './layouts-admin';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

function req(method: string, o: { body?: unknown; cookie?: string; path?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.76', 'x-forwarded-proto': 'https' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/layouts'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Website › Page layouts on PostgreSQL (PR 76)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = LayoutView & { ok: boolean; error?: string; details?: string[] };
  const api = async (method: string, o: { body?: unknown; cookie?: string; page?: string } = {}) => {
    const res = await layoutsHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/website/layouts${o.page ? `?page=${o.page}` : ''}` }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_page_layouts');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    admin = { db: t.prisma, resolver, vault: null } as unknown as AdminDeps;
    owner = cookiesOf(await loginHandler(req('POST', { path: '/api/admin/auth/login', body: { email: 'owner@example.com', password: OWNER_PW } }), admin));
    const role = await rolesHandler(req('POST', { path: '/api/admin/roles', cookie: owner, body: { nameEn: 'Site desk', nameBn: 'সাইট ডেস্ক', permissions: ['website.read'] } }), admin);
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

  it('reads each page as today\'s default; seeing needs website.read, saving website.layout.write', async () => {
    const h = await api('GET', { cookie: desk });
    expect(h.status).toBe(200);
    expect(h.a.rows.map((r) => r.id)).toEqual([...HOME_SECTIONS]);
    expect(h.a.rows.every((r) => r.on)).toBe(true);
    const c = await api('GET', { page: 'category' });
    expect(c.a).toMatchObject({ page: 'category', locked: ['head', 'listing'], rows: [{ id: 'head', on: true }, { id: 'listing', on: true }, { id: 'info', on: true }, { id: 'related', on: true }] });
    expect((await api('GET', { page: 'nowhere' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['page'] });
    expect((await api('PUT', { cookie: desk, body: { page: 'category', sections: c.a.rows, version: c.a.version } })).status).toBe(403);
  });

  it('saves a new order, hidden sections and screens; the shop reads it; audited once, nothing written when unchanged', async () => {
    const c = (await api('GET', { page: 'category' })).a;
    const sections = [{ id: 'head', on: true }, { id: 'info', on: true, dev: 'desktop' }, { id: 'listing', on: true }, { id: 'related', on: false }];
    const put = await api('PUT', { body: { page: 'category', sections, version: c.version } });
    expect(put.a.ok).toBe(true);
    expect(put.a.rows).toEqual(sections);
    expect(shownSections('category', (await resolver.value('layout.category', { storeId: S })) as never)).toEqual([
      { id: 'head', dev: 'both' },
      { id: 'info', dev: 'desktop' },
      { id: 'listing', dev: 'both' },
    ]);
    const again = await api('PUT', { body: { page: 'category', sections, version: put.a.version } });
    expect(again.a.ok).toBe(true);
    expect(await t.prisma.auditLog.count({ where: { action: 'website.layout.save' } })).toBe(1);
    const home = (await api('GET')).a;
    const homeRows = [...home.rows].reverse().map((r, i) => (i === 0 ? { ...r, dev: 'phone' } : r));
    expect((await api('PUT', { body: { page: 'home', sections: homeRows, version: home.version } })).a.ok).toBe(true);
    expect(shownSections('home', (await resolver.value('home.sections', { storeId: S })) as never)[0]).toEqual({ id: HOME_SECTIONS[HOME_SECTIONS.length - 1], dev: 'phone' });
  });

  it('refuses a save that drops, repeats or invents a section, hides a locked one, or comes after another save', async () => {
    const c = (await api('GET', { page: 'category' })).a;
    const put = (sections: unknown, version = c.version) => api('PUT', { body: { page: 'category', sections, version } });
    expect((await put(c.rows.slice(1))).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['sections'] });
    expect((await put([...c.rows.slice(1), c.rows[1]])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put([...c.rows.slice(1), { id: 'banner', on: true }])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put(c.rows.map((r) => ({ ...r, dev: 'tablet' })))).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put(c.rows.map((r) => (r.id === 'listing' ? { ...r, on: false } : r)))).a).toMatchObject({ ok: false, error: 'LOCKED' });
    expect((await put(c.rows, 'old')).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await api('PUT', { body: { page: 'checkout', sections: [], version: c.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['page'] });
  });
});
