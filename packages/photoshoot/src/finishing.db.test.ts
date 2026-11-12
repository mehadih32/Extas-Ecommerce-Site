// S24 · PR 455 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording a finishing step
// through PR 444's `recordGeneratedAsset` chokepoint, tracing back to the real original (never the candidate),
// the "no double charging" reuse guard, and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { finishingCandidateId, findExistingFinishingOutput, FINISHING_TAG, recordFinishingStepOutput } from './finishing';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 455 · finishing pass, part 1 — upscale, artifact repair (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let writer: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_finishing');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.generate')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t455-writer', ['photoshoot.read', 'photoshoot.generate']);
    reader = await staff('t455-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeOriginal(role: string | null, storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role },
    });
  }

  async function makeCandidate(sourceAssetId: string, role: string | null = 'primary_garment', storeId = S) {
    return t.prisma.mediaAsset.create({
      data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: 'b'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId, role },
    });
  }

  it('records an upscale output, tracing back to the real original, never the candidate', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const candidate = await makeCandidate(flat.id);
    const out = await recordFinishingStepOutput(d, writer, { candidateAssetId: candidate.id, step: 'upscale', storageKey: 'test/upscale.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 900, checksumSha256: 'c'.repeat(64) });
    expect(out.step).toBe('upscale');
    expect(out.sourceAssetId).toBe(flat.id);
    expect(out.isAiGenerated).toBe(true);
    expect(out.tags).toContain(FINISHING_TAG);
    expect(out.tags).toContain('finishing:upscale');
    expect(finishingCandidateId(out.tags)).toBe(candidate.id);

    // the real original is untouched
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: flat.id } });
    expect(row.isOriginal).toBe(true);
  });

  it('runs artifactRepair separately from upscale on the same candidate', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const candidate = await makeCandidate(flat.id);
    await recordFinishingStepOutput(d, writer, { candidateAssetId: candidate.id, step: 'upscale', storageKey: 'test/a.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '1'.repeat(64) });
    const repaired = await recordFinishingStepOutput(d, writer, { candidateAssetId: candidate.id, step: 'artifactRepair', storageKey: 'test/b.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '2'.repeat(64) });
    expect(repaired.step).toBe('artifactRepair');
    expect(repaired.tags).toContain('finishing:artifactRepair');
  });

  it('refuses to run the same step on the same candidate twice (no double charging)', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const candidate = await makeCandidate(flat.id);
    await recordFinishingStepOutput(d, writer, { candidateAssetId: candidate.id, step: 'upscale', storageKey: 'test/first.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '3'.repeat(64) });
    await expect(
      recordFinishingStepOutput(d, writer, { candidateAssetId: candidate.id, step: 'upscale', storageKey: 'test/second.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '4'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'STALE' });
  });

  it('refuses finishing on a real, original image — only a generated candidate is ever finished', async () => {
    const d = deps();
    const original = await makeOriginal('front_reference');
    await expect(
      recordFinishingStepOutput(d, writer, { candidateAssetId: original.id, step: 'upscale', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '5'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses an unknown or foreign-store candidate', async () => {
    const d = deps();
    await expect(
      recordFinishingStepOutput(d, writer, { candidateAssetId: '00000000-0000-0000-0000-000000000000', step: 'upscale', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '6'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const foreignFlat = await makeOriginal('primary_garment', other);
    const foreignCandidate = await makeCandidate(foreignFlat.id, 'primary_garment', other);
    await expect(
      recordFinishingStepOutput(d, writer, { candidateAssetId: foreignCandidate.id, step: 'upscale', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '7'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const candidate = await makeCandidate(flat.id);
    await expect(
      recordFinishingStepOutput(d, reader, { candidateAssetId: candidate.id, step: 'upscale', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '8'.repeat(64) }),
    ).rejects.toThrow();
  });

  it('findExistingFinishingOutput is null until one exists, then reuses the newest one', async () => {
    const d = deps();
    const flat = await makeOriginal('primary_garment');
    const candidate = await makeCandidate(flat.id);
    expect(await findExistingFinishingOutput(d, reader, candidate.id, 'upscale')).toBeNull();
    const first = await recordFinishingStepOutput(d, writer, { candidateAssetId: candidate.id, step: 'upscale', storageKey: 'test/reuse.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: '9'.repeat(64) });
    const found = await findExistingFinishingOutput(d, reader, candidate.id, 'upscale');
    expect(found?.id).toBe(first.id);
  });
});
