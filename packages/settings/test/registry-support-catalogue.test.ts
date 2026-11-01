// S22 · PR 429 (registry v157): the catalogue drawer in a support chat — at version 157, never owner data, labelled in
// both languages, off as shipped (CN-018), every number within its range.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { supportCatalogueSchema, supportCatalogueSettings } from '../src/registry-support-catalogue';

const spec = supportCatalogueSettings['support.catalogue'];

describe('support.catalogue setting (v157)', () => {
  it('is in the registry at version 157, store-level, labelled in English and Bengali', () => {
    expect(registry['support.catalogue']).toBe(spec);
    expect(spec.version).toBe(157);
    expect(spec.scope).toBe('store');
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [spec.labelKey, spec.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships off with three photos, eight results and seven days of credit; each number keeps to its range', () => {
    expect(spec.default).toEqual({ enabled: false, photos: 3, results: 8, creditDays: 7 });
    for (const bad of [{ photos: -1 }, { photos: 4 }, { results: 3 }, { results: 21 }, { creditDays: 0 }, { creditDays: 91 }, { enabled: 'yes' }, { extra: 1 }])
      expect(supportCatalogueSchema.safeParse({ ...spec.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
    expect(supportCatalogueSchema.safeParse({ enabled: true, photos: 0, results: 20, creditDays: 90 }).success).toBe(true);
  });
});
