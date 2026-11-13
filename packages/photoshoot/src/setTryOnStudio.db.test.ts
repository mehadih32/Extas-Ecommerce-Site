// S24 · PR 478 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a set try-on output
// through PR 444's `recordGeneratedAsset` chokepoint, C7.13's "never invent one half of a set" hard rule (both
// components, both sides), reuse lookup, and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findExistingSetTryOnOutput, recordSetTryOnOutput, SET_TRY_ON_STUDIO_TAG } from './setTryOnStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 478 · set try-on engine, part 2 (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_set_try_on');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate' | 'photoshoot.approve')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t478-writer', ['photoshoot.read', 'photoshoot.generate', 'photoshoot.approve']);
    reader = await staff('t478-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null, overrides: { archivedAt?: Date | null } = {}, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role, archivedAt: overrides.archivedAt ?? null },
    });
  }

  it('records a front set try-on image tagged set_try_on_studio + the angle + both component tags', async () => {
    const d = deps();
    const top = await makeOriginal('front_reference');
    const bottom = await makeOriginal('primary_garment');
    const out = await recordSetTryOnOutput(d, writer, {
      angle: 'front',
      topSourceAssetId: top.id,
      bottomSourceAssetId: bottom.id,
      storageKey: 'test/set-front.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 500,
      checksumSha256: 'b'.repeat(64),
    });
    expect(out.angle).toBe('front');
    expect(out.role).toBe('set_try_on');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(top.id);
    expect(out.topSourceAssetId).toBe(top.id);
    expect(out.bottomSourceAssetId).toBe(bottom.id);
    expect(out.tags).toContain(SET_TRY_ON_STUDIO_TAG);
    expect(out.tags).toContain('front');
    expect(out.tags).toContain(`component:top:${top.id}`);
    expect(out.tags).toContain(`component:bottom:${bottom.id}`);
  });

  it('records a back set try-on image only once BOTH components have a real back_reference', async () => {
    const d = deps();
    const topBack = await makeOriginal('back_reference');
    const bottomBack = await makeOriginal('back_reference');
    const out = await recordSetTryOnOutput(d, writer, {
      angle: 'back',
      topSourceAssetId: topBack.id,
      bottomSourceAssetId: bottomBack.id,
      storageKey: 'test/set-back.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 500,
      checksumSha256: 'c'.repeat(64),
    });
    expect(out.angle).toBe('back');
    expect(out.role).toBe('set_try_on');
  });

  it('C7.13 hard rule: refuses when either component is missing, wrong-role, archived or itself generated, naming each by position', async () => {
    const d = deps();
    const goodTop = await makeOriginal('front_reference');
    const goodBottom = await makeOriginal('front_reference');

    // bottom missing entirely
    await expect(
      recordSetTryOnOutput(d, writer, {
        angle: 'front',
        topSourceAssetId: goodTop.id,
        bottomSourceAssetId: '00000000-0000-0000-0000-000000000000',
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: 'd'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NO_SET_COMPONENT_REFERENCE', details: ['bottom'] });

    // both missing a front-like reference (a back reference does not count for a front angle)
    const topBackOnly = await makeOriginal('back_reference');
    const bottomBackOnly = await makeOriginal('back_reference');
    await expect(
      recordSetTryOnOutput(d, writer, {
        angle: 'front',
        topSourceAssetId: topBackOnly.id,
        bottomSourceAssetId: bottomBackOnly.id,
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: 'e'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NO_SET_COMPONENT_REFERENCE', details: ['top', 'bottom'] });

    // an archived reference never counts
    const archivedBottom = await makeOriginal('front_reference', { archivedAt: new Date() });
    await expect(
      recordSetTryOnOutput(d, writer, {
        angle: 'front',
        topSourceAssetId: goodTop.id,
        bottomSourceAssetId: archivedBottom.id,
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: 'f'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NO_SET_COMPONENT_REFERENCE', details: ['bottom'] });

    // a generated (not real) reference never counts, even one this same engine produced
    const generatedOutput = await recordSetTryOnOutput(d, writer, {
      angle: 'front',
      topSourceAssetId: goodTop.id,
      bottomSourceAssetId: goodBottom.id,
      storageKey: 'test/gen-front.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 1,
      checksumSha256: '0'.repeat(64),
    });
    await expect(
      recordSetTryOnOutput(d, writer, {
        angle: 'front',
        topSourceAssetId: generatedOutput.id,
        bottomSourceAssetId: goodBottom.id,
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: '1'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NO_SET_COMPONENT_REFERENCE', details: ['top'] });
  });

  it('refuses the same photo named as both the top and the bottom', async () => {
    const d = deps();
    const one = await makeOriginal('front_reference');
    await expect(
      recordSetTryOnOutput(d, writer, {
        angle: 'front',
        topSourceAssetId: one.id,
        bottomSourceAssetId: one.id,
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: '2'.repeat(64),
      }),
    ).rejects.toThrow();
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const top = await makeOriginal('front_reference');
    const bottom = await makeOriginal('front_reference');
    await expect(
      recordSetTryOnOutput(d, reader, {
        angle: 'front',
        topSourceAssetId: top.id,
        bottomSourceAssetId: bottom.id,
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: '3'.repeat(64),
      }),
    ).rejects.toThrow();
  });

  it('the real reference photos are left untouched — PR 444’s immutability guarantee carries through', async () => {
    const d = deps();
    const top = await makeOriginal('front_reference');
    const bottom = await makeOriginal('front_reference');
    await recordSetTryOnOutput(d, writer, {
      angle: 'front',
      topSourceAssetId: top.id,
      bottomSourceAssetId: bottom.id,
      storageKey: 'test/untouched.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 1,
      checksumSha256: '4'.repeat(64),
    });
    const topRow = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: top.id } });
    const bottomRow = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: bottom.id } });
    expect(topRow.isOriginal).toBe(true);
    expect(bottomRow.isOriginal).toBe(true);
    expect(topRow.archivedAt).toBeNull();
    expect(bottomRow.archivedAt).toBeNull();
  });

  it('findExistingSetTryOnOutput reuses the newest matching output, scoped to its exact angle and pair, and is null until one exists', async () => {
    const d = deps();
    const top = await makeOriginal('front_reference');
    const bottom = await makeOriginal('front_reference');
    expect(await findExistingSetTryOnOutput(d, reader, 'front', top.id, bottom.id)).toBeNull();
    const first = await recordSetTryOnOutput(d, writer, {
      angle: 'front',
      topSourceAssetId: top.id,
      bottomSourceAssetId: bottom.id,
      storageKey: 'test/reuse-1.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 1,
      checksumSha256: '5'.repeat(64),
    });
    const found = await findExistingSetTryOnOutput(d, reader, 'front', top.id, bottom.id);
    expect(found?.id).toBe(first.id);

    // a different angle on the exact same pair never matches
    expect(await findExistingSetTryOnOutput(d, reader, 'three_quarter', top.id, bottom.id)).toBeNull();

    // a plain generated front_reference with no set-try-on tag at all (e.g. a plain flat-lay render) never counts
    const untagged = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/not-set-try-on.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: '6'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: top.id, role: 'set_try_on', tags: [] },
    });
    const stillFirst = await findExistingSetTryOnOutput(d, reader, 'front', top.id, bottom.id);
    expect(stillFirst?.id).not.toBe(untagged.id);
  });
});
