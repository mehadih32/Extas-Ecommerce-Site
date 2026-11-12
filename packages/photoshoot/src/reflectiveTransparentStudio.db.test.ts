// S24 · PR 473 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a reflective/transparent
// studio output through PR 444's `recordGeneratedAsset` chokepoint, C7.12's "never invent" hard rule, reuse
// lookup, permission checks, and that the original real photo is never touched.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findExistingReflectiveTransparentOutput, recordReflectiveTransparentOutput, REFLECTIVE_TRANSPARENT_PIPELINE_STAGES, REFLECTIVE_TRANSPARENT_STUDIO_TAG } from './reflectiveTransparentStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 473 · reflective/transparent engine (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_reflective_transparent');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t473-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t473-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null, overrides: { archivedAt?: Date | null } = {}, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role, archivedAt: overrides.archivedAt ?? null },
    });
  }

  it('records a perfume studio output tagged reflective_transparent_studio + the family key + every pipeline stage', async () => {
    const d = deps();
    const real = await makeOriginal('reflective_reference');
    const out = await recordReflectiveTransparentOutput(d, writer, { family: 'perfume', sourceAssetId: real.id, storageKey: 'test/perfume-clean.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'b'.repeat(64) });
    expect(out.family).toBe('perfume');
    expect(out.role).toBe('reflective_reference');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(real.id);
    expect(out.tags).toContain(REFLECTIVE_TRANSPARENT_STUDIO_TAG);
    expect(out.tags).toContain('perfume');
    for (const stage of REFLECTIVE_TRANSPARENT_PIPELINE_STAGES) expect(out.tags).toContain(stage);
  });

  it('C7.12 hard rule: refuses an output whose named source is missing, foreign-role, generated or archived', async () => {
    const d = deps();
    await expect(
      recordReflectiveTransparentOutput(d, writer, { family: 'watch_glass', sourceAssetId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_REFLECTIVE_REFERENCE' });

    const wrongRole = await makeOriginal('front_reference');
    await expect(
      recordReflectiveTransparentOutput(d, writer, { family: 'watch_glass', sourceAssetId: wrongRole.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_REFLECTIVE_REFERENCE' });

    const archived = await makeOriginal('reflective_reference', { archivedAt: new Date() });
    await expect(
      recordReflectiveTransparentOutput(d, writer, { family: 'watch_glass', sourceAssetId: archived.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_REFLECTIVE_REFERENCE' });

    const real = await makeOriginal('reflective_reference');
    const generated = await recordReflectiveTransparentOutput(d, writer, { family: 'watch_glass', sourceAssetId: real.id, storageKey: 'test/watch-glass-clean.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) });
    await expect(
      recordReflectiveTransparentOutput(d, writer, { family: 'watch_glass', sourceAssetId: generated.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_REFLECTIVE_REFERENCE' });
  });

  it('the real reference photo itself is untouched (PR 444\'s immutability guarantee carries through)', async () => {
    const d = deps();
    const real = await makeOriginal('reflective_reference');
    await recordReflectiveTransparentOutput(d, writer, { family: 'sunglass_lens', sourceAssetId: real.id, storageKey: 'test/lens-clean.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '1'.repeat(64) });
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: real.id } });
    expect(row.isOriginal).toBe(true);
    expect(row.archivedAt).toBeNull();
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const real = await makeOriginal('reflective_reference');
    await expect(
      recordReflectiveTransparentOutput(d, reader, { family: 'perfume', sourceAssetId: real.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findExistingReflectiveTransparentOutput reuses the newest matching output, scoped to its own family, and is null until one exists', async () => {
    const d = deps();
    const real = await makeOriginal('reflective_reference');
    expect(await findExistingReflectiveTransparentOutput(d, reader, real.id, 'perfume')).toBeNull();
    const first = await recordReflectiveTransparentOutput(d, writer, { family: 'perfume', sourceAssetId: real.id, storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) });
    const found = await findExistingReflectiveTransparentOutput(d, reader, real.id, 'perfume');
    expect(found?.id).toBe(first.id);
    // the same real photo recorded under a different family is never matched
    expect(await findExistingReflectiveTransparentOutput(d, reader, real.id, 'watch_glass')).toBeNull();
    // a plain generated reflective_reference with no reflective_transparent_studio tag never counts
    const untagged = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/not-reflective-studio.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '4'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: real.id, role: 'reflective_reference', tags: [] },
    });
    const stillFirst = await findExistingReflectiveTransparentOutput(d, reader, real.id, 'perfume');
    expect(stillFirst?.id).not.toBe(untagged.id);
  });
});
