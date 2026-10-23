// PR 45 / 46 — what a category page reads from the catalogue, on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): a shown category with its sub-categories' listings, pinned first and then the owner's order,
// only live products; the sizes its variants carry (for the filters) with stock per size and colour; ratings only when
// asked; "New in" over every shown category, newest first, inside an optional days window; photos only for the cards
// drawn; and "not found" for a hidden or unknown category.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma } from '@extas/db/client';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { categoryData } from './catalogue';

describe.skipIf(!HAS_TEST_DB)('the category page catalogue read on PostgreSQL', () => {
  let t: TestDatabase;
  let store = 0;
  const saved = process.env.DATABASE_URL;
  const ids: Record<string, string> = {};
  const NOW = new Date(Date.UTC(2026, 9, 20));

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('shop_category');
    [store] = await seedSampleStores(t.prisma);
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    const db = t.prisma;
    const polo = await db.garmentType.create({ data: { storeId: store, key: 'polo-t', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = (slug: string, visible: boolean, parentId?: string) =>
      db.category.create({ data: { storeId: store, slug, nameEn: slug, nameBn: `${slug}-bn`, isVisible: visible, garmentTypeId: polo.id, ...(parentId ? { parentId } : {}) } });
    const polos = await cat('cat-polos', true);
    const knit = await cat('cat-knit', true, polos.id);
    const hidden = await cat('cat-hidden', false);
    const navy = await db.colour.create({ data: { storeId: store, key: 'cat-navy', nameEn: 'Navy', hex: '#1F2A44' } });
    const white = await db.colour.create({ data: { storeId: store, key: 'cat-white', nameEn: 'White', hex: '#F4F2EC' } });
    const L = await db.size.create({ data: { storeId: store, key: 'cat-l', label: 'L', sortOrder: 30 } });
    const M = await db.size.create({ data: { storeId: store, key: 'cat-m', label: 'M', sortOrder: 20 } });
    const product = async (slug: string, o: { cat: string; status?: 'PUBLISHED' | 'DRAFT'; day: number; price: number; inStock?: boolean }) => {
      const p = await db.product.create({
        data: { storeId: store, slug, nameEn: slug, status: o.status ?? 'PUBLISHED', publishedAt: new Date(Date.UTC(2026, 9, o.day)), categoryId: o.cat, inStock: o.inStock ?? true },
      });
      await db.productColour.create({ data: { storeId: store, productId: p.id, colourId: navy.id, sortOrder: 0 } });
      await db.productColour.create({ data: { storeId: store, productId: p.id, colourId: white.id, sortOrder: 1 } });
      await db.productVariant.create({ data: { storeId: store, productId: p.id, sku: `${slug}-nm`, colourId: navy.id, sizeId: M.id, priceMinor: o.price, active: true, inStock: true } });
      await db.productVariant.create({ data: { storeId: store, productId: p.id, sku: `${slug}-wl`, colourId: white.id, sizeId: L.id, priceMinor: o.price, active: true, inStock: false } });
      ids[slug] = p.id;
      return p;
    };
    await product('p-old', { cat: polos.id, day: 1, price: 85000 });
    await product('p-knit', { cat: knit.id, day: 15, price: 115000 });
    await product('p-pinned', { cat: polos.id, day: 5, price: 95000 });
    await product('p-draft', { cat: polos.id, status: 'DRAFT', day: 18, price: 99000 });
    await product('p-hidden', { cat: hidden.id, day: 19, price: 99000 });
    const list = (productId: string, categoryId: string, sortRank: number, pinned = false) =>
      db.categoryProduct.create({ data: { storeId: store, categoryId, productId, isVisible: true, sortRank, pinned } });
    await list(ids['p-old']!, polos.id, 9);
    await list(ids['p-knit']!, knit.id, 5);
    await list(ids['p-pinned']!, polos.id, 1, true);
    await list(ids['p-draft']!, polos.id, 20);
    await db.review.create({ data: { storeId: store, productId: ids['p-knit']!, rating: 4, status: 'APPROVED', body: 'Good.', displayName: 'Sample buyer', publishedAt: NOW } });
  }, 120_000);

  afterAll(async () => {
    await disconnectPrisma();
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  const NO_NEW_IN = { ratings: false } as const;

  it('a shown category: its own and its sub-categories\' live listings, pinned first, then the owner\'s order', async () => {
    const d = (await categoryData(store, 'cat-polos', NO_NEW_IN, NOW))!;
    expect(d.head).toMatchObject({ slug: 'cat-polos', nameEn: 'cat-polos', nameBn: 'cat-polos-bn', parent: null });
    expect(d.cards.map((c) => c.slug)).toEqual(['p-pinned', 'p-old', 'p-knit']);
    expect(d.items.map((i) => i.id)).toEqual(d.cards.map((c) => c.id));
  });

  it('the filters get what the products carry: sizes with their order, stock per size and colour, colours, prices', async () => {
    const d = (await categoryData(store, 'cat-polos', NO_NEW_IN, NOW))!;
    expect([...d.sizes.values()].sort((a, b) => a.order - b.order).map((s) => s.label)).toEqual(['M', 'L']);
    const item = d.items.find((i) => i.id === ids['p-old'])!;
    expect(item.colours).toEqual(['cat-navy', 'cat-white']);
    expect(item.stock).toEqual(expect.arrayContaining([{ size: 'cat-m', colour: 'cat-navy', inStock: true }, { size: 'cat-l', colour: 'cat-white', inStock: false }]));
    expect(item.price).toBe(85000);
    expect(item.rating).toBe(0);
  });

  it('ratings are read only when a sort needs them', async () => {
    const d = (await categoryData(store, 'cat-polos', { ratings: true }, NOW))!;
    expect(d.items.find((i) => i.id === ids['p-knit'])).toMatchObject({ rating: 4, reviews: 1 });
  });

  it('a sub-category has its parent for the breadcrumb', async () => {
    const d = (await categoryData(store, 'cat-knit', NO_NEW_IN, NOW))!;
    expect(d.head?.parent).toEqual({ slug: 'cat-polos', nameEn: 'cat-polos', nameBn: 'cat-polos-bn' });
    expect(d.cards.map((c) => c.slug)).toEqual(['p-knit']);
  });

  it('"New in": live products of shown categories, newest first; a days window leaves older ones out', async () => {
    const all = (await categoryData(store, 'cat-new', { slug: 'cat-new', order: 'newest', days: 0, ratings: false }, NOW))!;
    expect(all.head).toBeNull();
    const mine = all.cards.map((c) => c.slug).filter((s) => s.startsWith('p-'));
    expect(mine).toEqual(['p-knit', 'p-pinned', 'p-old']);
    const week = (await categoryData(store, 'cat-new', { slug: 'cat-new', order: 'newest', days: 7, ratings: false }, NOW))!;
    expect(week.cards.map((c) => c.slug).filter((s) => s.startsWith('p-'))).toEqual(['p-knit']);
  });

  it('a hidden or unknown category is not found; photos are read only for the cards drawn', async () => {
    expect(await categoryData(store, 'cat-hidden', NO_NEW_IN, NOW)).toBeUndefined();
    expect(await categoryData(store, 'no-such', NO_NEW_IN, NOW)).toBeUndefined();
    const d = (await categoryData(store, 'cat-polos', NO_NEW_IN, NOW))!;
    const one = await d.withPhotos(d.cards.slice(0, 1));
    expect(one).toHaveLength(1);
    expect(one[0]!.id).toBe(d.cards[0]!.id);
  });
});
