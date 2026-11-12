// S24 · PR 454 pure tests: the bbox shape, the "nothing to re-project without an approved region" plan, and the
// candidate-id round-trip the re-projection output's own tags carry.
import { describe, expect, it } from 'vitest';
import { bboxSchema, DETAIL_REGION_KINDS, DETAIL_REPROJECTION_TAG, planDetailReprojection, reprojectedCandidateId, type DetailRegionRow } from './detailRegions';

const region = (overrides: Partial<DetailRegionRow> = {}): DetailRegionRow => ({
  id: crypto.randomUUID(),
  storeId: 1,
  productId: crypto.randomUUID(),
  assetId: crypto.randomUUID(),
  kind: 'logo',
  bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  detectedBy: 'manual',
  approved: false,
  createdAt: new Date(),
  ...overrides,
});

describe('PR 454 · bboxSchema', () => {
  it('accepts a box that fits inside the image', () => {
    expect(bboxSchema.safeParse({ x: 0, y: 0, width: 1, height: 1 }).success).toBe(true);
    expect(bboxSchema.safeParse({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 }).success).toBe(true);
  });

  it('refuses a box that runs off the edge of the image', () => {
    expect(bboxSchema.safeParse({ x: 0.6, y: 0, width: 0.5, height: 0.1 }).success).toBe(false);
    expect(bboxSchema.safeParse({ x: 0, y: 0.9, width: 0.1, height: 0.2 }).success).toBe(false);
  });

  it('refuses a coordinate outside 0–1', () => {
    expect(bboxSchema.safeParse({ x: -0.1, y: 0, width: 0.1, height: 0.1 }).success).toBe(false);
    expect(bboxSchema.safeParse({ x: 0, y: 0, width: 1.1, height: 0.1 }).success).toBe(false);
  });

  it('refuses an unknown field (strict)', () => {
    expect(bboxSchema.safeParse({ x: 0, y: 0, width: 0.1, height: 0.1, extra: true }).success).toBe(false);
  });
});

describe('PR 454 · DETAIL_REGION_KINDS', () => {
  it('is the fixed C7.5 step 8 vocabulary', () => {
    expect(DETAIL_REGION_KINDS).toEqual(['logo', 'print', 'embroidery', 'text', 'label']);
  });
});

describe('PR 454 · planDetailReprojection', () => {
  it('is not ready with no regions at all', () => {
    expect(planDetailReprojection([])).toEqual({ ready: false, regions: [], reason: 'NO_APPROVED_DETAIL_REGION' });
  });

  it('is not ready when every region on file is still unapproved', () => {
    const plan = planDetailReprojection([region({ approved: false }), region({ approved: false })]);
    expect(plan.ready).toBe(false);
    expect(plan.regions).toEqual([]);
    expect(plan.reason).toBe('NO_APPROVED_DETAIL_REGION');
  });

  it('is ready with at least one approved region, and keeps only the approved ones', () => {
    const approved = region({ approved: true });
    const plan = planDetailReprojection([region({ approved: false }), approved]);
    expect(plan.ready).toBe(true);
    expect(plan.regions).toEqual([approved]);
    expect(plan.reason).toBeUndefined();
  });

  it('keeps every approved region when there are several', () => {
    const a = region({ approved: true, kind: 'logo' });
    const b = region({ approved: true, kind: 'print' });
    const plan = planDetailReprojection([a, b]);
    expect(plan.ready).toBe(true);
    expect(plan.regions).toEqual([a, b]);
  });
});

describe('PR 454 · reprojectedCandidateId', () => {
  it('finds the candidate id among the output asset\'s own tags', () => {
    const candidateId = crypto.randomUUID();
    expect(reprojectedCandidateId([DETAIL_REPROJECTION_TAG, candidateId])).toBe(candidateId);
  });

  it('is null when no tag looks like a uuid', () => {
    expect(reprojectedCandidateId([DETAIL_REPROJECTION_TAG, 'ghost_mannequin'])).toBeNull();
    expect(reprojectedCandidateId([])).toBeNull();
  });
});
