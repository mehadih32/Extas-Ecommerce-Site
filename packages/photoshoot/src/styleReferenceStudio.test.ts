// S24 · PR 539 — pure tests for the style/pose reference plan and the AI pose/video asset-library reuse tag.
import { describe, expect, it } from 'vitest';
import { isAssetRole } from './roles';
import {
  isUsableStyleReference,
  planStyleReferenceUsage,
  STYLE_REFERENCE_ROLE,
  styleReferenceLibraryTag,
  styleReferenceStatusMessage,
  type StyleReferenceCandidate,
} from './styleReferenceStudio';

describe('STYLE_REFERENCE_ROLE', () => {
  it('is a real, already-existing C7.6 role — never a new one this PR invents', () => {
    expect(isAssetRole(STYLE_REFERENCE_ROLE)).toBe(true);
    expect(STYLE_REFERENCE_ROLE).toBe('context_reference');
  });
});

describe('isUsableStyleReference', () => {
  const base: StyleReferenceCandidate = { assetId: 'a1', isOriginal: true, archivedAt: null, role: 'context_reference' };

  it('accepts a real, non-archived original tagged context_reference', () => {
    expect(isUsableStyleReference(base)).toBe(true);
  });

  it('rejects null', () => {
    expect(isUsableStyleReference(null)).toBe(false);
  });

  it('rejects an AI-generated image — a style reference is always the owner\'s own real photo', () => {
    expect(isUsableStyleReference({ ...base, isOriginal: false })).toBe(false);
  });

  it('rejects an archived photo', () => {
    expect(isUsableStyleReference({ ...base, archivedAt: new Date() })).toBe(false);
  });

  it('rejects a photo tagged for some other job', () => {
    expect(isUsableStyleReference({ ...base, role: 'front_reference' })).toBe(false);
  });

  it('rejects a photo with no role tagged yet', () => {
    expect(isUsableStyleReference({ ...base, role: null })).toBe(false);
  });
});

describe('planStyleReferenceUsage', () => {
  it('is "none" when the owner supplied no reference at all — always allowed, never required', () => {
    expect(planStyleReferenceUsage(null)).toEqual({ status: 'none', assetId: null });
    expect(planStyleReferenceUsage({ assetId: null, isOriginal: true, archivedAt: null, role: 'context_reference' })).toEqual({ status: 'none', assetId: null });
  });

  it('is "ready" for a real, usable reference', () => {
    expect(planStyleReferenceUsage({ assetId: 'a1', isOriginal: true, archivedAt: null, role: 'context_reference' })).toEqual({ status: 'ready', assetId: 'a1' });
  });

  it('is "ignored_not_usable" for a named asset that is not usable — named plainly, never silently applied anyway', () => {
    expect(planStyleReferenceUsage({ assetId: 'a1', isOriginal: false, archivedAt: null, role: 'context_reference' })).toEqual({ status: 'ignored_not_usable', assetId: 'a1' });
    expect(planStyleReferenceUsage({ assetId: 'a1', isOriginal: true, archivedAt: null, role: 'front_reference' })).toEqual({ status: 'ignored_not_usable', assetId: 'a1' });
  });
});

describe('styleReferenceStatusMessage', () => {
  it('says nothing for "none" — an unsupplied reference is the ordinary default path, not a warning', () => {
    expect(styleReferenceStatusMessage({ status: 'none', assetId: null })).toBeNull();
  });

  it('states plainly that a ready reference is meant to be followed', () => {
    expect(styleReferenceStatusMessage({ status: 'ready', assetId: 'a1' })).toMatch(/follow/i);
  });

  it('states plainly that a not-usable reference is ignored, never invented around', () => {
    const msg = styleReferenceStatusMessage({ status: 'ignored_not_usable', assetId: 'a1' });
    expect(msg).toMatch(/not usable/i);
    expect(msg).toMatch(/ignored/i);
  });
});

describe('styleReferenceLibraryTag', () => {
  it('is deterministic and round-trips the three parts, verbatim (template + product + colours)', () => {
    expect(styleReferenceLibraryTag('walkout', 'prod-1', 'black')).toBe('style_ref_lib:walkout:prod-1:black');
    expect(styleReferenceLibraryTag('walkout', 'prod-1', 'black')).toBe(styleReferenceLibraryTag('walkout', 'prod-1', 'black'));
  });

  it('a different colourway, product or template never collides with another', () => {
    const a = styleReferenceLibraryTag('walkout', 'prod-1', 'black');
    const b = styleReferenceLibraryTag('walkout', 'prod-1', 'white');
    const c = styleReferenceLibraryTag('walkout', 'prod-2', 'black');
    const d = styleReferenceLibraryTag('cafe_sit', 'prod-1', 'black');
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});
