// S13 · PR 589 — the Merchant Center feed on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): only published
// products of a shown category; the cheapest live variant's price; the brand, else the shop's name; absolute links; a
// product without a photo counted as left out; sold-out kept while `outOfStock`, left out otherwise; the card needs
// `marketing.campaigns.write`, is audited and refuses a bad country; signed out 401. Every value is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirstOwner, createRole, defaultSecurityPolicy, hashPassword, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { messages, prismaBackend, registry, SettingsResolver, syncSettings, storeTarget } from '@extas/settings';
import { createVault } from '@extas/vault';
import type { AdminDeps } from '../admin-auth';
import { loginHandler } from '../admin-api';
import { feedHandler, feedProducts } from './merchant-feed';

const HOST = 'admin.example.test';
const PW = 'a long sentence for the tests';
const ORIGIN = new URL('https://shop.example.test');

function call(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = { host: HOST, 'user-agent': 'SampleBrowser/1.0', 'x-forwarded-for': '192.0.2.70' };
  if (method !== 'GET') headers.origin = `https://${HOST}`;
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://${HOST}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c && !c.endsWith('='))
    .join('; ');

describe.skipIf(!HAS_TEST_DB)('Marketing › Merchant feed on PostgreSQL (PR 589)', () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = '';
  let reader = '';
  const S = MOTHER_STORE_ID;
  const api = async (method: string, body?: unknown, cookie = owner) => {
    const r = await feedHandler(call(method, '/api/admin/marketing/merchant-feed', cookie, body), deps, ORIGIN);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('merchant-feed');
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), { email: 'owner@example.com', displayName: 'Sample owner', password: PW, passwordChosenByOwner: true });
    deps = { db: t.prisma, resolver: new SettingsResolver(prismaBackend(t.prisma), registry), vault: createVault(t.prisma, 'test-master-key-'.padEnd(64, 'k')), now: () => new Date('2026-11-06T06:00:00Z') };
    await deps.resolver.set('store.name', 'Sample shop', storeTarget(S), { actorId: null, reason: 'test' });
    owner = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'owner@example.com', password: PW }), deps));
    const role = await createRole(t.prisma, SYSTEM, { key: 'feed-reader', nameEn: 'feed-reader', nameBn: 'feed-reader', permissions: ['marketing.campaigns.read'] });
    const u = await t.prisma.staffUser.create({ data: { email: 'reader@example.com', displayName: 'Sample reader', passwordHash: await hashPassword(PW), passwordSetAt: new Date() } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    reader = cookiesOf(await loginHandler(call('POST', '/api/admin/auth/login', undefined, { email: 'reader@example.com', password: PW }), deps));

    const shown = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-polos-589', nameEn: 'Sample polos', isVisible: true } });
    const hidden = await t.prisma.category.create({ data: { storeId: S, slug: 'sample-hidden-589', nameEn: 'Hidden', isVisible: false } });
    const brand = await t.prisma.brand.create({ data: { storeId: S, name: 'Sample brand', slug: 'sample-brand-589' } });
    const product = async (slug: string, extra: Record<string, unknown>, prices: (number | null)[]) => {
      const p = await t.prisma.product.create({ data: { storeId: S, slug, nameEn: `Sample ${slug}`, descriptionEn: 'Soft cotton.', status: 'PUBLISHED', inStock: true, categoryId: shown.id, ...extra } });
      for (const [i, price] of prices.entries()) await t.prisma.productVariant.create({ data: { storeId: S, productId: p.id, sku: `${slug}-${i}`, priceMinor: price, active: true, inStock: true } });
      return p.id;
    };
    await product('polo-589', { brandId: brand.id, feedTitle: 'Sample polo for the feed' }, [180_000, 150_000, null]);
    await product('tee-589', { inStock: false }, [90_000]);
    await product('draft-589', { status: 'DRAFT' }, [90_000]);
    await product('hidden-589', { categoryId: hidden.id }, [90_000]);
  });
  afterAll(async () => t?.drop());

  it('reads only published products of a shown category, at the cheapest live price, brand else the shop name', async () => {
    const { products, currency } = await feedProducts(t.prisma, deps.resolver, ORIGIN);
    expect(currency).toBe('BDT');
    const byTitle = Object.fromEntries(products.map((p) => [p.title, p]));
    expect(Object.keys(byTitle).sort()).toEqual(['Sample polo for the feed', 'Sample tee-589']);
    expect(byTitle['Sample polo for the feed']).toMatchObject({ priceMinor: 150_000, brand: 'Sample brand', category: 'Sample polos', image: null, inStock: true });
    expect(byTitle['Sample polo for the feed']!.link).toMatch(/^https:\/\/shop\.example\.test\/.+polo-589$/);
    expect(byTitle['Sample tee-589']).toMatchObject({ brand: 'Sample shop', inStock: false });
  });

  it('shows the address, the counts and why products are left out; signed out 401', async () => {
    expect((await api('GET', undefined, '')).status).toBe(401);
    const s = (await api('GET', undefined, reader)).j.screen;
    expect(s.url).toBe('https://shop.example.test/feeds/merchant.xml');
    expect(s).toMatchObject({ total: 2, inFeed: 0, left: { noImage: 2, noPrice: 0, noDescription: 0, soldOut: 0 } });
    expect(s.sample.map((x: any) => x.reasons)).toEqual([['noImage'], ['noImage']]);
  });

  it('only marketing.campaigns.write saves the card; audited; a bad country refused; sold-out left out when asked', async () => {
    expect((await api('PUT', { key: 'ads.merchantFeed', on: true, values: {} }, reader)).status).toBe(403);
    const bad = await api('PUT', { key: 'ads.merchantFeed', on: true, values: { country: 'Bangladesh' } });
    expect(bad.status).toBe(400);
    expect(bad.j.details).toContain('country');
    const ok = await api('PUT', { key: 'ads.merchantFeed', on: true, values: { outOfStock: 'off' } });
    expect(ok.status).toBe(200);
    expect(ok.j.screen.card.value).toMatchObject({ on: true, outOfStock: false, country: 'BD' });
    expect(ok.j.screen.total).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'ads.merchantFeed.settings' } })).toBe(1);
  });
});
