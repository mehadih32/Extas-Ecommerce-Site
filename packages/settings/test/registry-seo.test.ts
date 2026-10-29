// S11 · PR 220–222 (registry v64): the SEO engine's settings — every key at version 64, never owner data, labelled in
// both languages, its default valid; the shop stays out of search engines until the owner opens it.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { SEO_PAGE_TYPES, SEO_TEMPLATE_PAGES, SEO_TEMPLATE_TOKENS, seoAiDraftsSchema, seoIndexingSchema, seoSettings, seoTitlesSchema } from '../src/registry-seo';
import { tokensOf } from '../src/schemas';

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

  it('PR 221: a title template for every kind of page, in both languages, using only its own tokens', () => {
    const d = seoSettings['seo.titles'].default;
    expect(Object.keys(d).sort()).toEqual([...SEO_TEMPLATE_PAGES].sort());
    for (const k of SEO_TEMPLATE_PAGES) {
      for (const lang of ['en', 'bn'] as const) {
        expect(d[k].title[lang].trim(), `${k} ${lang}`).not.toBe('');
        for (const t of [...tokensOf(d[k].title[lang]), ...tokensOf(d[k].description[lang])]) expect(SEO_TEMPLATE_TOKENS[k], `${k} ${lang}`).toContain(t);
      }
    }
    // the home page is the shop's name until the owner writes more; a description may be left empty
    expect(d.home.title.en).toBe('{shop}');
    expect(seoTitlesSchema.safeParse({ ...d, home: { ...d.home, title: { en: '{shop} {price}', bn: '{shop}' } } }).success).toBe(false);
    expect(seoTitlesSchema.safeParse({ ...d, home: { ...d.home, title: { en: ' ', bn: '{shop}' } } }).success).toBe(false);
    expect(seoTitlesSchema.safeParse({ ...d, product: d.home }).success).toBe(false);
  });

  it('PR 221: AI drafts are off (CN-026), with a limit per press', () => {
    const d = seoSettings['seo.aiDrafts'].default;
    expect(d.enabled).toBe(false);
    expect(d.batchMax).toBeGreaterThan(0);
    expect(seoAiDraftsSchema.safeParse({ ...d, batchMax: 0 }).success).toBe(false);
    expect(seoAiDraftsSchema.safeParse({ ...d, subjects: { ...d.subjects, combo: true } }).success).toBe(false);
  });
});
