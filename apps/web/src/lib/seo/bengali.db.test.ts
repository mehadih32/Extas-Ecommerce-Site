// S11 · PR 588 — Website › SEO › Bengali pages on a real PostgreSQL: the coverage lists the shop's own pages, visible
// collections and published products with their Bengali state; a page is marked ready only when its Bengali text is
// there; marking needs `seo.manage`, is version-checked and audited; the gate's choice is saved and read by the proxy's
// check. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL). Sample values.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler, passwordHandler, rolesHandler, staffHandler, staffRolesHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import type { BengaliCoverage } from './bengali';
import { bengaliHandler } from './bengali-api';
import { bengaliPageKey, sendToEnglish } from './bengali-gate';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const S = MOTHER_STORE_ID;

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.40' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}/api/admin/seo/bengali`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Website › SEO › Bengali pages on PostgreSQL (PR 588)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    owner = cookiesOf(await loginHandler(call('POST', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
    const role = await rolesHandler(new Request(`https://${HOST}/api/admin/roles`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify({ nameEn: 'SEO watch', nameBn: 'SEO দেখা', permissions: ['seo.read'] }) }), deps);
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(new Request(`https://${HOST}/api/admin/staff`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'seo@example.com', displayName: 'Sample reader', password: 'first password from the owner' }) }), deps);
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(new Request(`https://${HOST}/api/admin/staff/${staffId}/roles`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, cookie: owner, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'assign', roleId, storeId: S }) }), deps, staffId);
    const first = cookiesOf(await loginHandler(call('POST', { body: { email: 'seo@example.com', password: 'first password from the owner' } }), deps));
    reader = cookiesOf(await passwordHandler(new Request(`https://${HOST}/api/admin/auth/password`, { method: 'POST', headers: { host: HOST, origin: `https://${HOST}`, cookie: first, 'content-type': 'application/json' }, body: JSON.stringify({ current: 'first password from the owner', next: 'my own words for this job' }) }), deps));

    const db = t.prisma;
    const g = await db.garmentType.create({ data: { storeId: S, key: 'bn-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = await db.category.create({ data: { storeId: S, slug: 'bn-polos', nameEn: 'Polos', nameBn: 'পোলো', isVisible: true, garmentTypeId: g.id } });
    await db.category.create({ data: { storeId: S, slug: 'bn-hidden', nameEn: 'Hidden', isVisible: false, garmentTypeId: g.id } });
    const at = new Date(Date.UTC(2026, 9, 23));
    await db.product.create({ data: { storeId: S, slug: 'bn-done', nameEn: 'Done polo', nameBn: 'তৈরি পোলো', descriptionEn: 'Soft cotton', descriptionBn: 'নরম সুতি', status: 'PUBLISHED', publishedAt: at, categoryId: cat.id } });
    await db.product.create({ data: { storeId: S, slug: 'bn-half', nameEn: 'Half polo', nameBn: 'আধা পোলো', descriptionEn: 'Soft cotton', status: 'PUBLISHED', publishedAt: at, categoryId: cat.id } });
    await db.product.create({ data: { storeId: S, slug: 'bn-draft', nameEn: 'Draft polo', status: 'DRAFT', categoryId: cat.id } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  const send = async (method: string, b?: unknown, cookie = owner) => {
    const res = await bengaliHandler(call(method, { cookie, body: b }), deps);
    return { status: res.status, a: (await res.json()) as { ok: boolean; error?: string; details?: string[]; coverage: BengaliCoverage } };
  };

  it('lists the pages with their Bengali state; a sign-in is needed', async () => {
    expect((await send('GET', undefined, '')).status).toBe(401);
    const { status, a } = await send('GET', undefined, reader);
    expect(status).toBe(200);
    const by = new Map(a.coverage.rows.map((r) => [r.key, r]));
    expect(by.get('home')).toMatchObject({ kind: 'pages', hasBengali: true, ready: false });
    expect(by.get('collections/bn-polos')).toMatchObject({ kind: 'collections', hasBengali: true });
    expect(by.has('collections/bn-hidden')).toBe(false);
    expect(by.get('p/bn-done')).toMatchObject({ kind: 'products', hasBengali: true, missing: [] });
    expect(by.get('p/bn-half')).toMatchObject({ hasBengali: false, missing: ['description'] });
    expect(by.has('p/bn-draft')).toBe(false);
    expect(a.coverage.counts.ready).toBe(0);
    // every key the coverage lists is one the gate and the pages name the same way
    for (const r of a.coverage.rows) expect(bengaliPageKey(r.path, '/p/'), r.path).toBe(r.key);
  });

  it('marks ready only with Bengali text, with seo.manage, version-checked and audited', async () => {
    const v = (await send('GET')).a.coverage.ready.version;
    expect((await send('POST', { keys: ['p/bn-done'], ready: true, version: v }, reader)).status).toBe(403);
    const no = await send('POST', { keys: ['p/bn-half'], ready: true, version: v });
    expect([no.status, no.a.error, no.a.details]).toEqual([409, 'NO_BENGALI', ['p/bn-half']]);
    expect((await send('POST', { keys: ['p/nope'], ready: true, version: v })).a.error).toBe('NOT_FOUND');
    expect((await send('POST', { keys: ['p/bn-done'], ready: true, version: 'old' })).a.error).toBe('STALE');
    const ok = await send('POST', { keys: ['p/bn-done', 'home', 'collections/bn-polos'], ready: true, version: v });
    expect(ok.status).toBe(200);
    expect(ok.a.coverage.counts.ready).toBe(3);
    expect(await deps.resolver.value('language.bengali.readyPages', { storeId: S })).toEqual(['p/bn-done', 'home', 'collections/bn-polos']);
    const off = await send('POST', { keys: ['home'], ready: false, version: ok.a.coverage.ready.version });
    expect(off.a.coverage.ready.value).toEqual(['p/bn-done', 'collections/bn-polos']);
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.bengali.ready' } })).toBe(2);
  });

  it('a page whose Bengali text is removed later stays ready and is flagged; one that is gone is left over', async () => {
    await t.prisma.product.update({ where: { storeId_slug: { storeId: S, slug: 'bn-done' } }, data: { descriptionBn: null } });
    const a = (await send('GET')).a.coverage;
    expect(a.rows.find((r) => r.key === 'p/bn-done')).toMatchObject({ ready: true, hasBengali: false });
    expect(a.counts.readyMissing).toBe(1);
    await t.prisma.product.update({ where: { storeId_slug: { storeId: S, slug: 'bn-done' } }, data: { archivedAt: new Date() } });
    expect((await send('GET')).a.coverage.leftOver).toEqual(['p/bn-done']);
  });

  it('the gate choice: seo.manage, version-checked, audited, and what the proxy then does', async () => {
    const card = (await send('GET')).a.coverage.gate;
    expect(card.value).toEqual({ notReady: 'unlisted' });
    expect((await send('PUT', { key: 'gate', value: { notReady: 'english' }, version: card.version }, reader)).status).toBe(403);
    expect((await send('PUT', { key: 'gate', value: { notReady: 'elsewhere' }, version: card.version })).a.error).toBe('INVALID_INPUT');
    const saved = await send('PUT', { key: 'gate', value: { notReady: 'english' }, version: card.version });
    expect(saved.a.coverage.gate.value).toEqual({ notReady: 'english' });
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.bengali.gate' } })).toBe(1);
    const ready = await deps.resolver.value('language.bengali.readyPages', { storeId: S });
    const gate = await deps.resolver.value('language.bengali.gate', { storeId: S });
    expect(sendToEnglish({ lang: 'bn', bengaliOn: true, gate, ready, key: 'collections/bn-polos' })).toBe(false);
    expect(sendToEnglish({ lang: 'bn', bengaliOn: true, gate, ready, key: 'home' })).toBe(true);
  });
});
