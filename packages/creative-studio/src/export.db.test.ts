// S25 · PR 487 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): campaign creative export, part 1.
// Requesting an export from a real, non-archived product/SKU/category of this store that already has at least one
// approved image to export from (SOURCE_INVALID otherwise), refusing a request that names none (SELECTION_EMPTY) or
// more than one (INVALID_INPUT), checking an optional campaign/brief is real (NOT_FOUND), listing exports newest
// first, and cancelling a still-DRAFT one (never deleted).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { cancelCreativeExport, listCreativeExports, requestCreativeExport, StudioError, type StudioDeps, type Who } from './index';

describe.skipIf(!HAS_TEST_DB)('PR 487 · campaign creative export, part 1 (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let sd: StudioDeps;

  beforeAll(async () => {
    t = await createTestDatabase('creative_studio_export');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't487-writer', nameEn: 'writer', nameBn: 'writer', permissions: ['marketing.studio.read', 'marketing.studio.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't487-writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { actor: { staffUserId: u.id }, storeId: S };
    sd = { db: t.prisma };
  });

  afterAll(async () => t.drop());

  const makeCategory = () => t.prisma.category.create({ data: { storeId: S, slug: `cat-${randomUUID()}`, nameEn: 'Polo' } });
  const makeProduct = (categoryId?: string) => t.prisma.product.create({ data: { storeId: S, slug: `prod-${randomUUID()}`, nameEn: 'Solid polo', categoryId } });
  const makeAsset = (kind: 'IMAGE' | 'VIDEO' = 'IMAGE') =>
    t.prisma.mediaAsset.create({ data: { storeId: S, kind, storage: 'LOCAL_DISK', storageKey: `studio/${randomUUID()}`, mimeType: kind === 'IMAGE' ? 'image/jpeg' : 'video/mp4', bytes: BigInt(1000), checksumSha256: randomUUID() } });
  const attachMedia = async (productId: string, colourId: string | null = null) => {
    const asset = await makeAsset();
    return t.prisma.productMedia.create({ data: { storeId: S, productId, assetId: asset.id, colourId, role: 'FRONT' } });
  };
  const makeColour = () => t.prisma.colour.create({ data: { storeId: S, key: `colour-${randomUUID()}`, nameEn: 'Navy', hex: '#223344' } });
  const makeVariant = (productId: string, colourId: string | null = null) => t.prisma.productVariant.create({ data: { storeId: S, productId, colourId, sku: `SKU-${randomUUID()}` } });

  it('requests an export for a product with an approved image, DRAFT, no outputs yet', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    const exp = await requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1', 'meta-4x5'] });
    expect(exp.status).toBe('DRAFT');
    expect(exp.selection).toEqual({ productId: product.id, variantId: null, categoryId: null });
    expect(exp.sizes).toEqual(['meta-1x1', 'meta-4x5']);
    expect(exp.outputAssetIds).toEqual([]);
    expect(exp.withOverlay).toBe(false);
    expect(exp.sentToAdAccountId).toBeNull();
  });

  it('refuses a request naming no product, SKU or category (SELECTION_EMPTY)', async () => {
    await expect(requestCreativeExport(sd, writer, { selection: {}, sizes: ['meta-1x1'] })).rejects.toMatchObject({ code: 'SELECTION_EMPTY' satisfies StudioError['code'] });
  });

  it('refuses a request naming more than one of product/SKU/category (INVALID_INPUT)', async () => {
    const product = await makeProduct();
    const category = await makeCategory();
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id, categoryId: category.id }, sizes: ['meta-1x1'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses a product id that does not exist or is not this store’s (NOT_FOUND)', async () => {
    await expect(requestCreativeExport(sd, writer, { selection: { productId: randomUUID() }, sizes: ['meta-1x1'] })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['selection', 'productId'] });
  });

  it('refuses a product with no approved image or video yet (SOURCE_INVALID)', async () => {
    const product = await makeProduct();
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1'] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('a SKU (variant) selection counts the product’s shared media and its own colour’s media', async () => {
    const product = await makeProduct();
    const colour = await makeColour();
    const variant = await makeVariant(product.id, colour.id);
    await attachMedia(product.id, null); // shared across colours
    const exp = await requestCreativeExport(sd, writer, { selection: { variantId: variant.id }, sizes: ['tiktok-9x16'] });
    expect(exp.selection).toEqual({ productId: null, variantId: variant.id, categoryId: null });
  });

  it('refuses a SKU whose product has only a different colour’s media (SOURCE_INVALID)', async () => {
    const product = await makeProduct();
    const [colour, otherColour] = await Promise.all([makeColour(), makeColour()]);
    const variant = await makeVariant(product.id, colour.id);
    await attachMedia(product.id, otherColour.id); // a different colour only
    await expect(requestCreativeExport(sd, writer, { selection: { variantId: variant.id }, sizes: ['tiktok-9x16'] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses a SKU id that does not exist (NOT_FOUND)', async () => {
    await expect(requestCreativeExport(sd, writer, { selection: { variantId: randomUUID() }, sizes: ['meta-1x1'] })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['selection', 'variantId'] });
  });

  it('a category selection counts any of its products’ approved media', async () => {
    const category = await makeCategory();
    const product = await makeProduct(category.id);
    await attachMedia(product.id);
    const exp = await requestCreativeExport(sd, writer, { selection: { categoryId: category.id }, sizes: ['google-1.91x1'] });
    expect(exp.selection).toEqual({ productId: null, variantId: null, categoryId: category.id });
  });

  it('refuses a category with no product that has an approved image yet (SOURCE_INVALID)', async () => {
    const category = await makeCategory();
    await makeProduct(category.id); // no media
    await expect(requestCreativeExport(sd, writer, { selection: { categoryId: category.id }, sizes: ['google-1.91x1'] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses a category id that does not exist (NOT_FOUND)', async () => {
    await expect(requestCreativeExport(sd, writer, { selection: { categoryId: randomUUID() }, sizes: ['meta-1x1'] })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['selection', 'categoryId'] });
  });

  it('refuses the same size chosen twice, or none at all (INVALID_INPUT)', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1', 'meta-1x1'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses a malformed landing URL (INVALID_INPUT)', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1'], landingUrl: 'not a url' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('accepts a real landing URL, withOverlay and a real campaign of this store', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    const campaign = await t.prisma.campaign.create({ data: { storeId: S, name: 'Eid flash sale' } });
    const exp = await requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-9x16'], withOverlay: true, landingUrl: 'https://new.extas.com.bd/p/solid-polo', campaignId: campaign.id });
    expect(exp.withOverlay).toBe(true);
    expect(exp.landingUrl).toBe('https://new.extas.com.bd/p/solid-polo');
    expect(exp.campaignId).toBe(campaign.id);
  });

  it('refuses a campaign id that does not exist or is not this store’s (NOT_FOUND)', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1'], campaignId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['campaignId'] });
  });

  it('refuses a creative brief id that does not exist (NOT_FOUND)', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    await expect(requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1'], briefId: randomUUID() })).rejects.toMatchObject({ code: 'NOT_FOUND', details: ['briefId'] });
  });

  it('lists exports newest first', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    const first = await requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1'] });
    const second = await requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-4x5'] });
    const list = await listCreativeExports(sd, S);
    const ids = list.map((e) => e.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
  });

  it('cancels a still-DRAFT export without deleting it, and refuses to cancel twice (WRONG_STATE)', async () => {
    const product = await makeProduct();
    await attachMedia(product.id);
    const exp = await requestCreativeExport(sd, writer, { selection: { productId: product.id }, sizes: ['meta-1x1'] });
    const cancelled = await cancelCreativeExport(sd, writer, exp.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.id).toBe(exp.id); // the same row, never a new one — nothing was deleted
    const list = await listCreativeExports(sd, S);
    expect(list.some((e) => e.id === exp.id)).toBe(true); // still listed, not removed
    await expect(cancelCreativeExport(sd, writer, exp.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('refuses an export id that does not exist (NOT_FOUND)', async () => {
    await expect(cancelCreativeExport(sd, writer, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
