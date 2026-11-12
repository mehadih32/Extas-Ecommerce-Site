// S24 · PR 462 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): `computePilotMetrics`/`recordPilotRun`/
// `listPilotRuns` against real `PhotoshootJob`/`PhotoshootOutput`/`StudioPilotRun` rows — permission checks, store
// scoping and the period window, on top of `pilotMetrics.test.ts`'s own pure arithmetic.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { StudioJobStatus } from '@extas/db/client';
import type { PhotoshootDeps, Who } from './context';
import { isPhotoshootError } from './context';
import { computePilotMetrics, listPilotRuns, recordPilotRun } from './pilotMetrics';

describe.skipIf(!HAS_TEST_DB)('PR 462 · pilot metrics and StudioPilotRun snapshots (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let writer: Who;
  let reader: Who;
  const deps: PhotoshootDeps = { db: undefined as never };

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_pilot_metrics');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    (deps as { db: unknown }).db = t.prisma;
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write')[], storeId = S) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId } });
      return { actor: { staffUserId: u.id }, storeId };
    };
    writer = await staff('t462-writer', ['photoshoot.read', 'photoshoot.write']);
    reader = await staff('t462-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeJob(storeId: number, over: Partial<{ status: StudioJobStatus; attempt: number; actualMinor: number | null; createdAt: Date; startedAt: Date | null; finishedAt: Date | null; provider: string | null }> = {}) {
    const p = await t.prisma.product.create({ data: { storeId, slug: `test-462-${crypto.randomUUID()}`, nameEn: 'Test product' } });
    return t.prisma.photoshootJob.create({
      data: {
        storeId,
        productId: p.id,
        angle: 'front',
        tier: 'baseline',
        status: 'DRAFT',
        idempotencyKey: crypto.randomUUID(),
        inputAssetIds: [],
        attempt: 1,
        actualMinor: null,
        provider: null,
        ...over,
      },
    });
  }

  async function makeApprovedOutput(job: { id: string; storeId: number }, over: Partial<{ reviewedAt: Date | null; createdAt: Date }> = {}) {
    const original = await t.prisma.mediaAsset.create({ data: { storeId: job.storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'a'.repeat(64), isOriginal: true } });
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: job.storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1n, checksumSha256: 'b'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: original.id } });
    return t.prisma.photoshootOutput.create({ data: { storeId: job.storeId, jobId: job.id, assetId: asset.id, candidateIndex: 0, reviewStatus: 'APPROVED', ...over } });
  }

  it('a period with no jobs at all comes back all-null, never 0', async () => {
    const m = await computePilotMetrics(deps, reader, { periodStart: '2020-01-01T00:00:00Z', periodEnd: '2020-01-02T00:00:00Z' });
    expect(m).toMatchObject({ generatedImages: 0, approvedImages: 0, costPerApprovedMinor: null, jobCount: 0 });
  });

  it('counts only jobs inside the period window', async () => {
    const inside = await makeJob(S, { createdAt: new Date('2026-06-15T00:00:00Z') });
    await makeApprovedOutput(inside, { createdAt: new Date('2026-06-15T00:00:00Z') });
    await makeJob(S, { createdAt: new Date('2026-07-15T00:00:00Z') }); // outside the window below
    const m = await computePilotMetrics(deps, reader, { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-07-01T00:00:00Z' });
    expect(m.jobCount).toBe(1);
    expect(m.approvedImages).toBe(1);
  });

  it('never counts another store’s jobs', async () => {
    await makeJob(other, { createdAt: new Date('2026-08-15T00:00:00Z') });
    const m = await computePilotMetrics(deps, reader, { periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-09-01T00:00:00Z' });
    expect(m.jobCount).toBe(0);
  });

  it('a staff user with no photoshoot.read is refused', async () => {
    const unassigned = await t.prisma.staffUser.create({ data: { email: 't462-noperm@example.com', displayName: 'no permissions', passwordHash: 'not-a-login' } });
    const nobody: Who = { actor: { staffUserId: unassigned.id }, storeId: S };
    await expect(computePilotMetrics(deps, nobody, { periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-02-01T00:00:00Z' })).rejects.toThrow();
  });

  it('rejects a period where periodEnd is not after periodStart', async () => {
    await expect(computePilotMetrics(deps, reader, { periodStart: '2026-02-01T00:00:00Z', periodEnd: '2026-01-01T00:00:00Z' })).rejects.toSatisfy((e) => isPhotoshootError(e));
  });

  it('recordPilotRun needs photoshoot.write, not just photoshoot.read', async () => {
    await expect(recordPilotRun(deps, reader, { periodStart: '2026-01-01T00:00:00Z', periodEnd: '2026-02-01T00:00:00Z' })).rejects.toThrow();
  });

  it('recordPilotRun snapshots the computed metrics as one StudioPilotRun row, and listPilotRuns reads it back', async () => {
    const job = await makeJob(S, { createdAt: new Date('2026-09-15T00:00:00Z'), actualMinor: 5000 });
    await makeApprovedOutput(job, { createdAt: new Date('2026-09-15T00:00:00Z') });
    const run = await recordPilotRun(deps, writer, { periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z' });
    expect(run.generatedImages).toBe(1);
    expect(run.approvedImages).toBe(1);
    expect(run.costPerApprovedMinor).toBe(5000);
    expect(run.metrics.jobCount).toBe(1);

    const rows = await listPilotRuns(deps, reader);
    expect(rows.some((r) => r.id === run.id)).toBe(true);
  });

  it('two runs of the same period never overwrite each other — append-only', async () => {
    const before = (await listPilotRuns(deps, reader)).length;
    await recordPilotRun(deps, writer, { periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z' });
    await recordPilotRun(deps, writer, { periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-10-01T00:00:00Z' });
    expect((await listPilotRuns(deps, reader)).length).toBe(before + 2);
  });
});
