// The catalogue on a real PostgreSQL (a throwaway database with the real migrations; skipped without
// TEST_DATABASE_ADMIN_URL): permissions and store isolation, the audit log, the SKU key rules, the category tree,
// garment type inheritance, the colour dictionary, fabrics, the product summary and naming with 301s without chains.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { prismaBackend, registry, SettingsResolver, type Key, type Value } from '@extas/settings';
import {
  applyBulkRename,
  applyTemplate,
  categoryTree,
  createBrand,
  createCategory,
  createColour,
  createFabric,
  createGarmentType,
  createProduct,
  createRedirect,
  createSize,
  createVariant,
  findColour,
  getCategory,
  getProduct,
  listColours,
  listProducts,
  listRedirects,
  listRenames,
  namingView,
  previewBulkRename,
  previewNaming,
  previewTemplateApply,
  productFacts,
  renameReport,
  resolveProductPath,
  saveNaming,
  setProductColours,
  updateBrand,
  updateCategory,
  updateColour,
  updateFabric,
  updateProduct,
  updateRedirect,
  updateSize,
  updateVariant,
  upsertVariantBySku,
  variantBySku,
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

describe.skipIf(!HAS_TEST_DB)('catalogue on PostgreSQL (PR 19, 20, 30, 31, 590)', () => {
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
  let viewer: Actor;
  let editor: Actor;

  beforeAll(async () => {
    t = await createTestDatabase('catalogue');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: ('catalogue.read' | 'catalogue.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    viewer = await staff('viewer@example.com', ['catalogue.read']);
    editor = await staff('editor@example.com', ['catalogue.read', 'catalogue.write']);
  });
  afterAll(async () => t?.drop());

  it('checks the permission in the acting store, on every action', async () => {
    expect(await code(listColours(deps(), { actor: viewer, storeId: A }))).toBe('ok');
    expect(await code(createSize(deps(), { actor: viewer, storeId: A }, { label: 'XS' }))).toBe('FORBIDDEN');
    expect(await code(listColours(deps(), { actor: viewer, storeId: B }))).toBe('FORBIDDEN');
    expect(await code(createSize(deps(), { actor: editor, storeId: A }, { label: 'XS' }))).toBe('ok');
    expect(await code(listColours(deps(), sys(9999)))).toBe('NOT_FOUND');
  });

  it('colours: one stored hex, names and synonyms name one colour, similar shades get a note, archived not deleted', async () => {
    const { colour: navy, warnings } = await createColour(deps(), sys(), { nameEn: 'Navy', nameBn: 'নেভি', hex: '1b2a4a', synonyms: ['navy blue', 'NAVY'], family: 'blue' });
    expect(navy.hex).toBe('#1B2A4A');
    expect(navy.key).toBe('navy');
    expect(navy.synonyms).toEqual(['navy blue']);
    expect(warnings).toEqual([]);
    expect((await findColour(deps(), sys(), '  Navy Blue '))?.id).toBe(navy.id);
    expect(await code(createColour(deps(), sys(), { nameEn: 'Dark navy', hex: '#111', synonyms: ['Navy Blue'] }))).toBe('NAME_TAKEN');
    expect(await code(createColour(deps(), sys(), { nameEn: 'Teal', hex: 'teal' }))).toBe('INVALID_INPUT');
    expect(await code(createColour(deps(), sys(), { nameEn: 'Mauve', hex: '#AA88AA', family: 'not-a-family' }))).toBe('UNKNOWN_KEY');
    const close = await createColour(deps(), sys(), { nameEn: 'Midnight', hex: '#1C2B4B' });
    expect(close.warnings.map((w) => w.code)).toEqual(['SIMILAR_SHADE']);
    // another store has its own library
    expect(await findColour(deps(), sys(B), 'navy')).toBeNull();
    const audits = await t.prisma.auditLog.count({ where: { entityType: 'Colour', entityId: navy.id, action: 'colour.create', storeId: A } });
    expect(audits).toBe(1);
    const off = await updateColour(deps(), sys(), close.colour.id, { archived: true });
    expect(off.colour.archived).toBe(true);
    expect(await t.prisma.colour.count({ where: { id: close.colour.id } })).toBe(1);
  });

  it('categories: tree, reserved links, cycles, depth, garment type inheritance, archive only when empty', async () => {
    const polo = await createGarmentType(deps(), sys(), {
      nameEn: 'Polo',
      nameBn: 'পোলো',
      measurementFields: [{ key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' }],
    });
    const top = await createCategory(deps(), sys(), { nameEn: 'Polos', nameBn: 'পোলো', garmentTypeId: polo.id });
    const sub = await createCategory(deps(), sys(), { nameEn: 'Pique polos', parentId: top.id });
    expect(sub.depth).toBe(2);
    expect(sub.pathEn).toEqual(['Polos', 'Pique polos']);
    expect(sub.url).toBe('/pique-polos');
    expect(sub.effectiveGarmentType).toMatchObject({ id: polo.id, inherited: true });
    expect(await code(createCategory(deps(), sys(), { nameEn: 'Checkout', slug: 'checkout' }))).toBe('SLUG_RESERVED');
    expect(await code(createCategory(deps(), sys(), { nameEn: 'Polos again', slug: 'polos' }))).toBe('SLUG_TAKEN');
    expect(await code(updateCategory(deps(), sys(), top.id, { parentId: sub.id }))).toBe('CATEGORY_CYCLE');
    overrides.set('catalogue.categoryMaxDepth', 2);
    expect(await code(createCategory(deps(), sys(), { nameEn: 'Deep', parentId: sub.id }))).toBe('CATEGORY_TOO_DEEP');
    overrides.delete('catalogue.categoryMaxDepth');
    expect(await code(updateCategory(deps(), sys(), top.id, { archived: true }))).toBe('CATEGORY_NOT_EMPTY');

    // a changed category link forwards from the old one
    const moved = await updateCategory(deps(), sys(), sub.id, { slug: 'pique' });
    expect(moved.url).toBe('/pique');
    const r = await t.prisma.redirect.findUnique({ where: { storeId_fromPath: { storeId: A, fromPath: '/pique-polos' } } });
    expect(r).toMatchObject({ toPath: '/pique', enabled: true, statusCode: 301, source: 'category-slug' });
    expect(await code(createCategory(deps(), sys(), { nameEn: 'Pique polos' }))).toBe('SLUG_TAKEN');

    const tree = await categoryTree(deps(), sys());
    expect(tree.map((n) => n.slug)).toEqual(['polos']);
    expect(tree[0]!.children.map((n) => n.slug)).toEqual(['pique']);
    expect((await categoryTree(deps(), sys(B))).length).toBe(0);
    expect(await code(getCategory(deps(), sys(B), top.id))).toBe('NOT_FOUND');
  });

  it('fabrics: structured composition from the dictionaries; GSM optional', async () => {
    const f = await createFabric(deps(), sys(), {
      nameEn: 'Cotton piqué',
      composition: { fibres: [{ fibre: 'cotton', share: 100 }], construction: 'pique', care: ['machine-wash-cold'], features: [] },
    });
    expect(f.gsm).toBeNull();
    expect(f.composition?.fibres).toEqual([{ fibre: 'cotton', share: 100 }]);
    expect(await code(createFabric(deps(), sys(), { nameEn: 'Blend', composition: { fibres: [{ fibre: 'cotton', share: 50 }, { fibre: 'unobtainium', share: 50 }] } }))).toBe('UNKNOWN_KEY');
    expect(await code(createFabric(deps(), sys(), { nameEn: 'Half', composition: { fibres: [{ fibre: 'cotton', share: 50 }] } }))).toBe('INVALID_INPUT');
    expect(await code(createFabric(deps(), sys(), { nameEn: 'cotton PIQUÉ' }))).toBe('NAME_TAKEN');
    const g = await updateFabric(deps(), sys(), f.id, { gsm: 220 });
    expect(g.gsm).toBe(220);
  });

  it('products and variants: the ERP SKU is the key; prices need their own permission; the summary follows', async () => {
    const own = await createBrand(deps(), sys(), { name: 'Sample Label', isOwnLabel: true });
    expect(await code(createBrand(deps(), sys(), { name: 'Second Label', isOwnLabel: true }))).toBe('CONFLICT');
    const lacoste = await createBrand(deps(), sys(), { name: 'Lacoste' });
    const cat = (await categoryTree(deps(), sys()))[0]!;
    const fabric = (await t.prisma.fabric.findFirstOrThrow({ where: { storeId: A, nameEn: 'Cotton piqué' } })).id;
    const p = await createProduct(deps(), sys(), { nameEn: 'Classic Polo', categoryId: cat.id, fabricId: fabric, erpStyleCode: 'ST-100' });
    expect(p.status).toBe('DRAFT');
    expect(p.slug).toBe('sample-label-classic-polo');
    expect(p.brand).toMatchObject({ id: own.id, source: 'ownLabel' });
    expect(p.garmentType?.key).toBe('polo');
    expect(await t.prisma.categoryProduct.count({ where: { productId: p.id, categoryId: cat.id, isVisible: false } })).toBe(1);

    const navy = (await findColour(deps(), sys(), 'navy'))!;
    const m = await createSize(deps(), sys(), { label: 'M', erpSizeCode: '02' });
    const l = await createSize(deps(), sys(), { label: 'L' });
    expect(await code(createVariant(deps(), sys(), { sku: 'bad sku', productId: p.id, colourId: navy.id, sizeId: m.id }))).toBe('SKU_FORMAT');
    const v1 = await createVariant(deps(), sys(), { sku: 'ST-100-NV-M', productId: p.id, colourId: navy.id, sizeId: m.id, priceMinor: 145000 });
    expect(v1.active).toBe(true);
    // the colour went onto the product by itself
    expect((await getProduct(deps(), sys(), p.id)).colours.map((c) => c.key)).toEqual(['navy']);
    expect(await code(createVariant(deps(), sys(), { sku: 'ST-100-NV-M', productId: p.id, colourId: navy.id, sizeId: l.id }))).toBe('SKU_TAKEN');
    expect(await code(createVariant(deps(), sys(), { sku: 'ST-100-NV-M2', productId: p.id, colourId: navy.id, sizeId: m.id }))).toBe('VARIANT_EXISTS');
    expect(await code(createVariant(deps(), sys(), { sku: 'ST-100-NV-L', productId: p.id, colourId: navy.id, sizeId: l.id, priceMinor: 150000, compareAtMinor: 140000 }))).toBe('INVALID_INPUT');
    expect(await code(createVariant(deps(), { actor: editor, storeId: A }, { sku: 'ST-100-NV-L', productId: p.id, colourId: navy.id, sizeId: l.id, priceMinor: 150000 }))).toBe('FORBIDDEN');
    const v2 = await createVariant(deps(), { actor: editor, storeId: A }, { sku: 'ST-100-NV-L', productId: p.id, colourId: navy.id, sizeId: l.id });
    expect(v2.priceMinor).toBeNull();
    expect(await code(updateVariant(deps(), { actor: editor, storeId: A }, v2.id, { priceMinor: 100 }))).toBe('FORBIDDEN');
    expect(await code(updateVariant(deps(), { actor: editor, storeId: A }, v2.id, { weightGrams: 250 }))).toBe('ok');

    await t.prisma.productVariant.update({ where: { id: v1.id }, data: { inStock: true } });
    await updateVariant(deps(), sys(), v1.id, { priceMinor: 139000, compareAtMinor: 145000 });
    const prices = await t.prisma.priceHistory.findMany({ where: { variantId: v1.id }, orderBy: { createdAt: 'asc' } });
    expect(prices.map((x) => [x.priceMinor, x.compareAtMinor])).toEqual([
      [145000, null],
      [139000, 145000],
    ]);
    const after = await getProduct(deps(), sys(), p.id);
    expect([after.inStock, after.minPriceMinor]).toEqual([true, 139000]);
    expect(await t.prisma.categoryProduct.findFirst({ where: { productId: p.id }, select: { inStock: true, priceMinor: true } })).toEqual({ inStock: true, priceMinor: 139000 });

    // a colour with live variants cannot come off the product; a size with live variants cannot be archived
    expect(await code(setProductColours(deps(), sys(), p.id, { colours: [] }))).toBe('COLOUR_IN_USE');
    expect(await code(updateSize(deps(), sys(), m.id, { archived: true }))).toBe('CONFLICT');
    expect(await code(updateBrand(deps(), sys(), own.id, { archived: true }))).toBe('ok');
    await updateBrand(deps(), sys(), own.id, { archived: false });

    // retire: the SKU is never given to another garment; the same garment may come back
    await updateVariant(deps(), sys(), v2.id, { archived: true });
    expect(await code(createVariant(deps(), sys(), { sku: 'ST-100-NV-L', productId: p.id, colourId: navy.id, sizeId: l.id }))).toBe('SKU_RETIRED');
    expect(await code(upsertVariantBySku(deps(), sys(), { sku: 'ST-100-NV-L', productId: p.id, colourId: navy.id, sizeId: m.id }))).toBe('SKU_RETIRED');
    const back = await upsertVariantBySku(deps(), sys(), { sku: 'ST-100-NV-L', productId: p.id, colourId: navy.id, sizeId: l.id, weightGrams: 260 });
    expect([back.created, back.variant.archived, back.variant.weightGrams]).toEqual([false, false, 260]);
    expect((await variantBySku(deps(), sys(), 'ST-100-NV-M'))?.id).toBe(v1.id);
    expect(await variantBySku(deps(), sys(B), 'ST-100-NV-M')).toBeNull();

    // brand: a real brand field
    const lp = await updateProduct(deps(), sys(), p.id, { brandId: lacoste.id });
    expect(lp.brand).toMatchObject({ name: 'Lacoste', source: 'product' });
    const listed = await listProducts(deps(), sys(), { q: 'st-100-nv' });
    expect(listed.items.map((i) => i.id)).toEqual([p.id]);
    expect(await code(updateProduct(deps(), sys(), p.id, { archived: true }))).toBe('ok');
    expect((await listProducts(deps(), sys())).items.find((i) => i.id === p.id)).toBeUndefined();
    await updateProduct(deps(), sys(), p.id, { archived: false });

    const facts = await productFacts(deps(), sys(), p.id, 'bn');
    expect(facts.colours.map((c) => c.name)).toEqual(['নেভি']);
    expect(facts.sizes).toEqual(['M', 'L']);
    expect(facts.fabricLine).toContain('100%');
    expect(facts.fabricLine).toContain('220');
  });

  it('naming: a changed link forwards (301) with no chains, and every rename is kept', async () => {
    const p = (await listProducts(deps(), sys(), { q: 'Classic Polo' })).items[0]!;
    const first = p.slug;
    const r1 = await saveNaming(deps(), sys(), p.id, { slug: 'navy-polo', seoTitleEn: 'Navy polo for summer' });
    expect(r1.moved).toMatchObject({ from: `/p/${first}`, to: '/p/navy-polo' });
    expect(r1.view.seoTitle.en).toMatchObject({ value: 'Navy polo for summer', source: 'own' });
    clock = new Date(clock.getTime() + 60_000);
    const r2 = await saveNaming(deps(), sys(), p.id, { slug: 'summer-polo', nameEn: 'Summer Polo' });
    expect(r2.moved?.repointed).toBe(1);
    const redirects = await t.prisma.redirect.findMany({ where: { storeId: A, source: 'product-slug' }, orderBy: { fromPath: 'asc' } });
    expect(redirects.map((r) => [r.fromPath, r.toPath, r.enabled])).toEqual([
      ['/p/navy-polo', '/p/summer-polo', true],
      [`/p/${first}`, '/p/summer-polo', true],
    ]);
    // the old link resolves straight to the product page
    expect(await resolveProductPath(t.prisma, settings, A, `/p/${first}`, { countHit: true })).toEqual({ kind: 'redirect', to: '/p/summer-polo', statusCode: 301 });
    expect(await resolveProductPath(t.prisma, settings, A, '/P/Summer-Polo/')).toMatchObject({ kind: 'product', productId: p.id });
    expect(await resolveProductPath(t.prisma, settings, B, '/p/summer-polo')).toBeNull();
    // going back to an old link of the same product switches that forward off (it is in use again)
    await saveNaming(deps(), sys(), p.id, { slug: 'navy-polo' });
    const back = await t.prisma.redirect.findMany({ where: { storeId: A, source: 'product-slug' }, orderBy: { fromPath: 'asc' } });
    expect(back.map((r) => [r.fromPath, r.toPath, r.enabled])).toEqual([
      ['/p/navy-polo', '/p/summer-polo', false],
      [`/p/${first}`, '/p/navy-polo', true],
      ['/p/summer-polo', '/p/navy-polo', true],
    ]);
    // another product may not take a link that forwards elsewhere
    const other = await createProduct(deps(), sys(), { nameEn: 'Oxford Shirt' });
    expect(await code(saveNaming(deps(), sys(), other.id, { slug: 'summer-polo' }))).toBe('SLUG_TAKEN');
    expect(await code(saveNaming(deps(), sys(), other.id, { slug: 'navy-polo' }))).toBe('SLUG_TAKEN');
    expect(await code(saveNaming(deps(), sys(), other.id, { slug: 'Not A Slug' }))).toBe('INVALID_INPUT');

    const renames = await listRenames(deps(), sys(), { productId: p.id });
    expect(renames.length).toBe(3);
    expect(renames[1]).toMatchObject({ oldName: 'Classic Polo', newName: 'Summer Polo', oldSlug: 'navy-polo', newSlug: 'summer-polo' });
    const report = await renameReport(deps(), sys(), renames[0]!.id);
    expect(report.windowDays).toBe(14);
    expect(report.before.visits).toBeNull();
    // PR 155: always both figures, by the one KPI definition (Sales = delivered only; Ordered value beside it).
    expect(report.after.ordered).toEqual({ orders: 0, units: 0, valueMinor: 0 });
    expect(report.after.sales).toEqual({ orders: 0, units: 0, valueMinor: 0 });
    expect(await t.prisma.auditLog.count({ where: { entityType: 'Product', entityId: p.id, action: 'product.rename' } })).toBe(3);

    // the draft preview (nothing saved)
    const pv = await previewNaming(deps(), sys(), { productId: p.id, slug: 'new-polo-link' });
    expect(pv.redirect).toEqual({ from: '/p/navy-polo', to: '/p/new-polo-link' });
    expect(pv.google.title).toBe('Navy polo for summer');
    expect((await namingView(deps(), sys(), p.id)).slug).toBe('navy-polo');
    const fresh = await previewNaming(deps(), sys(), { nameEn: 'Linen Panjabi' });
    expect(fresh.view.slug).toBe('sample-label-linen-panjabi');
    expect(fresh.slugProblem).toBeNull();

    // the other-brand note is off by default and never blocks
    expect((await namingView(deps(), sys(), other.id)).warnings).toEqual([]);
    overrides.set('naming.otherBrandWarning', true);
    const warned = await saveNaming(deps(), sys(), other.id, { nameEn: 'Ralph Lauren style Oxford Shirt' });
    expect(warned.view.warnings.find((w) => w.field === 'name')?.brands).toEqual(['Ralph Lauren']);
    overrides.delete('naming.otherBrandWarning');
  });

  it('manual redirects follow to the end, never loop, and are switched off rather than deleted', async () => {
    const r = await createRedirect(deps(), sys(), { fromPath: 'https://old.example/Product/Old-Polo/?ref=fb', toPath: '/p/summer-polo' });
    expect(r).toMatchObject({ fromPath: '/product/old-polo', toPath: '/p/navy-polo', source: 'manual', enabled: true });
    expect(await code(createRedirect(deps(), sys(), { fromPath: '/p/navy-polo', toPath: '/polos' }))).toBe('SLUG_TAKEN');
    expect(await code(createRedirect(deps(), sys(), { fromPath: '/a', toPath: '/a/' }))).toBe('CONFLICT');
    const off = await updateRedirect(deps(), sys(), r.id, { enabled: false });
    expect(off.enabled).toBe(false);
    expect((await listRedirects(deps(), sys(), { includeDisabled: true })).some((x) => x.id === r.id)).toBe(true);
    expect((await listRedirects(deps(), sys())).some((x) => x.id === r.id)).toBe(false);
  });

  it('template apply and bulk rename: preview first, apply exactly what was previewed', async () => {
    const prev = await previewTemplateApply(deps(), sys(), { fields: ['feedTitle', 'seoTitle'], mode: 'empty' });
    expect(prev.changes.length).toBeGreaterThan(0);
    expect(prev.changes.every((c) => c.from === '')).toBe(true);
    expect(prev.changes.some((c) => c.field === 'seoTitle.en' && c.productName === 'Summer Polo')).toBe(false);
    const done = await applyTemplate(deps(), sys(), { fields: ['feedTitle', 'seoTitle'], mode: 'empty' }, prev.hash);
    expect(done.applied).toBe(prev.changes.length);
    expect(await code(applyTemplate(deps(), sys(), { fields: ['feedTitle', 'seoTitle'], mode: 'empty' }, prev.hash))).toBe('PREVIEW_CHANGED');

    const bulk = await previewBulkRename(deps(), sys(), { find: 'polo', replace: 'Polo Shirt', relink: true });
    const names = bulk.changes.filter((c) => c.field === 'nameEn');
    expect(names.map((c) => c.to)).toEqual(['Summer Polo Shirt']);
    expect(bulk.changes.find((c) => c.field === 'slug')?.to).toBe('lacoste-summer-polo-shirt');
    overrides.set('naming.bulkMaxChanges', 1);
    const small = await previewBulkRename(deps(), sys(), { find: 'polo', replace: 'Polo Shirt', relink: true });
    expect(small.tooMany).toBe(true);
    expect(await code(applyBulkRename(deps(), sys(), { find: 'polo', replace: 'Polo Shirt', relink: true }, small.hash))).toBe('TOO_MANY_CHANGES');
    overrides.delete('naming.bulkMaxChanges');
    const applied = await applyBulkRename(deps(), sys(), { find: 'polo', replace: 'Polo Shirt', relink: true }, bulk.hash);
    expect(applied).toMatchObject({ products: 1, redirects: 1, renames: 1 });
    expect(await code(applyBulkRename(deps(), { actor: viewer, storeId: A }, { find: 'x', replace: 'y' }, bulk.hash))).toBe('FORBIDDEN');
  });

  it('the real settings resolver serves the catalogue', async () => {
    const resolver = new SettingsResolver(prismaBackend(t.prisma), registry);
    const view = await namingView({ db: t.prisma, settings: resolver }, sys(), (await listProducts(deps(), sys())).items[0]!.id);
    expect(view.path.startsWith('/p/')).toBe(true);
  });
});
