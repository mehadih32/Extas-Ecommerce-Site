// S11 · PR 228 — what the sitemaps list, on a real PostgreSQL: shown collections and sub-collections (never a hidden
// one), "New in", published products (a sold-out one only while sold-out pages stay listed), the owner's featured sets,
// a named filter page only with enough styles, a Bengali twin only once it is marked ready, only the kinds ticked in
// Website › SEO; the answers of /sitemap.xml and its files; "Make the sitemaps now" needs seo.manage.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { disconnectPrisma, MOTHER_STORE_ID } from '@extas/db/client';
import { messages, registry, SEO_FILTER_PAGES_DEFAULT, SEO_INDEXING_DEFAULT, SEO_SITEMAPS_DEFAULT, SEO_URL_POLICY_DEFAULT, storeTarget, syncSettings } from '@extas/settings';
import { createVault } from '@extas/vault';
import { loginHandler } from '../admin-api';
import type { AdminDeps } from '../admin-auth';
import { settingsResolver } from '../settings';
import type { CatItem } from '../shop/category-model';
import type { SitemapKind } from './sitemap';

vi.mock('./site', () => ({ siteAddress: async () => ({ origin: new URL('https://shop.example.test'), onPrimary: false }), primaryDomain: async () => null }));
const item = (id: string, colours: string[]): CatItem => ({ id, price: 100, was: null, colours, stock: [], fit: null, inStock: true, published: 0, rating: 0, reviews: 0, tags: [] });
vi.mock('../shop/catalogue', async (orig) => ({
  ...(await orig<typeof import('../shop/catalogue')>()),
  // the named filter page's collection, as the page counts it: two navy styles, one black
  categoryData: async () => ({ head: null, cards: [], items: [item('a', ['navy']), item('b', ['navy']), item('c', ['black'])], sizes: new Map(), withPhotos: async (c: unknown[]) => c }),
}));

const { collectSitemap, forgetSitemaps, sitemapSettings } = await import('./sitemap-data');
const { sitemapResponse } = await import('./sitemap-route');
const { seoSitemapsRoute } = await import('./sitemap-admin');

const HOST = 'admin.example.test';
const OWNER_PW = 'a long sentence for the tests';
const BASE = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.41', origin: `https://${HOST}`, 'content-type': 'application/json' };
const call = (cookie?: string) => new Request(`https://${HOST}/api/admin/seo/sitemaps`, { method: 'POST', headers: { ...BASE, ...(cookie ? { cookie } : {}) }, body: '{}' });
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('sitemaps on PostgreSQL (PR 228)', () => {
  let t: TestDatabase;
  const savedUrl = process.env.DATABASE_URL;
  const S = MOTHER_STORE_ID;
  const set = async <K extends Parameters<NonNullable<ReturnType<typeof settingsResolver>>['set']>[0]>(key: K, value: unknown) => {
    await settingsResolver()!.set(key, value as never, storeTarget(S), { actorId: null, reason: 'test' });
    forgetSitemaps(S);
  };
  const paths = async () => {
    const s = await collectSitemap(S, await sitemapSettings(S));
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.map((e) => `${e.path}${e.bn ? ' +bn' : ''}`)])) as Record<SitemapKind, string[]>;
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    const db = t.prisma;
    const g = await db.garmentType.create({ data: { storeId: S, key: 'sm-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const polos = await db.category.create({ data: { storeId: S, slug: 'sm-polos', nameEn: 'Polos', isVisible: true, garmentTypeId: g.id } });
    await db.category.create({ data: { storeId: S, slug: 'sm-half', nameEn: 'Half sleeve', isVisible: true, parentId: polos.id, garmentTypeId: g.id } });
    await db.category.create({ data: { storeId: S, slug: 'sm-hidden', nameEn: 'Hidden', isVisible: false, garmentTypeId: g.id } });
    const product = (slug: string, status: 'PUBLISHED' | 'DRAFT', more: Record<string, unknown> = {}) =>
      db.product.create({ data: { storeId: S, slug, nameEn: `Sample ${slug}`, status, categoryId: polos.id, ...(status === 'PUBLISHED' ? { publishedAt: new Date(Date.UTC(2026, 9, 20)) } : {}), ...more } });
    await product('sm-live', 'PUBLISHED', { inStock: true });
    await product('sm-sold', 'PUBLISHED', { inStock: false });
    await product('sm-draft', 'DRAFT', { inStock: true });
    await product('sm-gone', 'PUBLISHED', { inStock: true, archivedAt: new Date() });
    const combo = (slug: string, isFeatured: boolean, status: 'RUNNING' | 'DRAFT') => db.combo.create({ data: { storeId: S, slug, nameEn: `Set ${slug}`, type: 'FIXED_SET', pieceCount: 2, isFeatured, status } });
    await combo('sm-set', true, 'RUNNING');
    await combo('sm-pair', false, 'RUNNING');
    await combo('sm-draftset', true, 'DRAFT');
    await createFirstOwner(db, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: OWNER_PW, passwordChosenByOwner: true });
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
  }, 300_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await disconnectPrisma();
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    await t?.drop();
  });

  it('lists shown collections, published products and featured sets; never a hidden, draft or archived one', async () => {
    const p = await paths();
    expect(p.pages).toContain('/');
    for (const x of p.pages) expect(x === '/' || x.startsWith('/help/') || x.startsWith('/combos')).toBe(true);
    expect(p.collections).toEqual(expect.arrayContaining(['/collections/sm-polos', '/collections/sm-half', '/collections/new-in']));
    expect(p.collections).not.toContain('/collections/sm-hidden');
    const prefix = (await sitemapSettings(S))['naming.productPathPrefix'].replace(/\/+$/, '');
    expect(p.products).toEqual(expect.arrayContaining([`${prefix}/sm-live`, `${prefix}/sm-sold`]));
    expect(p.products.some((x) => /sm-(draft|gone)$/.test(x))).toBe(false);
    expect(p.combos).toContain('/combo/sm-set');
    expect(p.combos.some((x) => /sm-(pair|draftset)$/.test(x))).toBe(false);
  });

  it('follows the owner\'s switches: sold-out pages, the kinds ticked, the named filter pages, the Bengali gate', async () => {
    await set('seo.urlPolicy', { ...SEO_URL_POLICY_DEFAULT, soldOutIndexed: false });
    expect((await paths()).products.some((x) => x.endsWith('/sm-sold'))).toBe(false);
    await set('seo.indexing', { ...SEO_INDEXING_DEFAULT, pages: { ...SEO_INDEXING_DEFAULT.pages, product: false, combo: false } });
    let p = await paths();
    expect(p.products).toEqual([]);
    expect(p.combos).toEqual([]);
    const row = { category: 'sm-polos', filter: 'colour', value: 'navy', label: { en: 'Navy polos', bn: 'নেভি পোলো' } };
    await set('seo.filterPages', { ...SEO_FILTER_PAGES_DEFAULT, enabled: true, minProducts: 2, pages: [row, { ...row, value: 'black', label: { en: 'Black polos', bn: 'কালো পোলো' } }, { ...row, category: 'sm-hidden' }] });
    p = await paths();
    expect(p.collections).toContain('/collections/sm-polos?colour=navy');
    expect(p.collections.some((x) => x.includes('colour=black') || x.startsWith('/collections/sm-hidden'))).toBe(false);
    await set('language.bengali.enabled', true);
    await set('language.bengali.readyPages', ['home', 'collections/sm-polos']);
    p = await paths();
    expect(p.pages).toContain('/ +bn');
    expect(p.collections).toEqual(expect.arrayContaining(['/collections/sm-polos +bn', '/collections/sm-polos?colour=navy +bn', '/collections/sm-half']));
  });

  it('answers the index and each file as XML on the shop\'s address; a wrong file or the switch off is 404', async () => {
    const index = await sitemapResponse(null);
    expect(index.status).toBe(200);
    expect(index.headers.get('content-type')).toContain('application/xml');
    expect(index.headers.get('x-robots-tag')).toBe('noindex');
    const body = await index.text();
    for (const f of ['pages-1.xml', 'collections-1.xml', 'products-1.xml', 'combos-1.xml']) expect(body).toContain(`https://shop.example.test/sitemaps/${f}`);
    const cols = await (await sitemapResponse('collections-1.xml')).text();
    expect(cols).toContain('<loc>https://shop.example.test/collections/sm-polos?colour=navy</loc>');
    expect(cols).toContain('<loc>https://shop.example.test/bn/collections/sm-polos</loc>');
    // PR 236: the pairs are in the pages' heads only, unless the owner switches them on for the sitemaps too
    expect(cols).not.toContain('hreflang=');
    await set('seo.hreflang', { inSitemaps: true });
    expect(await (await sitemapResponse('collections-1.xml')).text()).toContain('hreflang="x-default" href="https://shop.example.test/collections/sm-polos"');
    await set('seo.hreflang', { inSitemaps: false });
    expect((await sitemapResponse('collections-2.xml')).status).toBe(404);
    expect((await sitemapResponse('orders-1.xml')).status).toBe(404);
    await set('seo.sitemaps', { ...SEO_SITEMAPS_DEFAULT, enabled: false });
    expect((await sitemapResponse(null)).status).toBe(404);
    await set('seo.sitemaps', SEO_SITEMAPS_DEFAULT);
  });

  it('"Make the sitemaps now" needs a session with seo.manage, makes them again and leaves an audit row', async () => {
    const deps: AdminDeps = { db: t.prisma, resolver: settingsResolver()!, vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')) };
    expect((await seoSitemapsRoute(call(), deps, [])).status).toBe(401);
    const login = await loginHandler(new Request(`https://${HOST}/api/admin/auth/login`, { method: 'POST', headers: BASE, body: JSON.stringify({ email: 'owner@example.com', password: OWNER_PW }) }), deps);
    const owner = cookiesOf(login);
    expect((await seoSitemapsRoute(new Request(`https://${HOST}/api/admin/seo/sitemaps`, { method: 'GET', headers: { ...BASE, cookie: owner } }), deps, [])).status).toBe(405);
    const res = await seoSitemapsRoute(call(owner), deps, []);
    expect(res.status).toBe(200);
    const b = (await res.json()) as { sitemaps: { index: string; files: { name: string; urls: number }[] } };
    expect(b.sitemaps.index).toBe('https://shop.example.test/sitemap.xml');
    expect(b.sitemaps.files.find((f) => f.name === 'collections-1.xml')?.urls).toBeGreaterThanOrEqual(5);
    expect(await t.prisma.auditLog.count({ where: { action: 'seo.sitemaps.make' } })).toBe(1);
  });
});
