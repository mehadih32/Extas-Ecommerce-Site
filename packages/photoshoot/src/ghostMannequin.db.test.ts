// S24 · PR 446 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a ghost-mannequin output
// through PR 444's `recordGeneratedAsset` chokepoint, the C7.6 hard rule actually enforced for a back view, reuse
// lookup, and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findExistingGhostMannequinOutput, GHOST_MANNEQUIN_TAG, recordGhostMannequinOutput } from './ghostMannequin';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 446 · ghost-mannequin engine (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_ghost');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t446-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t446-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role },
    });
  }

  it('records a front view, tagged ghost_mannequin, linked back to the real flat-lay', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const out = await recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'front', storageKey: 'test/ghost-front.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'b'.repeat(64) });
    expect(out.view).toBe('front');
    expect(out.role).toBe('front_reference');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(flat.id);
    expect(out.tags).toContain(GHOST_MANNEQUIN_TAG);
  });

  it('refuses a back view with no backReferenceAssetId at all', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    await expect(
      recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'back', storageKey: 'test/ghost-back-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('C7.6 hard rule: refuses a back view whose named back reference is missing, foreign-store, generated or archived', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    await expect(
      recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'back', backReferenceAssetId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_BACK_REFERENCE' });

    const notBack = await makeOriginal('front_reference');
    await expect(
      recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'back', backReferenceAssetId: notBack.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_BACK_REFERENCE' });

    const archivedBack = await t.prisma.mediaAsset.update({ where: { id: (await makeOriginal('back_reference')).id }, data: { archivedAt: new Date() } });
    await expect(
      recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'back', backReferenceAssetId: archivedBack.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_BACK_REFERENCE' });
  });

  it('a real, non-archived back_reference on file lets the back view through', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const back = await makeOriginal('back_reference');
    const out = await recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'back', backReferenceAssetId: back.id, storageKey: 'test/ghost-back-ok.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: '1'.repeat(64) });
    expect(out.role).toBe('back_reference');
    expect(out.tags).toContain(GHOST_MANNEQUIN_TAG);
    // the real back reference itself is untouched (PR 444's immutability guarantee carries through)
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: back.id } });
    expect(row.isOriginal).toBe(true);
    expect(row.archivedAt).toBeNull();
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    await expect(
      recordGhostMannequinOutput(d, reader, { sourceAssetId: flat.id, view: 'front', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findExistingGhostMannequinOutput reuses the newest matching output, and is null until one exists', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    expect(await findExistingGhostMannequinOutput(d, reader, flat.id, 'front')).toBeNull();
    const first = await recordGhostMannequinOutput(d, writer, { sourceAssetId: flat.id, view: 'front', storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) });
    const found = await findExistingGhostMannequinOutput(d, reader, flat.id, 'front');
    expect(found?.id).toBe(first.id);
    // a plain generated front_reference with no ghost_mannequin tag (e.g. straight from an on-model job) never counts
    const untagged = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/not-ghost.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '4'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: flat.id, role: 'front_reference', tags: [] },
    });
    const stillFirst = await findExistingGhostMannequinOutput(d, reader, flat.id, 'front');
    expect(stillFirst?.id).not.toBe(untagged.id);
  });
});
