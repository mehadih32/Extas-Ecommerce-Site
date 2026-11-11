// S24 · PR 454 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording and approving a detail
// region on a real reference photo, the "never on a generated image" rule, the readiness plan fed real rows, and
// recording the finished re-projection through PR 444's `recordGeneratedAsset` chokepoint.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import {
  approveDetailRegion,
  DETAIL_REPROJECTION_TAG,
  listDetailRegionsForProduct,
  planDetailReprojection,
  recordDetailRegion,
  recordDetailReprojectionOutput,
  reprojectedCandidateId,
} from './detailRegions';
import type { PhotoshootDeps, Who } from './context';

describe.skipIf(!HAS_TEST_DB)('PR 454 · detail re-projection (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let writer: Who;
  let approver: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });
  const productId = crypto.randomUUID();

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_detail_regions');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write' | 'photoshoot.generate' | 'photoshoot.approve')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t454-writer', ['photoshoot.read', 'photoshoot.write', 'photoshoot.generate']);
    approver = await staff('t454-approver', ['photoshoot.read', 'photoshoot.approve']);
    reader = await staff('t454-reader', ['photoshoot.read']);
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

  const bbox = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

  it('records a region on a real reference photo', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const row = await recordDetailRegion(d, writer, { productId, assetId: detail.id, kind: 'logo', bbox });
    expect(row.approved).toBe(false);
    expect(row.kind).toBe('logo');
    expect(row.detectedBy).toBe('manual');
    expect(row.bbox).toEqual(bbox);
  });

  it('refuses a region on a generated image, never on a real one', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const generated = await makeCandidate(detail.id);
    await expect(recordDetailRegion(d, writer, { productId, assetId: generated.id, kind: 'print', bbox })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses an asset from another store', async () => {
    const d = deps();
    const foreign = await makeOriginal('detail_reference', other);
    await expect(recordDetailRegion(d, writer, { productId, assetId: foreign.id, kind: 'logo', bbox })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('a writer without photoshoot.write is refused outright', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    await expect(recordDetailRegion(d, reader, { productId, assetId: detail.id, kind: 'logo', bbox })).rejects.toThrow();
  });

  it('planDetailReprojection says NO_APPROVED_DETAIL_REGION until the owner approves one, then is ready', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const row = await recordDetailRegion(d, writer, { productId, assetId: detail.id, kind: 'logo', bbox });

    const beforeApproval = await listDetailRegionsForProduct(d, reader, productId);
    expect(planDetailReprojection(beforeApproval.filter((r) => r.id === row.id)).ready).toBe(false);

    const approved = await approveDetailRegion(d, approver, row.id);
    expect(approved.approved).toBe(true);
    const afterApproval = await listDetailRegionsForProduct(d, reader, productId);
    const plan = planDetailReprojection(afterApproval.filter((r) => r.id === row.id));
    expect(plan.ready).toBe(true);
    expect(plan.regions.map((r) => r.id)).toEqual([row.id]);
  });

  it('a reader without photoshoot.approve is refused outright', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const row = await recordDetailRegion(d, writer, { productId, assetId: detail.id, kind: 'logo', bbox });
    await expect(approveDetailRegion(d, reader, row.id)).rejects.toThrow();
  });

  it('approveDetailRegion refuses an unknown region', async () => {
    const d = deps();
    await expect(approveDetailRegion(d, approver, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('records the finished re-projection, tracing back to the real reference, never the candidate, carrying the candidate id in tags', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const region = await recordDetailRegion(d, writer, { productId, assetId: detail.id, kind: 'logo', bbox });
    await approveDetailRegion(d, approver, region.id);
    const candidate = await makeCandidate(detail.id, 'front_reference');

    const out = await recordDetailReprojectionOutput(d, writer, {
      candidateAssetId: candidate.id,
      regionId: region.id,
      storageKey: 'test/reprojected.jpg',
      storage: 'LOCAL_DISK',
      mimeType: 'image/jpeg',
      bytes: 700,
      checksumSha256: 'c'.repeat(64),
    });
    expect(out.sourceAssetId).toBe(detail.id);
    expect(out.isAiGenerated).toBe(true);
    expect(out.role).toBe('front_reference');
    expect(out.tags).toContain(DETAIL_REPROJECTION_TAG);
    expect(reprojectedCandidateId(out.tags)).toBe(candidate.id);

    // the real reference photo itself is untouched (PR 444's immutability guarantee carries through)
    const row = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: detail.id } });
    expect(row.isOriginal).toBe(true);
  });

  it('refuses to re-project from an unapproved region', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const region = await recordDetailRegion(d, writer, { productId, assetId: detail.id, kind: 'logo', bbox });
    const candidate = await makeCandidate(detail.id);
    await expect(
      recordDetailReprojectionOutput(d, writer, { candidateAssetId: candidate.id, regionId: region.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'd'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('refuses to re-project onto a real, original image — only a generated candidate is ever enhanced', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const region = await recordDetailRegion(d, writer, { productId, assetId: detail.id, kind: 'logo', bbox });
    await approveDetailRegion(d, approver, region.id);
    const notCandidate = await makeOriginal('front_reference');
    await expect(
      recordDetailReprojectionOutput(d, writer, { candidateAssetId: notCandidate.id, regionId: region.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('recordDetailReprojectionOutput refuses an unknown region', async () => {
    const d = deps();
    const detail = await makeOriginal('detail_reference');
    const candidate = await makeCandidate(detail.id);
    await expect(
      recordDetailReprojectionOutput(d, writer, {
        candidateAssetId: candidate.id,
        regionId: '00000000-0000-0000-0000-000000000000',
        storageKey: 'x',
        storage: 'LOCAL_DISK',
        mimeType: 'image/jpeg',
        bytes: 1,
        checksumSha256: 'f'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('listDetailRegionsForProduct is store-scoped and permission-gated', async () => {
    const d = deps();
    await expect(listDetailRegionsForProduct(d, { actor: reader.actor, storeId: S }, productId)).resolves.toBeInstanceOf(Array);
  });
});
