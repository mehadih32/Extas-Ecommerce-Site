// S02 · PR 597 follow-up (695) — one page's snapshots on a real PostgreSQL (Website › Page layouts and Side canvas):
// "Save snapshot" keeps the page as saved now under a name; "Restore" saves the page as it is now first ("Before
// restoring …"), brings the saved order, sections and switches back through the page's own Save (audited the same way),
// keeps sections and zones made since switched off (never deleted), refuses a stale page, a snapshot of another page and
// a looker; Launch default's list never shows them. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
// Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { blockDefaults, messages, prismaBackend, registry, SettingsResolver, syncSettings, type LayoutBlock, type SideZone } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { lookView } from './launch-default-admin';
import { layoutsHandler, type LayoutView } from './layouts-admin';
import { pageSnapsHandler, type PageRestoreDone, type PageSnapView } from './page-snapshots';
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
  return new Request(`https://${HOST}${o.path ?? '/api/admin/website/snapshots'}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
}

describe.skipIf(!HAS_TEST_DB)('Website › one page’s snapshots on PostgreSQL (PR 597 follow-up 695)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Snap = PageSnapView & { ok: boolean; error?: string; details?: string[]; id?: string; done?: PageRestoreDone };
  const snaps = async (method: string, o: { body?: unknown; cookie?: string; place?: string } = {}) => {
    const res = await pageSnapsHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/website/snapshots${o.place ? `?place=${encodeURIComponent(o.place)}` : ''}` }), admin);
    return { status: res.status, a: (await res.json()) as Snap };
  };
  const layout = async (method: string, o: { body?: unknown; q?: string } = {}) => {
    const res = await layoutsHandler(req(method, { body: o.body, cookie: owner, path: `/api/admin/website/layouts${o.q ?? ''}` }), admin);
    return (await res.json()) as LayoutView & { ok: boolean };
  };
  const side = async (method: string, body?: unknown) => (await (await sideCanvasHandler(req(method, { body, cookie: owner, path: '/api/admin/website/side-canvas' }), admin)).json()) as SideView & { ok: boolean };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_page_snaps');
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
    await t.prisma.category.create({ data: { storeId: S, slug: 'polo', nameEn: 'Polo', isVisible: true } });
    desk = cookiesOf(await passwordHandler(req('POST', { path: '/api/admin/auth/password', cookie: once, body: { current: 'first password from the owner', next: 'my own words for this job' } }), admin));
  });
  afterAll(async () => {
    await disconnectPrisma();
    process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  const block = (id: string, on = true): LayoutBlock =>
    ({ id, page: 'home', cat: null, name: 'Sample', on, dev: 'both', from: null, to: null, before: null, type: 'spacer', data: blockDefaults('spacer') }) as LayoutBlock;
  const zone = (id: string, on = true): SideZone =>
    ({ id, name: 'Sample', side: 'right', on, pages: 'both', cats: [], from: null, to: null, top: 24, width: 160, height: 300, mode: 'sticky', kind: 'teaser', ref: '', alt: { en: '', bn: '' }, text: { en: 'Eid', bn: 'ঈদ' }, href: '', style: 'card' }) as SideZone;

  it('saves the home page, restores it after a change (the change saved first), keeps a newer section switched off', async () => {
    const h = await layout('GET');
    const first = await layout('PUT', { body: { page: 'home', sections: h.rows, blocks: [block('eid001')], version: h.version } });
    const g = (await snaps('GET', { place: 'layout:home' })).a;
    expect(g).toMatchObject({ ok: true, place: 'layout:home', version: first.version, snaps: [] });
    const made = (await snaps('POST', { body: { action: 'save', place: 'layout:home', name: 'Eid 2026', version: g.version } })).a;
    expect(made).toMatchObject({ ok: true, snaps: [{ name: 'Eid 2026', before: null, by: 'Sample owner' }] });
    // the owner changes the page: the order turned round, a section switched off, a new one added
    const rows = [...first.rows].reverse();
    const changed = await layout('PUT', { body: { page: 'home', sections: rows, blocks: [block('eid001', false), block('new001')], version: first.version } });
    expect(changed.rows.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    expect((await snaps('POST', { body: { action: 'restore', place: 'layout:home', id: made.id, version: first.version } })).a).toMatchObject({ ok: false, error: 'STALE' });
    const back = (await snaps('POST', { body: { action: 'restore', place: 'layout:home', id: made.id, version: changed.version } })).a;
    expect(back).toMatchObject({ ok: true, done: { hidden: 1 } });
    expect(back.snaps.map((s) => [s.name, s.before])).toEqual([
      ['Eid 2026', 'Eid 2026'],
      ['Eid 2026', null],
    ]);
    const now = await layout('GET');
    expect(now.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id));
    expect(now.blocks).toMatchObject([
      { id: 'eid001', on: true },
      { id: 'new001', on: false },
    ]);
    expect(await t.prisma.auditLog.count({ where: { action: 'website.snapshot.restore' } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'website.layout.save' } })).toBe(3);
    // undo = restore the copy saved just before
    const undo = (await snaps('POST', { body: { action: 'restore', place: 'layout:home', id: back.snaps[0]!.id, version: now.version } })).a;
    expect(undo.ok).toBe(true);
    expect((await layout('GET')).rows.map((r) => r.id)).toEqual(rows.map((r) => r.id));
    // never in Launch default's list of whole-shop looks
    expect((await lookView({ db: t.prisma, resolver })).looks).toEqual([]);
  });

  it('keeps one page’s snapshots to that page; refuses a stale save, a bad place, no name and a looker', async () => {
    const p = (await snaps('GET', { place: 'layout:product' })).a;
    expect(p.snaps).toEqual([]);
    const home = (await snaps('GET', { place: 'layout:home' })).a;
    expect((await snaps('POST', { body: { action: 'restore', place: 'layout:product', id: home.snaps[0]!.id, version: p.version } })).a).toMatchObject({ ok: false, error: 'not-found' });
    expect((await snaps('POST', { body: { action: 'save', place: 'layout:product', name: 'x', version: 'old' } })).a).toMatchObject({ ok: false, error: 'STALE' });
    expect((await snaps('POST', { body: { action: 'save', place: 'layout:product', name: '  ', version: p.version } })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['name'] });
    expect((await snaps('GET', { place: 'layout:category:nowhere' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['place'] });
    expect((await snaps('GET', { place: 'shop' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['place'] });
    expect((await snaps('GET', { place: 'layout:home', cookie: desk })).status).toBe(200);
    expect((await snaps('POST', { cookie: desk, body: { action: 'save', place: 'layout:home', name: 'x', version: home.version } })).status).toBe(403);
  });

  it('saves and restores the side canvas: its switch comes back, a zone made since stays switched off', async () => {
    const h = await side('GET');
    const on = await side('PUT', { canvas: { ...h.canvas, enabled: true }, zones: [zone('aaa001')], version: h.version });
    const made = (await snaps('POST', { body: { action: 'save', place: 'side', name: 'Winter', version: on.version } })).a;
    expect(made.ok).toBe(true);
    const later = await side('PUT', { canvas: { ...on.canvas, enabled: false }, zones: [zone('aaa001', false), zone('bbb002')], version: on.version });
    const back = (await snaps('POST', { body: { action: 'restore', place: 'side', id: made.id, version: later.version } })).a;
    expect(back).toMatchObject({ ok: true, done: { hidden: 1 } });
    expect(await side('GET')).toMatchObject({ canvas: { enabled: true }, zones: [{ id: 'aaa001', on: true }, { id: 'bbb002', on: false }] });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.sidecanvas.save' } })).toBe(3);
  });
});
