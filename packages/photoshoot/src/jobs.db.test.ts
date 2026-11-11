// S24 · PR 451 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): `createOrReuseJob` and
// `transitionJob` against the actual `PhotoshootJob` table and its `@@unique([storeId, idempotencyKey])` constraint.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { createOrReuseJob, getJob, listJobsForProduct, transitionJob } from './jobs';
import type { PhotoshootDeps, Who } from './context';

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

  it('records the error message on failure, and clears it on the retry back to queued', async () => {
    const d = deps();
    const p = await makeProduct();
    const { job } = await createOrReuseJob(d, generator, { productId: p.id, angle: 'front', tier: 'baseline', inputAssetIds: [crypto.randomUUID()] });
    const failed = await transitionJob(d, generator, job.id, 'FAILED', { errorMessage: 'provider timed out' });
    expect(failed.error).toBe('provider timed out');
    expect(failed.finishedAt).not.toBeNull();
    const retried = await transitionJob(d, generator, job.id, 'QUEUED');
    expect(retried.error).toBeNull();
    expect(retried.finishedAt).toBeNull();
    expect(retried.attempt).toBe(2);
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
