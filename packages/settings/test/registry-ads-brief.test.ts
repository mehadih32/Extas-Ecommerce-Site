// S13 · PR 270 (registry v176): the creative brief's settings — at version 176, never owner data, labelled in both
// languages, off as it ships, every value bounded, the shortest video cut never longer than the longest.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsBriefSettings, adsCreativeBriefSchema, BRIEF_CAROUSEL_MAX, BRIEF_VIDEO_MAX_SECONDS } from '../src/registry-ads-brief';

describe('ads.creativeBrief (v176)', () => {
  it('is in the registry at version 176, store-level, labelled in English and Bengali', () => {
    const spec = adsBriefSettings['ads.creativeBrief'];
    expect(registry['ads.creativeBrief']).toBe(spec);
    expect(spec.version).toBe(176);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off and refuses what is out of range', () => {
    const d = adsBriefSettings['ads.creativeBrief'].default;
    expect(d.on).toBe(false);
    expect(d.optimiseFor).toBe('deliveredPurchase');
    expect(adsCreativeBriefSchema.safeParse(d).success).toBe(true);
    for (const bad of [{ carouselCards: 1 }, { carouselCards: BRIEF_CAROUSEL_MAX + 1 }, { videoMinSeconds: 0 }, { videoMaxSeconds: BRIEF_VIDEO_MAX_SECONDS + 1 }, { videoMinSeconds: 20, videoMaxSeconds: 10 }, { optimiseFor: 'clicks' }, { extra: 1 }])
      expect(adsCreativeBriefSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});
