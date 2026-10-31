// S11 · CN-031 lane A (registry v71–72): every key at its version, labelled in both languages, its default valid, nothing
// owner data. PR 235: the WordPress map is off until go-live day, old links are kept 12 months, the 404 report counts.
// PR 527: no page that was on the shop answers 404; what is shipped keeps today's listing (sold out and retired listed).
// PR 227: no filtered page is listed as shipped; a named one has one filter, one value, two names, and no twin.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { seoReachSettings, SEO_FILTER_PAGES_DEFAULT, SEO_HASH_LINKS_DEFAULT, SEO_NOT_FOUND_DEFAULT, SEO_REDIRECTS_DEFAULT, SEO_URL_POLICY_DEFAULT } from '../src/registry-seo-reach';

describe('lane A SEO settings (v71–72)', () => {
  it('every key is in the registry at version 71, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(seoReachSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect([71, 72], key).toContain(s.version);
      expect(s.group, key).toBe('seo');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      expect(s.isOwnerData, key).toBe(false);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 235: the WordPress map waits for go-live day; old links are kept 12 months; the 404 report counts, capped', () => {
    expect(SEO_REDIRECTS_DEFAULT).toEqual({ wordpressMapLive: false, keepMonths: 12, listShown: 50 });
    expect(SEO_NOT_FOUND_DEFAULT).toEqual({ record: true, maxRows: 5000, suggestMatchAtLeast: 50 });
    const r = registry['seo.redirects'].schema;
    expect(r.safeParse({ ...SEO_REDIRECTS_DEFAULT, keepMonths: 0 }).success).toBe(false);
    expect(r.safeParse({ ...SEO_REDIRECTS_DEFAULT, extra: 1 }).success).toBe(false);
    expect(registry['seo.notFound'].schema.safeParse({ ...SEO_NOT_FOUND_DEFAULT, maxRows: 10 }).success).toBe(false);
  });

  it('PR 527: alternatives on, sold-out and retired pages stay listed, a retired category keeps a page', () => {
    expect(SEO_URL_POLICY_DEFAULT).toEqual({ alternatives: true, alternativesMax: 4, soldOutIndexed: true, retiredIndexed: true, retiredCategoryPage: true });
    expect(registry['seo.urlPolicy'].version).toBe(72);
    const u = registry['seo.urlPolicy'].schema;
    expect(u.safeParse({ ...SEO_URL_POLICY_DEFAULT, alternativesMax: 1 }).success).toBe(false);
    expect(u.safeParse({ ...SEO_URL_POLICY_DEFAULT, alternativesMax: 13 }).success).toBe(false);
  });

  it('PR 586: old demo #/ links are forwarded as shipped (a switch, v72)', () => {
    expect(SEO_HASH_LINKS_DEFAULT).toEqual({ forward: true });
    expect(registry['seo.hashLinks'].version).toBe(72);
    expect(registry['seo.hashLinks'].schema.safeParse({ forward: true, extra: 1 }).success).toBe(false);
  });

  it('PR 227: filter pages are off and empty as shipped (v72); a row needs both names, a clean value, no twin', () => {
    expect(SEO_FILTER_PAGES_DEFAULT).toEqual({ enabled: false, minProducts: 4, maxPages: 50, pages: [] });
    expect(registry['seo.filterPages'].version).toBe(72);
    expect(registry['seo.filterPages'].isOwnerData).toBe(false);
    const f = registry['seo.filterPages'].schema;
    const row = { category: 'polos', filter: 'colour', value: 'navy', label: { en: 'Navy polos', bn: 'নেভি পোলো' } };
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, enabled: true, pages: [row] }).success).toBe(true);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, pages: [row, { ...row, value: 'NAVY' }] }).success).toBe(false);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, pages: [row, { ...row, filter: 'size', value: 'XL' }] }).success).toBe(true);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, maxPages: 1, pages: [row, { ...row, value: 'black' }] }).success).toBe(false);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, pages: [{ ...row, filter: 'price' }] }).success).toBe(false);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, pages: [{ ...row, value: 'navy&sort=new' }] }).success).toBe(false);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, pages: [{ ...row, label: { en: 'Navy polos', bn: '' } }] }).success).toBe(false);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, minProducts: 0 }).success).toBe(false);
    expect(f.safeParse({ ...SEO_FILTER_PAGES_DEFAULT, maxPages: 501 }).success).toBe(false);
  });
});
