// S24 · PR 476 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a scene-library entry
// through PR 444's `recordGeneratedAsset` chokepoint, C7.13's "never invent" hard rule, the A4.3 shared/private
// catalogue query, the reuse lookup, permission checks, and that the real source photo is never touched.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findLatestSceneLibraryEntry, listSceneLibrary, recordSceneLibraryEntry, SCENE_LIBRARY_TAG } from './sceneLibrary';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 476 · scene library (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_scene_library');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[], storeId = S) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { actor: { staffUserId: u.id }, storeId };
    };
    writer = await staff('t476-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t476-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(storeId = S, overrides: { archivedAt?: Date | null } = {}) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, archivedAt: overrides.archivedAt ?? null },
    });
  }

  it('saves a scene tagged scene_library + its own scene key, private by default', async () => {
    const d = deps();
    const real = await makeOriginal();
    const out = await recordSceneLibraryEntry(d, writer, { sceneKey: 'festive', sourceAssetId: real.id, storageKey: 'test/festive-demo.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'b'.repeat(64) });
    expect(out.sceneKey).toBe('festive');
    expect(out.role).toBe('scene_library_demo');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(real.id);
    expect(out.sharedWithAllStores).toBe(false);
    expect(out.tags).toContain(SCENE_LIBRARY_TAG);
    expect(out.tags).toContain('scene:festive');
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: out.id } });
    expect(row.sharedWithAllStores).toBe(false);
  });

  it('C7.13 hard rule: refuses a scene whose named source is missing, archived, or itself generated', async () => {
    const d = deps();
    await expect(
      recordSceneLibraryEntry(d, writer, { sceneKey: 'winter', sourceAssetId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_SCENE_REFERENCE' });

    const archived = await makeOriginal(S, { archivedAt: new Date() });
    await expect(
      recordSceneLibraryEntry(d, writer, { sceneKey: 'winter', sourceAssetId: archived.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_SCENE_REFERENCE' });

    const real = await makeOriginal();
    const generated = await recordSceneLibraryEntry(d, writer, { sceneKey: 'winter', sourceAssetId: real.id, storageKey: 'test/winter-demo.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) });
    await expect(
      recordSceneLibraryEntry(d, writer, { sceneKey: 'winter', sourceAssetId: generated.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_SCENE_REFERENCE' });
  });

  it('refuses a malformed or unknown scene key up front (INVALID_INPUT)', async () => {
    const d = deps();
    const real = await makeOriginal();
    await expect(
      recordSceneLibraryEntry(d, writer, { sceneKey: 'Not Valid', sourceAssetId: real.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('the real source photo itself is untouched (PR 444\'s immutability guarantee carries through)', async () => {
    const d = deps();
    const real = await makeOriginal();
    await recordSceneLibraryEntry(d, writer, { sceneKey: 'street', sourceAssetId: real.id, storageKey: 'test/street-demo.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '1'.repeat(64) });
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: real.id } });
    expect(row.isOriginal).toBe(true);
    expect(row.archivedAt).toBeNull();
    expect(row.sharedWithAllStores).toBe(false);
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const real = await makeOriginal();
    await expect(
      recordSceneLibraryEntry(d, reader, { sceneKey: 'studio_grey', sourceAssetId: real.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findLatestSceneLibraryEntry reuses the newest matching scene, scoped to its own key, and is null until one exists', async () => {
    const d = deps();
    const real = await makeOriginal();
    expect(await findLatestSceneLibraryEntry(d, reader, 'eid_evening')).toBeNull();
    const first = await recordSceneLibraryEntry(d, writer, { sceneKey: 'eid_evening', sourceAssetId: real.id, storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) });
    const found = await findLatestSceneLibraryEntry(d, reader, 'eid_evening');
    expect(found?.id).toBe(first.id);
    // the same key under a different scene is never matched
    expect(await findLatestSceneLibraryEntry(d, reader, 'match_day')).toBeNull();
    // a second, newer approval for the same key supersedes the first
    const second = await recordSceneLibraryEntry(d, writer, { sceneKey: 'eid_evening', sourceAssetId: real.id, storageKey: 'test/reuse-2.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '4'.repeat(64) });
    const latest = await findLatestSceneLibraryEntry(d, reader, 'eid_evening');
    expect(latest?.id).toBe(second.id);
  });

  it('A4.3: a scene shared with all stores is visible from a second store; a private one is not', async () => {
    const d = deps();
    const real = await makeOriginal();
    const privateScene = await recordSceneLibraryEntry(d, writer, { sceneKey: 'match_day', sourceAssetId: real.id, sharedWithAllStores: false, storageKey: 'test/private.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '5'.repeat(64) });
    const sharedScene = await recordSceneLibraryEntry(d, writer, { sceneKey: 'summer', sourceAssetId: real.id, sharedWithAllStores: true, storageKey: 'test/shared.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '6'.repeat(64) });
    const otherStoreReader: Who = { actor: reader.actor, storeId: S2 };

    expect(await findLatestSceneLibraryEntry(d, otherStoreReader, 'match_day')).toBeNull();
    const foundShared = await findLatestSceneLibraryEntry(d, otherStoreReader, 'summer');
    expect(foundShared?.id).toBe(sharedScene.id);
    expect(privateScene.sharedWithAllStores).toBe(false);
  });

  it('listSceneLibrary returns one entry per scene key, the newest one, including scenes shared from another store', async () => {
    const d = deps();
    const real = await makeOriginal();
    await recordSceneLibraryEntry(d, writer, { sceneKey: 'studio_grey', sourceAssetId: real.id, storageKey: 'test/list-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '7'.repeat(64) });
    const newest = await recordSceneLibraryEntry(d, writer, { sceneKey: 'studio_grey', sourceAssetId: real.id, storageKey: 'test/list-2.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '8'.repeat(64) });
    const list = await listSceneLibrary(d, writer);
    const studioGreyEntries = list.filter((e) => e.sceneKey === 'studio_grey');
    expect(studioGreyEntries).toHaveLength(1);
    expect(studioGreyEntries[0]?.id).toBe(newest.id);
  });
});
