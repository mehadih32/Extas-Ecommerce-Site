// S13 · PR 264 (registry v171): the refused-parcel exclusion list and the daily audience refresh — at version 171, never
// owner data, labelled in both languages, off as they ship, every value bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsAudienceRefreshSchema, adsRefusedExcludeSchema, adsRefusedSettings } from '../src/registry-ads-refused';

describe('ads.refusedExclude and ads.audienceRefresh (v171)', () => {
  it('are in the registry at version 171, store-level, labelled in English and Bengali', () => {
    for (const key of ['ads.refusedExclude', 'ads.audienceRefresh'] as const) {
      const spec = adsRefusedSettings[key];
      expect(registry[key]).toBe(spec);
      expect(spec.version).toBe(171);
      expect(spec.isOwnerData).toBe(false);
      expect(spec.scope).toBe('store');
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
      }
    }
  });

  it('ship off', () => {
    expect(adsRefusedSettings['ads.refusedExclude'].default).toEqual({ on: false, everyRefusal: false, days: 0 });
    expect(adsRefusedSettings['ads.audienceRefresh'].default).toEqual({ on: false, hour: 0 });
    expect(adsRefusedExcludeSchema.safeParse(adsRefusedSettings['ads.refusedExclude'].default).success).toBe(true);
    expect(adsAudienceRefreshSchema.safeParse(adsRefusedSettings['ads.audienceRefresh'].default).success).toBe(true);
  });

  it('refuse what is out of range', () => {
    const r = adsRefusedSettings['ads.refusedExclude'].default;
    for (const bad of [{ days: -1 }, { days: 3651 }, { days: 1.5 }, { on: 'yes' }, { extra: 1 }]) expect(adsRefusedExcludeSchema.safeParse({ ...r, ...bad }).success).toBe(false);
    const f = adsRefusedSettings['ads.audienceRefresh'].default;
    for (const bad of [{ hour: 24 }, { hour: -1 }, { extra: 1 }]) expect(adsAudienceRefreshSchema.safeParse({ ...f, ...bad }).success).toBe(false);
  });
});
