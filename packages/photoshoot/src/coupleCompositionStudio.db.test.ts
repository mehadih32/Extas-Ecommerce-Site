// S24 · PR 479 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a couple-shot
// composition through PR 444's `recordGeneratedAsset` chokepoint, traced transitively off the male member's own
// generated render back to the real original it carries (the same shape `finishing.ts`'s own
// `recordFinishingStepOutput` already uses), C7.13's "never invent one half of a couple shot" hard rule, reuse
// lookup scoped to the exact pair, and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { coupleCompositionMemberTag, COUPLE_COMPOSITION_STUDIO_TAG, findExistingCoupleCompositionOutput, recordCoupleCompositionOutput } from './coupleCompositionStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 479 · unisex/couple composition studio (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_couple_composition');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t479-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t479-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role: 'primary_garment' },
    });
  }

  /** A real, already-generated on-model render (any role), tracing back to its own real original — C7.13's own
   * "generate each model separately on their own profile" step, already done before this engine ever runs. */
  async function makeRender(overrides: { archivedAt?: Date | null; sourceAssetId?: string | null; isAiGenerated?: boolean } = {}) {
    const original = overrides.sourceAssetId === undefined ? await makeOriginal() : null;
    return t.prisma.mediaAsset.create({
      data: {
        storeId: S,
        kind: 'IMAGE',
        storage: 'LOCAL_DISK',
        storageKey: `test/${crypto.randomUUID()}.jpg`,
        mimeType: 'image/jpeg',
        bytes: 1000n,
        checksumSha256: 'b'.repeat(64),
        isOriginal: false,
        isAiGenerated: overrides.isAiGenerated ?? true,
        sourceAssetId: overrides.sourceAssetId !== undefined ? overrides.sourceAssetId : original!.id,
        role: 'set_try_on',
        archivedAt: overrides.archivedAt ?? null,
      },
    });
  }

  it('records a couple composition tagged studio + both members, filed against the male render’s own real original', async () => {
    const d = deps();
    const male = await makeRender();
    const female = await makeRender();
    const out = await recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: male.id, femaleRenderAssetId: female.id, storageKey: 'test/couple-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'c'.repeat(64) });
    expect(out.role).toBe('couple_composition');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(male.sourceAssetId); // the male's own real original, never the render itself
    expect(out.maleRenderAssetId).toBe(male.id);
    expect(out.femaleRenderAssetId).toBe(female.id);
    expect(out.tags).toContain(COUPLE_COMPOSITION_STUDIO_TAG);
    expect(out.tags).toContain(coupleCompositionMemberTag('male', male.id));
    expect(out.tags).toContain(coupleCompositionMemberTag('female', female.id));
  });

  it("C7.13 hard rule: refuses when either member's render is missing, not yet generated, or archived — naming each by name", async () => {
    const d = deps();
    const goodMale = await makeRender();
    const goodFemale = await makeRender();

    // female missing entirely
    await expect(
      recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: goodMale.id, femaleRenderAssetId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_COUPLE_MEMBER_REFERENCE', details: ['female'] });

    // a real, original (never-generated) photo named as a member — a model was never actually rendered
    const original = await makeOriginal();
    await expect(
      recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: original.id, femaleRenderAssetId: goodFemale.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_COUPLE_MEMBER_REFERENCE', details: ['male'] });

    // an archived render never counts
    const archivedFemale = await makeRender({ archivedAt: new Date() });
    await expect(
      recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: goodMale.id, femaleRenderAssetId: archivedFemale.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_COUPLE_MEMBER_REFERENCE', details: ['female'] });

    // both missing at once — named together, never only the first
    await expect(
      recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: original.id, femaleRenderAssetId: archivedFemale.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '0'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NO_COUPLE_MEMBER_REFERENCE', details: ['male', 'female'] });
  });

  it('refuses the same render named as both the male and the female member', async () => {
    const d = deps();
    const one = await makeRender();
    await expect(
      recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: one.id, femaleRenderAssetId: one.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '1'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const male = await makeRender();
    const female = await makeRender();
    await expect(recordCoupleCompositionOutput(d, reader, { maleRenderAssetId: male.id, femaleRenderAssetId: female.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) })).rejects.toThrow();
  });

  it('the real member renders (and their own real originals) are left untouched', async () => {
    const d = deps();
    const male = await makeRender();
    const female = await makeRender();
    await recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: male.id, femaleRenderAssetId: female.id, storageKey: 'test/untouched.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) });
    const maleRow = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: male.id } });
    const originalRow = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: male.sourceAssetId! } });
    expect(maleRow.isAiGenerated).toBe(true);
    expect(maleRow.archivedAt).toBeNull();
    expect(originalRow.isOriginal).toBe(true);
    expect(originalRow.archivedAt).toBeNull();
  });

  it('findExistingCoupleCompositionOutput reuses the newest matching composition, scoped to its exact pair, and is null until one exists', async () => {
    const d = deps();
    const male = await makeRender();
    const female = await makeRender();
    expect(await findExistingCoupleCompositionOutput(d, reader, male.id, female.id)).toBeNull();
    const first = await recordCoupleCompositionOutput(d, writer, { maleRenderAssetId: male.id, femaleRenderAssetId: female.id, storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '4'.repeat(64) });
    const found = await findExistingCoupleCompositionOutput(d, reader, male.id, female.id);
    expect(found?.id).toBe(first.id);

    // a different female render on the exact same male never matches
    const otherFemale = await makeRender();
    expect(await findExistingCoupleCompositionOutput(d, reader, male.id, otherFemale.id)).toBeNull();
  });
});
