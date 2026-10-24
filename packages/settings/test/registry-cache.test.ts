// S02 · PR 602 (registry v53): every cache key at version 53 in the System group, never owner data, labelled in both
// languages, its default valid; the choices are the demo's, Cloudflare page caching ships off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { CACHE_CHOICES, cachePagesSchema, cacheSettings, cacheTuningSchema } from '../src/registry-cache';

describe('cache settings (v53)', () => {
  it('every key is in the registry at version 53 in the System group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(cacheSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(53);
      expect(spec.group, key).toBe('system');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships the demo times with Cloudflare page caching off, and takes only the offered choices', () => {
    expect(cacheSettings['cache.pages'].default).toEqual({ server: true, cdn: false, categoryMinutes: 5, productMinutes: 5 });
    expect(cacheSettings['cache.stockDisplaySeconds'].default).toBe(15);
    expect(CACHE_CHOICES.pageMinutes).toEqual([1, 2, 5, 10, 15]);
    expect(CACHE_CHOICES.stockSeconds).toEqual([10, 15, 30]);
    expect(cachePagesSchema.safeParse({ server: true, cdn: false, categoryMinutes: 7, productMinutes: 5 }).success).toBe(false);
    expect(cacheSettings['cache.stockDisplaySeconds'].schema.safeParse(20).success).toBe(false);
    expect(cacheTuningSchema.safeParse({ maxEntries: 1_000, repeatSeconds: 3, statsDays: 7 }).success).toBe(false);
  });
});
