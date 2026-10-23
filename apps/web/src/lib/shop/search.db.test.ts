// PR 72 / 73 — the search on a real PostgreSQL (a throwaway database; skipped without TEST_DATABASE_ADMIN_URL): the
// adapter answers from the shop's own catalogue when there is no Meilisearch; the results page lists only what a
// customer can buy now, whatever the engine found; the panel counts the same products; and — SIM-F-035, a required
// acceptance test of PR 72 (CN-017) — a size sold out in every colour stays in the search's size filter, crossed out
// (count 0), never hidden, and the product stays listed.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma } from '@extas/db/client';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { forgetSearchCache, searchCatalogue, type SettingsReader } from '@extas/search';
import { categorySettings, registry, type Key, type Value } from '@extas/settings';
import { searchListing, sellableIds } from './catalogue';
import { chipTests, cutsFor, facets } from './category-filter';
import { parseState } from './category-model';

const defaults: SettingsReader = { value: async <K extends Key>(k: K) => registry[k].default as Value<K> };

describe.skipIf(!HAS_TEST_DB)('search on PostgreSQL (PR 72 / 73)', () => {
  let t: TestDatabase;
  let store = 0;
  const saved = process.env.DATABASE_URL;
  const ids: Record<string, string> = {};
  const deps = () => ({ db: t.prisma, settings: defaults, meili: null });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('shop_search');
    [store] = await seedSampleStores(t.prisma);
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    const db = t.prisma;
    const garment = await db.garmentType.create({ data: { storeId: store, key: 'srch-polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const polos = await db.category.create({ data: { storeId: store, slug: 'srch-polos', nameEn: 'Polos', nameBn: 'পোলো', isVisible: true, garmentTypeId: garment.id } });
    const hidden = await db.category.create({ data: { storeId: store, slug: 'srch-hidden', nameEn: 'Hidden polos', isVisible: false, garmentTypeId: garment.id } });
    const navy = await db.colour.create({ data: { storeId: store, key: 'srch-navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#1F2A44' } });
    const white = await db.colour.create({ data: { storeId: store, key: 'srch-white', nameEn: 'White', hex: '#F4F2EC' } });
    const M = await db.size.create({ data: { storeId: store, key: 'srch-m', label: 'M', sortOrder: 20 } });
    const L = await db.size.create({ data: { storeId: store, key: 'srch-l', label: 'L', sortOrder: 30 } });
    const product = async (slug: string, nameEn: string, o: { cat?: string; status?: 'PUBLISHED' | 'DRAFT'; priced?: boolean; lInStock?: boolean; inStock?: boolean }) => {
      const p = await db.product.create({
        data: { storeId: store, slug, nameEn, status: o.status ?? 'PUBLISHED', publishedAt: new Date(), categoryId: o.cat ?? polos.id, inStock: o.inStock ?? true },
      });
      for (const [i, k] of [navy, white].entries()) await db.productColour.create({ data: { storeId: store, productId: p.id, colourId: k.id, sortOrder: i } });
      const price = o.priced === false ? null : 120000;
      // M in navy is in stock; L is sold out in every colour unless asked (SIM-F-035)
      await db.productVariant.create({ data: { storeId: store, productId: p.id, sku: `${slug}-nm`, colourId: navy.id, sizeId: M.id, priceMinor: price, active: true, inStock: o.inStock ?? true } });
      await db.productVariant.create({ data: { storeId: store, productId: p.id, sku: `${slug}-nl`, colourId: navy.id, sizeId: L.id, priceMinor: price, active: true, inStock: o.lInStock ?? false } });
      await db.productVariant.create({ data: { storeId: store, productId: p.id, sku: `${slug}-wl`, colourId: white.id, sizeId: L.id, priceMinor: price, active: true, inStock: false } });
      ids[slug] = p.id;
    };
    await product('srch-classic', 'Classic Pique Polo', {});
    await product('srch-knit', 'Knit Polo', { lInStock: true });
    await product('srch-sold', 'Weekend Polo', { inStock: false });
    await product('srch-draft', 'Draft Polo', { status: 'DRAFT' });
    await product('srch-hidden', 'Hidden Polo', { cat: hidden.id });
    await product('srch-unpriced', 'Unpriced Polo', { priced: false });
    forgetSearchCache();
  }, 120_000);

  afterAll(async () => {
    await disconnectPrisma();
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('without Meilisearch the shop`s own catalogue answers: live products of shown categories, slips forgiven, Bengali too', async () => {
    const a = await searchCatalogue(deps(), store, 'polo');
    expect(a.engine).toBe('postgres');
    expect(a.products.sort()).toEqual([ids['srch-classic'], ids['srch-knit'], ids['srch-sold'], ids['srch-unpriced']].sort());
    expect((await searchCatalogue(deps(), store, 'pique pollo')).products).toEqual([ids['srch-classic']]);
    expect((await searchCatalogue(deps(), store, 'নেভি পোলো')).products.length).toBeGreaterThan(0);
    expect((await searchCatalogue(deps(), store, 'polos')).categories.length).toBe(1);
  });

  it('the results page lists only what can be bought now, in the engine`s order; the panel counts the same', async () => {
    const found = [ids['srch-unpriced']!, ids['srch-knit']!, ids['srch-classic']!, ids['srch-draft']!, ids['srch-sold']!];
    const l = await searchListing(store, found, false);
    expect(l.cards.map((c) => c.slug)).toEqual(['srch-knit', 'srch-classic', 'srch-sold']);
    expect(await sellableIds(store, found, false)).toEqual([ids['srch-knit'], ids['srch-classic'], ids['srch-sold']]);
    // the owner hides sold-out styles: the panel's count follows
    expect(await sellableIds(store, found, true)).toEqual([ids['srch-knit'], ids['srch-classic']]);
  });

  it('SIM-F-035: a size sold out in every colour is crossed out in the search`s size filter, never hidden, and the style stays listed', async () => {
    const l = await searchListing(store, [ids['srch-classic']!], false);
    expect(l.cards.map((c) => c.slug)).toEqual(['srch-classic']);
    const fs = categorySettings['category.filters'].default;
    const tb = categorySettings['category.toolbar'].default;
    const ctx = { cuts: cutsFor('search', l.items, fs), chipTests: chipTests(tb) };
    const f = facets(l.items, parseState({}, ['rec']), ctx, fs, l.sizes);
    const sizes = f.sizes.letters;
    expect(sizes.map((o) => o.value)).toEqual(['srch-m', 'srch-l']);
    expect(sizes.find((o) => o.value === 'srch-l')).toMatchObject({ count: 0, off: true });
    expect(sizes.find((o) => o.value === 'srch-m')).toMatchObject({ count: 1 });
  });
});
