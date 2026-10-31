// S11 · CN-031 lane A (registry v71): every key at version 71, labelled in both languages, its default valid, nothing
// owner data. PR 235: the WordPress map is off until go-live day, old links are kept 12 months, the 404 report counts.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { seoReachSettings, SEO_NOT_FOUND_DEFAULT, SEO_REDIRECTS_DEFAULT } from '../src/registry-seo-reach';

describe('lane A SEO settings (v71)', () => {
  it('every key is in the registry at version 71, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(seoReachSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(71);
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
});
