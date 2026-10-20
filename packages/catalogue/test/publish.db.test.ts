// PR 21, 26, 29, 35 on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL): the publish
// checklist and health score, the gate that keeps a half-done product off the shop, the queue, bulk actions, the
// product form save in order, the admin list, and permissions/store isolation.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, SYSTEM, syncAuth, type Actor } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import {
  adminProductList,
  bulkProducts,
  checkProduct,
  createCategory,
  createColour,
  createFabric,
  createGarmentType,
  createProduct,
  createSize,
  createVariant,
  getProduct,
  healthBand,
  healthScore,
  productReadiness,
  productStock,
  publishProduct,
  publishQueue,
  saveProductForm,
  suggestSku,
  unpublishProduct,
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
async function details(p: Promise<unknown>): Promise<string[]> {
  try {
    await p;
    return [];
  } catch (e) {
    return (e as { details?: string[] }).details ?? [];
  }
}

describe('health score (pure)', () => {
  it('is the share of the weights that pass; bands colour it', () => {
    const w = registry['catalogue.health.weights'].default;
    expect(healthScore([{ key: 'photos', ok: false }, { key: 'price', ok: true }], w)).toBe(Math.round((w.price / (w.price + w.photos)) * 100));
    expect(healthScore([], w)).toBe(100);
    expect(healthBand(100, { good: 100, fair: 60 })).toBe('good');
    expect(healthBand(60, { good: 100, fair: 60 })).toBe('fair');
    expect(healthBand(59, { good: 100, fair: 60 })).toBe('poor');
  });
  it('suggests an SKU only when every token has a value', () => {
    expect(suggestSku('{style}-{colour}-{size}', { style: 'plo pq', colour: 'navy', size: 'xl' })).toBe('PLO-PQ-NAVY-XL');
    expect(suggestSku('{style}-{colour}-{size}', { style: null, colour: 'navy', size: 'xl' })).toBe('');
  });
});

describe.skipIf(!HAS_TEST_DB)('publishing on PostgreSQL (PR 21, 26, 29, 35)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  const clock = new Date('2026-10-20T08:00:00Z');
  const overrides = new Map<string, unknown>([['store.name', 'Sample Shop']]);
  const settings: SettingsReader = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides.has(key) ? overrides.get(key) : registry[key].default) as Value<K>;
    },
  };
  const deps = (): CatalogueDeps => ({ db: t.prisma, settings, now: () => clock });
  const sys = (storeId = A): Who => ({ actor: SYSTEM, storeId });
  let editor: Actor;
  let publisher: Actor;
  let catId = '';
  let fabricId = '';
  let navy = '';
  let black = '';
  let sizeM = '';
  let sizeL = '';
  let n = 0;

  const asset = async (storeId = A) =>
    (
      await t.prisma.mediaAsset.create({
        data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `media/s${storeId}/o/test-${++n}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: `sum-${n}` },
      })
    ).id;
  const photoSet = async (productId: string) => {
    for (const role of ['FRONT', 'BACK', 'DETAIL', 'ON_MODEL'] as const) await t.prisma.productMedia.create({ data: { storeId: A, productId, assetId: await asset(), role } });
  };
  /** A product with everything but what the test leaves out. */
  const full = async (name: string, opts: { photos?: boolean; price?: boolean; fabric?: boolean } = {}) => {
    const p = await createProduct(deps(), sys(), { nameEn: name, categoryId: catId, fabricId: opts.fabric === false ? null : fabricId, erpStyleCode: `ST-${++n}`, descriptionEn: 'A plain sample garment.' });
    await createVariant(deps(), sys(), { sku: `ST-${n}-NV-M`, productId: p.id, colourId: navy, sizeId: sizeM, priceMinor: opts.price === false ? null : 120000 });
    if (opts.photos !== false) await photoSet(p.id);
    return p.id;
  };

  beforeAll(async () => {
    t = await createTestDatabase('publish');
    [A, B] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (email: string, perms: ('catalogue.read' | 'catalogue.write' | 'catalogue.publish' | 'catalogue.prices')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key: email.split('@')[0]!, nameEn: email, nameBn: email, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email, displayName: email, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: A } });
      return { staffUserId: u.id };
    };
    editor = await staff('editor@example.com', ['catalogue.read', 'catalogue.write']);
    publisher = await staff('publisher@example.com', ['catalogue.read', 'catalogue.write', 'catalogue.publish']);
    const gt = await createGarmentType(deps(), sys(), { nameEn: 'Polo', nameBn: 'পোলো', measurementFields: [{ key: 'chest', labelEn: 'Chest', labelBn: 'বুক', unit: 'inch' }] });
    catId = (await createCategory(deps(), sys(), { nameEn: 'Polos', garmentTypeId: gt.id })).id;
    fabricId = (await createFabric(deps(), sys(), { nameEn: 'Cotton pique', composition: { fibres: [{ fibre: 'cotton', share: 100 }], construction: 'pique', care: [], features: [] } })).id;
    navy = (await createColour(deps(), sys(), { nameEn: 'Navy', hex: '#1B2A4A' })).colour.id;
    black = (await createColour(deps(), sys(), { nameEn: 'Black', hex: '#111111' })).colour.id;
    sizeM = (await createSize(deps(), sys(), { label: 'M' })).id;
    sizeL = (await createSize(deps(), sys(), { label: 'L' })).id;
    const chart = await t.prisma.sizeChart.create({ data: { storeId: A, garmentTypeId: gt.id, name: 'Polo regular', columns: [], rows: [] } });
    await t.prisma.sizeChartAssignment.create({ data: { storeId: A, sizeChartId: chart.id, categoryId: catId } });
  });
  afterAll(async () => t?.drop());

  it('upload-time block: a new draft lists exactly what is missing (PR 26), the score counts it (PR 29)', async () => {
    const p = await createProduct(deps(), sys(), { nameEn: 'Bare polo' });
    const r = await productReadiness(deps(), sys(), p.id);
    expect(r.ready).toBe(false);
    expect(r.blocking).toEqual(['category', 'variants', 'price', 'photos', 'sizeChart', 'fabric']);
    expect(r.reminders).toEqual(['description', 'stock']);
    expect(r.checks.find((c) => c.key === 'photos')?.details).toEqual(['FRONT', 'BACK', 'DETAIL', 'ON_MODEL', 'count:0/4']);
    // SEO comes from the shop's templates, so it is already filled
    expect(r.checks.find((c) => c.key === 'seo')?.ok).toBe(true);
    expect(r.score).toBe(healthScore(r.checks, registry['catalogue.health.weights'].default));
    expect(r.band).toBe('poor');
  });

  it('the size chart comes from the product or its category; a garment type without measurements needs none', async () => {
    const id = await full('Chart polo');
    expect((await productReadiness(deps(), sys(), id)).sizeChart).toMatchObject({ name: 'Polo regular', via: 'category' });
    const acc = await createGarmentType(deps(), sys(), { nameEn: 'Accessory', nameBn: 'অ্যাক্সেসরি', measurementFields: [] });
    const caps = await createCategory(deps(), sys(), { nameEn: 'Caps', garmentTypeId: acc.id });
    const cap = await createProduct(deps(), sys(), { nameEn: 'Cap', categoryId: caps.id });
    const r = await productReadiness(deps(), sys(), cap.id);
    expect(r.checks.find((c) => c.key === 'sizeChart')?.ok).toBe(true);
    expect(r.sizeChart).toBeNull();
  });

  it('nothing reaches the shop until the checklist passes; publish needs catalogue.publish (PR 35)', async () => {
    const id = await full('Gate polo', { photos: false });
    expect(await code(publishProduct(deps(), { actor: editor, storeId: A }, id))).toBe('FORBIDDEN');
    expect(await details(publishProduct(deps(), { actor: publisher, storeId: A }, id))).toEqual(['photos']);
    expect((await getProduct(deps(), sys(), id)).status).toBe('DRAFT');
    expect(await t.prisma.categoryProduct.count({ where: { productId: id, isVisible: true } })).toBe(0);
    await photoSet(id);
    const checked = await checkProduct(deps(), sys(), id);
    expect(checked.ready).toBe(true);
    expect(checked.status).toBe('READY_TO_PUBLISH');
    const pub = await publishProduct(deps(), { actor: publisher, storeId: A }, id);
    expect(pub.status).toBe('PUBLISHED');
    expect(await t.prisma.categoryProduct.count({ where: { productId: id, isVisible: true } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { entityId: id, action: 'product.publish', storeId: A } })).toBe(1);
    expect(await t.prisma.publishQueueItem.count({ where: { productId: id, status: 'OPEN' } })).toBe(0);
    expect(await t.prisma.publishQueueItem.count({ where: { productId: id, status: 'DONE' } })).toBeGreaterThan(0);
    // the health is stored for the list
    const row = await t.prisma.product.findUniqueOrThrow({ where: { id } });
    expect(row.healthScore).toBe(checked.score);
  });

  it('unpublish hides the listings, keeps the page and queues it; a live product that starts failing is flagged, not taken off', async () => {
    const id = await full('Off polo');
    await publishProduct(deps(), sys(), id);
    // a photo taken off after publishing: flagged in the queue, still on the shop (the owner decides)
    await t.prisma.productMedia.updateMany({ where: { productId: id, role: 'BACK' }, data: { archivedAt: clock } });
    const r = await checkProduct(deps(), sys(), id);
    expect(r.status).toBe('PUBLISHED');
    expect(await t.prisma.publishQueueItem.findFirst({ where: { productId: id, status: 'OPEN' } })).toMatchObject({ reason: 'live-failing' });
    const off = await unpublishProduct(deps(), sys(), id);
    expect(off.status).toBe('UNPUBLISHED');
    expect(await t.prisma.categoryProduct.count({ where: { productId: id, isVisible: true } })).toBe(0);
    expect(await t.prisma.product.count({ where: { id, archivedAt: null } })).toBe(1);
    const open = await t.prisma.publishQueueItem.findMany({ where: { productId: id, status: 'OPEN' } });
    expect(open.map((o) => o.reason)).toEqual(['unpublished']);
    expect(await code(unpublishProduct(deps(), sys(), id))).toBe('CONFLICT');
  });

  it('the queue lists every product not on the shop, checks the unchecked ones first, and filters ready / waiting / live', async () => {
    const ready = await full('Queue ready polo');
    const waiting = await full('Queue waiting polo', { price: false });
    // made without the form: never checked
    expect(await t.prisma.publishQueueItem.count({ where: { productId: { in: [ready, waiting] } } })).toBe(0);
    const q = await publishQueue(deps(), sys());
    const mine = q.items.filter((i) => [ready, waiting].includes(i.productId));
    expect(mine.map((i) => [i.nameEn, i.ready, i.reason])).toEqual([
      ['Queue ready polo', true, 'new'],
      ['Queue waiting polo', false, 'new'],
    ]);
    expect(mine[1]!.checks.find((c) => c.key === 'price')?.details).toEqual([expect.stringMatching(/^sku:ST-\d+-NV-M$/)]);
    const r = await publishQueue(deps(), sys(), { filter: 'ready' });
    expect(r.items.some((i) => i.productId === waiting)).toBe(false);
    expect(r.counts.ready).toBe(r.total);
    expect(q.counts.all).toBe(q.counts.ready + q.counts.waiting + q.counts.live);
  });

  it('bulk: each product on its own, refusals reported, archive only off the shop, at most the setting', async () => {
    const good = await full('Bulk good polo');
    const bad = await full('Bulk bad polo', { fabric: false });
    const res = await bulkProducts(deps(), { actor: publisher, storeId: A }, { action: 'publish', productIds: [good, bad] });
    expect(res).toMatchObject({ done: 1, failed: 1 });
    expect(res.results.find((r) => r.productId === bad)).toMatchObject({ ok: false, error: 'CHECKLIST_FAILED', details: ['fabric'] });
    const arch = await bulkProducts(deps(), sys(), { action: 'archive', productIds: [good, bad] });
    expect(arch.results.find((r) => r.productId === good)).toMatchObject({ ok: false, error: 'CONFLICT' });
    expect(arch.results.find((r) => r.productId === bad)).toMatchObject({ ok: true });
    expect(await t.prisma.product.count({ where: { id: bad } })).toBe(1);
    expect(await t.prisma.publishQueueItem.count({ where: { productId: bad, status: 'OPEN' } })).toBe(0);
    expect(await code(bulkProducts(deps(), { actor: editor, storeId: A }, { action: 'unpublish', productIds: [good] }))).toBe('FORBIDDEN');
    overrides.set('catalogue.bulk.maxProducts', 1);
    expect(await code(bulkProducts(deps(), sys(), { action: 'recheck', productIds: [good, bad] }))).toBe('TOO_MANY_CHANGES');
    overrides.delete('catalogue.bulk.maxProducts');
  });

  it('a check switched off is not counted; a check set to warn no longer blocks', async () => {
    const id = await full('Setting polo', { fabric: false });
    overrides.set('catalogue.publish.checks', { ...registry['catalogue.publish.checks'].default, fabric: 'warn' });
    const r = await productReadiness(deps(), sys(), id);
    expect(r.ready).toBe(true);
    expect(r.reminders).toContain('fabric');
    overrides.set('catalogue.publish.checks', { ...registry['catalogue.publish.checks'].default, fabric: 'off' });
    expect((await productReadiness(deps(), sys(), id)).checks.some((c) => c.key === 'fabric')).toBe(false);
    overrides.delete('catalogue.publish.checks');
  });

  it('the form saves in order through the services; prices need catalogue.prices; a refusal names its step', async () => {
    const id = await full('Form polo');
    const v = (await getProduct(deps(), sys(), id)).variants[0]!;
    const out = await saveProductForm(deps(), sys(), id, {
      product: { descriptionEn: 'Changed text.' },
      naming: { nameEn: 'Form polo two' },
      colours: [navy, black],
      create: [{ sku: 'FORM-BK-L', colourId: black, sizeId: sizeL, priceMinor: 130000 }],
    });
    expect(out.saved).toEqual(['product', 'naming', 'colours', 'create']);
    expect(out.product.nameEn).toBe('Form polo two');
    expect(out.product.colours.map((c) => c.colourId)).toEqual([navy, black]);
    expect(out.product.variants.map((x) => x.sku).sort()).toEqual(['FORM-BK-L', v.sku].sort());
    // an editor without catalogue.prices cannot move a price; the steps before are kept and named
    const d = await details(saveProductForm(deps(), { actor: editor, storeId: A }, id, { product: { descriptionEn: 'Again.' }, variants: [{ id: v.id, patch: { priceMinor: 99000 } }] }));
    expect(d).toEqual(expect.arrayContaining(['step:variants', 'saved:product']));
    expect((await getProduct(deps(), sys(), id)).descriptionEn).toBe('Again.');
    // retire = archived, never deleted; then the colour can go
    const retired = await saveProductForm(deps(), sys(), id, { retire: [out.product.variants.find((x) => x.sku === 'FORM-BK-L')!.id], colours: [navy] });
    expect(retired.saved).toEqual(['retire', 'colours']);
    expect(await t.prisma.productVariant.count({ where: { sku: 'FORM-BK-L', archivedAt: { not: null } } })).toBe(1);
    // another product's variant is refused
    const other = await full('Other polo');
    const ov = (await getProduct(deps(), sys(), other)).variants[0]!;
    expect(await code(saveProductForm(deps(), sys(), id, { retire: [ov.id] }))).toBe('NOT_FOUND');
  });

  it('the admin list: search by name, colour or SKU, status filter, counters, stock per variant', async () => {
    const id = await full('Listed navy polo');
    await checkProduct(deps(), sys(), id);
    const loc = await t.prisma.inventoryLocation.create({
      data: { code: 'L1', name: 'Shelf', kind: 'WAREHOUSE', warehouse: { create: { code: 'W1', name: 'Warehouse' } } },
    });
    const v = (await getProduct(deps(), sys(), id)).variants[0]!;
    await t.prisma.stockLevel.create({ data: { variantId: v.id, locationId: loc.id, onHand: 2, available: 2 } });
    expect(await productStock(deps(), sys(), id)).toEqual({ [v.id]: 2 });
    const l = await adminProductList(deps(), sys(), { q: 'listed navy' });
    expect(l.items.map((i) => i.id)).toEqual([id]);
    expect(l.items[0]).toMatchObject({ stockPieces: 2, sizes: ['M'], categoryPathEn: ['Polos'], thumbAssetId: expect.any(String) });
    expect((await adminProductList(deps(), sys(), { q: v.sku })).items.map((i) => i.id)).toContain(id);
    expect((await adminProductList(deps(), sys(), { status: 'ready' })).items.every((i) => i.status === 'READY_TO_PUBLISH')).toBe(true);
    expect(l.counts.lowStockSizes).toBeGreaterThanOrEqual(1);
    expect(l.counts.products).toBeGreaterThan(5);
    // another store sees none of it
    expect((await adminProductList(deps(), sys(B))).total).toBe(0);
    expect(await code(productReadiness(deps(), sys(B), id))).toBe('NOT_FOUND');
  });
});
