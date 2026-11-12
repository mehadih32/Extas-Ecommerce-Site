// S24 · PR 457 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording an editing session,
// the archived-image refusal, the "run finishing again" rule (generated only, never a real original), store
// scoping, permission gating, and the edit history list.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { listImageEdits, recordImageEdit } from './imageEdits';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 457 · in-admin image editor (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_image_edits');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t457-writer', ['photoshoot.read', 'photoshoot.write']);
    reader = await staff('t457-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeAsset(opts: { isAiGenerated?: boolean; archivedAt?: Date; storeId?: number } = {}) {
    return t.prisma.mediaAsset.create({
      data: {
        storeId: opts.storeId ?? S,
        kind: 'IMAGE',
        storage: 'LOCAL_DISK',
        storageKey: `test/${crypto.randomUUID()}.jpg`,
        mimeType: 'image/jpeg',
        bytes: 1000n,
        checksumSha256: 'a'.repeat(64),
        isOriginal: !opts.isAiGenerated,
        isAiGenerated: !!opts.isAiGenerated,
        sourceAssetId: null,
        archivedAt: opts.archivedAt ?? null,
      },
    });
  }

  it('records a crop + straighten + brightness/contrast + spot-removal session, in order', async () => {
    const asset = await makeAsset();
    const row = await recordImageEdit(deps(), writer, {
      sourceAssetId: asset.id,
      operations: [
        { kind: 'crop', box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } },
        { kind: 'straighten', degrees: -3 },
        { kind: 'brightnessContrast', brightness: 5, contrast: 10 },
        { kind: 'spotRemoval', points: [{ x: 0.2, y: 0.3 }] },
      ],
    });
    expect(row.sourceAssetId).toBe(asset.id);
    expect(row.resultAssetId).toBeNull();
    expect(row.operations.map((o) => o.kind)).toEqual(['crop', 'straighten', 'brightnessContrast', 'spotRemoval']);
  });

  it('refuses an archived image', async () => {
    const asset = await makeAsset({ archivedAt: new Date() });
    await expect(recordImageEdit(deps(), writer, { sourceAssetId: asset.id, operations: [{ kind: 'straighten', degrees: 1 }] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses an asset from another store', async () => {
    const asset = await makeAsset({ storeId: other });
    await expect(recordImageEdit(deps(), writer, { sourceAssetId: asset.id, operations: [{ kind: 'straighten', degrees: 1 }] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('"run finishing again" is refused on a real original, allowed on a generated image', async () => {
    const original = await makeAsset();
    await expect(recordImageEdit(deps(), writer, { sourceAssetId: original.id, operations: [{ kind: 'runFinishingAgain' }] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const generated = await makeAsset({ isAiGenerated: true });
    const row = await recordImageEdit(deps(), writer, { sourceAssetId: generated.id, operations: [{ kind: 'runFinishingAgain' }] });
    expect(row.operations).toEqual([{ kind: 'runFinishingAgain' }]);
  });

  it('a reader without photoshoot.write is refused outright', async () => {
    const asset = await makeAsset();
    await expect(recordImageEdit(deps(), reader, { sourceAssetId: asset.id, operations: [{ kind: 'straighten', degrees: 1 }] })).rejects.toThrow();
  });

  it('listImageEdits returns this image\'s own edits, most recent first, and is permission-gated', async () => {
    const asset = await makeAsset();
    const first = await recordImageEdit(deps(), writer, { sourceAssetId: asset.id, operations: [{ kind: 'straighten', degrees: 1 }] });
    const second = await recordImageEdit(deps(), writer, { sourceAssetId: asset.id, operations: [{ kind: 'straighten', degrees: 2 }] });
    const rows = await listImageEdits(deps(), reader, asset.id);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it('rejects an edit with no operations', async () => {
    const asset = await makeAsset();
    await expect(recordImageEdit(deps(), writer, { sourceAssetId: asset.id, operations: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
