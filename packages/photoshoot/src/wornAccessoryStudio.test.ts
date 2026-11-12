// S24 · PR 471 — pure tests for the worn-accessory engine's family/view vocabulary and its "never invent" view
// planner (no database).
import { describe, expect, it } from 'vitest';
import {
  isWornAccessoryFamily,
  missingWornAccessoryViews,
  planWornAccessoryViews,
  WORN_ACCESSORY_FAMILIES,
  WORN_ACCESSORY_MANDATORY_REPROJECTION_FAMILIES,
  WORN_ACCESSORY_VIEWS,
  wornAccessoryRequiresDetailReprojection,
  wornAccessoryViewRole,
} from './wornAccessoryStudio';

describe('WORN_ACCESSORY_FAMILIES', () => {
  it('is C7.12’s own four worn-accessory families, with no duplicates', () => {
    expect(WORN_ACCESSORY_FAMILIES).toEqual(['caps', 'sunglasses', 'watches', 'bags']);
    expect(new Set(WORN_ACCESSORY_FAMILIES).size).toBe(WORN_ACCESSORY_FAMILIES.length);
  });
});

describe('isWornAccessoryFamily', () => {
  it('accepts every listed family and refuses anything else', () => {
    for (const f of WORN_ACCESSORY_FAMILIES) expect(isWornAccessoryFamily(f)).toBe(true);
    expect(isWornAccessoryFamily('footwear')).toBe(false);
    expect(isWornAccessoryFamily('')).toBe(false);
    expect(isWornAccessoryFamily(7)).toBe(false);
  });
});

describe('WORN_ACCESSORY_VIEWS', () => {
  it('is the two engines C7.12 names together for every family, with no duplicates', () => {
    expect(WORN_ACCESSORY_VIEWS).toEqual(['worn', 'flat']);
    expect(new Set(WORN_ACCESSORY_VIEWS).size).toBe(WORN_ACCESSORY_VIEWS.length);
  });
});

describe('wornAccessoryViewRole', () => {
  it('maps worn to its own new role and flat to the reused flat-lay role', () => {
    expect(wornAccessoryViewRole('worn')).toBe('worn_reference');
    expect(wornAccessoryViewRole('flat')).toBe('front_reference');
  });
});

describe('planWornAccessoryViews', () => {
  it('a view is ready from a real, non-archived reference of its own role', () => {
    const plan = planWornAccessoryViews([{ role: 'worn_reference', isOriginal: true, archivedAt: null }], ['worn']);
    expect(plan).toEqual([{ view: 'worn', ready: true }]);
  });

  it('a view is not ready with no real reference of its own role on file — C7.12’s "never invent" rule', () => {
    const plan = planWornAccessoryViews([], ['flat']);
    expect(plan).toEqual([{ view: 'flat', ready: false, reason: 'NO_FLAT_REFERENCE' }]);
  });

  it('never derives one view from the other — a worn reference never makes "flat" ready, and vice versa', () => {
    const wornOnly = planWornAccessoryViews([{ role: 'worn_reference', isOriginal: true, archivedAt: null }], ['flat']);
    expect(wornOnly[0]).toMatchObject({ ready: false, reason: 'NO_FLAT_REFERENCE' });
    const flatOnly = planWornAccessoryViews([{ role: 'front_reference', isOriginal: true, archivedAt: null }], ['worn']);
    expect(flatOnly[0]).toMatchObject({ ready: false, reason: 'NO_WORN_REFERENCE' });
  });

  it('a generated (not real) reference never counts for readiness', () => {
    const plan = planWornAccessoryViews([{ role: 'worn_reference', isOriginal: false, archivedAt: null }], ['worn']);
    expect(plan[0]).toMatchObject({ ready: false, reason: 'NO_WORN_REFERENCE' });
  });

  it('an archived reference no longer counts', () => {
    const plan = planWornAccessoryViews([{ role: 'worn_reference', isOriginal: true, archivedAt: new Date() }], ['worn']);
    expect(plan[0]?.ready).toBe(false);
  });

  it('defaults to both views, each assessed independently, with its own reason', () => {
    const plan = planWornAccessoryViews([{ role: 'worn_reference', isOriginal: true, archivedAt: null }]);
    expect(plan.map((p) => p.view)).toEqual([...WORN_ACCESSORY_VIEWS]);
    expect(plan.find((p) => p.view === 'worn')?.ready).toBe(true);
    expect(plan.find((p) => p.view === 'flat')?.ready).toBe(false);
  });
});

describe('missingWornAccessoryViews', () => {
  it('names every wanted view not present', () => {
    expect(missingWornAccessoryViews([])).toEqual(['worn', 'flat']);
  });

  it('is empty once every wanted view is present', () => {
    const assets = [
      { role: 'worn_reference', isOriginal: true, archivedAt: null },
      { role: 'front_reference', isOriginal: true, archivedAt: null },
    ];
    expect(missingWornAccessoryViews(assets)).toEqual([]);
  });
});

describe('WORN_ACCESSORY_MANDATORY_REPROJECTION_FAMILIES / wornAccessoryRequiresDetailReprojection — C7.12', () => {
  it('names exactly the three families C7.12’s own sentence names, never caps', () => {
    expect(WORN_ACCESSORY_MANDATORY_REPROJECTION_FAMILIES).toEqual(['sunglasses', 'watches', 'bags']);
    expect(wornAccessoryRequiresDetailReprojection('sunglasses')).toBe(true);
    expect(wornAccessoryRequiresDetailReprojection('watches')).toBe(true);
    expect(wornAccessoryRequiresDetailReprojection('bags')).toBe(true);
    expect(wornAccessoryRequiresDetailReprojection('caps')).toBe(false);
  });
});
