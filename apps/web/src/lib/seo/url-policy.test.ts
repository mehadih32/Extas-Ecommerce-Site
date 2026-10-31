// S11 · PR 527 — the permanent URL policy. Pure: which product pages stay listed, how a retired product is named to
// search engines. On PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): an archived category with a past on the shop
// has a resting page; one that never had a product on the shop, a hidden one and a live one do not.
// Guard: no shop code deletes a product, a category or a redirect row (removed means switched off, App. answers #8).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { SEO_URL_POLICY_DEFAULT } from '@extas/settings';
import { productLd } from '../shop/structured-data';
import { ghostListed, pickAlternatives, restingCategoryIn, retiredForGood, type RestingDb } from './url-policy';

describe('PR 527 · which pages stay listed', () => {
  it('as shipped every page that was on the shop stays listed; each kind has its own switch', () => {
    for (const r of [null, 'soldOut', 'unpublished', 'archived'] as const) expect(ghostListed(r, SEO_URL_POLICY_DEFAULT), String(r)).toBe(true);
    const noSoldOut = { ...SEO_URL_POLICY_DEFAULT, soldOutIndexed: false };
    expect(ghostListed('soldOut', noSoldOut)).toBe(false);
    expect(ghostListed('archived', noSoldOut)).toBe(true);
    const noRetired = { ...SEO_URL_POLICY_DEFAULT, retiredIndexed: false };
    expect(ghostListed('soldOut', noRetired)).toBe(true);
    expect(ghostListed('unpublished', noRetired)).toBe(false);
    expect(ghostListed('archived', noRetired)).toBe(false);
    expect(ghostListed(null, { soldOutIndexed: false, retiredIndexed: false })).toBe(true);
  });

  it('"Available now": the category first, then the shop, only what can be bought, never the product itself, at most max', () => {
    const card = (id: string, inStock = true) => ({ id, inStock });
    const own = [card('this'), card('a'), card('b', false), card('c')];
    const shop = [card('c'), card('d'), card('e', false), card('f'), card('g')];
    expect(pickAlternatives(own, shop, 'this', 4).map((x) => x.id)).toEqual(['a', 'c', 'd', 'f']);
    expect(pickAlternatives([], shop, '', 2).map((x) => x.id)).toEqual(['c', 'd']);
    expect(pickAlternatives([card('b', false)], [card('e', false)], 'this', 4)).toEqual([]);
  });

  it('an archived product is "discontinued" to search engines, a sold-out one only "out of stock"', () => {
    expect(retiredForGood('archived')).toBe(true);
    expect(retiredForGood('soldOut')).toBe(false);
    expect(retiredForGood('unpublished')).toBe(false);
    const base = { name: 'Sample Polo', href: '/p/sample-polo', description: null, images: [], brand: null, category: null, currency: 'BDT', onSale: false, variants: [{ priceMinor: 150000, stock: 0 }] };
    const offer = (ld: ReturnType<typeof productLd>) => (ld as { offers: { availability: string } }).offers.availability;
    expect(offer(productLd('https://shop.example.test', base))).toBe('https://schema.org/OutOfStock');
    expect(offer(productLd('https://shop.example.test', { ...base, retired: true }))).toBe('https://schema.org/Discontinued');
    // retired never wins over a product that can be bought
    expect(offer(productLd('https://shop.example.test', { ...base, onSale: true, variants: [{ priceMinor: 150000, stock: 2 }], retired: true }))).toBe('https://schema.org/InStock');
  });
});

describe('PR 527 · guard: nothing on the shop is deleted', () => {
  const root = join(__dirname, '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p);
      return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
  it('no product, category or redirect is ever deleted by the web app (they are archived or switched off)', () => {
    const hits = files(root).filter((f) => /\b(product|category|redirect|categoryProduct)\.(delete|deleteMany)\(/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 527 · resting categories on PostgreSQL', () => {
  let t: TestDatabase;
  const S = MOTHER_STORE_ID;
  const db = () => t.prisma as unknown as RestingDb;

  beforeAll(async () => {
    t = await createTestDatabase('web');
    await seedSampleStores(t.prisma);
    const p = t.prisma;
    const g = await p.garmentType.create({ data: { storeId: S, key: 'up-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const parent = await p.category.create({ data: { storeId: S, slug: 'tops', nameEn: 'Tops', nameBn: 'টপস', isVisible: true, garmentTypeId: g.id } });
    const summer = await p.category.create({ data: { storeId: S, slug: 'summer-polos', nameEn: 'Summer Polos', parentId: parent.id, isVisible: false, archivedAt: new Date(Date.UTC(2026, 0, 2)), garmentTypeId: g.id } });
    const archived = await p.category.create({ data: { storeId: S, slug: 'eid-2025', nameEn: 'Eid 2025', isVisible: true, archivedAt: new Date(Date.UTC(2026, 0, 5)), garmentTypeId: g.id } });
    await p.category.create({ data: { storeId: S, slug: 'secret-draft', nameEn: 'Secret Draft', isVisible: false, garmentTypeId: g.id } });
    await p.category.create({ data: { storeId: S, slug: 'live-polos', nameEn: 'Live Polos', isVisible: true, garmentTypeId: g.id } });
    const was = new Date(Date.UTC(2025, 5, 1));
    await p.product.create({ data: { storeId: S, slug: 'summer-polo', nameEn: 'Summer Polo', status: 'ARCHIVED', categoryId: summer.id, publishedAt: was, archivedAt: new Date(Date.UTC(2026, 0, 1)) } });
    // a category whose product only reached it through a listing
    const lone = await p.product.create({ data: { storeId: S, slug: 'eid-panjabi', nameEn: 'Eid Panjabi', status: 'PUBLISHED', publishedAt: was } });
    await p.categoryProduct.create({ data: { storeId: S, categoryId: archived.id, productId: lone.id } });
    // hidden by choice: an add-ons group with published products of its own, a collection being prepared
    const addOns = await p.category.create({ data: { storeId: S, slug: 'add-ons', nameEn: 'Add-ons', isVisible: false, garmentTypeId: g.id } });
    await p.product.create({ data: { storeId: S, slug: 'sample-belt', nameEn: 'Sample Belt', status: 'PUBLISHED', categoryId: addOns.id, publishedAt: was } });
    const prep = await p.category.create({ data: { storeId: S, slug: 'winter-2026', nameEn: 'Winter 2026', isVisible: false, garmentTypeId: g.id } });
    await p.categoryProduct.create({ data: { storeId: S, categoryId: prep.id, productId: lone.id } });
  });
  afterAll(async () => t?.drop());

  it('an archived category with a past on the shop rests, linking its live parent', async () => {
    expect(await restingCategoryIn(db(), S, 'summer-polos')).toEqual({ slug: 'summer-polos', nameEn: 'Summer Polos', nameBn: null, parent: { slug: 'tops', nameEn: 'Tops', nameBn: 'টপস' } });
  });
  it('an archived category whose product was listed in it rests too', async () => {
    expect((await restingCategoryIn(db(), S, 'eid-2025'))?.parent).toBeNull();
  });
  it('a category that never had a product on the shop has no public past (still "page not found")', async () => {
    expect(await restingCategoryIn(db(), S, 'secret-draft')).toBeNull();
    // hidden is the owner's choice, not retiring: its name is not shown
    expect(await restingCategoryIn(db(), S, 'add-ons')).toBeNull();
    expect(await restingCategoryIn(db(), S, 'winter-2026')).toBeNull();
    expect(await restingCategoryIn(db(), S, 'no-such-category')).toBeNull();
  });
  it('a live category is never "resting"', async () => {
    expect(await restingCategoryIn(db(), S, 'live-polos')).toBeNull();
  });
});
