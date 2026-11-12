// S24 · PR 460 — pure tests: the recommended-provider pick and the recommendation note's own honesty rules, no
// database involved.
import { describe, expect, it } from 'vitest';
import type { PhotoshootRates } from './costLedger';
import { photoshootRecommendationNote, PHOTOSHOOT_PROVIDER_RECOMMENDATION_ORDER, recommendedPhotoshootProvider } from './recommendation';

const none: PhotoshootRates = { fashn: { baseline: 0, premium: 0 }, fitroom: { baseline: 0, premium: 0 } };

describe('PHOTOSHOOT_PROVIDER_RECOMMENDATION_ORDER', () => {
  it('lists fashn before fitroom — C7.17 lists FASHN first among the providers to benchmark', () => {
    expect(PHOTOSHOOT_PROVIDER_RECOMMENDATION_ORDER).toEqual(['fashn', 'fitroom']);
  });
});

describe('recommendedPhotoshootProvider', () => {
  it('is null when the owner has configured no rated provider at all — nothing to recommend', () => {
    expect(recommendedPhotoshootProvider(none)).toBeNull();
  });

  it('is the one rated provider the owner has set any rate for', () => {
    expect(recommendedPhotoshootProvider({ ...none, fitroom: { baseline: 5000, premium: 0 } })).toBe('fitroom');
  });

  it('a non-zero rate at either tier counts, not only baseline', () => {
    expect(recommendedPhotoshootProvider({ ...none, fitroom: { baseline: 0, premium: 9000 } })).toBe('fitroom');
  });

  it('prefers fashn over fitroom when the owner has set up both', () => {
    expect(recommendedPhotoshootProvider({ fashn: { baseline: 10000, premium: 20000 }, fitroom: { baseline: 5000, premium: 9000 } })).toBe('fashn');
  });
});

describe('photoshootRecommendationNote', () => {
  const bothSet: PhotoshootRates = { fashn: { baseline: 10000, premium: 20000 }, fitroom: { baseline: 8000, premium: 16000 } };

  it('is null for the free practice provider — nothing to compare it to', () => {
    expect(photoshootRecommendationNote({ provider: 'mockPhotoshoot', tier: 'baseline', rates: bothSet })).toBeNull();
  });

  it('is null when the owner has configured no rated provider yet', () => {
    expect(photoshootRecommendationNote({ provider: 'fashn', tier: 'baseline', rates: none })).toBeNull();
  });

  it('is null when the chosen provider already matches the system\'s own suggestion', () => {
    expect(photoshootRecommendationNote({ provider: 'fashn', tier: 'baseline', rates: bothSet })).toBeNull();
  });

  it('never claims a quality difference — every non-null note ends on the same honest disclaimer', () => {
    const note = photoshootRecommendationNote({ provider: 'fitroom', tier: 'baseline', rates: bothSet })!;
    expect(note).toMatch(/quality is not compared here/);
  });

  it('names a real cost delta in paisa when both providers have a rate set at this tier', () => {
    const note = photoshootRecommendationNote({ provider: 'fitroom', tier: 'baseline', rates: bothSet })!;
    expect(note).toContain('fitroom');
    expect(note).toContain('fashn');
    expect(note).toContain('2000 paisa less');
  });

  it('says "more" when the chosen provider costs more than the suggestion', () => {
    const rates: PhotoshootRates = { fashn: { baseline: 5000, premium: 10000 }, fitroom: { baseline: 9000, premium: 18000 } };
    const note = photoshootRecommendationNote({ provider: 'fitroom', tier: 'baseline', rates })!;
    expect(note).toContain('4000 paisa more');
  });

  it('says they cost the same, with no invented delta, when the rates happen to match', () => {
    const rates: PhotoshootRates = { fashn: { baseline: 7000, premium: 14000 }, fitroom: { baseline: 7000, premium: 14000 } };
    const note = photoshootRecommendationNote({ provider: 'fitroom', tier: 'baseline', rates })!;
    expect(note).toMatch(/costs the same as/);
  });

  it('never invents a cost comparison when the chosen provider has no rate set at this tier', () => {
    const rates: PhotoshootRates = { fashn: { baseline: 10000, premium: 20000 }, fitroom: { baseline: 0, premium: 16000 } };
    const note = photoshootRecommendationNote({ provider: 'fitroom', tier: 'baseline', rates })!;
    expect(note).toMatch(/no rate is set yet for fitroom/);
    expect(note).not.toMatch(/\d+ paisa/);
  });

  it('never invents a cost comparison when the suggested provider has no rate set at this tier', () => {
    const rates: PhotoshootRates = { fashn: { baseline: 0, premium: 20000 }, fitroom: { baseline: 8000, premium: 0 } };
    // fitroom is the only one with ANY rate set here under one ordering check — force fashn to be "configured"
    // (premium only) so it is recommended, then ask about its own unset baseline tier.
    const note = photoshootRecommendationNote({ provider: 'fitroom', tier: 'baseline', rates })!;
    expect(note).toMatch(/fashn is the system's own suggestion but has no rate set at this tier yet/);
  });
});
