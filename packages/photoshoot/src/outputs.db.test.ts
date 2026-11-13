// S24 · PR 453/458/459 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): PR 453's `recordScoredOutputs`
// against the actual `PhotoshootOutput` table, the quality-threshold setting and the job's own move to
// REVIEW_REQUIRED/FAILED; PR 458 grows the same file in place with the owner's own review decision
// (`decideOutputReview`) and the review queue (`listReviewQueue`); PR 459 grows it again with the cost ledger
// write (C7.6 "no double charging") that `recordScoredOutputs` now makes once scoring is in — the real
// `CostEntry` row and the job's own `actualMinor`, trued up against the real candidate count rather than the
// job's open-time estimate.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createOrReuseJob, transitionJob } from './jobs';
import { decideOutputReview, getOutputsForJob, listReviewQueue, recordScoredOutputs } from './outputs';
import type { PhotoshootDeps, SettingsReader, Who } from './context';

const perfect = { garmentShapeIntegrity: 1, printLegibility: 1, colourDifference: 1, handFingerArtefacts: 1, edgeQuality: 1, seamContinuity: 1 };
const worst = { garmentShapeIntegrity: 0, printLegibility: 0, colourDifference: 0, handFingerArtefacts: 0, edgeQuality: 0, seamContinuity: 0 };

function fakeSettings(qualityThresholdPercent: number): SettingsReader {
  return { value: async () => qualityThresholdPercent as never };
}

/** A rate-table stand-in for `studio.photoshoot.rates`. `recordScoredOutputs` also reads
 * `studio.photoshoot.qualityThresholdPercent` on every call (PR 453) to score candidates — a fake that ignored
 * the key, as `jobs.db.test.ts`'s own `fakeRates` safely can (its callers never exercise that path), would hand
 * the rate table back as the threshold too and reject every candidate on a non-numeric comparison. This one
 * answers per key: the rate table for `rates`, and 0 ("ships off", CN-018 — never rejects) for the threshold,
 * matching the real default every test here relies on. */
function fakeRates(rates: { fashn?: { baseline: number; premium: number }; fitroom?: { baseline: number; premium: number } }): SettingsReader {
  return {
    value: async (key: string) => (key === 'studio.photoshoot.rates' ? rates : 0) as never,
  };
}

describe.skipIf(!HAS_TEST_DB)('PR 453/458/459 · best-of-2, automatic scoring, the review decision and the cost ledger (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let generator: Who;
  let approver: Who;
  let reader: Who;
  const deps = (settings?: SettingsReader): PhotoshootDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_outputs');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write' | 'photoshoot.generate' | 'photoshoot.approve')[], storeId = S) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { actor: { staffUserId: u.id }, storeId };
    };
    generator = await staff('t453-generator', ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate']);
    approver = await staff('t458-approver', ['photoshoot.read', 'photoshoot.approve']);
    reader = await staff('t458-reader', ['photoshoot.read']);
    // the cross-store NOT_FOUND test below swaps `approver`'s storeId to `other` on purpose, to prove a
    // cross-store output is hidden as NOT_FOUND rather than leaking FORBIDDEN/exists-but-denied — which only
    // tests that path if the actor actually holds `photoshoot.approve` in `other` too, same role, same staff user.
    const approverStaffUserId = approver.actor.staffUserId!; // always set — this suite only ever builds staff actors
    const approverRole = await t.prisma.staffRoleAssignment.findFirstOrThrow({ where: { staffUserId: approverStaffUserId, storeId: S } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: approverStaffUserId, roleId: approverRole.roleId, storeId: other } });
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

  /** PR 459: the same flow, but the job names a `provider` (and, through `tier`, how many images a pass
   * draws) — the shape `recordScoredOutputs`'s own cost-ledger write needs a rate to look up. */
  async function makeProcessingJobWithProvider(provider: 'fashn' | 'fitroom' | 'mockPhotoshoot', tier: 'baseline' | 'premium' = 'baseline', who: Who = generator) {
    const p = await t.prisma.product.create({ data: { storeId: who.storeId, slug: `test-459-${crypto.randomUUID()}`, nameEn: 'Test product' } });
    const { job } = await createOrReuseJob(deps(), who, { productId: p.id, angle: 'front', tier, inputAssetIds: [crypto.randomUUID()], provider });
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

  // --- PR 458: the owner's own review decision (C7.5 step 10, C7.16) -------------------------------------------

  async function makePendingOutput() {
    const d = deps();
    const job = await makeProcessingJob();
    const asset = await makeGeneratedAsset();
    const result = await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    return { job: result.job, output: result.outputs[0]! };
  }

  it('approving a PENDING output moves it to APPROVED and its job to APPROVED', async () => {
    const d = deps();
    const { output } = await makePendingOutput();
    const result = await decideOutputReview(d, approver, output.id, { decision: 'approve' });
    expect(result.output.reviewStatus).toBe('APPROVED');
    expect(result.output.rejectReason).toBeNull();
    expect(result.output.reviewedById).toBe(approver.actor.staffUserId);
    expect(result.output.reviewedAt).toBeInstanceOf(Date);
    expect(result.job.status).toBe('APPROVED');
  });

  it('rejecting with a reason moves the output to REJECTED (with the reason kept) and its job to REJECTED', async () => {
    const d = deps();
    const { output } = await makePendingOutput();
    const result = await decideOutputReview(d, approver, output.id, { decision: 'reject', reason: 'the print drifted off-centre on the sleeve' });
    expect(result.output.reviewStatus).toBe('REJECTED');
    expect(result.output.rejectReason).toBe('the print drifted off-centre on the sleeve');
    expect(result.job.status).toBe('REJECTED');
  });

  it('rejecting with no reason is refused outright — "reasons on rejection" (C7.16) — and nothing is changed', async () => {
    const d = deps();
    const { output, job } = await makePendingOutput();
    await expect(decideOutputReview(d, approver, output.id, { decision: 'reject' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const stillPending = await getOutputsForJob(d, approver, job.id);
    expect(stillPending[0]!.reviewStatus).toBe('PENDING');
  });

  it('refuses a decision on an output that was never PENDING (NOT_SELECTED/AUTO_REJECTED), and on one already decided', async () => {
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
    const notSelected = result.outputs.find((o) => o.assetId === bad.id)!;
    await expect(decideOutputReview(d, approver, notSelected.id, { decision: 'approve' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    const pending = result.outputs.find((o) => o.assetId === good.id)!;
    await decideOutputReview(d, approver, pending.id, { decision: 'approve' });
    await expect(decideOutputReview(d, approver, pending.id, { decision: 'approve' })).rejects.toMatchObject({ code: 'INVALID_INPUT' }); // no silent overwrite of a past decision
  });

  it('a reader without photoshoot.approve is refused outright; NOT_FOUND on an unknown or cross-store output', async () => {
    const d = deps();
    const { output } = await makePendingOutput();
    await expect(decideOutputReview(d, reader, output.id, { decision: 'approve' })).rejects.toThrow();
    await expect(decideOutputReview(d, approver, '00000000-0000-0000-0000-000000000000', { decision: 'approve' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(decideOutputReview(d, { actor: approver.actor, storeId: other }, output.id, { decision: 'approve' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('listReviewQueue lists only this store\'s own REVIEW_REQUIRED jobs with their PENDING output, oldest first', async () => {
    const d = deps();
    const before = await listReviewQueue(d, reader);
    const beforeIds = new Set(before.map((r) => r.job.id));

    const { job: job1 } = await makePendingOutput();
    const { job: job2 } = await makePendingOutput();
    const queue = (await listReviewQueue(d, reader)).filter((r) => !beforeIds.has(r.job.id));
    expect(queue.map((r) => r.job.id)).toEqual([job1.id, job2.id]);
    for (const row of queue) expect(row.output.reviewStatus).toBe('PENDING');

    // deciding one removes it from the queue (its job is no longer REVIEW_REQUIRED)
    await decideOutputReview(d, approver, queue[0]!.output.id, { decision: 'approve' });
    const after = (await listReviewQueue(d, reader)).filter((r) => !beforeIds.has(r.job.id));
    expect(after.map((r) => r.job.id)).toEqual([job2.id]);
  });

  // --- PR 459: the cost ledger write (C7.6 "no double charging") ----------------------------------------------

  async function costEntriesFor(jobId: string) {
    return t.prisma.costEntry.findMany({ where: { storeId: S, refType: 'photoshoot_job', refId: jobId } });
  }

  it('a job with a known provider and a set rate writes exactly one CostEntry row, and trues up the job\'s actualMinor', async () => {
    const settings = fakeRates({ fashn: { baseline: 10000, premium: 20000 } });
    const d = deps(settings);
    const job = await makeProcessingJobWithProvider('fashn', 'baseline');
    const asset = await makeGeneratedAsset();
    const result = await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    const entries = await costEntriesFor(job.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amountMinor).toBe(10000); // 1 candidate at the baseline rate
    expect(entries[0]!.currency).toBe('BDT');
    expect(entries[0]!.detail).toBe('fashn · baseline · 1 image');
    const refetched = await getOutputsForJob(d, generator, job.id);
    expect(refetched).toHaveLength(1);
    expect(result.job.status).toBe('REVIEW_REQUIRED');
  });

  it('best-of-2 (two candidates) costs double a baseline single pass, at the same per-image rate', async () => {
    const settings = fakeRates({ fashn: { baseline: 10000, premium: 20000 } });
    const d = deps(settings);
    const job = await makeProcessingJobWithProvider('fashn', 'premium');
    const good = await makeGeneratedAsset();
    const bad = await makeGeneratedAsset();
    await recordScoredOutputs(d, generator, job.id, {
      candidates: [
        { assetId: bad.id, scores: worst },
        { assetId: good.id, scores: perfect },
      ],
    });
    const entries = await costEntriesFor(job.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amountMinor).toBe(40000); // 2 candidates at the premium rate (20000 each)
    expect(entries[0]!.detail).toBe('fashn · premium · 2 images');
  });

  it('writes no CostEntry, and leaves actualMinor null, for the free practice provider', async () => {
    const d = deps(fakeRates({ fashn: { baseline: 10000, premium: 20000 } }));
    const job = await makeProcessingJobWithProvider('mockPhotoshoot', 'baseline');
    const asset = await makeGeneratedAsset();
    await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    expect(await costEntriesFor(job.id)).toHaveLength(0);
  });

  it('writes no CostEntry for a job that never named a provider at all', async () => {
    const d = deps(fakeRates({ fashn: { baseline: 10000, premium: 20000 } }));
    const job = await makeProcessingJob();
    const asset = await makeGeneratedAsset();
    await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    expect(await costEntriesFor(job.id)).toHaveLength(0);
  });

  it('writes no CostEntry when the owner has not set a rate yet (0, CN-018) — never an invented number', async () => {
    const d = deps(fakeRates({ fitroom: { baseline: 0, premium: 0 } }));
    const job = await makeProcessingJobWithProvider('fitroom', 'baseline');
    const asset = await makeGeneratedAsset();
    await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    expect(await costEntriesFor(job.id)).toHaveLength(0);
  });

  it('never double-writes the ledger — the PROCESSING-only precondition that blocks a repeat report also blocks a repeat charge', async () => {
    const d = deps(fakeRates({ fashn: { baseline: 10000, premium: 20000 } }));
    const job = await makeProcessingJobWithProvider('fashn', 'baseline');
    const asset = await makeGeneratedAsset();
    await recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] });
    await expect(recordScoredOutputs(d, generator, job.id, { candidates: [{ assetId: asset.id, scores: perfect }] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await costEntriesFor(job.id)).toHaveLength(1); // still just the one entry
  });
});
