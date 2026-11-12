// S24 · PR 472 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a worn-accessory studio
// output through PR 444's `recordGeneratedAsset` chokepoint, C7.12's "never invent" hard rule, the mandatory
// detail-reprojection gate for sunglasses/watches/bags (never caps), reuse lookup, and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findExistingWornAccessoryOutput, recordWornAccessoryOutput, WORN_ACCESSORY_STUDIO_TAG } from './wornAccessoryStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 472 · worn-accessory engine (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_worn_accessory');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate' | 'photoshoot.approve')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t472-writer', ['photoshoot.read', 'photoshoot.generate', 'photoshoot.approve']);
    reader = await staff('t472-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null, overrides: { archivedAt?: Date | null } = {}, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role, archivedAt: overrides.archivedAt ?? null },
    });
  }

  async function approvedRegion(productId: string, assetId: string) {
    const region = await t.prisma.detailRegion.create({ data: { storeId: S, productId, assetId, kind: 'logo', bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, detectedBy: 'manual', approved: false } });
    return t.prisma.detailRegion.update({ where: { id: region.id }, data: { approved: true } });
  }

  it('records a cap worn studio image (no mandatory gate) tagged worn_accessory_studio + the family key', async () => {
    const d = deps();
    const worn = await makeOriginal('worn_reference');
    const out = await recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'worn', sourceAssetId: worn.id, storageKey: 'test/cap-worn.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'b'.repeat(64) });
    expect(out.family).toBe('caps');
    expect(out.view).toBe('worn');
    expect(out.role).toBe('worn_reference');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(worn.id);
    expect(out.tags).toContain(WORN_ACCESSORY_STUDIO_TAG);
    expect(out.tags).toContain('caps');
  });

  it('C7.12 hard rule: refuses a view whose named source is missing, foreign-role, generated or archived', async () => {
    const d = deps();
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_WORN_ACCESSORY_REFERENCE' });

    const wrongView = await makeOriginal('worn_reference');
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: wrongView.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_WORN_ACCESSORY_REFERENCE' });

    const archivedFlat = await makeOriginal('front_reference', { archivedAt: new Date() });
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: archivedFlat.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_WORN_ACCESSORY_REFERENCE' });

    const flat = await makeOriginal('front_reference');
    const generatedFlat = await recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: flat.id, storageKey: 'test/gen-flat.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) });
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: generatedFlat.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_WORN_ACCESSORY_REFERENCE' });
  });

  it('C7.12 "mandatory for these families": watches/sunglasses/bags refuse with no approved detail region on file', async () => {
    const d = deps();
    const productId = crypto.randomUUID();
    const watchWorn = await makeOriginal('worn_reference');
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'watches', view: 'worn', sourceAssetId: watchWorn.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '1'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'DETAIL_REPROJECTION_REQUIRED' });

    const sunglassesWorn = await makeOriginal('worn_reference');
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'sunglasses', view: 'worn', sourceAssetId: sunglassesWorn.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'DETAIL_REPROJECTION_REQUIRED' });

    const bagFlat = await makeOriginal('front_reference');
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'bags', view: 'flat', sourceAssetId: bagFlat.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'DETAIL_REPROJECTION_REQUIRED' });

    // once an approved region exists on that exact reference photo, the same watch output goes through
    await approvedRegion(productId, watchWorn.id);
    const out = await recordWornAccessoryOutput(d, writer, { family: 'watches', view: 'worn', sourceAssetId: watchWorn.id, storageKey: 'test/watch-worn-ok.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '4'.repeat(64) });
    expect(out.family).toBe('watches');
    expect(out.tags).toContain(WORN_ACCESSORY_STUDIO_TAG);
  });

  it('a cap is never gated by the mandatory-reprojection rule, even with no detail region on file at all', async () => {
    const d = deps();
    const capFlat = await makeOriginal('front_reference');
    const out = await recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: capFlat.id, storageKey: 'test/cap-flat-ok.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '5'.repeat(64) });
    expect(out.family).toBe('caps');
    // the real reference itself is untouched (PR 444's immutability guarantee carries through)
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: capFlat.id } });
    expect(row.isOriginal).toBe(true);
    expect(row.archivedAt).toBeNull();
  });

  it('an unapproved detail region on the reference photo still refuses a mandatory family', async () => {
    const d = deps();
    const productId = crypto.randomUUID();
    const bagWorn = await makeOriginal('worn_reference');
    await t.prisma.detailRegion.create({ data: { storeId: S, productId, assetId: bagWorn.id, kind: 'logo', bbox: { x: 0, y: 0, width: 0.1, height: 0.1 }, detectedBy: 'manual', approved: false } });
    await expect(
      recordWornAccessoryOutput(d, writer, { family: 'bags', view: 'worn', sourceAssetId: bagWorn.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '6'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'DETAIL_REPROJECTION_REQUIRED' });
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const worn = await makeOriginal('worn_reference');
    await expect(
      recordWornAccessoryOutput(d, reader, { family: 'caps', view: 'worn', sourceAssetId: worn.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '7'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findExistingWornAccessoryOutput reuses the newest matching output, scoped to its own family, and is null until one exists', async () => {
    const d = deps();
    const flat = await makeOriginal('front_reference');
    expect(await findExistingWornAccessoryOutput(d, reader, flat.id, 'caps', 'flat')).toBeNull();
    const first = await recordWornAccessoryOutput(d, writer, { family: 'caps', view: 'flat', sourceAssetId: flat.id, storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '8'.repeat(64) });
    const found = await findExistingWornAccessoryOutput(d, reader, flat.id, 'caps', 'flat');
    expect(found?.id).toBe(first.id);
    // a plain generated front_reference with no worn-accessory tag (e.g. a plain flat-lay render) never counts
    const untagged = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/not-worn-accessory.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '9'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: flat.id, role: 'front_reference', tags: [] },
    });
    const stillFirst = await findExistingWornAccessoryOutput(d, reader, flat.id, 'caps', 'flat');
    expect(stillFirst?.id).not.toBe(untagged.id);
  });
});
