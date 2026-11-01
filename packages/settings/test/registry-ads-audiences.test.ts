// S13 · PR 263 (registry v170): sending audiences to the ad platforms — at version 170, never owner data, labelled in
// both languages, off as it ships with nothing filled in for the owner (no country, no lookalike size, no floor), and
// every value bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsAudiencesSchema, adsAudiencesSettings, lookalikeCountries } from '../src/registry-ads-audiences';

const spec = adsAudiencesSettings['ads.audiences'];

describe('ads.audiences (v170)', () => {
  it('is in the registry at version 170, store-level, labelled in English and Bengali', () => {
    expect(registry['ads.audiences']).toBe(spec);
    expect(spec.version).toBe(170);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off with nothing filled in', () => {
    expect(spec.default).toEqual({ push: false, countries: '', metaPercent: 0, googleSize: '', tiktokSize: '', minMeta: 0, minGoogle: 0, minTiktok: 0 });
    expect(adsAudiencesSchema.safeParse(spec.default).success).toBe(true);
    expect(lookalikeCountries(spec.default)).toEqual([]);
  });

  it('reads the countries as codes and refuses what is out of range', () => {
    expect(lookalikeCountries({ countries: 'bd, IN ,bd' })).toEqual(['BD', 'IN']);
    const d = spec.default;
    for (const bad of [{ countries: 'Bangladesh' }, { metaPercent: 11 }, { googleSize: 'huge' }, { minMeta: -1 }, { extra: 1 }]) expect(adsAudiencesSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});
