// S11 · PR 220–222 (registry v64): the SEO engine's settings — every key at version 64, never owner data, labelled in
// both languages, its default valid; the shop stays out of search engines until the owner opens it.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { SEO_PAGE_TYPES, seoIndexingSchema, seoSettings } from '../src/registry-seo';

describe('SEO settings (v64)', () => {
  it('every key is in the registry at version 64, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(seoSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(64);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.group, key).toBe('seo');
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], 'groups.seo'), lang).toBeTruthy();
      }
    }
  });

  it('PR 220: search engines are off until go-live; once open, search results are never listed', () => {
    const d = seoSettings['seo.indexing'].default;
    expect(d.searchEngines).toBe(false);
    expect(Object.keys(d.pages).sort()).toEqual([...SEO_PAGE_TYPES].sort());
    expect(d.pages.search).toBe(false);
    expect(d.pages.setBuilder).toBe(false);
    expect(d.pages.product && d.pages.category && d.pages.home).toBe(true);
    expect(d.xDefault).toBe('en');
    expect(seoIndexingSchema.safeParse({ ...d, pages: { ...d.pages, bag: true } }).success).toBe(false);
    expect(seoIndexingSchema.safeParse({ ...d, xDefault: 'bn' }).success).toBe(false);
  });
});
