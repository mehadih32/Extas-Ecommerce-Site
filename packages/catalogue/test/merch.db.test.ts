// PR 27, 28, 32, 34, 38 on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): size charts per garment type and fit, assigned to categories and single products; collections
// and tags; the catalogue CSV (preview, apply, never removes, prices only with the permission, no cost in the export);
// the "was" price source and its honesty rule. Permissions and store isolation on every service.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor, type PermissionKey } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  applyCsvImport,
  assignSizeChart,
  comboWasPrice,
  copySizeChart,
  createBrand,
  createCategory,
  createCollection,
  createColour,
  createGarmentType,
  createProduct,
  createSize,
  createSizeChart,
  createTag,
  createVariant,
  exportCatalogueCsv,
  getCollection,
  getSizeChart,
  listCollections,
  listSizeCharts,
  listTags,
  previewCsvImport,
  productTags,
  resolveSizeChart,
  resolveWasPrice,
  setCollectionProducts,
  setProductTags,
  setWasPriceSource,
  tagProducts,
  unassignSizeChart,
  updateCollection,
  updateSizeChart,
  updateTag,
  updateVariant,
  wasPriceSources,
  type CatalogueDeps,
  type SettingsReader,
  type Who,
} from '../src';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const csvOf = (lines: string[][]) => lines.map((l) => l.join(',')).join('\n');

describe.skipIf(!HAS_TEST_DB)('size charts, collections, tags, CSV and the "was" price on PostgreSQL (PR 27, 28, 32, 34, 38)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let clock = new Date('2026-10-20T06:00:00Z');
  const overrides = new Map<string, unknown>([['store.name', 'Sample Shop']]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  const as = (actor: Actor, storeId = A): Who => ({ actor, storeId });
  let viewer: Actor;
  let editor: Actor;
  let importer: Actor;
  let pricer: Actor;

  // The shared fixture: a polo and a trouser garment type, sizes, categories, products.
  const ids = {} as Record<string, string>;

  beforeAll(async () => {
    t = await createTestDatabase('catalogue_merch');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: PermissionKey[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    viewer = await staff('viewer@example.com', ['catalogue.read']);
    editor = await staff('editor@example.com', ['catalogue.read', 'catalogue.write']);
    importer = await staff('importer@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.import']);
    pricer = await staff('pricer@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.import', 'catalogue.export', 'catalogue.prices']);

    const d = deps();
    const polo = await createGarmentType(d, sys(), {
      key: 'polo',
      nameEn: 'Polo',
      nameBn: 'পোলো',
      measurementFields: [
        { key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' },
        { key: 'length', labelEn: 'Length', labelBn: 'লম্বা', unit: 'inch' },
      ],
    });
    const trouser = await createGarmentType(d, sys(), { key: 'trouser', nameEn: 'Trouser', nameBn: 'প্যান্ট', measurementFields: [{ key: 'waist', labelEn: 'Waist', labelBn: 'কোমর', unit: 'inch' }] });
    ids.polo = polo.id;
    ids.trouser = trouser.id;
    for (const [i, label] of ['S', 'M', 'L', 'XL', 'XXL'].entries()) ids[`size_${label.toLowerCase()}`] = (await createSize(d, sys(), { key: label.toLowerCase(), label, sortOrder: (i + 1) * 10 })).id;
    ids.size_32 = (await createSize(d, sys(), { key: '32', label: '32', sortOrder: 200 })).id;
    ids.polos = (await createCategory(d, sys(), { nameEn: 'Polos', nameBn: 'পোলো', garmentTypeId: polo.id })).id;
    ids.pique = (await createCategory(d, sys(), { nameEn: 'Pique polos', parentId: ids.polos })).id;
    ids.trousers = (await createCategory(d, sys(), { nameEn: 'Trousers', garmentTypeId: trouser.id })).id;
    ids.navy = (await createColour(d, sys(), { nameEn: 'Navy', hex: '#1B2A4A' })).colour.id;
    const product = async (key: string, nameEn: string, categoryId: string, fit: string | null, sizes: string[]) => {
      const p = await createProduct(d, sys(), { nameEn, categoryId, slug: key });
      if (fit) await t.prisma.product.update({ where: { id: p.id }, data: { pdpBlocks: { fit, fitNote: null } } });
      for (const s of sizes) await createVariant(d, sys(), { productId: p.id, sku: `${key.toUpperCase()}-${s.toUpperCase()}`, sizeId: ids[`size_${s}`]!, priceMinor: 85000 });
      ids[key] = p.id;
    };
    await product('slim-polo', 'Slim polo', ids.pique, 'Slim', ['s', 'm']);
    await product('plain-polo', 'Plain polo', ids.pique, null, ['m', 'l', 'xl']);
    await product('odd-polo', 'Odd polo', ids.polos, 'regular', ['m']);
  });
  afterAll(async () => t?.drop());

  // ------------------------------------------------------------------------------------------------------------
  describe('size charts (PR 27, 28)', () => {
    let regular = '';
    let slim = '';

    it('creates a chart per garment type and fit, with the garment type\'s measurements, in inches and cm', async () => {
      const c = await createSizeChart(deps(), sys(), {
        name: 'Polo regular',
        garmentTypeId: ids.polo!,
        fitKey: 'regular',
        rows: [
          { size: 'm', values: [40, 28] },
          { size: 's', values: [38, 27] },
          { size: 'l', values: [42, 29] },
        ],
      });
      regular = c.id;
      expect(c.fields.map((f) => [f.key, f.labelBn, f.unit])).toEqual([
        ['chest', 'বুক', 'inch'],
        ['length', 'লম্বা', 'inch'],
      ]);
      expect(c.rows.map((r) => r.size)).toEqual(['s', 'm', 'l']);
      expect(c.rows[1]).toMatchObject({ label: 'M', inch: [40, 28], cm: [102, 71] });
      expect(c.easeInch).toBe(registry['catalogue.sizeCharts.defaultEaseInch'].default);
      expect(c.diagram?.key).toBe('top');
      expect(c.fit?.key).toBe('regular');
      expect(c.fields[0]!.howTo?.bn).toBeTruthy();
      const audit = await t.prisma.auditLog.count({ where: { entityType: 'SizeChart', entityId: c.id, action: 'sizeChart.create', storeId: A } });
      expect(audit).toBe(1);
      // the trouser chart gets the bottom drawing from the setting
      const tr = await createSizeChart(deps(), sys(), { name: 'Trouser regular', garmentTypeId: ids.trouser!, fitKey: 'regular', rows: [{ size: '32', values: [32] }] });
      expect(tr.diagram?.key).toBe('bottom');
      ids.trouserChart = tr.id;
    });

    it('refuses what a chart cannot hold', async () => {
      const base = { name: 'Bad', garmentTypeId: ids.polo!, fitKey: 'regular', rows: [{ size: 's', values: [38, 27] }] };
      expect(await code(createSizeChart(deps(), sys(), { ...base, fitKey: 'baggy' }))).toBe('UNKNOWN_KEY');
      expect(await code(createSizeChart(deps(), sys(), { ...base, rows: [{ size: 'zz', values: [1, 2] }] }))).toBe('UNKNOWN_KEY');
      expect(await code(createSizeChart(deps(), sys(), { ...base, rows: [{ size: 's', values: [38] }] }))).toBe('INVALID_INPUT');
      expect(await code(createSizeChart(deps(), sys(), { ...base, rows: [{ size: 's', values: [38, 0] }] }))).toBe('INVALID_INPUT');
      expect(await code(createSizeChart(deps(), sys(), { ...base, rows: [{ size: 's', values: [38, 999] }] }))).toBe('INVALID_INPUT');
      expect(await code(createSizeChart(deps(), sys(), { ...base, rows: [{ size: 's', values: [1, 2] }, { size: 's', values: [1, 2] }] }))).toBe('INVALID_INPUT');
      expect(await code(createSizeChart(deps(), sys(), { ...base, fields: ['chest', 'waist'] }))).toBe('UNKNOWN_KEY');
      expect(await code(createSizeChart(deps(), sys(), { ...base, name: 'polo REGULAR' }))).toBe('CONFLICT');
      overrides.set('catalogue.sizeCharts.maxRows', 1);
      expect(await code(createSizeChart(deps(), sys(), { ...base, rows: [{ size: 's', values: [1, 2] }, { size: 'm', values: [1, 2] }] }))).toBe('INVALID_INPUT');
      overrides.delete('catalogue.sizeCharts.maxRows');
      expect(await code(createSizeChart(deps(), as(viewer), base))).toBe('FORBIDDEN');
      expect(await code(createSizeChart(deps(), as(editor), base))).toBe('ok');
      expect(await code(listSizeCharts(deps(), as(viewer, B)))).toBe('FORBIDDEN');
    });

    it('copies a chart for a style that fits differently; the copy remembers where it came from', async () => {
      const c = await copySizeChart(deps(), sys(), regular, { name: 'Polo slim', fitKey: 'slim' });
      slim = c.id;
      expect(c.fitKey).toBe('slim');
      expect(c.copiedFromId).toBe(regular);
      expect(c.rows.map((r) => r.values)).toEqual([
        [38, 27],
        [40, 28],
        [42, 29],
      ]);
      const edited = await updateSizeChart(deps(), sys(), slim, { rows: [{ size: 's', values: [37, 27] }, { size: 'm', values: [39, 28] }] });
      expect(edited.rows.map((r) => r.size)).toEqual(['s', 'm']);
      // the original is untouched
      expect((await getSizeChart(deps(), sys(), regular)).rows).toHaveLength(3);
    });

    it('is a category default per fit; a product picks by its own fit, then the fallback fit', async () => {
      await assignSizeChart(deps(), sys(), { sizeChartId: regular, categoryId: ids.polos! });
      await assignSizeChart(deps(), sys(), { sizeChartId: slim, categoryId: ids.polos! });
      expect(await code(assignSizeChart(deps(), sys(), { sizeChartId: ids.trouserChart!, categoryId: ids.polos! }))).toBe('GARMENT_TYPE_MISMATCH');
      expect(await code(assignSizeChart(deps(), sys(), { sizeChartId: ids.trouserChart!, productId: ids['plain-polo']! }))).toBe('GARMENT_TYPE_MISMATCH');
      // "Slim" from the product's fit text, through the sub-category to the parent's default
      const a = await resolveSizeChart(deps(), sys(), { productId: ids['slim-polo']! });
      expect(a.fitKey).toBe('slim');
      expect(a.choice).toMatchObject({ chartId: slim, via: 'category', categoryId: ids.polos, matched: 'fit' });
      // no fit: the fallback fit
      const b = await resolveSizeChart(deps(), sys(), { productId: ids['plain-polo']! });
      expect(b.choice).toMatchObject({ chartId: regular, matched: 'fallback' });
      // "When you add a product": a category and a fit
      const n = await resolveSizeChart(deps(), as(viewer), { categoryId: ids.pique!, fitKey: 'slim' });
      expect(n.chart?.name).toBe('Polo slim');
      // a second regular chart replaces the category's regular default (one per fit), the old one is reported
      const other = await createSizeChart(deps(), sys(), { name: 'Polo regular 2', garmentTypeId: ids.polo!, fitKey: 'regular', rows: [{ size: 's', values: [39, 27] }] });
      const swap = await assignSizeChart(deps(), sys(), { sizeChartId: other.id, categoryId: ids.polos! });
      expect(swap.replacedChartId).toBe(regular);
      expect(await t.prisma.sizeChartAssignment.count({ where: { categoryId: ids.polos } })).toBe(2);
      await assignSizeChart(deps(), sys(), { sizeChartId: regular, categoryId: ids.polos! });
    });

    it('a single product can have its own chart ("make custom"), and go back to auto', async () => {
      const own = await copySizeChart(deps(), sys(), regular, { name: 'Odd polo own', productId: ids['odd-polo']! });
      const r = await resolveSizeChart(deps(), sys(), { productId: ids['odd-polo']! });
      expect(r.choice).toMatchObject({ chartId: own.id, via: 'product', matched: 'product' });
      expect((await getSizeChart(deps(), sys(), own.id)).products.map((p) => [p.nameEn, p.via])).toEqual([['Odd polo', 'product']]);
      expect(await unassignSizeChart(deps(), sys(), { productId: ids['odd-polo']! })).toEqual({ removed: 1 });
      expect((await resolveSizeChart(deps(), sys(), { productId: ids['odd-polo']! })).choice).toMatchObject({ chartId: regular, matched: 'fit' });
      // the link is archived, never deleted (hard rule 3); the audit log keeps it whole
      const log = await t.prisma.auditLog.findFirst({ where: { action: 'sizeChart.unassign', storeId: A }, orderBy: { createdAt: 'desc' } });
      expect(log?.before).toMatchObject({ sizeChartId: own.id, productId: ids['odd-polo'] });
      const kept = await t.prisma.sizeChartAssignment.findMany({ where: { productId: ids['odd-polo'] } });
      expect(kept).toHaveLength(1);
      expect(kept[0]!.archivedAt).not.toBeNull();
      expect((await getSizeChart(deps(), sys(), own.id)).products).toEqual([]);
      // making it custom again brings the same row back; "back to auto" archives it again
      const again = await assignSizeChart(deps(), sys(), { sizeChartId: own.id, productId: ids['odd-polo']! });
      expect(again.assignmentId).toBe(kept[0]!.id);
      expect((await resolveSizeChart(deps(), sys(), { productId: ids['odd-polo']! })).choice).toMatchObject({ chartId: own.id, via: 'product' });
      expect(await t.prisma.auditLog.count({ where: { action: 'sizeChart.reassign', entityId: kept[0]!.id } })).toBe(1);
      expect(await unassignSizeChart(deps(), sys(), { productId: ids['odd-polo']! })).toEqual({ removed: 1 });
      expect(await unassignSizeChart(deps(), sys(), { productId: ids['odd-polo']! })).toEqual({ removed: 0 });
      expect(await t.prisma.sizeChartAssignment.count({ where: { productId: ids['odd-polo'] } })).toBe(1);
    });

    it('names the sizes a product sells that its chart lacks, with a suggestion from the neighbours', async () => {
      const c = await getSizeChart(deps(), sys(), regular);
      expect(c.products.map((p) => p.nameEn).sort()).toEqual(['Odd polo', 'Plain polo']);
      expect(c.usedBy).toBe(2);
      expect(c.coverage).toEqual([expect.objectContaining({ size: 'xl', label: 'XL', suggestion: [44, 30], products: [expect.objectContaining({ nameEn: 'Plain polo' })] })]);
      expect(c.defaultFor.map((x) => x.id)).toEqual([ids.polos]);
    });

    it('is archived, never deleted, and only when nothing uses it', async () => {
      expect(await code(updateSizeChart(deps(), sys(), regular, { archived: true }))).toBe('CHART_IN_USE');
      // changing the fit to one the category already has a default for is refused
      expect(await code(updateSizeChart(deps(), sys(), regular, { fitKey: 'slim' }))).toBe('CONFLICT');
      expect(await unassignSizeChart(deps(), sys(), { categoryId: ids.polos!, sizeChartId: regular })).toEqual({ removed: 1 });
      const off = await updateSizeChart(deps(), sys(), regular, { archived: true });
      expect(off.archived).toBe(true);
      expect(await t.prisma.sizeChart.count({ where: { id: regular } })).toBe(1);
      expect((await listSizeCharts(deps(), sys())).some((c) => c.id === regular)).toBe(false);
      expect((await listSizeCharts(deps(), sys(), { includeArchived: true })).some((c) => c.id === regular)).toBe(true);
      expect(await code(assignSizeChart(deps(), sys(), { sizeChartId: regular, categoryId: ids.polos! }))).toBe('PARENT_ARCHIVED');
      // without a regular default, a product with no fit falls to the category's only default
      expect((await resolveSizeChart(deps(), sys(), { productId: ids['plain-polo']! })).choice).toMatchObject({ chartId: slim, matched: 'any' });
      const back = await updateSizeChart(deps(), sys(), regular, { archived: false });
      expect(back.archived).toBe(false);
      const actions = (await t.prisma.auditLog.findMany({ where: { entityId: regular }, select: { action: true } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['sizeChart.archive', 'sizeChart.restore']));
    });

    it("reads the sample seed's stored shape, and keeps to its own store", async () => {
      const seeded = await t.prisma.sizeChart.create({ data: { storeId: A, garmentTypeId: ids.polo!, name: 'Seeded', fitKey: 'regular', columns: ['chest', 'length'], rows: [{ size: 's', values: [38, 27] }] } });
      const c = await getSizeChart(deps(), sys(), seeded.id);
      expect(c.fields.map((f) => f.key)).toEqual(['chest', 'length']);
      expect(c.rows[0]).toMatchObject({ size: 's', inch: [38, 27] });
      expect(await code(getSizeChart(deps(), sys(B), seeded.id))).toBe('NOT_FOUND');
      expect(await code(assignSizeChart(deps(), sys(B), { sizeChartId: seeded.id, categoryId: ids.polos! }))).toBe('NOT_FOUND');
      expect(await listSizeCharts(deps(), sys(B))).toEqual([]);
    });
  });

  // ------------------------------------------------------------------------------------------------------------
  describe('collections and tags (PR 32)', () => {
    it('tags: made, put on and taken off products (only the link), archived not deleted', async () => {
      const linen = await createTag(deps(), sys(), { slug: 'linen', name: 'Linen' });
      const summer = await createTag(deps(), sys(), { slug: 'summer', name: 'Summer' });
      ids.linen = linen.id;
      expect(await code(createTag(deps(), sys(), { slug: 'linen', name: 'Linen again' }))).not.toBe('ok');
      expect(await setProductTags(deps(), sys(), ids['slim-polo']!, { tagIds: [linen.id, summer.id] })).toHaveLength(2);
      expect((await setProductTags(deps(), sys(), ids['slim-polo']!, { tagIds: [linen.id] })).map((x) => x.slug)).toEqual(['linen']);
      // taking a tag off archives the link (hard rule 3); tagging again brings the same row back
      const offLink = await t.prisma.productTag.findUniqueOrThrow({ where: { tagId_productId: { tagId: summer.id, productId: ids['slim-polo']! } } });
      expect(offLink.archivedAt).not.toBeNull();
      expect((await listTags(deps(), sys())).find((x) => x.id === summer.id)?.products).toBe(0);
      expect((await setProductTags(deps(), sys(), ids['slim-polo']!, { tagIds: [linen.id, summer.id] })).map((x) => x.slug)).toEqual(['linen', 'summer']);
      const backLink = await t.prisma.productTag.findUniqueOrThrow({ where: { tagId_productId: { tagId: summer.id, productId: ids['slim-polo']! } } });
      expect(backLink).toMatchObject({ id: offLink.id, archivedAt: null });
      await setProductTags(deps(), sys(), ids['slim-polo']!, { tagIds: [linen.id] });
      expect(await tagProducts(deps(), sys(), summer.id, { action: 'add', productIds: [ids['plain-polo']!, ids['odd-polo']!] })).toEqual({ changed: 2 });
      expect(await tagProducts(deps(), sys(), summer.id, { action: 'remove', productIds: [ids['odd-polo']!] })).toEqual({ changed: 1 });
      expect(await tagProducts(deps(), sys(), summer.id, { action: 'remove', productIds: [ids['odd-polo']!] })).toEqual({ changed: 0 });
      expect(await t.prisma.productTag.count({ where: { tagId: summer.id } })).toBe(3);
      expect(await t.prisma.productTag.count({ where: { tagId: summer.id, archivedAt: null } })).toBe(1);
      expect((await productTags(deps(), sys(), ids['plain-polo']!)).map((x) => x.slug)).toEqual(['summer']);
      overrides.set('catalogue.tags.maxPerProduct', 1);
      expect(await code(setProductTags(deps(), sys(), ids['plain-polo']!, { tagIds: [linen.id, summer.id] }))).toBe('INVALID_INPUT');
      overrides.delete('catalogue.tags.maxPerProduct');
      const off = await updateTag(deps(), sys(), summer.id, { archived: true });
      expect(off.archived).toBe(true);
      expect(await t.prisma.tag.count({ where: { id: summer.id } })).toBe(1);
      expect((await listTags(deps(), sys())).map((x) => x.slug)).toEqual(['linen']);
      expect(await code(tagProducts(deps(), sys(), summer.id, { action: 'add', productIds: [ids['slim-polo']!] }))).toBe('PARENT_ARCHIVED');
      expect(await code(setProductTags(deps(), as(viewer), ids['slim-polo']!, { tagIds: [] }))).toBe('FORBIDDEN');
      expect(await code(productTags(deps(), sys(B), ids['slim-polo']!))).toBe('NOT_FOUND');
    });

    it('seasonal collections: a season from the dictionary, live between its dates, a permanent page', async () => {
      expect(await code(createCollection(deps(), sys(), { nameEn: 'Eid edit', kind: 'SEASONAL' }))).toBe('INVALID_INPUT');
      expect(await code(createCollection(deps(), sys(), { nameEn: 'Eid edit', kind: 'SEASONAL', season: 'monsoon' }))).toBe('UNKNOWN_KEY');
      expect(await code(createCollection(deps(), sys(), { nameEn: 'Eid edit', kind: 'MANUAL', season: 'eid' }))).toBe('INVALID_INPUT');
      expect(await code(createCollection(deps(), sys(), { nameEn: 'Eid edit', kind: 'SEASONAL', season: 'eid', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' }))).toBe('INVALID_INPUT');
      const c = await createCollection(deps(), sys(), { slug: 'eid-edit', nameEn: 'Eid edit', nameBn: 'ঈদ', kind: 'SEASONAL', season: 'eid', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z' });
      ids.eid = c.id;
      expect(c).toMatchObject({ path: '/collections/eid-edit', state: 'scheduled', season: { key: 'eid' } });
      clock = new Date('2026-11-10T00:00:00Z');
      expect((await getCollection(deps(), sys(), c.id)).state).toBe('live');
      clock = new Date('2026-12-10T00:00:00Z');
      expect((await getCollection(deps(), sys(), c.id)).state).toBe('ended');
      clock = new Date('2026-10-20T06:00:00Z');
      // products in order; one left out loses only its link
      const two = await setCollectionProducts(deps(), sys(), c.id, { productIds: [ids['plain-polo']!, ids['slim-polo']!] });
      expect(two.items.map((i) => i.slug)).toEqual(['plain-polo', 'slim-polo']);
      const one = await setCollectionProducts(deps(), sys(), c.id, { productIds: [ids['slim-polo']!] });
      expect(one.items.map((i) => i.slug)).toEqual(['slim-polo']);
      expect(await t.prisma.product.count({ where: { id: ids['plain-polo'] } })).toBe(1);
      const log = await t.prisma.auditLog.findFirst({ where: { action: 'collection.products', entityId: c.id }, orderBy: { createdAt: 'desc' } });
      expect(log?.after).toMatchObject({ removed: [ids['plain-polo']] });
      // the link is archived, never deleted; putting the product back brings the same row back
      const out = await t.prisma.collectionProduct.findUniqueOrThrow({ where: { collectionId_productId: { collectionId: c.id, productId: ids['plain-polo']! } } });
      expect(out.archivedAt).not.toBeNull();
      expect(one.products).toBe(1);
      const back = await setCollectionProducts(deps(), sys(), c.id, { productIds: [ids['plain-polo']!, ids['slim-polo']!] });
      expect(back.items.map((i) => i.slug)).toEqual(['plain-polo', 'slim-polo']);
      expect(await t.prisma.collectionProduct.findUniqueOrThrow({ where: { id: out.id } })).toMatchObject({ archivedAt: null, position: 0 });
      await setCollectionProducts(deps(), sys(), c.id, { productIds: [ids['slim-polo']!] });
      expect(await t.prisma.collectionProduct.count({ where: { collectionId: c.id } })).toBe(2);
      // a new link keeps the old one working (301)
      const moved = await updateCollection(deps(), sys(), c.id, { slug: 'eid-2026' });
      expect(moved.path).toBe('/collections/eid-2026');
      const r = await t.prisma.redirect.findFirst({ where: { storeId: A, fromPath: '/collections/eid-edit' } });
      expect(r).toMatchObject({ toPath: '/collections/eid-2026', statusCode: registry['naming.redirectStatusCode'].default, source: 'collection-slug' });
      // archived, never deleted
      expect((await updateCollection(deps(), sys(), c.id, { archived: true })).state).toBe('archived');
      expect(await t.prisma.collection.count({ where: { id: c.id } })).toBe(1);
      expect(await code(setCollectionProducts(deps(), sys(), c.id, { productIds: [] }))).toBe('PARENT_ARCHIVED');
      await updateCollection(deps(), sys(), c.id, { archived: false });
      expect(await code(getCollection(deps(), sys(B), c.id))).toBe('NOT_FOUND');
    });

    it('rule collections follow their tags and categories', async () => {
      const c = await createCollection(deps(), sys(), { slug: 'linen-shop', nameEn: 'Linen', kind: 'RULE', rule: { tags: ['linen'] } });
      expect(c.items.map((i) => i.slug)).toEqual(['slim-polo']);
      const wide = await updateCollection(deps(), sys(), c.id, { rule: { tags: ['linen'], categoryIds: [ids.polos!] } });
      expect(wide.items.map((i) => i.slug).sort()).toEqual(['odd-polo', 'plain-polo', 'slim-polo']);
      expect(wide.products).toBe(3);
      expect(await code(setCollectionProducts(deps(), sys(), c.id, { productIds: [] }))).toBe('INVALID_INPUT');
      expect(await code(createCollection(deps(), sys(), { nameEn: 'Empty rule', kind: 'RULE' }))).toBe('INVALID_INPUT');
      expect((await listCollections(deps(), as(viewer))).map((x) => x.slug).sort()).toEqual(['eid-2026', 'linen-shop']);
    });
  });

  // ------------------------------------------------------------------------------------------------------------
  describe('catalogue CSV (PR 34)', () => {
    it('exports one row per variant, with the catalogue\'s own columns only: never cost or ERP prices', async () => {
      await t.prisma.productVariant.updateMany({ where: { storeId: A }, data: { avgCostMinor: 12_345, bGradeAvgCostMinor: 12_345, erpRetailPriceMinor: 99_999 } });
      expect(await code(exportCatalogueCsv(deps(), as(editor)))).toBe('FORBIDDEN');
      const x = await exportCatalogueCsv(deps(), as(pricer));
      expect(x.csv.startsWith('﻿')).toBe(true);
      const head = x.csv.slice(1).split('\r\n')[0]!.split(',');
      expect(head).toEqual(registry['catalogue.csv.columns'].default);
      expect(head.some((h) => /cost|erp/i.test(h))).toBe(false);
      expect(x.csv).not.toMatch(/123\.45|12345|999\.99|99999/);
      expect(x.rows).toBe(6);
      expect(x.products).toBe(3);
      expect(x.csv).toContain('SLIM-POLO-S');
      expect(x.csv).toContain(',850,');
      const job = await t.prisma.catalogImportJob.findFirst({ where: { storeId: A, kind: 'CSV_EXPORT' } });
      expect(job).toMatchObject({ status: 'SUCCEEDED', rowsTotal: 6, createdById: pricer.staffUserId });
      expect(await t.prisma.auditLog.count({ where: { action: 'catalogue.csv.export', storeId: A } })).toBe(1);
      // one category and its sub-categories
      expect((await exportCatalogueCsv(deps(), as(pricer), { categoryId: ids.pique! })).products).toBe(2);
      expect((await exportCatalogueCsv(deps(), as(pricer), { categoryId: ids.trousers! })).rows).toBe(0);
    });

    it('an exported file reads straight back with nothing to change', async () => {
      const x = await exportCatalogueCsv(deps(), as(pricer));
      const p = await previewCsvImport(deps(), as(pricer), x.csv);
      expect(p.totals).toMatchObject({ rows: 6, error: 0, create: 0, update: 0, unchanged: 6 });
      expect(p.columns.ignored).toEqual(['status']);
    });

    it('previews row by row, errors first, and saves nothing', async () => {
      await updateVariant(deps(), sys(), (await t.prisma.productVariant.findFirstOrThrow({ where: { sku: 'PLAIN-POLO-XL' } })).id, { archived: true });
      const file = csvOf([
        ['product', 'sku', 'nameEn', 'category', 'size', 'price', 'tags', 'collections', 'mystery'],
        ['csv-tee', 'CSV-TEE-S', 'CSV tee', 'pique-polos', 's', '', 'linen', 'eid-2026', 'x'],
        ['csv-tee', 'CSV-TEE-M', '', '', 'm', '', '', '', ''],
        ['plain-polo', 'PLAIN-POLO-M', '', '', '', '900', '', '', ''],
        ['new-one', '', 'New one', 'nowhere', '', '', '', '', ''],
        ['csv-tee', 'CSV-TEE-S', '', '', 's', '', '', '', ''],
        ['plain-polo', 'PLAIN-POLO-XL', '', '', 'xl', '', '', '', ''],
        ['plain-polo', 'bad sku', '', '', 'xxl', '', '', '', ''],
        ['slim-polo', 'SLIM-POLO-S', 'Slim polo', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', ''],
        ['odd-polo', 'ODD-POLO-L', '', '', 'm', '', '', 'linen-shop', ''],
      ]);
      expect(await code(previewCsvImport(deps(), as(editor), file))).toBe('FORBIDDEN');
      const before = { products: await t.prisma.product.count(), variants: await t.prisma.productVariant.count(), tags: await t.prisma.productTag.count() };
      const p = await previewCsvImport(deps(), as(importer), file);
      expect(p.canSetPrices).toBe(false);
      expect(p.columns).toEqual({ used: ['product', 'sku', 'nameEn', 'category', 'size', 'price', 'tags', 'collections'], ignored: ['mystery'] });
      const byLine = new Map(p.rows.map((r) => [r.line, r]));
      expect(byLine.get(2)).toMatchObject({ action: 'create', productAction: 'create', variantAction: 'create' });
      expect(byLine.get(2)!.changes.map((c) => c.field)).toEqual(expect.arrayContaining(['nameEn', 'categoryId', 'sku', 'size', 'tags', 'collections']));
      expect(byLine.get(3)).toMatchObject({ action: 'create', productAction: null, variantAction: 'create' });
      expect(byLine.get(4)!.issues).toEqual([{ code: 'PRICES_NOT_ALLOWED', column: 'price' }]);
      expect(byLine.get(5)!.issues).toEqual([{ code: 'UNKNOWN_KEY', column: 'category', detail: 'nowhere' }]);
      expect(byLine.get(6)!.issues.map((i) => i.code)).toEqual(['DUPLICATE_SKU']);
      expect(byLine.get(7)!.issues.map((i) => i.code)).toEqual(['SKU_RETIRED']);
      expect(byLine.get(8)!.issues.map((i) => i.code)).toEqual(['SKU_FORMAT']);
      expect(byLine.get(9)).toMatchObject({ action: 'unchanged' });
      expect(byLine.has(10)).toBe(false);
      expect(byLine.get(11)!.issues.map((i) => i.code)).toEqual(['VARIANT_EXISTS', 'INVALID_VALUE']);
      expect(p.rows.slice(0, p.totals.error).every((r) => r.action === 'error')).toBe(true);
      expect(p.totals).toMatchObject({ rows: 9, create: 2, update: 0, unchanged: 1, error: 6, productsCreated: 1, variantsCreated: 2 });
      expect({ products: await t.prisma.product.count(), variants: await t.prisma.productVariant.count(), tags: await t.prisma.productTag.count() }).toEqual(before);
      // the same file, applied as previewed; nothing outside it is touched, nothing is removed
      expect(await code(applyCsvImport(deps(), as(importer), file, 'not-the-hash'))).toBe('PREVIEW_CHANGED');
      const r = await applyCsvImport(deps(), as(importer), file, p.hash);
      expect(r).toMatchObject({ applied: 2, skipped: 6, failed: [] });
      const tee = await t.prisma.product.findFirstOrThrow({ where: { storeId: A, slug: 'csv-tee' }, select: { id: true } });
      expect((await t.prisma.productVariant.findMany({ where: { productId: tee.id }, select: { sku: true } })).map((v) => v.sku).sort()).toEqual(['CSV-TEE-M', 'CSV-TEE-S']);
      expect(await t.prisma.productTag.count({ where: { productId: tee.id } })).toBe(1);
      expect((await getCollection(deps(), sys(), ids.eid!)).items.map((i) => i.slug)).toEqual(['slim-polo', 'csv-tee']);
      expect((await t.prisma.productVariant.findFirstOrThrow({ where: { sku: 'PLAIN-POLO-M' } })).priceMinor).toBe(85_000);
      expect(await t.prisma.productVariant.count({ where: { sku: 'PLAIN-POLO-XL', archivedAt: { not: null } } })).toBe(1);
      expect(await t.prisma.product.count()).toBe(before.products + 1);
      const job = await t.prisma.catalogImportJob.findUniqueOrThrow({ where: { id: r.jobId } });
      expect(job).toMatchObject({ kind: 'CSV_IMPORT', status: 'SUCCEEDED', rowsTotal: 9, rowsOk: 3, rowsFailed: 6, createdById: importer.staffUserId });
      expect(await t.prisma.auditLog.count({ where: { action: 'catalogue.csv.import', entityId: r.jobId } })).toBe(1);
      // applying again changes nothing: every created row is now unchanged
      const again = await previewCsvImport(deps(), as(importer), file);
      expect(again.totals).toMatchObject({ create: 0, update: 0 });
    });

    it('changes prices only for someone allowed to, with the price history kept', async () => {
      const file = csvOf([
        ['product', 'sku', 'price', 'compareAt'],
        ['plain-polo', 'PLAIN-POLO-M', '900', ''],
        ['plain-polo', 'PLAIN-POLO-L', '800', '700'],
      ]);
      const p = await previewCsvImport(deps(), as(pricer), file);
      expect(p.canSetPrices).toBe(true);
      expect(p.rows.find((r) => r.line === 2)).toMatchObject({ action: 'update', changes: [{ field: 'price', before: 85_000, after: 90_000 }] });
      expect(p.rows.find((r) => r.line === 3)!.issues.map((i) => i.code)).toEqual(['INVALID_VALUE']);
      const r = await applyCsvImport(deps(), as(pricer), file, p.hash);
      expect(r.applied).toBe(1);
      const v = await t.prisma.productVariant.findFirstOrThrow({ where: { sku: 'PLAIN-POLO-M' } });
      expect(v.priceMinor).toBe(90_000);
      expect(await t.prisma.priceHistory.count({ where: { variantId: v.id, priceMinor: 90_000 } })).toBe(1);
    });

    it('refuses a broken file as a whole, with the line', async () => {
      expect(await code(previewCsvImport(deps(), as(importer), ''))).toBe('CSV_INVALID');
      expect(await code(previewCsvImport(deps(), as(importer), 'sku,nameEn\nX,Y'))).toBe('CSV_INVALID');
      expect(await code(previewCsvImport(deps(), as(importer), 'product,product\nx,y'))).toBe('CSV_INVALID');
      expect(await code(previewCsvImport(deps(), as(importer), 'product,nameEn\nx,"open'))).toBe('CSV_INVALID');
      overrides.set('catalogue.csv.maxRows', 1);
      expect(await code(previewCsvImport(deps(), as(importer), 'product\na\nb'))).toBe('CSV_INVALID');
      overrides.delete('catalogue.csv.maxRows');
      // another store's products are not this store's
      const other = await previewCsvImport(deps(), sys(B), 'product,nameEn\nslim-polo,Slim polo');
      expect(other.rows[0]).toMatchObject({ action: 'create', productAction: 'create' });
    });
  });

  // ------------------------------------------------------------------------------------------------------------
  describe('the "was" price (PR 38)', () => {
    it('shows nothing until a source is chosen; choosing one needs the price permission', async () => {
      const none = await resolveWasPrice(deps(), as(viewer), ids['plain-polo']!);
      expect(none.choice).toEqual({ source: null, from: 'none', categoryId: null });
      expect(none.variants.every((v) => v.wasMinor === null && v.reason === 'NOT_CHOSEN')).toBe(true);
      expect(await code(setWasPriceSource(deps(), as(editor), { categoryId: ids.polos!, source: 'PRICE_HISTORY' }))).toBe('FORBIDDEN');
      expect(await code(setWasPriceSource(deps(), as(pricer), { categoryId: ids.polos!, source: 'PRICE_HISTORY' }))).toBe('ok');
      const s = await wasPriceSources(deps(), as(viewer));
      expect(s.store).toBeNull();
      expect(s.categories.find((c) => c.id === ids.pique)).toMatchObject({ own: null, effective: { source: 'PRICE_HISTORY', from: 'category', categoryId: ids.polos } });
      expect(await t.prisma.auditLog.count({ where: { action: 'category.wasPriceSource', entityId: ids.polos } })).toBe(1);
    });

    it('price history: the real earlier price, only for the set window after the change', async () => {
      const v = await t.prisma.productVariant.findFirstOrThrow({ where: { sku: 'PLAIN-POLO-M' } });
      // PLAIN-POLO-M went 850 → 900 above; now it drops to 700
      clock = new Date('2026-10-25T06:00:00Z');
      await updateVariant(deps(), as(pricer), v.id, { priceMinor: 70_000 });
      const r = await resolveWasPrice(deps(), sys(), ids['plain-polo']!);
      expect(r.choice.from).toBe('category');
      expect(r.variants.find((x) => x.sku === 'PLAIN-POLO-M')).toMatchObject({ priceMinor: 70_000, wasMinor: 85_000, reason: 'SHOWN' });
      // a variant whose price never changed shows nothing
      expect(r.variants.find((x) => x.sku === 'PLAIN-POLO-L')).toMatchObject({ wasMinor: null });
      clock = new Date('2027-01-30T06:00:00Z');
      expect((await resolveWasPrice(deps(), sys(), ids['plain-polo']!)).variants.find((x) => x.sku === 'PLAIN-POLO-M')).toMatchObject({ wasMinor: null, reason: 'TOO_OLD' });
      clock = new Date('2026-10-20T06:00:00Z');
    });

    it('MRP: a product can choose its own source; own-label goods never show an MRP unless the setting allows', async () => {
      const own = await createBrand(deps(), sys(), { name: 'House', isOwnLabel: true });
      const lab = await createBrand(deps(), sys(), { name: 'Lacoste' });
      await t.prisma.product.update({ where: { id: ids['slim-polo'] }, data: { brandId: lab.id } });
      await t.prisma.product.update({ where: { id: ids['odd-polo'] }, data: { brandId: own.id } });
      await t.prisma.productVariant.updateMany({ where: { productId: { in: [ids['slim-polo']!, ids['odd-polo']!] } }, data: { compareAtMinor: 120_000 } });
      await setWasPriceSource(deps(), as(pricer), { productId: ids['slim-polo']!, source: 'MRP' });
      await setWasPriceSource(deps(), as(pricer), { productId: ids['odd-polo']!, source: 'MRP' });
      const branded = await resolveWasPrice(deps(), sys(), ids['slim-polo']!);
      expect(branded.choice).toEqual({ source: 'MRP', from: 'product', categoryId: null });
      expect(branded.variants.every((v) => v.wasMinor === 120_000 && v.reason === 'SHOWN')).toBe(true);
      expect((await resolveWasPrice(deps(), sys(), ids['odd-polo']!)).variants[0]).toMatchObject({ wasMinor: null, reason: 'MRP_OWN_LABEL' });
      overrides.set('catalogue.wasPrice.mrpOwnLabel', true);
      expect((await resolveWasPrice(deps(), sys(), ids['odd-polo']!)).variants[0]).toMatchObject({ wasMinor: 120_000 });
      overrides.delete('catalogue.wasPrice.mrpOwnLabel');
      // NONE switches it off; null follows the category again
      await setWasPriceSource(deps(), as(pricer), { productId: ids['slim-polo']!, source: 'NONE' });
      expect((await resolveWasPrice(deps(), sys(), ids['slim-polo']!)).variants[0]!.wasMinor).toBeNull();
      await setWasPriceSource(deps(), as(pricer), { productId: ids['slim-polo']!, source: null });
      expect((await resolveWasPrice(deps(), sys(), ids['slim-polo']!)).choice.from).toBe('category');
      expect(await code(resolveWasPrice(deps(), sys(B), ids['slim-polo']!))).toBe('NOT_FOUND');
    });

    it('combo: the sum of the pieces\' own prices, only when it is above the set price', async () => {
      const plainM = await t.prisma.productVariant.findFirstOrThrow({ where: { sku: 'PLAIN-POLO-M' } });
      const slimS = await t.prisma.productVariant.findFirstOrThrow({ where: { sku: 'SLIM-POLO-S' } });
      const combo = await t.prisma.combo.create({
        data: { storeId: A, slug: 'two-polos', nameEn: 'Two polos', type: 'FIXED_SET', pieceCount: 2, setPriceMinor: 150_000, items: { create: [{ storeId: A, position: 0, productId: ids['plain-polo']!, fixedVariantId: plainM.id, quantity: 1 }, { storeId: A, position: 1, productId: ids['slim-polo']!, fixedVariantId: slimS.id, quantity: 1 }] } },
      });
      const w = await comboWasPrice(deps(), sys(), combo.id);
      expect(w).toMatchObject({ setPriceMinor: 150_000, sumMinor: (plainM.priceMinor ?? 0) + (slimS.priceMinor ?? 0) });
      expect(w.wasMinor).toBe(w.sumMinor! > 150_000 ? w.sumMinor : null);
      expect(await code(comboWasPrice(deps(), sys(B), combo.id))).toBe('NOT_FOUND');
    });
  });
});
