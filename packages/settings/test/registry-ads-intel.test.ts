// S13 · PR 548 (registry v291): market and competitor intelligence — proposals only, off as shipped, 10 links, a
// 24-hour refresh schedule, a 55 % match score, every number bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { ADS_INTEL_DEFAULT, adsIntelSchema, adsIntelSettings } from '../src/registry-ads-intel';

describe('ads intel (v291)', () => {
  it('is in the registry at version 291, per store, labelled in English and Bengali, its default valid', () => {
    const s = adsIntelSettings['ads.intel'];
    expect(registry['ads.intel']).toBe(s);
    expect(s.version).toBe(291);
    expect(s.scope).toBe('store');
    expect(s.isOwnerData).toBe(false);
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off', () => {
    expect(ADS_INTEL_DEFAULT).toEqual({ on: false, maxLinks: 10, refreshHours: 24, matchScore: 55 });
  });

  it('keeps every number in bounds and refuses a price field', () => {
    const ok = (patch: Record<string, unknown>) => adsIntelSchema.safeParse({ ...ADS_INTEL_DEFAULT, ...patch }).success;
    expect(ok({ on: true, maxLinks: 50, refreshHours: 168, matchScore: 100 })).toBe(true);
    expect(ok({ maxLinks: 0 })).toBe(false);
    expect(ok({ maxLinks: 51 })).toBe(false);
    expect(ok({ refreshHours: 0 })).toBe(false);
    expect(ok({ matchScore: 9 })).toBe(false);
    expect(ok({ priceMinor: 100 })).toBe(false);
  });
});
