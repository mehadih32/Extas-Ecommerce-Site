// S12 · PR 592 (registry v253): the journal's house ads — off as shipped, at most three on an article page, one inside
// the words, the search guard on, every number bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { HOUSE_ADS_DEFAULT, houseAdSettings, houseAdsSchema } from '../src/registry-house-ads';

describe('house ads (v253)', () => {
  it('is in the registry at version 253 (258 since the follow-up\'s view counting), per store, labelled in English and Bengali, its default valid', () => {
    const s = houseAdSettings['blog.houseAds'];
    expect(registry['blog.houseAds']).toBe(s);
    expect(s.version).toBe(258);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off, with the blog QA round rules: three a page, one inside the words, no popup on a searcher’s first screen', () => {
    expect(HOUSE_ADS_DEFAULT).toEqual({ on: false, maxPerPage: 3, inlineMax: 1, popupScrollPct: 50, popupSeconds: 0, capTimes: 1, capDays: 7, searchGuard: true, creditDays: 7, countViews: false });
  });

  it('follow-up (v258): views are not counted as shipped, and a value saved before reads them off', () => {
    const { countViews: _gone, ...old } = HOUSE_ADS_DEFAULT;
    expect(houseAdsSchema.parse(old).countViews).toBe(false);
    expect(houseAdsSchema.safeParse({ ...HOUSE_ADS_DEFAULT, countViews: true }).success).toBe(true);
  });

  it('keeps every number inside its bounds and refuses unknown fields (no outside network)', () => {
    const ok = (patch: Record<string, unknown>) => houseAdsSchema.safeParse({ ...HOUSE_ADS_DEFAULT, ...patch }).success;
    expect(ok({ on: true, maxPerPage: 6, inlineMax: 3, capDays: 90, creditDays: 30 })).toBe(true);
    expect(ok({ maxPerPage: 0 })).toBe(false);
    expect(ok({ maxPerPage: 7 })).toBe(false);
    expect(ok({ inlineMax: 4 })).toBe(false);
    expect(ok({ popupScrollPct: 5 })).toBe(false);
    expect(ok({ creditDays: 31 })).toBe(false);
    expect(ok({ network: 'adsense' })).toBe(false);
  });
});
