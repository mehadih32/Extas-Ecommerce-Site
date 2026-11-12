// S24 · PR 453 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): `recordScoredOutputs` against the
// actual `PhotoshootOutput` table, the quality-threshold setting and the job's own move to REVIEW_REQUIRED/FAILED.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createOrReuseJob, transitionJob } from './jobs';
import { getOutputsForJob, recordScoredOutputs } from './outputs';
import type { PhotoshootDeps, SettingsReader, Who } from './context';

const perfect = { garmentShapeIntegrity: 1, printLegibility: 1, colourDifference: 1, handFingerArtefacts: 1, edgeQuality: 1, seamContinuity: 1 };
const worst = { garmentShapeIntegrity: 0, printLegibility: 0, colourDifference: 0, handFingerArtefacts: 0, edgeQuality: 0, seamContinuity: 0 };

function fakeSettings(qualityThresholdPercent: number): SettingsReader {
  return { value: async () => qualityThresholdPercent as never };
}

describe.skipIf(!HAS_TEST_DB)('PR 453 · best-of-2 and automatic scoring (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let generator: Who;
  const deps = (settings?: SettingsReader): PhotoshootDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_outputs');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't453-generator', nameEn: 'generator', nameBn: 'generator', permissions: ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't453-generator@example.com', displayName: 'generator', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    generator = { actor: { staffUserId: u.id }, storeId: S };
  });

  afterAll(async () => t.drop());

  async function makeGeneratedAsset(storeId = S) {
    const original = await t.prisma.mediaAsset.create({ data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'a'.repeat(64), isOriginal: true } });
    return t.prisma.mediaAsset.create({ data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'b'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: original.id } });
  }

  async function makeProcessingJob(who: Who = generator) {
    const p = await t.prisma.product.create({ data: { storeId: who.storeId, slug: `test-453-${crypto.randomUUID()}`, nameEn: 'Test product' } });
    const { job } = await createOrReuseJob(deps(), who, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    return transitionJob(deps(), who, job.id, 'PROCESSING');
  }

  it('a single winning candidate above the (default, 0) threshold moves the job to REVIEW_REQUIRED, pending review', async () => {
    const d = deps();
    const job = await makeProcessingJob();
    const asset = await makeGeneratedAsset();
    const result = await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    expect(result.job.status).toBe('REVIEW_REQUIRED');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.reviewStatus).toBe('PENDING');
    expect(result.outputs[0]!.passedThreshold).toBe(true);
    const listed = await getOutputsForJob(d, generator, job.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.candidateIndex).toBe(0);
  });

  it('best-of-2: the better candidate goes to review as PENDING, the other is recorded as NOT_SELECTED', async () => {
    const d = deps();
    const job = await makeProcessingJob();
    const good = await makeGeneratedAsset();
    const bad = await makeGeneratedAsset();
    const result = await recordScoredOutputs(d, generator, job.id, {
      candidates: [
        { assetId: bad.id, scores: worst },
        { assetId: good.id, scores: perfect },
      ],
    });
    expect(result.winnerIndex).toBe(1);
    expect(result.job.status).toBe('REVIEW_REQUIRED');
    const byAsset = new Map(result.outputs.map((o) => [o.assetId, o]));
    expect(byAsset.get(good.id)!.reviewStatus).toBe('PENDING');
    expect(byAsset.get(bad.id)!.reviewStatus).toBe('NOT_SELECTED');
    expect(byAsset.get(bad.id)!.passedThreshold).toBe(true); // recorded truthfully — 0% still "passes" a 0% cut-off
  });

  it('every candidate below the quality cut-off auto-rejects, and the job fails instead of reaching review', async () => {
    const d = deps(fakeSettings(90));
    const job = await makeProcessingJob();
    const asset = await makeGeneratedAsset();
    const result = await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: { ...worst, garmentShapeIntegrity: 1 } }] }); // 17%, well under 90%
    expect(result.job.status).toBe('FAILED');
    expect(result.job.error).toMatch(/quality cut-off/);
    expect(result.outputs[0]!.reviewStatus).toBe('AUTO_REJECTED');
    expect(result.outputs[0]!.passedThreshold).toBe(false);
  });

  it('a candidate at exactly the cut-off passes (>= , not strictly over)', async () => {
    const d = deps(fakeSettings(100));
    const job = await makeProcessingJob();
    const asset = await makeGeneratedAsset();
    const result = await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    expect(result.job.status).toBe('REVIEW_REQUIRED');
  });

  it('refuses a job that is not PROCESSING (also the idempotency guard: a repeat report cannot land twice)', async () => {
    const d = deps();
    const job = await makeProcessingJob();
    const asset = await makeGeneratedAsset();
    await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] }); // now REVIEW_REQUIRED
    await expect(recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const listed = await getOutputsForJob(d, generator, job.id);
    expect(listed).toHaveLength(1); // the repeat never recorded a second row
  });

  it('refuses a candidate asset that does not exist, or is not itself AI-generated, or belongs to another store', async () => {
    const d = deps();
    const job1 = await makeProcessingJob();
    await expect(recordScoredOutputs(d, generator, job1.id, { candidates: [{ assetId: crypto.randomUUID(), scores: perfect }] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const job2 = await makeProcessingJob();
    const original = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'c'.repeat(64), isOriginal: true } });
    await expect(recordScoredOutputs(d, generator, job2.id, { candidates: [{ assetId: original.id, scores: perfect }] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const job3 = await makeProcessingJob();
    const foreignAsset = await makeGeneratedAsset(other);
    await expect(recordScoredOutputs(d, generator, job3.id, { candidates: [{ assetId: foreignAsset.id, scores: perfect }] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses more than two candidates — "best-of-2, not best-of-4" (C7.7)', async () => {
    const d = deps();
    const job = await makeProcessingJob();
    const [a, b, c] = await Promise.all([makeGeneratedAsset(), makeGeneratedAsset(), makeGeneratedAsset()]);
    await expect(
      recordScoredOutputs(d, generator, job.id, {
        candidates: [
          { assetId: a.id, scores: perfect },
          { assetId: b.id, scores: perfect },
          { assetId: c.id, scores: perfect },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
