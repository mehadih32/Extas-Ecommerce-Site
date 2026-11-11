// S25 · PR 482 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): requesting an image-to-video clip job.
// Off while `studio.video.enabled` is off; the clip's source is always the product's own live primary photo, never an
// arbitrary asset; the same request twice returns the same job (idempotent), never a duplicate.
// S25 · PR 483: the orchestration that follows a request — queue, run (success and failure), retry up to the cap.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { estimateFromRate, type VideoProvider } from '@extas/adapters';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { registry, type Key, type Value } from '@extas/settings';
import { estimateVideoJob, MAX_ATTEMPTS, primaryProductAsset, queueVideoJob, requestVideoJob, retryVideoJob, runVideoJob, StudioError, type StudioDeps, type Who } from './index';

const mockProvider: VideoProvider = {
  async estimate(input) {
    return estimateFromRate(input);
  },
  async createClip(input) {
    return { providerJobId: `mock-${input.sourceAssetId}`, status: 'SUCCEEDED', outputAssetId: input.sourceAssetId, practice: true };
  },
};

const failingProvider: VideoProvider = {
  async estimate(input) {
    return estimateFromRate(input);
  },
  async createClip() {
    throw new Error('the vendor refused this job');
  },
};

describe.skipIf(!HAS_TEST_DB)('PR 482 · request a video clip job (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let writer: Who;
  let overrides: Record<string, unknown> = {};

  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return (overrides[key] ?? registry[key].default) as Value<K>;
    },
  };
  const deps = (): StudioDeps => ({ db: t.prisma, settings });

  beforeAll(async () => {
    t = await createTestDatabase('creative_studio_video');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't482-writer', nameEn: 'writer', nameBn: 'writer', permissions: ['marketing.studio.read', 'marketing.studio.write'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't482-writer@example.com', displayName: 'writer', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    writer = { actor: { staffUserId: u.id }, storeId: S };
  });

  afterAll(async () => t.drop());

  const productWithPhoto = async () => {
    const product = await t.prisma.product.create({ data: { storeId: S, slug: `vj-${randomUUID()}`, nameEn: 'Sample Polo' } });
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: BigInt(1000), checksumSha256: randomUUID() } });
    await t.prisma.productMedia.create({ data: { storeId: S, productId: product.id, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    return { productId: product.id, assetId: asset.id };
  };

  it('is OFF while studio.video.enabled is off (CN-018: off by default)', async () => {
    overrides = {};
    const { productId } = await productWithPhoto();
    await expect(requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '9:16', durationSec: 6 })).rejects.toMatchObject({ code: 'OFF' } satisfies Partial<StudioError>);
  });

  it('refuses a product with no live primary photo yet (SOURCE_INVALID)', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const product = await t.prisma.product.create({ data: { storeId: S, slug: `vj-nophoto-${randomUUID()}`, nameEn: 'No Photo' } });
    expect(await primaryProductAsset(t.prisma, S, product.id)).toBeNull();
    await expect(requestVideoJob(deps(), writer, mockProvider, { productId: product.id, aspect: '9:16', durationSec: 6 })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('requests a job from the product\'s own live primary photo, estimate null while no rate is set', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId, assetId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '9:16', durationSec: 6 });
    expect(job.sourceAssetId).toBe(assetId);
    expect(job.status).toBe('DRAFT');
    expect(job.estimateMinor).toBeNull();
    expect(job.provider).toBe('mockVideoProvider');
  });

  it('prices the clip once the owner sets a rate (Blueprint C8.2)', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 150 } };
    const { productId } = await productWithPhoto();
    const est = await estimateVideoJob(deps(), mockProvider, S, { productId, aspect: '1:1', durationSec: 4 });
    expect(est).toEqual({ costMinor: 600, currency: 'BDT' });
    const job = await requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '1:1', durationSec: 4 });
    expect(job.estimateMinor).toBe(600);
  });

  it('the same request asked twice returns the same job (idempotent), never a duplicate', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId } = await productWithPhoto();
    const input = { productId, aspect: '4:5', durationSec: 5 };
    const a = await requestVideoJob(deps(), writer, mockProvider, input);
    const b = await requestVideoJob(deps(), writer, mockProvider, input);
    expect(b.id).toBe(a.id);
    const rows = await t.prisma.videoJob.findMany({ where: { storeId: S, productId } });
    expect(rows.length).toBe(1);
  });

  it('refuses an actionId that names no motion action of this store', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId } = await productWithPhoto();
    await expect(requestVideoJob(deps(), writer, mockProvider, { productId, actionId: randomUUID(), aspect: '9:16', durationSec: 6 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('queues a DRAFT job, refuses to queue twice (WRONG_STATE), 404s an unknown id', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '9:16', durationSec: 6 });
    const queued = await queueVideoJob(deps(), writer, job.id);
    expect(queued.status).toBe('QUEUED');
    await expect(queueVideoJob(deps(), writer, job.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
    await expect(queueVideoJob(deps(), writer, randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('runs a queued job through to REVIEW_REQUIRED on success, refuses a second run', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId, assetId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '9:16', durationSec: 6 });
    await queueVideoJob(deps(), writer, job.id);
    const ran = await runVideoJob(deps(), writer, mockProvider, job.id);
    expect(ran.status).toBe('REVIEW_REQUIRED');
    expect(ran.outputAssetId).toBe(assetId);
    await expect(runVideoJob(deps(), writer, mockProvider, job.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('refuses to run a job that is still DRAFT (must be queued first)', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '9:16', durationSec: 6 });
    await expect(runVideoJob(deps(), writer, mockProvider, job.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('lands on FAILED when the provider refuses, then retries up to MAX_ATTEMPTS and CAP_REACHES past it', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, failingProvider, { productId, aspect: '9:16', durationSec: 6 });
    await queueVideoJob(deps(), writer, job.id);
    const failed = await runVideoJob(deps(), writer, failingProvider, job.id);
    expect(failed.status).toBe('FAILED');
    expect(failed.attempt).toBe(1);

    await expect(runVideoJob(deps(), writer, failingProvider, job.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });

    let last = failed;
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      const retried = await retryVideoJob(deps(), writer, job.id);
      expect(retried.status).toBe('QUEUED');
      expect(retried.attempt).toBe(attempt);
      last = await runVideoJob(deps(), writer, failingProvider, job.id);
      expect(last.status).toBe('FAILED');
      expect(last.attempt).toBe(attempt);
    }
    expect(last.attempt).toBe(MAX_ATTEMPTS);
    await expect(retryVideoJob(deps(), writer, job.id)).rejects.toMatchObject({ code: 'CAP_REACHED' });
  });

  it('a retried job that then succeeds lands on REVIEW_REQUIRED', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId, assetId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, failingProvider, { productId, aspect: '9:16', durationSec: 6 });
    await queueVideoJob(deps(), writer, job.id);
    await runVideoJob(deps(), writer, failingProvider, job.id);
    await retryVideoJob(deps(), writer, job.id);
    const ran = await runVideoJob(deps(), writer, mockProvider, job.id);
    expect(ran.status).toBe('REVIEW_REQUIRED');
    expect(ran.outputAssetId).toBe(assetId);
    expect(ran.attempt).toBe(2);
  });

  it('refuses to retry a job that is not FAILED', async () => {
    overrides = { 'studio.video': { enabled: true, costPerSecondMinor: 0 } };
    const { productId } = await productWithPhoto();
    const job = await requestVideoJob(deps(), writer, mockProvider, { productId, aspect: '9:16', durationSec: 6 });
    await expect(retryVideoJob(deps(), writer, job.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });
});
