// S24 · PR 447 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a garment-prep output
// through PR 444's `recordGeneratedAsset` chokepoint, reuse lookup, the store's own colour-tolerance setting, and
// permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { checkGarmentColour, findExistingGarmentPrepOutput, GARMENT_PREP_TAG, recordGarmentPrepOutput } from './garmentPrep';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 447 · garment prep and standardisation (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_garment_prep');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t447-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t447-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null = 'primary_garment') {
    return t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role },
    });
  }

  it('records a cut-out/standardised output, tagged for reuse, filed under primary_garment', async () => {
    const d = deps();
    const flat = await makeOriginal();
    const out = await recordGarmentPrepOutput(d, writer, { sourceAssetId: flat.id, storageKey: 'test/prep-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 500, checksumSha256: 'b'.repeat(64) });
    expect(out.role).toBe('primary_garment');
    expect(out.isAiGenerated).toBe(true);
    expect(out.sourceAssetId).toBe(flat.id);
    expect(out.tags).toContain(GARMENT_PREP_TAG);
    // the real original is untouched (PR 444's immutability guarantee carries through)
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: flat.id } });
    expect(row.isOriginal).toBe(true);
  });

  it('refuses a missing or foreign-store source, the same way PR 444s recordGeneratedAsset does', async () => {
    const d = deps();
    await expect(
      recordGarmentPrepOutput(d, writer, { sourceAssetId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const flat = await makeOriginal();
    await expect(
      recordGarmentPrepOutput(d, reader, { sourceAssetId: flat.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findExistingGarmentPrepOutput reuses the newest matching output, and ignores an untagged generated row', async () => {
    const d = deps();
    const flat = await makeOriginal();
    expect(await findExistingGarmentPrepOutput(d, reader, flat.id)).toBeNull();
    const first = await recordGarmentPrepOutput(d, writer, { sourceAssetId: flat.id, storageKey: 'test/reuse-1.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) });
    const found = await findExistingGarmentPrepOutput(d, reader, flat.id);
    expect(found?.id).toBe(first.id);
    const untagged = await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: 'test/not-prep.jpg', mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'f'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: flat.id, role: 'primary_garment', tags: [] },
    });
    const stillFirst = await findExistingGarmentPrepOutput(d, reader, flat.id);
    expect(stillFirst?.id).not.toBe(untagged.id);
  });

  it('checkGarmentColour reads the store setting and never flags while it is off (0, as it ships)', async () => {
    const d = deps();
    const result = await checkGarmentColour(d, reader, '#000000', '#FFFFFF');
    expect(result.tolerance).toBe(0);
    expect(result.flagged).toBe(false);
    expect(result.distance).toBeCloseTo(441.7, 1);
  });

  it('checkGarmentColour refuses anything that is not a 6-digit hex colour', async () => {
    const d = deps();
    await expect(checkGarmentColour(d, reader, 'not-a-colour', '#FFFFFF')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
