// S24 · PR 448 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recommendReferences reads the roles
// already tagged on a product's real photos (through PR 444's `listReferenceRoles`), with its own store scoping and
// permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { recommendReferences } from './referenceAnalysis';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 448 · reference analysis and recommendation (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let reader: Who;
  let noPerms: Who;
  const deps = (): Pick<PhotoshootDeps, 'db'> => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_reference_analysis');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    reader = await staff('t448-reader', ['photoshoot.read']);
    noPerms = await staff('t448-noperm', []);
  });

  afterAll(async () => t.drop());

  async function makeAsset(role: string | null, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role },
    });
  }

  it('recommends all three required photos when nothing is tagged yet', async () => {
    const r = await recommendReferences(deps(), reader, { assetIds: [(await makeAsset(null)).id] });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('front_reference');
    expect(r.missing).toContain('back_reference');
    expect(r.missing).toContain('detail_reference');
  });

  it('is ready once front, back and detail are all tagged and passed in', async () => {
    const front = await makeAsset('front_reference');
    const back = await makeAsset('back_reference');
    const detail = await makeAsset('detail_reference');
    const r = await recommendReferences(deps(), reader, { assetIds: [front.id, back.id, detail.id] });
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('never counts an asset from another store, the same way listReferenceRoles scopes it', async () => {
    const foreign = await makeAsset('back_reference', other);
    const r = await recommendReferences(deps(), reader, { assetIds: [foreign.id] });
    expect(r.missing).toContain('back_reference');
  });

  it('refuses a reader without even photoshoot.read', async () => {
    const asset = await makeAsset('front_reference');
    await expect(recommendReferences(deps(), noPerms, { assetIds: [asset.id] })).rejects.toThrow();
  });

  it('refuses an empty or malformed assetIds list', async () => {
    await expect(recommendReferences(deps(), reader, { assetIds: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(recommendReferences(deps(), reader, { assetIds: ['not-a-uuid'] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
