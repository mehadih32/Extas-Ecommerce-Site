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
    // S24 · PR 471: the one role the worn-accessory engine's own "worn" view needed (its "flat" view reuses
    // front_reference instead of adding a second one).
    expect((ASSET_ROLES as readonly string[]).includes('worn_reference')).toBe(true);
    // S24 · PR 473: the one role the reflective/transparent engine needs — a real, unedited phone photo of a
    // perfume bottle, watch glass or sunglass lens; C7.12's own "these are not generated" rule accepts no other
    // source.
    expect((ASSET_ROLES as readonly string[]).includes('reflective_reference')).toBe(true);
    // S24 · PR 475 (C7.22 item 32): the combo/gift-set composition studio's own finished-group-image role —
    // never a reference for any further generation.
    expect((ASSET_ROLES as readonly string[]).includes('combo_gift_set_composition')).toBe(true);
    // S24 · PR 476 (C7.22 item 33): the scene library's own approved-demo role — unlike combo_gift_set_composition,
    // this one IS meant to be reused as a reference for a later, different garment set (C7.13's own "re-rendered
    // into a seasonal scene without a new shoot").
    expect((ASSET_ROLES as readonly string[]).includes('scene_library_demo')).toBe(true);
    // S24 · PR 478 (C7.22 item 35): the set try-on engine's own finished two-garment render role.
    expect((ASSET_ROLES as readonly string[]).includes('set_try_on')).toBe(true);
  });

  it('REFERENCE_ROLES excludes primary_garment, combo_gift_set_composition and set_try_on only', () => {
    expect(REFERENCE_ROLES.includes('primary_garment' as never)).toBe(false);
    expect(REFERENCE_ROLES.includes('combo_gift_set_composition' as never)).toBe(false);
    expect(REFERENCE_ROLES.includes('set_try_on' as never)).toBe(false);
    // scene_library_demo IS a reference role (see the module comment on roles.ts) — included, not excluded.
    expect(REFERENCE_ROLES.includes('scene_library_demo' as never)).toBe(true);
    expect(REFERENCE_ROLES.length).toBe(ASSET_ROLES.length - 3);
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
