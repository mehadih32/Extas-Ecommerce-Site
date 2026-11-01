// PR 72 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL),
// with an in-memory stand-in for Meilisearch's HTTP API: what search can find (only published products of shown
// categories, shown categories), the PostgreSQL answers (names, Bengali, categories, colours), the adapter's choice
// (Meilisearch only when its index is current; slow or down → PostgreSQL), and the indexer (one version once, the
// leftovers of an older version deleted, settings from the rules). Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { catalogueVersion, readDocTexts } from './docs';
import { forgetSearchCache, searchCatalogue, type SearchDeps, type SettingsReader } from './engine';
import { indexBehind, indexSettings, indexStore } from './indexer';
import { meiliFromEnv } from './meili';
import { fakeMeili } from './testing';

describe.skipIf(!HAS_TEST_DB)('search on PostgreSQL and the Meilisearch adapter (PR 72)', () => {
  let t: TestDatabase;
  let store = 0;
  const ids: Record<string, string> = {};
  let overrides: Partial<Record<Key, unknown>> = {};
  const settings: SettingsReader = {
    value: async <K extends Key>(key: K) => (key in overrides ? overrides[key] : registry[key].default) as Value<K>,
  };
  let deps: SearchDeps;

  beforeAll(async () => {
    t = await createTestDatabase('search_engine');
    [store] = await seedSampleStores(t.prisma);
    const db = t.prisma;
    const polo = await db.garmentType.create({ data: { storeId: store, key: 'polo-t', nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [] } });
    const tops = await db.category.create({ data: { storeId: store, slug: 's-tops', nameEn: 'Tops', nameBn: 'টপস', isVisible: true } });
    const polos = await db.category.create({ data: { storeId: store, slug: 's-polos', nameEn: 'Polo shirts', nameBn: 'পোলো শার্ট', isVisible: true, garmentTypeId: polo.id, parentId: tops.id } });
    const hidden = await db.category.create({ data: { storeId: store, slug: 's-hidden', nameEn: 'Hidden things', isVisible: false } });
    const navy = await db.colour.create({ data: { storeId: store, key: 's-navy', nameEn: 'Navy', nameBn: 'নেভি', hex: '#1F2A44', synonyms: ['dark blue'] } });
    const product = async (slug: string, o: { cat: string; name: string; nameBn?: string; status?: 'PUBLISHED' | 'DRAFT'; archived?: boolean; rank?: number }) => {
      const p = await db.product.create({
        data: { storeId: store, slug, nameEn: o.name, nameBn: o.nameBn ?? null, status: o.status ?? 'PUBLISHED', categoryId: o.cat, sortRank: o.rank ?? 0, archivedAt: o.archived ? new Date() : null },
      });
      await db.productColour.create({ data: { storeId: store, productId: p.id, colourId: navy.id, sortOrder: 0 } });
      ids[slug] = p.id;
    };
    await product('s-classic', { cat: polos.id, name: 'Classic Pique Polo', nameBn: 'ক্লাসিক পিকে পোলো', rank: 5 });
    await product('s-stripe', { cat: polos.id, name: 'Striped Rib Polo', rank: 3 });
    await product('s-draft', { cat: polos.id, name: 'Draft Polo' , status: 'DRAFT' });
    await product('s-gone', { cat: polos.id, name: 'Archived Polo', archived: true });
    await product('s-hidden', { cat: hidden.id, name: 'Hidden Polo' });
    ids.polos = polos.id;
    ids.tops = tops.id;
    deps = { db: t.prisma, settings, meili: null };
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  const ask = (q: string) => searchCatalogue(deps, store, q);

  it('what search can find: published products of shown categories, and shown categories', async () => {
    const docs = await readDocTexts(t.prisma, store);
    const names = docs.filter((d) => d.kind === 'product').map((d) => d.nameEn);
    expect(names).toEqual(['Classic Pique Polo', 'Striped Rib Polo']);
    expect(docs.filter((d) => d.kind === 'category').map((d) => d.nameEn).sort()).toEqual(['Polo shirts', 'Tops']);
    const classic = docs.find((d) => d.id === ids['s-classic'])!;
    expect(classic.category).toContain('Polo shirts');
    expect(classic.category).toContain('Tops');
    expect(classic.colours).toContain('dark blue');
  });

  it('PostgreSQL answers: names, Bengali names, categories, colour words, the owner order', async () => {
    forgetSearchCache();
    const r = await ask('polo');
    expect(r.engine).toBe('postgres');
    expect(r.products).toEqual([ids['s-classic'], ids['s-stripe']]);
    expect(r.categories).toEqual([ids.polos]);
    expect((await ask('ক্লাসিক')).products).toEqual([ids['s-classic']]);
    expect((await ask('পোলো শার্ট')).products).toEqual([ids['s-classic'], ids['s-stripe']]);
    expect((await ask('dark blue polo')).products.length).toBe(2);
    // a category's own name first, then its sub-categories (found by their parent's name)
    expect((await ask('tops')).categories).toEqual([ids.tops, ids.polos]);
    const none = await ask('stripd classik');
    expect(none.products).toEqual([]);
    const partial = await ask('striped hoodie');
    expect(partial.products).toEqual([]);
    expect(partial.partial?.words).toEqual(['striped']);
    expect(partial.partial?.products).toEqual([ids['s-stripe']]);
  });

  it('the indexer: nothing without the server; one version once; the leftovers of an older version deleted', async () => {
    expect(await indexStore(deps, store)).toEqual({ status: 'skipped', reason: 'no-server' });
    const fake = fakeMeili();
    const withMeili: SearchDeps = { ...deps, meili: { url: 'http://search.test', key: 'test-only-key', fetch: fake.fetch } };
    overrides = { 'search.engine': { ...registry['search.engine'].default, mode: 'postgres' } };
    expect(await indexStore(withMeili, store)).toEqual({ status: 'skipped', reason: 'postgres-mode' });
    overrides = {};
    expect(await indexBehind(withMeili, store)).toMatchObject({ behind: true });
    const first = await indexStore(withMeili, store);
    expect(first).toMatchObject({ status: 'indexed', products: 2, categories: 2 });
    const ix = fake.indexes.get(`shop-${store}`)!;
    expect(ix.settings).toMatchObject({ filterableAttributes: ['kind', 'v'], typoTolerance: { minWordSizeForTypos: { oneTypo: 4, twoTypos: 7 } } });
    expect((ix.settings.synonyms as Record<string, string[]>)['গেঞ্জি']).toEqual(['tshirt', 'tee']);
    expect(await indexStore(withMeili, store)).toEqual({ status: 'unchanged', version: (first as { version: string }).version });
    expect(await indexBehind(withMeili, store)).toMatchObject({ behind: false });

    // the adapter now asks Meilisearch (its index is current)
    forgetSearchCache();
    deps = withMeili;
    const r = await ask('polo');
    expect(r.engine).toBe('meilisearch');
    expect(r.products).toEqual([ids['s-classic'], ids['s-stripe']]);
    expect(r.categories).toEqual([ids.polos]);

    // a product goes off sale: the index is behind, PostgreSQL answers until the worker catches up
    await t.prisma.product.update({ where: { id: ids['s-stripe']! }, data: { status: 'UNPUBLISHED' } });
    forgetSearchCache();
    const behind = await ask('polo');
    expect(behind.engine).toBe('postgres');
    expect(behind.products).toEqual([ids['s-classic']]);
    const again = await indexStore(withMeili, store);
    expect(again).toMatchObject({ status: 'indexed', products: 1 });
    expect(ix.docs.has(ids['s-stripe']!)).toBe(false);
    forgetSearchCache();
    const caught = await ask('polo');
    expect(caught).toMatchObject({ engine: 'meilisearch', products: [ids['s-classic']] });

    // a slip of a general word ("shrit" for shirt) is left out on Meilisearch as on PostgreSQL (gate-c360, 1 Nov 2026:
    // "pollo shrit" found nothing on the server, where only an exactly written general word was dropped)
    const slip = await ask('classic shrit');
    expect(slip).toMatchObject({ engine: 'meilisearch', products: [ids['s-classic']], used: ['classic'], dropped: ['shrit'] });
    deps = { ...deps, meili: null };
    forgetSearchCache();
    // (PostgreSQL also reads "shrit" as the start of the category's "shirts", one slip off, so it keeps the word)
    expect(await ask('classic shrit')).toMatchObject({ engine: 'postgres', products: [ids['s-classic']] });
    deps = withMeili;
    forgetSearchCache();

    // the search server down: PostgreSQL answers, the shopper sees the same products
    fake.setDown(true);
    forgetSearchCache();
    const lines: string[] = [];
    const down = await searchCatalogue(deps, store, 'polo', { log: (l) => lines.push(l) });
    expect(down).toMatchObject({ engine: 'postgres', products: [ids['s-classic']] });
    expect(lines[0]).toMatch(/did not answer/);
    fake.setDown(false);
  });

  it('the version changes with the word lists, and the server comes from the environment only', async () => {
    const a = await catalogueVersion(t.prisma, store, { x: 1 });
    expect(await catalogueVersion(t.prisma, store, { x: 1 })).toBe(a);
    expect(await catalogueVersion(t.prisma, store, { x: 2 })).not.toBe(a);
    expect(meiliFromEnv({})).toBeNull();
    expect(meiliFromEnv({ MEILI_URL: 'http://extas-meilisearch:7700/', MEILI_MASTER_KEY: 'k' })).toEqual({ url: 'http://extas-meilisearch:7700', key: 'k' });
    expect(meiliFromEnv({ MEILI_URL: 'not a url', MEILI_MASTER_KEY: 'k' })).toBeNull();
    expect(indexSettings({ engine: registry['search.engine'].default, match: { ...registry['search.match'].default, prefix: false }, words: registry['search.words'].default })).toMatchObject({
      prefixSearch: 'disabled',
    });
  });
});
