// PR 41 — what the home page reads from the catalogue, on a real PostgreSQL (a throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): "New in" cards (only live products of visible categories, the cheapest live price, no struck
// price unless the owner chose a source, the first tag as the badge, the colours in order), the category tiles' lead
// product (pinned first, sub-categories count) and the reviews row (approved only; the average counts every approved
// review, whatever the row's star filter). PR 43: the hero's products per category (pinned first, sub-categories count,
// in stock only when asked) and a campaign collection (its own order, only inside its dates).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma } from '@extas/db/client';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { categoryLeads, heroCategoryCards, heroCollectionCards, newestCards } from './catalogue';
import { homeReviews } from './reviews';

describe.skipIf(!HAS_TEST_DB)('the home page catalogue reads on PostgreSQL', () => {
  let t: TestDatabase;
  let store = 0;
  const saved = process.env.DATABASE_URL;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t = await createTestDatabase('shop_catalogue');
    [store] = await seedSampleStores(t.prisma);
    await disconnectPrisma();
    process.env.DATABASE_URL = t.url;
    const db = t.prisma;
    const polo = await db.garmentType.create({ data: { storeId: store, key: 'polo', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const cat = (slug: string, visible: boolean, parentId?: string) =>
      db.category.create({ data: { storeId: store, slug, nameEn: slug, isVisible: visible, garmentTypeId: polo.id, ...(parentId ? { parentId } : {}) } });
    const polos = await cat('polos', true);
    const knit = await cat('knit-polos', true, polos.id);
    const hidden = await cat('hidden', false);
    const navy = await db.colour.create({ data: { storeId: store, key: 'navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#1F2A44' } });
    const white = await db.colour.create({ data: { storeId: store, key: 'white', nameEn: 'White', hex: '#F4F2EC' } });
    const product = async (slug: string, o: { cat: string; status?: 'PUBLISHED' | 'DRAFT'; day: number; prices: number[]; rank?: number }) => {
      const p = await db.product.create({
        data: {
          storeId: store,
          slug,
          nameEn: slug,
          status: o.status ?? 'PUBLISHED',
          publishedAt: new Date(Date.UTC(2026, 9, o.day)),
          categoryId: o.cat,
          sortRank: o.rank ?? 0,
          pdpBlocks: { fit: 'Regular fit' },
        },
      });
      await db.productColour.create({ data: { storeId: store, productId: p.id, colourId: white.id, sortOrder: 1 } });
      await db.productColour.create({ data: { storeId: store, productId: p.id, colourId: navy.id, sortOrder: 0 } });
      for (const [i, price] of o.prices.entries())
        await db.productVariant.create({ data: { storeId: store, productId: p.id, sku: `${slug}-${i}`, colourId: navy.id, priceMinor: price, compareAtMinor: price + 50000, active: true } });
      ids[slug] = p.id;
      return p;
    };
    await product('old-polo', { cat: polos.id, day: 1, prices: [120000], rank: 5 });
    await product('new-polo', { cat: knit.id, day: 9, prices: [150000, 99000], rank: 1 });
    await product('draft-polo', { cat: polos.id, status: 'DRAFT', day: 10, prices: [100000] });
    await product('hidden-polo', { cat: hidden.id, day: 11, prices: [100000] });
    // an inactive cheaper variant never sets the price
    await db.productVariant.create({ data: { storeId: store, productId: ids['old-polo']!, sku: 'old-cheap', priceMinor: 1000, active: false } });
    const tag = await db.tag.create({ data: { storeId: store, slug: 'new', name: 'New' } });
    await db.productTag.create({ data: { storeId: store, tagId: tag.id, productId: ids['new-polo']! } });
    await db.categoryProduct.create({ data: { storeId: store, categoryId: polos.id, productId: ids['old-polo']!, isVisible: true, sortRank: 9 } });
    await db.categoryProduct.create({ data: { storeId: store, categoryId: knit.id, productId: ids['new-polo']!, isVisible: true, sortRank: 1, pinned: true } });
    const review = (rating: number, status: 'APPROVED' | 'PENDING', productId: string, body = 'Fits well.') =>
      db.review.create({ data: { storeId: store, productId, rating, status, body, displayName: 'Sample buyer', publishedAt: new Date(Date.UTC(2026, 9, rating)), isVerifiedPurchase: rating > 3 } });
    await review(5, 'APPROVED', ids['new-polo']!);
    await review(2, 'APPROVED', ids['old-polo']!);
    await review(4, 'PENDING', ids['old-polo']!);
    await review(5, 'APPROVED', ids['draft-polo']!);
  }, 120_000);

  it("PR 43: the hero takes each category's pinned product first; in stock only leaves out what cannot be bought", async () => {
    expect((await heroCategoryCards(store, ['polos', 'hidden'], 2, false)).map((g) => g.map((c) => c.slug))).toEqual([['new-polo', 'old-polo'], []]);
    expect((await heroCategoryCards(store, ['polos'], 1, false))[0]!.map((c) => c.slug)).toEqual(['new-polo']);
    await t.prisma.product.update({ where: { id: ids['old-polo']! }, data: { inStock: true } });
    expect((await heroCategoryCards(store, ['polos'], 2, true))[0]!.map((c) => c.slug)).toEqual(['old-polo']);
    expect(await heroCategoryCards(store, [], 2, false)).toEqual([]);
  });

  it('PR 43: a campaign collection fills the hero in its own order, only inside its dates', async () => {
    const db = t.prisma;
    const col = await db.collection.create({
      data: { storeId: store, slug: 'winter', nameEn: 'Winter', kind: 'SEASONAL', startsAt: new Date(Date.UTC(2026, 9, 1)), endsAt: new Date(Date.UTC(2026, 11, 1)) },
    });
    await db.collectionProduct.create({ data: { storeId: store, collectionId: col.id, productId: ids['old-polo']!, position: 2 } });
    await db.collectionProduct.create({ data: { storeId: store, collectionId: col.id, productId: ids['new-polo']!, position: 1 } });
    await db.collectionProduct.create({ data: { storeId: store, collectionId: col.id, productId: ids['draft-polo']!, position: 0 } });
    const inside = new Date(Date.UTC(2026, 9, 20));
    expect((await heroCollectionCards(store, 'winter', 14, false, inside))!.map((c) => c.slug)).toEqual(['new-polo', 'old-polo']);
    expect((await heroCollectionCards(store, 'winter', 1, false, inside))!.map((c) => c.slug)).toEqual(['new-polo']);
    expect(await heroCollectionCards(store, 'winter', 14, false, new Date(Date.UTC(2026, 11, 2)))).toBeNull();
    expect(await heroCollectionCards(store, 'no-such', 14, false, inside)).toBeNull();
  });

  afterAll(async () => {
    await disconnectPrisma();
    if (saved === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = saved;
    await t?.drop();
  });

  it('"New in": live products of visible categories, newest first, at the cheapest live price, no struck price by default', async () => {
    const cards = await newestCards(store, 8, 'newest');
    expect(cards.map((c) => c.slug)).toEqual(['new-polo', 'old-polo']);
    expect(cards[0]).toMatchObject({ priceMinor: 99000, wasMinor: null, badge: 'New', garment: 'polo', fit: 'Regular fit', categorySlug: 'knit-polos' });
    expect(cards[0]!.colours.map((c) => c.key)).toEqual(['navy', 'white']);
    expect(cards[1]!.priceMinor).toBe(120000);
    expect((await newestCards(store, 8, 'rank')).map((c) => c.slug)).toEqual(['old-polo', 'new-polo']);
    expect(await newestCards(store, 1, 'newest')).toHaveLength(1);
  });

  it('a category tile takes its pinned product first, searching its sub-categories too', async () => {
    const leads = await categoryLeads(store, ['polos', 'hidden']);
    expect(Object.keys(leads)).toEqual(['polos']);
    expect(leads.polos!.slug).toBe('new-polo');
  });

  it('reviews: approved ones of live products; the average counts all of them whatever the star filter', async () => {
    const all = await homeReviews(store, 10, 1);
    expect(all.reviews.map((r) => r.rating)).toEqual([5, 2]);
    expect(all.total).toBe(2);
    expect(all.average).toBe(3.5);
    const good = await homeReviews(store, 10, 4);
    expect(good.reviews.map((r) => r.rating)).toEqual([5]);
    expect(good.average).toBe(3.5);
    expect(good.reviews[0]).toMatchObject({ name: 'Sample buyer', verified: true, body: 'Fits well.' });
  });
});
