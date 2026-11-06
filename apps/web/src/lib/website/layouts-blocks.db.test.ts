// S02 · PR 595 — the page layout builder's own sections and one category's own layout on a real PostgreSQL: a save
// adds the owner's sections to the home page or the category pages (the scope gives each its page and category); the
// shop draws them in their place on their days; a save never drops one (hidden, never deleted), never takes another
// scope's id and never an unsafe link; one category keeps its own order while its switch is on and keeps it when off.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values only.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { blockDefaults, messages, prismaBackend, registry, SettingsResolver, syncSettings, type LayoutBlock } from '@extas/settings';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { blocksOf, categoryRows, pageItems } from '../shop/blocks';
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

describe.skipIf(!HAS_TEST_DB)('Website › Page layouts — own sections on PostgreSQL (PR 595)', () => {
  let t: TestDatabase;
  let admin: AdminDeps;
  let resolver: SettingsResolver<typeof registry>;
  let owner = '';
  let desk = '';
  const saved = process.env.DATABASE_URL;
  type Answer = LayoutView & { ok: boolean; error?: string; details?: string[] };
  const api = async (method: string, o: { body?: unknown; cookie?: string; page?: string; cat?: string } = {}) => {
    const res = await layoutsHandler(req(method, { body: o.body, cookie: o.cookie ?? owner, path: `/api/admin/website/layouts${o.page ? `?page=${o.page}` : ''}${o.cat ? `&cat=${o.cat}` : ''}` }), admin);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web_page_blocks');
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

  const strip = (id: string, over: Record<string, unknown> = {}) => ({ id, page: 'home', cat: null, name: 'Eid offer', on: true, dev: 'both', from: null, to: null, before: 'reviews', type: 'offerStrip', data: { ...blockDefaults('offerStrip'), text: { en: 'Eid week', bn: 'ঈদের সপ্তাহ' } }, ...over });
  const allBlocks = async () => (await resolver.value('layout.blocks', { storeId: S })) as LayoutBlock[];

  it('adds the owner’s section to the home page above the reviews; the shop draws it there; audited', async () => {
    const h = (await api('GET')).a;
    expect(h.blocks).toEqual([]);
    const put = await api('PUT', { body: { page: 'home', sections: h.rows, blocks: [strip('eid001', { page: 'category', cat: 'polo' })], version: h.version } });
    expect(put.a.ok).toBe(true);
    // the page and the category come from the scope, never from the editor
    expect(put.a.blocks).toMatchObject([{ id: 'eid001', page: 'home', cat: null, before: 'reviews' }]);
    const items = pageItems('home', (await resolver.value('home.sections', { storeId: S })) as never, blocksOf(await allBlocks(), 'home'), '2026-11-06');
    const at = items.findIndex((it) => it.kind === 'block');
    expect(items[at + 1]).toMatchObject({ kind: 'sec', row: { id: 'reviews' } });
    expect(await t.prisma.auditLog.count({ where: { action: 'website.layout.save', entityId: 'layout.blocks' } })).toBe(1);
    expect((await api('PUT', { cookie: desk, body: { page: 'home', sections: h.rows, blocks: [], version: put.a.version } })).status).toBe(403);
  });

  it('never drops a section, never takes another page’s id, never an unsafe link, never on the product page', async () => {
    const h = (await api('GET')).a;
    const put = (blocks: unknown, page = 'home', v = h) => api('PUT', { body: { page, sections: v.rows, blocks, version: v.version } });
    expect((await put([])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['blocks'] });
    expect((await put([...h.blocks, strip('bad001', { data: { ...blockDefaults('offerStrip'), href: 'javascript:alert(1)' } })])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    expect((await put([...h.blocks, strip('eid001')])).a).toMatchObject({ ok: false, error: 'INVALID_INPUT' });
    const c = (await api('GET', { page: 'category' })).a;
    expect((await put([strip('eid001', { before: 'info' })], 'category', c)).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['blocks'] });
    const p = (await api('GET', { page: 'product' })).a;
    expect((await put([strip('new001')], 'product', p)).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['blocks'] });
    // hidden, not deleted: switched off it stays in the list and the shop leaves it out
    const off = await put(h.blocks.map((b) => ({ ...b, on: false })));
    expect(off.a.blocks).toMatchObject([{ id: 'eid001', on: false }]);
    expect(pageItems('home', null, blocksOf(await allBlocks(), 'home'), '2026-11-06').some((it) => it.kind === 'block')).toBe(false);
  });

  it('gives one category its own order with its switch, and its own sections; off keeps the order', async () => {
    expect((await api('GET', { page: 'category', cat: 'nowhere' })).a).toMatchObject({ ok: false, error: 'INVALID_INPUT', details: ['cat'] });
    const one = (await api('GET', { page: 'category', cat: 'polo' })).a;
    expect(one).toMatchObject({ cat: 'polo', own: false, ownRows: null, blocks: [] });
    const mine = [...one.rows].reverse();
    const on = await api('PUT', { body: { page: 'category', cat: 'polo', own: true, sections: mine, blocks: [strip('polo01', { before: 'info' })], version: one.version } });
    expect(on.a).toMatchObject({ ok: true, own: true, blocks: [{ id: 'polo01', page: 'category', cat: 'polo' }] });
    expect(on.a.rows.map((r) => r.id)).toEqual(mine.map((r) => r.id));
    const own = (await resolver.value('layout.categoryOwn', { storeId: S })) as never;
    const every = (await resolver.value('layout.category', { storeId: S })) as never;
    expect(categoryRows(own, 'polo', every).map((r) => r.id)).toEqual(mine.map((r) => r.id));
    expect(blocksOf(await allBlocks(), 'category', 'polo').map((b) => b.id)).toEqual(['polo01']);
    expect(blocksOf(await allBlocks(), 'category', 'jeans')).toEqual([]);
    // every category page's own sections show on polo too, and polo's never on another category
    const all = (await api('GET', { page: 'category' })).a;
    expect(all.blocks).toEqual([]);
    const off = await api('PUT', { body: { page: 'category', cat: 'polo', own: false, sections: all.rows, blocks: on.a.blocks, version: on.a.version } });
    expect(off.a).toMatchObject({ ok: true, own: false });
    expect(off.a.ownRows!.map((r) => r.id)).toEqual(mine.map((r) => r.id));
    expect(categoryRows((await resolver.value('layout.categoryOwn', { storeId: S })) as never, 'polo', every)).toBe(every);
  });
});
