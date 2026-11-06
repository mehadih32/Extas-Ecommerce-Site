// S02 · PR 596 — Website › Side canvas on a real PostgreSQL: off as shipped with no zones; a save keeps the switch and
// the zones, is audited, refuses a stale version, a dropped zone (hidden, never deleted), an unsafe link or image and a
// number out of range; a staff member who may only look cannot save. A throwaway database (skipped without
// TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { sideCanvasHandler, type SideView } from './side-canvas-admin';

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
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/side-canvas'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Website › Side canvas on PostgreSQL (PR 596)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = SideView & { ok: boolean; error?: string; details?: string[] };
  const api = async (method: string, o: { body?: unknown; cookie?: string } = {}) => {
    const res = await sideCanvasHandler(req(method, { body: o.body, cookie: o.cookie ?? owner }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_side_canvas');
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

  const zone = (id: string, over: Record<string, unknown> = {}) => ({ id, name: 'Eid polo', side: 'right', on: true, pages: 'both', cats: [], from: '2026-11-01', to: '2026-11-30', top: 24, width: 160, height: 300, mode: 'sticky', kind: 'teaser', ref: '', alt: { en: '', bn: '' }, text: { en: 'Eid week', bn: 'ঈদের সপ্তাহ' }, href: '/collections/polo', style: 'card', ...over });

  it('comes off with no zones; a save keeps the switch and the zones and is audited; a looker cannot save', async () => {
    const h = (await api('GET')).a;
    expect(h).toMatchObject({ ok: true, canvas: { enabled: false }, zones: [] });
    const put = await api('PUT', { body: { canvas: { ...h.canvas, enabled: true }, zones: [zone('eid001')], version: h.version } });
    expect(put.a).toMatchObject({ ok: true, canvas: { enabled: true }, zones: [{ id: 'eid001', side: 'right' }] });
    expect(await resolver.value('layout.sideCanvas', { storeId: S })).toMatchObject({ enabled: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.sidecanvas.save' } })).toBe(1);
    // the same again writes nothing new
    await api('PUT', { body: { canvas: put.a.canvas, zones: put.a.zones, version: put.a.version } });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.sidecanvas.save' } })).toBe(1);
    expect((await api('GET', { cookie: desk })).status).toBe(200);
    expect((await api('PUT', { cookie: desk, body: { canvas: put.a.canvas, zones: put.a.zones, version: put.a.version } })).status).toBe(403);
  });

  it('refuses a stale save, a dropped zone, an unsafe link or image and a number out of range', async () => {
    const h = (await api('GET')).a;
    const put = (zones: unknown, canvas: unknown = h.canvas, version = h.version) => api('PUT', { body: { canvas, zones, version } });
    expect((await put(h.zones, h.canvas, 'old')).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await put([])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['zones'] });
    expect((await put([zone('eid001', { href: 'javascript:alert(1)' })])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put([zone('eid001', { kind: 'image', ref: 'http://example.com/a.jpg' })])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put([zone('eid001', { from: '2026-11-30', to: '2026-11-01' })])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put(h.zones, { ...h.canvas, minWidth: 800 })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['canvas'] });
    // hidden, not deleted: switched off it stays in the list
    const off = await put(h.zones.map((z) => ({ ...z, on: false })));
    expect(off.a).toMatchObject({ ok: true, zones: [{ id: 'eid001', on: false }] });
  });
});
