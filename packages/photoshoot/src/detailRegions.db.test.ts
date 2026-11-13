// S24 · PR 454 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): recording and approving a detail
// region on a real reference photo, the "never on a generated image" rule, the readiness plan fed real rows, and
// recording the finished re-projection through PR 444's `recordGeneratedAsset` chokepoint.
// S24 · PR 463 on the same database (below PR 454's own suite): the Detail Finder's own confirm/rename/add/remove
// workflow, on both a real flat-lay photo and a generated on-model render (C7.10's own "the ghost and on-model
// renders too, not only the flat-lay"), store scoping and permission checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import {
  addDetailFocusRegion,
  approveDetailRegion,
  confirmDetailFocusRegion,
  DETAIL_FOCUS_CROP_TAG,
  DETAIL_REPROJECTION_TAG,
  detailFocusCropRegionId,
  listDetailFocusRegionsForProduct,
  listDetailRegionsForProduct,
  planDetailReprojection,
  proposeDetailFocusRegion,
  recordDetailFocusCropOutput,
  recordDetailRegion,
  recordDetailReprojectionOutput,
  removeDetailFocusRegion,
  renameDetailFocusRegion,
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

describe.skipIf(!HAS_TEST_DB)('PR 463 · Detail Finder focus regions (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let other: number;
  let writer: Who;
  let generator: Who;
  let approver: Who;
  let reader: Who;
  const deps = (): PhotoshootDeps => ({ db: t.prisma });
  const productId = crypto.randomUUID();
  const bbox = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

  beforeAll(async () => {
    t = await createTestDatabase('photoshoot_detail_finder');
    [S, other] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('photoshoot.read' | 'photoshoot.write' | 'photoshoot.generate' | 'photoshoot.approve')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    writer = await staff('t463-writer', ['photoshoot.read', 'photoshoot.write']);
    generator = await staff('t463-generator', ['photoshoot.read', 'photoshoot.generate']);
    approver = await staff('t463-approver', ['photoshoot.read', 'photoshoot.approve']);
    reader = await staff('t463-reader', ['photoshoot.read']);
  });

  afterAll(async () => t.drop());

  async function makeFlatLay(storeId = S) {
    return t.prisma.mediaAsset.create({ data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 1000n, checksumSha256: 'a'.repeat(64), isOriginal: true, role: 'primary_garment' } });
  }

  async function makeOnModelRender(storeId = S) {
    const original = await makeFlatLay(storeId);
    return t.prisma.mediaAsset.create({ data: { storeId, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `test/${crypto.randomUUID()}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: 'b'.repeat(64), isOriginal: false, isAiGenerated: true, sourceAssetId: original.id, role: 'primary_garment' } });
  }

  it('proposes a region on a real flat-lay AND on a generated on-model render — C7.10’s own point, never PR 454’s "no generated image" rule', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const onModel = await makeOnModelRender();

    const onFlatLay = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'polo', point: 'chest_logo', bbox });
    expect(onFlatLay.approved).toBe(false);
    expect(onFlatLay.detectedBy).toBe('auto');
    expect(onFlatLay.garmentType).toBe('polo');
    expect(onFlatLay.point).toBe('chest_logo');

    const onRender = await proposeDetailFocusRegion(d, generator, { productId, assetId: onModel.id, garmentType: 'polo', point: 'side_tape', bbox });
    expect(onRender.point).toBe('side_tape');
  });

  it('refuses a checklist point that garment type never listed', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    await expect(proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'polo', point: 'rivets', bbox })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('refuses an asset from another store', async () => {
    const d = deps();
    const foreign = await makeFlatLay(other);
    await expect(proposeDetailFocusRegion(d, generator, { productId, assetId: foreign.id, garmentType: 'polo', point: 'chest_logo', bbox })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('a reader without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    await expect(proposeDetailFocusRegion(d, reader, { productId, assetId: flatLay.id, garmentType: 'polo', point: 'chest_logo', bbox })).rejects.toThrow();
  });

  it('confirm moves a proposal to approved', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const row = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'shirt', point: 'collar', bbox });
    const confirmed = await confirmDetailFocusRegion(d, approver, row.id);
    expect(confirmed.approved).toBe(true);
  });

  it('a writer without photoshoot.approve cannot confirm', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const row = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'shirt', point: 'button', bbox });
    await expect(confirmDetailFocusRegion(d, writer, row.id)).rejects.toThrow();
  });

  it('confirmDetailFocusRegion refuses an unknown region, and refuses a PR 454 region (not one of this PR’s own rows)', async () => {
    const d = deps();
    await expect(confirmDetailFocusRegion(d, approver, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const flatLay = await makeFlatLay();
    const pr454Region = await recordDetailRegion(d, writer, { productId, assetId: flatLay.id, kind: 'logo', bbox });
    await expect(confirmDetailFocusRegion(d, approver, pr454Region.id)).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('owner’s own "add" starts already approved, no confirm step needed', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const row = await addDetailFocusRegion(d, writer, { productId, assetId: flatLay.id, garmentType: 'hoodie', point: 'drawcord_tips', bbox });
    expect(row.approved).toBe(true);
    expect(row.detectedBy).toBe('manual');
  });

  it('rename relabels within the same garment type, and refuses a point the garment type never listed', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const row = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'denim_chino', point: 'rivets', bbox });
    const renamed = await renameDetailFocusRegion(d, writer, row.id, { point: 'selvedge' });
    expect(renamed.point).toBe('selvedge');
    expect(renamed.garmentType).toBe('denim_chino');
    await expect(renameDetailFocusRegion(d, writer, row.id, { point: 'drawcord_tips' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('remove sets rejectedAt and is never a delete; a confirmed region cannot be removed; a removed one cannot be removed twice', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const proposed = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'panjabi', point: 'side_slit', bbox });
    const removed = await removeDetailFocusRegion(d, writer, proposed.id);
    expect(removed.rejectedAt).not.toBeNull();
    await expect(removeDetailFocusRegion(d, writer, proposed.id)).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const confirmed = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'panjabi', point: 'button_placket', bbox });
    await confirmDetailFocusRegion(d, approver, confirmed.id);
    await expect(removeDetailFocusRegion(d, writer, confirmed.id)).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    // still on file, never deleted
    const row = await t.prisma.detailRegion.findUniqueOrThrow({ where: { id: proposed.id } });
    expect(row).toBeTruthy();
  });

  it('a removed region cannot be confirmed or renamed — it is re-added instead', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const proposed = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'hoodie', point: 'rib', bbox });
    await removeDetailFocusRegion(d, writer, proposed.id);
    await expect(confirmDetailFocusRegion(d, approver, proposed.id)).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
    await expect(renameDetailFocusRegion(d, writer, proposed.id, { point: 'zip_pull' })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('listDetailFocusRegionsForProduct never returns a PR 454 region, and is store-scoped and permission-gated', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    await recordDetailRegion(d, writer, { productId, assetId: flatLay.id, kind: 'print', bbox });
    await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'polo', point: 'cuff', bbox });
    const rows = await listDetailFocusRegionsForProduct(d, reader, productId);
    expect(rows.every((r) => r.garmentType && r.point)).toBe(true);
    expect(rows.some((r) => r.point === 'cuff')).toBe(true);
  });

  it('PR 464 · records a focus-crop output on a confirmed region sitting on a real flat-lay, tracing to that same real original', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const region = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'polo', point: 'chest_logo', bbox });
    await confirmDetailFocusRegion(d, approver, region.id);

    const out = await recordDetailFocusCropOutput(d, generator, { regionId: region.id, storageKey: 'test/crop.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 400, checksumSha256: 'c'.repeat(64) });
    expect(out.sourceAssetId).toBe(flatLay.id);
    expect(out.isAiGenerated).toBe(true);
    expect(out.tags).toContain(DETAIL_FOCUS_CROP_TAG);
    expect(detailFocusCropRegionId(out.tags)).toBe(region.id);
  });

  it('PR 464 · on a region sitting on a generated on-model render, traces past the render to ITS own real original — never the render itself', async () => {
    const d = deps();
    const onModel = await makeOnModelRender();
    const original = await t.prisma.mediaAsset.findUniqueOrThrow({ where: { id: onModel.sourceAssetId! } });
    const region = await proposeDetailFocusRegion(d, generator, { productId, assetId: onModel.id, garmentType: 'polo', point: 'side_tape', bbox });
    await confirmDetailFocusRegion(d, approver, region.id);

    const out = await recordDetailFocusCropOutput(d, generator, { regionId: region.id, storageKey: 'test/crop2.jpg', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 400, checksumSha256: 'd'.repeat(64) });
    expect(out.sourceAssetId).toBe(original.id);
    expect(out.sourceAssetId).not.toBe(onModel.id);
  });

  it('PR 464 · refuses a crop from an unconfirmed or a removed region', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const proposed = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'shirt', point: 'pocket', bbox });
    await expect(recordDetailFocusCropOutput(d, generator, { regionId: proposed.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'e'.repeat(64) })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });

    const removed = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'shirt', point: 'yoke', bbox });
    await removeDetailFocusRegion(d, writer, removed.id);
    await expect(recordDetailFocusCropOutput(d, generator, { regionId: removed.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('PR 464 · refuses an unknown region, and a PR 454 region (not one of this PR’s own rows)', async () => {
    const d = deps();
    await expect(recordDetailFocusCropOutput(d, generator, { regionId: '00000000-0000-0000-0000-000000000000', storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const flatLay = await makeFlatLay();
    const pr454Region = await recordDetailRegion(d, writer, { productId, assetId: flatLay.id, kind: 'logo', bbox });
    await expect(recordDetailFocusCropOutput(d, generator, { regionId: pr454Region.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'SOURCE_INVALID' });
  });

  it('PR 464 · a generator without photoshoot.generate is refused outright', async () => {
    const d = deps();
    const flatLay = await makeFlatLay();
    const region = await proposeDetailFocusRegion(d, generator, { productId, assetId: flatLay.id, garmentType: 'hoodie', point: 'zip_pull', bbox });
    await confirmDetailFocusRegion(d, approver, region.id);
    await expect(recordDetailFocusCropOutput(d, reader, { regionId: region.id, storageKey: 'x', storage: 'LOCAL_DISK', mimeType: 'image/jpeg', bytes: 1, checksumSha256: 'c'.repeat(64) })).rejects.toThrow();
  });
});
