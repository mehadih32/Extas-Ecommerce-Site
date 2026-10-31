// S11 · PR 235 — Website › SEO › Redirects & 404 on a real PostgreSQL: seo.read reads, seo.manage writes; a forward
// typed in by hand follows its target to the end and moves older links onto the new page (no chains); it never takes
// over the home page, the shop's own pages or a live product or category; it is switched off, never deleted; the
// owner's list of old links is checked line by line first and written only on commit (the WordPress map kept 12
// months, forwarding only once live); the 404 counter is capped; the one-click fix forwards that address and takes it
// out of the open list; a combo asked for with its colours in another order is found and remembered. Every write is
// audited. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SEO_REDIRECTS_DEFAULT, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { seoSettingsRoute } from './admin-api';
import { comboOrderTarget, type ComboOrderDb } from './combo-order';
import { countNotFound, type NotFoundDb } from './not-found';
import { forwardOf, redirectKey, type RedirectTable } from './redirect-table';
import { seoRedirectsRoute, type RedirectsSnapshot } from './redirects-admin';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const BASE = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.35', origin: `https://${HOST}`, 'content-type': 'application/json' };
const S = MOTHER_STORE_ID;

function call(method: string, path: string, opts: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { ...BASE };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request(`https://${HOST}${path}`, { method, headers, ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

async function staffWith(deps: AdminDeps, owner: string, email: string, permissions: string[]): Promise<string> {
  const role = await rolesHandler(call('POST', '/api/admin/roles', { cookie: owner, body: { nameEn: `Role ${email}`, nameBn: 'ভূমিকা', permissions } }), deps);
  const roleId = ((await role.json()) as { role: { id: string } }).role.id;
  const made = await staffHandler(call('POST', '/api/admin/staff', { cookie: owner, body: { email, displayName: 'Sample staff', password: 'first password from the owner' } }), deps);
  const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
  await staffRolesHandler(call('POST', `/api/admin/staff/${staffId}/roles`, { cookie: owner, body: { action: 'assign', roleId, storeId: S } }), deps, staffId);
  const first = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email, password: 'first password from the owner' } }), deps));
  return cookiesOf(await passwordHandler(call('POST', '/api/admin/auth/password', { cookie: first, body: { current: 'first password from the owner', next: 'my own words for this job' } }), deps));
}

describe.skipIf(!HAS_TEST_DB)('Website › SEO › Redirects & 404 on PostgreSQL (PR 235)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const api = (cookie: string, method: string, rest = '', b?: unknown) =>
    seoRedirectsRoute(call(method, `/api/admin/seo/redirects${rest}`, { cookie, ...(b === undefined ? {} : { body: b }) }), deps, rest ? rest.slice(1).split('?')[0]!.split('/') : []);
  const snap = async (q = '') => (await (await seoRedirectsRoute(call('GET', `/api/admin/seo/redirects${q}`, { cookie: owner }), deps, [])).json()) as RedirectsSnapshot & { ok: boolean };
  /** The table the proxy would hold now (the same read, without the memo). */
  const table = async (): Promise<RedirectTable> => {
    const rows = await t.prisma.redirect.findMany({ where: { storeId: S, enabled: true, archivedAt: null } });
    const set = await deps.resolver.value('seo.redirects', { storeId: S });
    return { status: 301, wordpressLive: set.wordpressMapLive, rows: new Map(rows.map((r) => [redirectKey(r.fromPath), { id: r.id, to: r.toPath, source: r.source }])) };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => new Date(Date.UTC(2026, 9, 31, 9)) };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    reader = await staffWith(deps, owner, 'reader@example.com', ['seo.read']);
    const db = t.prisma;
    const g = await db.garmentType.create({ data: { storeId: S, key: 'rd-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = await db.category.create({ data: { storeId: S, slug: 'polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g.id } });
    await db.category.create({ data: { storeId: S, slug: 'panjabi', nameEn: 'Panjabi', isVisible: true, garmentTypeId: g.id } });
    await db.product.create({ data: { storeId: S, slug: 'essential-pique-polo', nameEn: 'Essential Pique Polo', status: 'PUBLISHED', categoryId: cat.id, publishedAt: new Date(Date.UTC(2026, 9, 1)) } });
    await db.product.create({ data: { storeId: S, slug: 'oxford-shirt', nameEn: 'Oxford Shirt', status: 'PUBLISHED', categoryId: cat.id, publishedAt: new Date(Date.UTC(2026, 9, 1)) } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a session; seo.read reads, seo.manage writes', async () => {
    expect((await api('', 'GET')).status).toBe(401);
    const r = await api(reader, 'GET');
    expect(r.status).toBe(200);
    const b = (await r.json()) as RedirectsSnapshot;
    expect(b).toMatchObject({ view: 'all', redirects: [], wordpress: { rows: 0, live: false }, statusCode: 301 });
    expect(b.values['seo.redirects']).toEqual(SEO_REDIRECTS_DEFAULT);
    expect((await api(reader, 'POST', '', { fromPath: '/old', toPath: '/p/oxford-shirt' })).status).toBe(403);
    expect((await api(owner, 'DELETE')).status).toBe(405);
  });

  it('a forward by hand: no chains, never over a live page or the shop`s own pages, switched off never deleted', async () => {
    const add = (fromPath: string, toPath: string) => api(owner, 'POST', '', { fromPath, toPath });
    expect((await add('/Old-Polo/', '/p/essential-pique-polo')).status).toBe(200);
    // pointing at an old link follows it to its end; an older link to the new address moves too
    const b = (await (await add('/older-polo', '/old-polo')).json()) as { row: { toPath: string } };
    expect(b.row.toPath).toBe('/p/essential-pique-polo');
    const moved = (await (await add('/p/essential-pique-polo-v1', '/older-polo')).json()) as { row: { toPath: string } };
    expect(moved.row.toPath).toBe('/p/essential-pique-polo');
    // a new forward from an address others point at moves them straight onto its target
    await add('/summer-landing', '/summer-sale');
    const rep = (await (await add('/summer-sale', '/p/oxford-shirt')).json()) as { repointed: number };
    expect(rep.repointed).toBe(1);
    expect((await t.prisma.redirect.findFirstOrThrow({ where: { storeId: S, fromPath: '/summer-landing' } })).toPath).toBe('/p/oxford-shirt');
    for (const [from, code] of [
      ['/p/essential-pique-polo', 'LIVE_PAGE'],
      ['/collections/polos', 'LIVE_PAGE'],
      ['/', 'OWN_PAGE'],
      ['/checkout', 'OWN_PAGE'],
      ['/bn/old', 'OWN_PAGE'],
    ] as const) {
      const res = await add(from, '/p/oxford-shirt');
      expect([from, res.status, ((await res.json()) as { error: string }).error]).toEqual([from, 409, code]);
    }
    expect((await add('/same', '/same/')).status).toBe(409);
    expect((await add('', '/x')).status).toBe(400);
    const row = await t.prisma.redirect.findFirstOrThrow({ where: { storeId: S, fromPath: '/old-polo' } });
    expect(row).toMatchObject({ toPath: '/p/essential-pique-polo', statusCode: 301, source: 'manual', enabled: true });
    expect(forwardOf(await table(), '/OLD-POLO/', '?utm_source=fb')?.location).toBe('/p/essential-pique-polo?utm_source=fb');
    const off = await api(owner, 'POST', `/${row.id}`, { enabled: false });
    expect(((await off.json()) as { row: { enabled: boolean } }).row.enabled).toBe(false);
    expect(forwardOf(await table(), '/old-polo')).toBeNull();
    expect(await t.prisma.redirect.count({ where: { id: row.id } })).toBe(1);
    expect((await api(owner, 'POST', `/${row.id}`, { enabled: true, toPath: '/p/oxford-shirt' })).status).toBe(200);
    expect(forwardOf(await table(), '/old-polo')?.location).toBe('/p/oxford-shirt');
    const actions = (await t.prisma.auditLog.findMany({ where: { action: { startsWith: 'seo.redirect.' } }, select: { action: true } })).map((a) => a.action);
    expect(new Set(actions)).toEqual(new Set(['seo.redirect.create', 'seo.redirect.repoint', 'seo.redirect.disable', 'seo.redirect.enable']));
    const s = await snap('?view=manual&q=polo');
    expect(s.redirects.map((r) => r.fromPath).sort()).toEqual(['/old-polo', '/older-polo', '/p/essential-pique-polo-v1']);
    expect(s.counts.manual).toBe(5);
  });

  it('the WordPress map: checked line by line, written on commit, kept 12 months, forwarding only once live', async () => {
    const text = 'old,new\n/product/polo-shirt-navy-l/,/p/essential-pique-polo\n/product-category/panjabi/,/collections/panjabi\n/product/polo-shirt-navy-l/,/p/oxford-shirt\n/shop/,/\n/p/oxford-shirt,/p/essential-pique-polo\n/only-one\n/same,/same';
    const check = (await (await api(owner, 'POST', '/import', { text, kind: 'wordpress' })).json()) as { committed: boolean; tally: Record<string, number>; lines: { status: string }[] };
    expect(check.committed).toBe(false);
    expect(check.lines.map((l) => l.status)).toEqual(['ok', 'ok', 'twice', 'ok', 'live', 'empty', 'self']);
    expect(await t.prisma.redirect.count({ where: { source: 'wordpress' } })).toBe(0);
    expect((await api(owner, 'POST', '/import', { text, kind: 'other' })).status).toBe(400);
    expect((await api(owner, 'POST', '/import', { text: '\n\n', kind: 'wordpress' })).status).toBe(400);
    const done = (await (await api(owner, 'POST', '/import', { text, kind: 'wordpress', commit: true })).json()) as { written: number };
    expect(done.written).toBe(3);
    const wp = await t.prisma.redirect.findFirstOrThrow({ where: { storeId: S, fromPath: '/product/polo-shirt-navy-l' } });
    expect(wp.source).toBe('wordpress');
    expect(wp.keepUntil?.toISOString()).toBe('2027-10-31T09:00:00.000Z');
    // a second check of the same list says "already there"
    const again = (await (await api(owner, 'POST', '/import', { text, kind: 'wordpress' })).json()) as { lines: { status: string }[] };
    expect(again.lines[0]!.status).toBe('same');
    // off until go-live day, then on through the SEO settings (audited)
    expect(forwardOf(await table(), '/product/polo-shirt-navy-l/')).toBeNull();
    const ver = (await snap()).versions['seo.redirects'];
    const put = await seoSettingsRoute(call('PUT', '/api/admin/seo', { cookie: owner, body: { key: 'seo.redirects', value: { ...SEO_REDIRECTS_DEFAULT, wordpressMapLive: true }, version: ver } }), deps);
    expect(put.status).toBe(200);
    expect(forwardOf(await table(), '/product/polo-shirt-navy-l/')?.location).toBe('/p/essential-pique-polo');
    expect(forwardOf(await table(), '/bn/product-category/panjabi')?.location).toBe('/bn/collections/panjabi');
    const s = await snap('?view=wordpress');
    expect(s.wordpress).toEqual({ rows: 3, live: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.redirect.import' } })).toBe(1);
  });

  it('the 404 report: capped counter, a suggestion, the one-click fix, ignore', async () => {
    const db = t.prisma as unknown as NotFoundDb;
    const now = new Date(Date.UTC(2026, 9, 31, 10));
    expect(await countNotFound(db, S, '/product/pique-polo-navy/', 'https://www.facebook.com/x', 3, now)).toBe('new');
    expect(await countNotFound(db, S, '/Product/Pique-Polo-Navy', null, 3, now)).toBe('counted');
    expect(await countNotFound(db, S, '/wp-login.php', null, 3, now)).toBe('new');
    expect(await countNotFound(db, S, '/shop/panjabi-eid-2025', null, 3, now)).toBe('new');
    expect(await countNotFound(db, S, '/one-too-many', null, 3, now)).toBe('full');
    expect(await countNotFound(db, S, '/', null, 3, now)).toBe('skipped');
    const s = await snap();
    const polo = s.notFound.open.find((h) => h.path === '/product/pique-polo-navy')!;
    expect(polo).toMatchObject({ hits: 2, referrer: 'https://www.facebook.com/x', suggestion: { path: '/p/essential-pique-polo', percent: 67 } });
    expect(s.notFound.openCount).toBe(3);
    expect((await api(reader, 'POST', `/not-found/${polo.id}`, { action: 'fix', toPath: polo.suggestion!.path })).status).toBe(403);
    expect((await api(owner, 'POST', `/not-found/${polo.id}`, { action: 'fix', toPath: polo.suggestion!.path })).status).toBe(200);
    expect(forwardOf(await table(), '/product/pique-polo-navy')?.location).toBe('/p/essential-pique-polo');
    const bot = s.notFound.open.find((h) => h.path === '/wp-login.php')!;
    expect((await api(owner, 'POST', `/not-found/${bot.id}`, { action: 'ignore' })).status).toBe(200);
    const after = await snap();
    expect(after.notFound).toMatchObject({ openCount: 1, ignoredCount: 1, fixedCount: 1 });
    expect((await api(owner, 'POST', `/not-found/${bot.id}`, { action: 'unignore' })).status).toBe(200);
    expect((await snap()).notFound.openCount).toBe(2);
    expect((await api(owner, 'POST', `/not-found/${bot.id}`, { action: 'explode' })).status).toBe(400);
  });

  it('a combo asked for with its colours in another order is found and remembered as a forward', async () => {
    const db = t.prisma;
    for (const slug of ['polo-pairs~black-navy', 'polo-pairs~black-white']) await db.combo.create({ data: { storeId: S, slug, nameEn: slug, type: 'COLOUR_PAIR', pieceCount: 2 } });
    const cdb = db as unknown as ComboOrderDb;
    expect(await comboOrderTarget(cdb, S, 'polo-pairs~navy-black', 301)).toBe('/combo/polo-pairs~black-navy');
    expect(await comboOrderTarget(cdb, S, 'polo-pairs~navy-black', 301)).toBe('/combo/polo-pairs~black-navy');
    expect(await db.redirect.count({ where: { storeId: S, source: 'combo-order' } })).toBe(1);
    expect(await comboOrderTarget(cdb, S, 'polo-pairs~red-navy', 301)).toBeNull();
    expect(forwardOf(await table(), '/combo/polo-pairs~navy-black')?.location).toBe('/combo/polo-pairs~black-navy');
    expect((await snap('?view=combo')).counts.combo).toBe(1);
  });
});
