// S24 · PR 451, 452 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): `createOrReuseJob` and
// `transitionJob` against the actual `PhotoshootJob` table and its `@@unique([storeId, idempotencyKey])` constraint
// (PR 451), plus `retryFailedJob`'s new seed and `startProcessing`'s concurrency/spend-cap gates (PR 452).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createOrReuseJob, getJob, listJobsForProduct, retryFailedJob, startProcessing, transitionJob } from './jobs';
import type { PhotoshootDeps, SettingsReader, Who } from './context';

/** A minimal stand-in for the resolver, for the one setting `startProcessing` reads. */
function fakeSettings(maxConcurrentJobs: number): SettingsReader {
  return { value: async () => maxConcurrentJobs as never };
}

describe.skipIf(!HAS_TEST_DB)('PR 451 · photoshoot job orchestration (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let generator: Who;
  let approver: Who;
  let publisher: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_jobs');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write' | 'photoshoot.generate' | 'photoshoot.approve' | 'photoshoot.publish')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    generator = await staff('t451-generator', ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate']);
    approver = await staff('t451-approver', ['photoshoot.read', 'photoshoot.approve']);
    publisher = await staff('t451-publisher', ['photoshoot.read', 'photoshoot.publish']);
    reader = await staff('t451-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeProduct(storeId = S) {
    return t.prisma.product.create({ data: { storeId, slug: `test-${crypto.randomUUID()}`, nameEn: 'Test product' } });
  }

  it('opens a job queued, scoped to its store, and a reader cannot request one', async () => {
    const d = deps();
    const p = await makeProduct();
    const { job, reused } = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    expect(reused).toBe(false);
    expect(job.status).toBe('QUEUED');
    expect(job.storeId).toBe(S);
    const fetched = await getJob(d, generator, job.id);
    expect(fetched.id).toBe(job.id);
    await expect(createOrReuseJob(d, reader, { productId: p.id, angle: 'back', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] })).rejects.toThrow();
  });

  it('the exact same request reuses the same job instead of opening a second one (no double charging)', async () => {
    const d = deps();
    const p = await makeProduct();
    const assetId = crypto.randomUUID();
    const first = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [assetId] });
    const second = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [assetId] });
    expect(second.reused).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    const list = await listJobsForProduct(d, generator, p.id);
    expect(list.filter((j) => j.id === first.job.id)).toHaveLength(1);
  });

  it('refuses a product that does not exist in this store', async () => {
    const d = deps();
    await expect(createOrReuseJob(d, generator, { productId: '00000000-0000-0000-0000-000000000000', angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses a product that belongs to another store', async () => {
    const d = deps();
    const foreign = await makeProduct(other);
    await expect(createOrReuseJob(d, generator, { productId: foreign.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses an unknown tier', async () => {
    const d = deps();
    const p = await makeProduct();
    await expect(createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'deluxe', inputAssetIds: [crypto.randomUUID()] })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('walks the full flow to published, each step gated by its own permission', async () => {
    const d = deps();
    const p = await makeProduct();
    const { job } = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    await expect(transitionJob(d, approver, job.id, 'PROCESSING')).rejects.toThrow();
    const processing = await transitionJob(d, generator, job.id, 'PROCESSING');
    expect(processing.startedAt).not.toBeNull();
    const review = await transitionJob(d, generator, job.id, 'REVIEW_REQUIRED');
    expect(review.status).toBe('REVIEW_REQUIRED');
    await expect(transitionJob(d, generator, job.id, 'APPROVED')).rejects.toThrow();
    const approved = await transitionJob(d, approver, job.id, 'APPROVED');
    expect(approved.status).toBe('APPROVED');
    await expect(transitionJob(d, approver, job.id, 'PUBLISHED')).rejects.toThrow();
    const published = await transitionJob(d, publisher, job.id, 'PUBLISHED');
    expect(published.status).toBe('PUBLISHED');
    expect(published.finishedAt).not.toBeNull();
  });

  it('refuses a move the state machine does not allow', async () => {
    const d = deps();
    const p = await makeProduct();
    const { job } = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    await expect(transitionJob(d, generator, job.id, 'PUBLISHED')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('records the error message on failure, and clears it (with a new seed) on the retry back to queued', async () => {
    const d: PhotoshootDeps = { db: t.prisma, randomSeed: () => 'seed-after-retry' };
    const p = await makeProduct();
    const { job } = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    expect(job.seed).toBeNull();
    const failed = await transitionJob(d, generator, job.id, 'FAILED', { errorMessage: 'provider timed out' });
    expect(failed.error).toBe('provider timed out');
    expect(failed.finishedAt).not.toBeNull();
    const retried = await transitionJob(d, generator, job.id, 'QUEUED');
    expect(retried.error).toBeNull();
    expect(retried.finishedAt).toBeNull();
    expect(retried.attempt).toBe(2);
    expect(retried.seed).toBe('seed-after-retry');
  });

  it('refuses a job that does not exist, and one from another store', async () => {
    const d = deps();
    await expect(getJob(d, generator, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const foreignProduct = await makeProduct(other);
    const foreignGenerator: Who = { actor: generator.actor, storeId: other };
    // the actor has no role in `other`, so even reaching the permission check should refuse
    await expect(createOrReuseJob(d, foreignGenerator, { productId: foreignProduct.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] })).rejects.toThrow();
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 452 · per-view retry, concurrency limiting, spend cap (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let S2: number; // its own store: the two concurrency tests must not see each other's — or tests 3/4's — leftover PROCESSING rows
  let generator: Who;
  let generatorS2: Who;
  const deps = (settings?: SettingsReader): PhotoshootDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_jobs_452');
    [S] = await seedSampleStores(t.prisma);
    const storeB = await t.prisma.store.create({ data: { slug: 'sample-452-concurrency', name: 'Sample store (concurrency)', defaultLocale: 'en-GB', currency: 'BDT', timezone: 'Asia/Dhaka' } });
    S2 = storeB.id;
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't452-generator', nameEn: 'generator', nameBn: 'generator', permissions: ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't452-generator@example.com', displayName: 'generator', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S2 } });
    generator = { actor: { staffUserId: u.id }, storeId: S };
    generatorS2 = { actor: { staffUserId: u.id }, storeId: S2 };
  });

  afterAll(async () => t.drop());

  async function makeQueuedJob(who: Who = generator) {
    const p = await t.prisma.product.create({ data: { storeId: who.storeId, slug: `test-452-${crypto.randomUUID()}`, nameEn: 'Test product' } });
    const { job } = await createOrReuseJob(deps(), who, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    return job;
  }

  it('retryFailedJob moves a failed job back to queued with a fresh seed, and only that job', async () => {
    const d: PhotoshootDeps = { db: t.prisma, randomSeed: () => 'retry-seed-1' };
    const jobA = await makeQueuedJob();
    const jobB = await makeQueuedJob();
    await transitionJob(d, generator, jobA.id, 'PROCESSING');
    await transitionJob(d, generator, jobA.id, 'FAILED', { errorMessage: 'provider timed out' });
    const retried = await retryFailedJob(d, generator, jobA.id);
    expect(retried.status).toBe('QUEUED');
    expect(retried.seed).toBe('retry-seed-1');
    expect(retried.attempt).toBe(2);
    const untouched = await getJob(d, generator, jobB.id);
    expect(untouched.status).toBe('QUEUED');
    expect(untouched.attempt).toBe(1);
  });

  it('retryFailedJob refuses a job that is not FAILED', async () => {
    const d = deps();
    const job = await makeQueuedJob();
    await expect(retryFailedJob(d, generator, job.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('startProcessing moves a queued job to processing when nothing limits it', async () => {
    const d = deps();
    const job = await makeQueuedJob();
    const started = await startProcessing(d, generator, job.id);
    expect(started.status).toBe('PROCESSING');
    expect(started.startedAt).not.toBeNull();
  });

  it('startProcessing refuses a job that is not queued', async () => {
    const d = deps();
    const job = await makeQueuedJob();
    await startProcessing(d, generator, job.id);
    await expect(startProcessing(d, generator, job.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('startProcessing refuses once this store is at its own concurrency limit, and leaves the job queued', async () => {
    // its own store (S2): tests 3/4 above already left PROCESSING rows in S, which must not leak into this count
    const d = deps(fakeSettings(1));
    const already = await makeQueuedJob(generatorS2);
    await startProcessing(d, generatorS2, already.id); // now PROCESSING — the store's one allowed slot
    const second = await makeQueuedJob(generatorS2);
    await expect(startProcessing(d, generatorS2, second.id)).rejects.toMatchObject({ code: 'CONCURRENCY_LIMIT' });
    const stillQueued = await getJob(d, generatorS2, second.id);
    expect(stillQueued.status).toBe('QUEUED');
  });

  it('0 (unlimited, as it ships) never limits concurrency, even with a job already processing', async () => {
    // same store (S2), right after the test above, which already left one job PROCESSING there — strengthens the point
    const d = deps(fakeSettings(0));
    const another = await makeQueuedJob(generatorS2);
    const started = await startProcessing(d, generatorS2, another.id);
    expect(started.status).toBe('PROCESSING');
  });

  it('with no AiAgent row keyed "photoshoot" yet, the cap check never blocks (CN-018 ships off)', async () => {
    const d = deps();
    const job = await makeQueuedJob();
    const started = await startProcessing(d, generator, job.id);
    expect(started.status).toBe('PROCESSING');
  });

  it("a cap set but not yet reached never blocks; reaching it then refuses and leaves the job queued", async () => {
    const d = deps();
    const agent = await t.prisma.aiAgent.create({ data: { key: 'photoshoot', code: 'A360-TEST-PHOTOSHOOT', nameEn: 'Photoshoot', role: 'photoshoot', monthlyCapMinor: 1000 } });
    const ledger = (costMinor: number) => t.prisma.aiUsageLedger.create({ data: { agentId: agent.id, providerKey: 'fashn', modelKey: 'try-on-v1.6', idempotencyKey: `t452-ledger-${crypto.randomUUID()}`, costUsdMicros: 1n, costMinor } });

    await ledger(500); // 50% of the 1000 cap — still "ok"
    const okJob = await makeQueuedJob();
    const started = await startProcessing(d, generator, okJob.id);
    expect(started.status).toBe('PROCESSING');

    await ledger(500); // now 1000/1000 — "paused"
    const pausedJob = await makeQueuedJob();
    await expect(startProcessing(d, generator, pausedJob.id)).rejects.toMatchObject({ code: 'SPEND_CAP_REACHED' });
    const stillQueued = await getJob(d, generator, pausedJob.id);
    expect(stillQueued.status).toBe('QUEUED');
  });
});
