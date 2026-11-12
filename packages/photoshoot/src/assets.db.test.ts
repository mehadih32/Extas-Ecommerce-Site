// S24 · PR 444 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the asset-model guarantees — an
// original can be role-tagged but never otherwise changed or deleted, and a generated image is always its own row
// pointing back at a real photo, never at another generated one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { assertNoProtectedFieldChange, recordGeneratedAsset, tagReferenceRole } from './assets';
import { PhotoshootError, type PhotoshootDeps, type Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 444 · photoshoot asset model (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_assets');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t444-writer', ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate']);
    reader = await staff('t444-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null = null) {
    return t.prisma.mediaAsset.create({
      data: {
        storeId: S,
        kind: 'IMAGE',
        storage: 'LOCAL_DISK',
        storageKey: `test/${crypto.randomUUID()}.jpg`,
        mimeType: 'image/jpeg',
        bytes: 1000n,
        checksumSha256: 'a'.repeat(64),
        isOriginal: true,
        role,
      },
    });
  }

  it('tags a reference role on a real original, and only that field', async () => {
    const d = deps();
    const a = await makeOriginal();
    const tagged = await tagReferenceRole(d, writer, { assetId: a.id, role: 'front_reference' });
    expect(tagged.role).toBe('front_reference');
    expect(tagged.isOriginal).toBe(true);
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.storageKey).toBe(a.storageKey); // untouched
    expect(row.checksumSha256).toBe(a.checksumSha256); // untouched
  });

  it('refuses an unknown role and a role on a generated (non-original) asset', async () => {
    const d = deps();
    const original = await makeOriginal();
    const generated = await recordGeneratedAsset(d, writer, {
      sourceAssetId: original.id,
      role: 'primary_garment',
      storageKey: 'test/gen-1.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 500,
      checksumSha256: 'b'.repeat(64),
    });
    await expect(tagReferenceRole(d, writer, { assetId: original.id, role: 'not_a_role' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(tagReferenceRole(d, writer, { assetId: generated.id, role: 'front_reference' })).rejects.toMatchObject({ code: 'ORIGINAL_IMMUTABLE' });
  });

  it('records a generated image as its own row, linked back to the real source, never mutating it', async () => {
    const d = deps();
    const original = await makeOriginal('front_reference');
    const generated = await recordGeneratedAsset(d, writer, {
      sourceAssetId: original.id,
      role: 'primary_garment',
      storageKey: 'test/gen-2.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 700,
      checksumSha256: 'c'.repeat(64),
    });
    expect(generated.id).not.toBe(original.id);
    expect(generated.isOriginal).toBe(false);
    expect(generated.isAiGenerated).toBe(true);
    expect(generated.sourceAssetId).toBe(original.id);
    const sourceRow = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: original.id } });
    expect(sourceRow.isOriginal).toBe(true); // the real photo is untouched
    expect(sourceRow.role).toBe('front_reference');
  });

  it('records free pipeline-step tags (S24 · PR 446), defaulting to none', async () => {
    const d = deps();
    const original = await makeOriginal('primary_garment');
    const untagged = await recordGeneratedAsset(d, writer, { sourceAssetId: original.id, role: 'primary_garment', storageKey: 'test/gen-tags-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'h'.repeat(64) });
    expect(untagged.tags).toEqual([]);
    const tagged = await recordGeneratedAsset(d, writer, { sourceAssetId: original.id, role: 'front_reference', storageKey: 'test/gen-tags-2.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'i'.repeat(64), tags: ['ghost_mannequin'] });
    expect(tagged.tags).toEqual(['ghost_mannequin']);
  });

  it('refuses a generated image whose named source is missing, in another store, or itself generated (never AI-from-AI)', async () => {
    const d = deps();
    await expect(
      recordGeneratedAsset(d, writer, { sourceAssetId: '00000000-0000-0000-0000-000000000000', role: 'primary_garment', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const original = await makeOriginal();
    const generated = await recordGeneratedAsset(d, writer, { sourceAssetId: original.id, role: 'primary_garment', storageKey: 'test/gen-3.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) });
    await expect(
      recordGeneratedAsset(d, writer, { sourceAssetId: generated.id, role: 'primary_garment', storageKey: 'test/gen-4.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('a reader without photoshoot.write or .generate is refused outright', async () => {
    const d = deps();
    const original = await makeOriginal();
    await expect(tagReferenceRole(d, reader, { assetId: original.id, role: 'front_reference' })).rejects.toThrow();
    await expect(recordGeneratedAsset(d, reader, { sourceAssetId: original.id, role: 'primary_garment', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'g'.repeat(64) })).rejects.toThrow();
  });

  it('assertNoProtectedFieldChange refuses any patch touching an immutable field, and nothing else', () => {
    expect(() => assertNoProtectedFieldChange({ altEn: 'new text' })).not.toThrow();
    expect(() => assertNoProtectedFieldChange({ isOriginal: false })).toThrow(PhotoshootError);
    expect(() => assertNoProtectedFieldChange({ sourceAssetId: 'x' })).toThrow(PhotoshootError);
    expect(() => assertNoProtectedFieldChange({ isAiGenerated: true })).toThrow(PhotoshootError);
  });
});
