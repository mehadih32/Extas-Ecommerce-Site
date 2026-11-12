// S24 · PR 444 — pure tests for the C7.6 role taxonomy and its hard rule (no database).
import { describe, expect, it } from 'vitest';
import { ASSET_ROLES, hasBackReference, isAssetRole, missingReferenceRoles, REFERENCE_ROLES } from './roles';

describe('ASSET_ROLES', () => {
  it('names every role the blueprint lists, with no duplicates', () => {
    expect(new Set(ASSET_ROLES).size).toBe(ASSET_ROLES.length);
    for (const r of ['primary_garment', 'front_reference', 'side_reference', 'back_reference', 'detail_reference', 'context_reference']) {
      expect((ASSET_ROLES as readonly string[]).includes(r)).toBe(true);
    }
    // S24 · PR 465: the three roles the product-only studio engine needed that no garment reference ever did.
    for (const r of ['three_quarter_reference', 'top_reference', 'sole_reference']) {
      expect((ASSET_ROLES as readonly string[]).includes(r)).toBe(true);
    }
  });

  it('REFERENCE_ROLES excludes primary_garment only', () => {
    expect(REFERENCE_ROLES.includes('primary_garment' as never)).toBe(false);
    expect(REFERENCE_ROLES.length).toBe(ASSET_ROLES.length - 1);
  });
});

describe('isAssetRole', () => {
  it('accepts every listed role and refuses anything else', () => {
    for (const r of ASSET_ROLES) expect(isAssetRole(r)).toBe(true);
    expect(isAssetRole('on_model')).toBe(false);
    expect(isAssetRole('')).toBe(false);
    expect(isAssetRole(42)).toBe(false);
  });
});

describe('hasBackReference — C7.6 hard rule', () => {
  it('is false with no back_reference on file', () => {
    expect(hasBackReference([{ role: 'front_reference', isOriginal: true, archivedAt: null }])).toBe(false);
  });

  it('is true only for a real, non-archived back_reference', () => {
    expect(hasBackReference([{ role: 'back_reference', isOriginal: true, archivedAt: null }])).toBe(true);
  });

  it('a generated back_reference never counts — only a real photo can justify generating a back view', () => {
    expect(hasBackReference([{ role: 'back_reference', isOriginal: false, archivedAt: null }])).toBe(false);
  });

  it('an archived back reference no longer counts', () => {
    expect(hasBackReference([{ role: 'back_reference', isOriginal: true, archivedAt: new Date() }])).toBe(false);
  });
});

describe('missingReferenceRoles', () => {
  it('names every wanted role not present', () => {
    expect(missingReferenceRoles(['front_reference'])).toEqual(['back_reference', 'detail_reference']);
  });

  it('is empty once every wanted role is present', () => {
    expect(missingReferenceRoles(['front_reference', 'back_reference', 'detail_reference'])).toEqual([]);
  });
});
