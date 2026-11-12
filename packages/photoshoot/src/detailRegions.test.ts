// S24 · PR 454 pure tests: the bbox shape, the "nothing to re-project without an approved region" plan, and the
// candidate-id round-trip the re-projection output's own tags carry.
// S24 · PR 463 pure tests (below PR 454's own): the Detail Finder checklist, the `finder:` kind namespace
// round-trip, and the coverage read.
import { describe, expect, it } from 'vitest';
import {
  bboxSchema,
  detailFinderClarityMessage,
  detailFinderClarityRequests,
  detailFinderCoverage,
  DETAIL_FINDER_CHECKLIST,
  detailFinderKind,
  DETAIL_FINDER_GARMENT_TYPES,
  detailFocusCropRegionId,
  DETAIL_FOCUS_CROP_TAG,
  DETAIL_REGION_KINDS,
  DETAIL_REPROJECTION_TAG,
  isDetailFinderPoint,
  parseDetailFinderKind,
  planDetailReprojection,
  reprojectedCandidateId,
  type DetailFocusRegionRow,
  type DetailRegionRow,
} from './detailRegions';

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

describe('PR 463 · DETAIL_FINDER_CHECKLIST', () => {
  it('is C7.10’s own fixed list, one entry per named garment type', () => {
    expect(DETAIL_FINDER_GARMENT_TYPES).toEqual(['polo', 'shirt', 'denim_chino', 'hoodie', 'panjabi']);
    expect(DETAIL_FINDER_CHECKLIST.polo).toEqual(['side_tape', 'side_vent', 'collar_tape', 'placket_and_buttons', 'cuff', 'chest_logo']);
    expect(DETAIL_FINDER_CHECKLIST.panjabi).toEqual(['neck_embroidery', 'button_placket', 'side_slit']);
  });

  it('isDetailFinderPoint only accepts a point its own garment type actually lists', () => {
    expect(isDetailFinderPoint('polo', 'chest_logo')).toBe(true);
    expect(isDetailFinderPoint('polo', 'rivets')).toBe(false);
    expect(isDetailFinderPoint('denim_chino', 'rivets')).toBe(true);
  });
});

describe('PR 463 · detailFinderKind / parseDetailFinderKind round-trip', () => {
  it('round-trips a namespaced kind back to its garment type and point', () => {
    const kind = detailFinderKind('polo', 'chest_logo');
    expect(kind).toBe('finder:polo:chest_logo');
    expect(parseDetailFinderKind(kind)).toEqual({ garmentType: 'polo', point: 'chest_logo' });
  });

  it('is null for a PR 454 kind (never confused with one of this PR’s own rows)', () => {
    expect(parseDetailFinderKind('logo')).toBeNull();
    expect(parseDetailFinderKind('label')).toBeNull();
  });

  it('is null for an unknown garment type or a malformed string', () => {
    expect(parseDetailFinderKind('finder:unknown_type:chest_logo')).toBeNull();
    expect(parseDetailFinderKind('finder:polo')).toBeNull();
    expect(parseDetailFinderKind('finder:polo:')).toBeNull();
  });
});

describe('PR 463 · detailFinderCoverage', () => {
  const focusRegion = (overrides: Partial<DetailFocusRegionRow> = {}): DetailFocusRegionRow => ({
    id: crypto.randomUUID(),
    storeId: 1,
    productId: crypto.randomUUID(),
    assetId: crypto.randomUUID(),
    garmentType: 'polo',
    point: 'chest_logo',
    bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    detectedBy: 'auto',
    approved: false,
    rejectedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  it('every checklist point is "missing" with no regions at all', () => {
    const coverage = detailFinderCoverage('panjabi', []);
    expect(coverage).toEqual({ neck_embroidery: 'missing', button_placket: 'missing', side_slit: 'missing' });
  });

  it('a point with an unconfirmed proposal on file is "proposed"', () => {
    const coverage = detailFinderCoverage('polo', [focusRegion({ point: 'chest_logo', approved: false })]);
    expect(coverage.chest_logo).toBe('proposed');
    expect(coverage.cuff).toBe('missing');
  });

  it('a point with at least one confirmed, un-removed region is "confirmed"', () => {
    const coverage = detailFinderCoverage('polo', [focusRegion({ point: 'chest_logo', approved: false, rejectedAt: new Date() }), focusRegion({ point: 'chest_logo', approved: true })]);
    expect(coverage.chest_logo).toBe('confirmed');
  });

  it('a point whose every region was removed is "rejected_only"', () => {
    const coverage = detailFinderCoverage('polo', [focusRegion({ point: 'cuff', approved: false, rejectedAt: new Date() })]);
    expect(coverage.cuff).toBe('rejected_only');
  });

  it('never mixes in a region of a different garment type, even on a point both garment types share', () => {
    // 'cuff' is a real checklist point for both polo and shirt — a shirt cuff region must never count toward polo's own coverage.
    const coverage = detailFinderCoverage('polo', [focusRegion({ garmentType: 'shirt', point: 'cuff', approved: true })]);
    expect(coverage.cuff).toBe('missing');
  });
});

describe('PR 464 · detailFocusCropRegionId', () => {
  it('finds the region id among the crop output’s own tags', () => {
    const regionId = crypto.randomUUID();
    expect(detailFocusCropRegionId([DETAIL_FOCUS_CROP_TAG, regionId])).toBe(regionId);
  });

  it('is null when no tag looks like a uuid', () => {
    expect(detailFocusCropRegionId([DETAIL_FOCUS_CROP_TAG])).toBeNull();
    expect(detailFocusCropRegionId([])).toBeNull();
  });
});

describe('PR 464 · detailFinderClarityMessage', () => {
  it('turns a checklist point’s own name into C7.10’s own back-and-forth wording', () => {
    expect(detailFinderClarityMessage('collar_tape')).toBe('The collar tape is not readable in these photos — please take one closer photo of the collar tape.');
  });
});

describe('PR 464 · detailFinderClarityRequests', () => {
  const focusRegion = (overrides: Partial<DetailFocusRegionRow> = {}): DetailFocusRegionRow => ({
    id: crypto.randomUUID(),
    storeId: 1,
    productId: crypto.randomUUID(),
    assetId: crypto.randomUUID(),
    garmentType: 'polo',
    point: 'chest_logo',
    bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    detectedBy: 'auto',
    approved: false,
    rejectedAt: null,
    createdAt: new Date(),
    ...overrides,
  });

  it('asks for every missing checklist point, and only those', () => {
    const requests = detailFinderClarityRequests('panjabi', []);
    expect(requests.map((r) => r.point).sort()).toEqual(['button_placket', 'neck_embroidery', 'side_slit']);
    expect(requests[0]!.message).toContain('please take one closer photo');
  });

  it('never asks for a point that is only proposed or already confirmed', () => {
    const proposed = focusRegion({ garmentType: 'polo', point: 'chest_logo', approved: false });
    const confirmed = focusRegion({ garmentType: 'polo', point: 'cuff', approved: true });
    const requests = detailFinderClarityRequests('polo', [proposed, confirmed]);
    const points = requests.map((r) => r.point);
    expect(points).not.toContain('chest_logo');
    expect(points).not.toContain('cuff');
  });

  it('asks again for a point whose every region was removed', () => {
    const rejected = focusRegion({ garmentType: 'hoodie', point: 'rib', approved: false, rejectedAt: new Date() });
    const requests = detailFinderClarityRequests('hoodie', [rejected]);
    expect(requests.map((r) => r.point)).toContain('rib');
  });
});
