// S24 · PR 466 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a footwear product-only
// studio output through PR 444's `recordGeneratedAsset` chokepoint, C7.12's "never invent" hard rule actually
// enforced for every angle (not just one), reuse lookup, and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findExistingFootwearStudioOutput, FOOTWEAR_STUDIO_TAG, recordFootwearStudioOutput } from './footwearStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 466 · footwear / product-only studio engine (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_footwear');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t466-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t466-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null, overrides: { archivedAt?: Date | null } = {}, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role, archivedAt: overrides.archivedAt ?? null },
    });
  }

  it('records a sole studio image, tagged footwear_product_only_studio, linked back to the real sole reference', async () => {
    const d = deps();
    const sole = await makeOriginal('sole_reference');
    const out = await recordFootwearStudioOutput(d, writer, { sourceAssetId: sole.id, angle: 'sole', storageKey: 'test/footwear-sole.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'b'.repeat(64) });
    expect(out.angle).toBe('sole');
    expect(out.role).toBe('sole_reference');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(sole.id);
    expect(out.tags).toContain(FOOTWEAR_STUDIO_TAG);
  });

  it('C7.12 hard rule: refuses an angle whose named source is missing, foreign-role, generated or archived', async () => {
    const d = deps();
    await expect(
      recordFootwearStudioOutput(d, writer, { sourceAssetId: '00000000-0000-0000-0000-000000000000', angle: 'top', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_FOOTWEAR_REFERENCE' });

    const wrongAngle = await makeOriginal('side_reference');
    await expect(
      recordFootwearStudioOutput(d, writer, { sourceAssetId: wrongAngle.id, angle: 'top', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_FOOTWEAR_REFERENCE' });

    const archivedTop = await makeOriginal('top_reference', { archivedAt: new Date() });
    await expect(
      recordFootwearStudioOutput(d, writer, { sourceAssetId: archivedTop.id, angle: 'top', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_FOOTWEAR_REFERENCE' });

    const top = await makeOriginal('top_reference');
    const generatedTop = await recordFootwearStudioOutput(d, writer, { sourceAssetId: top.id, angle: 'top', storageKey: 'test/gen-top.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) });
    await expect(
      recordFootwearStudioOutput(d, writer, { sourceAssetId: generatedTop.id, angle: 'top', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_FOOTWEAR_REFERENCE' });
  });

  it('a real, non-archived reference of the matching angle lets every one of the six angles through', async () => {
    const d = deps();
    const back = await makeOriginal('back_reference');
    const out = await recordFootwearStudioOutput(d, writer, { sourceAssetId: back.id, angle: 'back', storageKey: 'test/footwear-back-ok.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: '1'.repeat(64) });
    expect(out.role).toBe('back_reference');
    expect(out.tags).toContain(FOOTWEAR_STUDIO_TAG);
    // the real reference itself is untouched (PR 444's immutability guarantee carries through)
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: back.id } });
    expect(row.isOriginal).toBe(true);
    expect(row.archivedAt).toBeNull();
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const sole = await makeOriginal('sole_reference');
    await expect(
      recordFootwearStudioOutput(d, reader, { sourceAssetId: sole.id, angle: 'sole', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findExistingFootwearStudioOutput reuses the newest matching output, and is null until one exists', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    expect(await findExistingFootwearStudioOutput(d, reader, detail.id, 'detail')).toBeNull();
    const first = await recordFootwearStudioOutput(d, writer, { sourceAssetId: detail.id, angle: 'detail', storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) });
    const found = await findExistingFootwearStudioOutput(d, reader, detail.id, 'detail');
    expect(found?.id).toBe(first.id);
    // a plain generated detail_reference with no footwear-studio tag (e.g. straight from Detail Finder) never counts
    const untagged = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/not-footwear.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '4'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: detail.id, role: 'detail_reference', tags: [] },
    });
    const stillFirst = await findExistingFootwearStudioOutput(d, reader, detail.id, 'detail');
    expect(stillFirst?.id).not.toBe(untagged.id);
  });
});
