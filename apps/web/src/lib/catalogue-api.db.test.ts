// S01 · PR 19, 20, 30, 31, 590 — the catalogue admin API end to end on a real PostgreSQL (a throwaway database; skipped
// without TEST_DATABASE_ADMIN_URL): login and permission per store, the same-site check, error codes, and a product
// from colour to variant to a renamed link that forwards.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver } from '@extas/settings';
import type { AdminDeps } from './admin-auth';
import { loginHandler } from './admin-api';
import {
  bulkRenameHandler,
  categoriesHandler,
  colourHandler,
  coloursHandler,
  productHandler,
  productNamingHandler,
  productsHandler,
  redirectsHandler,
  sizesHandler,
  storeIdOf,
  variantsHandler,
} from './catalogue-api';

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';

function call(method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.40' };
  if (opts.origin !== null && method !== 'GET') headers.origin = opts.origin ?? `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const cookiesOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').filter((c) => c && !c.endsWith('=')).join('; ');
async function read(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe('store id from the query', () => {
  it('defaults to the mother store and refuses nonsense', () => {
    expect(storeIdOf(new URL('https://x.test/a'))).toBe(1);
    expect(storeIdOf(new URL('https://x.test/a?storeId=2'))).toBe(2);
    expect(storeIdOf(new URL('https://x.test/a?storeId=0'))).toBeNull();
    expect(storeIdOf(new URL('https://x.test/a?storeId=x'))).toBeNull();
  });
});

describe.skipIf(!HAS_TEST_DB)('catalogue admin API on PostgreSQL', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('catalogue_api');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: null };
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', { body: { email: 'owner@example.com', password: OWNER_PW } }), deps));
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.drop();
  });

  it('needs a login, a database and a same-site request', async () => {
    expect((await coloursHandler(call('GET', '/api/admin/catalogue/colours'), deps)).status).toBe(401);
    expect((await coloursHandler(call('GET', '/api/admin/catalogue/colours', { cookie: owner }), null)).status).toBe(503);
    expect((await coloursHandler(call('POST', '/api/admin/catalogue/colours', { cookie: owner, origin: 'https://evil.example.test', body: { nameEn: 'Navy', hex: '#000080' } }), deps)).status).toBe(403);
    expect((await coloursHandler(call('GET', '/api/admin/catalogue/colours?storeId=0', { cookie: owner }), deps)).status).toBe(400);
  });

  it('builds a product from colour to variant, and a renamed link forwards', async () => {
    const navy = await read(await coloursHandler(call('POST', '/api/admin/catalogue/colours', { cookie: owner, body: { nameEn: 'Navy', hex: '#1b2a4a' } }), deps));
    expect(navy.status).toBe(201);
    expect(navy.body.created.colour.hex).toBe('#1B2A4A');
    const bad = await read(await coloursHandler(call('POST', '/api/admin/catalogue/colours', { cookie: owner, body: { nameEn: 'Teal', hex: 'teal' } }), deps));
    expect([bad.status, bad.body.error]).toEqual([400, 'INVALID_INPUT']);
    const missing = await read(await colourHandler(call('PATCH', '/api/admin/catalogue/colours/x', { cookie: owner, body: {} }), deps, 'not-a-uuid'));
    expect(missing.status).toBe(400);

    const size = await read(await sizesHandler(call('POST', '/api/admin/catalogue/sizes', { cookie: owner, body: { label: 'M' } }), deps));
    const cat = await read(await categoriesHandler(call('POST', '/api/admin/catalogue/categories', { cookie: owner, body: { nameEn: 'Polos' } }), deps));
    expect(cat.body.created.url).toBe('/polos');
    const reserved = await read(await categoriesHandler(call('POST', '/api/admin/catalogue/categories', { cookie: owner, body: { nameEn: 'Search', slug: 'search' } }), deps));
    expect([reserved.status, reserved.body.error]).toEqual([400, 'SLUG_RESERVED']);

    const p = await read(await productsHandler(call('POST', '/api/admin/catalogue/products', { cookie: owner, body: { nameEn: 'Classic Polo', categoryId: cat.body.created.id } }), deps));
    expect(p.status).toBe(201);
    const id = p.body.created.id as string;
    const v = await read(await variantsHandler(call('POST', '/api/admin/catalogue/variants', { cookie: owner, body: { sku: 'SMP-1-NV-M', productId: id, colourId: navy.body.created.colour.id, sizeId: size.body.created.id, priceMinor: 120000 } }), deps));
    expect(v.status).toBe(201);
    const dup = await read(await variantsHandler(call('POST', '/api/admin/catalogue/variants', { cookie: owner, body: { sku: 'SMP-1-NV-M', productId: id } }), deps));
    expect([dup.status, dup.body.error]).toEqual([409, 'SKU_TAKEN']);
    const bySku = await read(await variantsHandler(call('GET', '/api/admin/catalogue/variants?sku=SMP-1-NV-M', { cookie: owner }), deps));
    expect(bySku.body.variant.id).toBe(v.body.created.id);

    const one = await read(await productHandler(call('GET', `/api/admin/catalogue/products/${id}`, { cookie: owner }), deps, id));
    expect([one.body.item.minPriceMinor, one.body.item.colours.length]).toEqual([120000, 1]);
    const list = await read(await productsHandler(call('GET', '/api/admin/catalogue/products?q=smp-1', { cookie: owner }), deps));
    expect(list.body.total).toBe(1);

    const old = one.body.item.slug as string;
    const renamed = await read(await productNamingHandler(call('PATCH', `/api/admin/catalogue/products/${id}/naming`, { cookie: owner, body: { slug: 'navy-classic-polo' } }), deps, id));
    expect(renamed.body.moved).toMatchObject({ from: `/p/${old}`, to: '/p/navy-classic-polo' });
    const redirects = await read(await redirectsHandler(call('GET', '/api/admin/catalogue/naming/redirects', { cookie: owner }), deps));
    expect(redirects.body.redirects.map((r: { fromPath: string; toPath: string; statusCode: number }) => [r.fromPath, r.toPath, r.statusCode])).toEqual([[`/p/${old}`, '/p/navy-classic-polo', 301]]);

    const preview = await read(await bulkRenameHandler(call('POST', '/api/admin/catalogue/naming/bulk-rename', { cookie: owner, body: { action: 'preview', input: { find: 'Classic', replace: 'Everyday' } } }), deps));
    expect(preview.body.preview.changes).toHaveLength(1);
    const noHash = await read(await bulkRenameHandler(call('POST', '/api/admin/catalogue/naming/bulk-rename', { cookie: owner, body: { action: 'apply', input: { find: 'Classic', replace: 'Everyday' } } }), deps));
    expect(noHash.status).toBe(400);
    const applied = await read(await bulkRenameHandler(call('POST', '/api/admin/catalogue/naming/bulk-rename', { cookie: owner, body: { action: 'apply', input: { find: 'Classic', replace: 'Everyday' }, hash: preview.body.preview.hash } }), deps));
    expect(applied.body.result).toMatchObject({ applied: 1, renames: 1 });

    // nothing of store 1 is seen from store 2
    const other = await read(await productHandler(call('GET', `/api/admin/catalogue/products/${id}?storeId=2`, { cookie: owner }), deps, id));
    expect([other.status, other.body.error]).toEqual([404, 'NOT_FOUND']);
  });
});
