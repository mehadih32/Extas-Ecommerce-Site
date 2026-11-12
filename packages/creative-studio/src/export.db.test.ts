// S25 · PR 487 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the campaign creative export's
// selection step. Off while `studio.creativeExport.enabled` is off; a selection resolves to the live products it
// covers (product/SKU/category) and refuses `SELECTION_EMPTY` when nothing live or nothing approved is found.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { archiveCreativeExport, previewCreativeExportSelection, requestCreativeExport, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 487 · campaign creative export selection (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let overrides: Record<string, unknown> = {};

  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides[key] ?? registry[key].default) as Value<K>;
    },
  };
  const deps = (): StudioDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('creative_studio_export');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't487-writer', nameEn: 'writer', nameBn: 'writer', permissions: ['marketing.studio.read', 'marketing.studio.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't487-writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { actor: { staffUserId: u.id }, storeId: S };
  });

  afterAll(async () => t.drop());

  async function productWithPhoto(categoryId?: string) {
    const product = await t.prisma.product.create({ data: { storeId: S, slug: `ce-${randomUUID()}`, nameEn: 'Sample Polo', categoryId } });
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: randomUUID() } });
    await t.prisma.productMedia.create({ data: { storeId: S, productId: product.id, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    return { productId: product.id, assetId: asset.id };
  }

  it('is OFF while studio.creativeExport.enabled is off (CN-018: off by default)', async () => {
    overrides = {};
    const { productId } = await productWithPhoto();
    await expect(requestCreativeExport(deps(), writer, { selection: { kind: 'product', productId }, sizes: ['meta_1_1'] })).rejects.toMatchObject({ code: 'OFF' });
  });

  it('previews a selection without writing anything', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const { productId } = await productWithPhoto();
    const preview = await previewCreativeExportSelection(deps(), S, { kind: 'product', productId });
    expect(preview).toEqual({ productCount: 1, assetCount: 1 });
    const rows = await t.prisma.creativeExport.findMany({ where: { storeId: S } });
    expect(rows.length).toBe(0);
  });

  it('refuses SELECTION_EMPTY for a product with no live photo yet', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const product = await t.prisma.product.create({ data: { storeId: S, slug: `ce-nophoto-${randomUUID()}`, nameEn: 'No Photo' } });
    await expect(requestCreativeExport(deps(), writer, { selection: { kind: 'product', productId: product.id }, sizes: ['meta_1_1'] })).rejects.toMatchObject({ code: 'SELECTION_EMPTY' });
  });

  it('refuses SELECTION_EMPTY for an unknown category', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    await expect(requestCreativeExport(deps(), writer, { selection: { kind: 'category', categoryId: randomUUID() }, sizes: ['meta_1_1'] })).rejects.toMatchObject({ code: 'SELECTION_EMPTY' });
  });

  it('gathers every live photo of a whole category selection', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const category = await t.prisma.category.create({ data: { storeId: S, slug: `ce-cat-${randomUUID()}`, nameEn: 'Polos' } });
    await productWithPhoto(category.id);
    await productWithPhoto(category.id);
    const row = await requestCreativeExport(deps(), writer, { selection: { kind: 'category', categoryId: category.id }, sizes: ['meta_1_1', 'tiktok_9_16'] });
    expect(row.productCount).toBe(2);
    expect(row.assetCount).toBe(2);
    expect(row.status).toBe('DRAFT');
    expect(row.sizes).toEqual(['meta_1_1', 'tiktok_9_16']);
  });

  it('resolves a SKU selection to its own product', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const { productId } = await productWithPhoto();
    const variant = await t.prisma.productVariant.create({ data: { storeId: S, productId, sku: `CE-${randomUUID()}` } });
    const row = await requestCreativeExport(deps(), writer, { selection: { kind: 'sku', skuId: variant.id }, sizes: ['google_1_91_1'] });
    expect(row.productCount).toBe(1);
  });

  it('refuses NOT_FOUND for a campaignId that names no campaign of this store', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const { productId } = await productWithPhoto();
    await expect(requestCreativeExport(deps(), writer, { campaignId: randomUUID(), selection: { kind: 'product', productId }, sizes: ['meta_1_1'] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('links a real campaign when campaignId is given', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const { productId } = await productWithPhoto();
    const campaign = await t.prisma.campaign.create({ data: { storeId: S, name: 'Eid flash sale' } });
    const row = await requestCreativeExport(deps(), writer, { campaignId: campaign.id, selection: { kind: 'product', productId }, sizes: ['meta_1_1'] });
    expect(row.campaignId).toBe(campaign.id);
  });

  it('sets aside a DRAFT export, refuses a second time (WRONG_STATE), 404s an unknown id', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const { productId } = await productWithPhoto();
    const row = await requestCreativeExport(deps(), writer, { selection: { kind: 'product', productId }, sizes: ['meta_1_1'] });
    const cancelled = await archiveCreativeExport(deps(), writer, row.id);
    expect(cancelled.status).toBe('CANCELLED');
    await expect(archiveCreativeExport(deps(), writer, row.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
    await expect(archiveCreativeExport(deps(), writer, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses INVALID_INPUT for an empty sizes list', async () => {
    overrides = { 'studio.creativeExport': { enabled: true } };
    const { productId } = await productWithPhoto();
    await expect(requestCreativeExport(deps(), writer, { selection: { kind: 'product', productId }, sizes: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
