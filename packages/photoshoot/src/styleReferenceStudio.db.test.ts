// S24 · PR 539 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the AI pose/video asset-library
// reuse lookup, scoped to the exact template + product + colours, and its own permission/store-isolation checks.
// (No recorder of its own to test here — any engine's existing `recordGeneratedAsset` call opts into this reuse
// by adding `styleReferenceLibraryTag(...)` to its own `tags`, exactly as `recordGeneratedAsset`'s own doc
// comment already documents `tags` to be used.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { findExistingStyleReferenceRender, styleReferenceLibraryTag } from './styleReferenceStudio';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 539 · style/pose reference asset-library reuse (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_style_reference');
    [S, S2] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    reader = await staff('t539-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeRender(storeId: number, tags: string[], overrides: { archivedAt?: Date | null; isAiGenerated?: boolean } = {}) {
    return t.prisma.mediaAsset.create({
      data: {
        storeId,
        kind: 'IMAGE',
        storage: 'LOCAL_DISK',
        storageKey: `test/${crypto.randomUUID()}.jpg`,
        mimeType: 'image/jpeg',
        bytes: 1000n,
        checksumSha256: 'a'.repeat(64),
        isOriginal: false,
        isAiGenerated: overrides.isAiGenerated ?? true,
        role: 'set_try_on',
        tags,
        archivedAt: overrides.archivedAt ?? null,
      },
    });
  }

  it('is null until a matching pose/video render exists for this exact template + product + colours', async () => {
    const d = deps();
    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'walkout', productId: 'p1', colourKey: 'black' })).toBeNull();
  });

  it('finds the newest matching render once one is recorded, never a different colourway, product or template', async () => {
    const d = deps();
    const tag = styleReferenceLibraryTag('cafe_sit', 'p2', 'navy');
    const first = await makeRender(S, [tag]);
    await new Promise((r) => setTimeout(r, 2));
    const second = await makeRender(S, [tag]);

    const found = await findExistingStyleReferenceRender(d, reader, { templateKey: 'cafe_sit', productId: 'p2', colourKey: 'navy' });
    expect(found?.id).toBe(second.id); // the newest match, never the first

    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'cafe_sit', productId: 'p2', colourKey: 'black' })).toBeNull();
    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'cafe_sit', productId: 'p3', colourKey: 'navy' })).toBeNull();
    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'walkout', productId: 'p2', colourKey: 'navy' })).toBeNull();
    void first;
  });

  it('never reuses an archived render', async () => {
    const d = deps();
    const tag = styleReferenceLibraryTag('office_walk', 'p4', 'grey');
    await makeRender(S, [tag], { archivedAt: new Date() });
    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'office_walk', productId: 'p4', colourKey: 'grey' })).toBeNull();
  });

  it('never reuses a real original (never-generated) photo even if it somehow carried the tag', async () => {
    const d = deps();
    const tag = styleReferenceLibraryTag('festive_greeting', 'p5', 'red');
    await t.prisma.mediaAsset.create({
      data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'b'.repeat(64), isOriginal: true, isAiGenerated: false, role: 'context_reference', tags: [tag] },
    });
    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'festive_greeting', productId: 'p5', colourKey: 'red' })).toBeNull();
  });

  it('store isolation: another store’s matching render is never found', async () => {
    const d = deps();
    const tag = styleReferenceLibraryTag('bag_sling', 'p6', 'tan');
    await makeRender(S2, [tag]);
    expect(await findExistingStyleReferenceRender(d, reader, { templateKey: 'bag_sling', productId: 'p6', colourKey: 'tan' })).toBeNull();
  });

  it('a reader without photoshoot.read is refused outright', async () => {
    const d = deps();
    const noPerm: Who = { actor: { staffUserId: 'no-such-user' }, storeId: S };
    await expect(findExistingStyleReferenceRender(d, noPerm, { templateKey: 'walkout', productId: 'p1', colourKey: 'black' })).rejects.toThrow();
  });
});
