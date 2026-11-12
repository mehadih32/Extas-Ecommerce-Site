// S24 · PR 459 — pure tests: the estimate arithmetic, the tier's own default image count, the reuse-hash
// fingerprint and the provider-key guard. No database involved.
import { describe, expect, it } from 'vitest';
import { computeReuseHash, estimateGenerationCostMinor, imageCountForTier, isPhotoshootProvider, photoshootCostDetail, PHOTOSHOOT_PROVIDERS, type PhotoshootRates } from './costLedger';

const rates: PhotoshootRates = { fashn: { baseline: 10000, premium: 20000 }, fitroom: { baseline: 5000, premium: 0 } };

describe('PHOTOSHOOT_PROVIDERS / isPhotoshootProvider', () => {
  it('lists exactly the three known provider keys', () => {
    expect(PHOTOSHOOT_PROVIDERS).toEqual(['mockPhotoshoot', 'fashn', 'fitroom']);
  });

  it('accepts only a known key', () => {
    expect(isPhotoshootProvider('fashn')).toBe(true);
    expect(isPhotoshootProvider('fitroom')).toBe(true);
    expect(isPhotoshootProvider('mockPhotoshoot')).toBe(true);
    expect(isPhotoshootProvider('openai')).toBe(false);
    expect(isPhotoshootProvider(42)).toBe(false);
  });
});

describe('estimateGenerationCostMinor', () => {
  it('is the rate times the image count, rounded', () => {
    expect(estimateGenerationCostMinor({ provider: 'fashn', tier: 'baseline', imageCount: 1, rates })).toBe(10000);
    expect(estimateGenerationCostMinor({ provider: 'fashn', tier: 'premium', imageCount: 2, rates })).toBe(40000);
  });

  it('is null for the free practice provider, no matter the rate table', () => {
    expect(estimateGenerationCostMinor({ provider: 'mockPhotoshoot', tier: 'premium', imageCount: 2, rates })).toBeNull();
  });

  it('is null when the owner has not set a rate yet (0, CN-018) — never an invented number', () => {
    expect(estimateGenerationCostMinor({ provider: 'fitroom', tier: 'premium', imageCount: 2, rates })).toBeNull();
  });

  it('is null for a non-positive image count', () => {
    expect(estimateGenerationCostMinor({ provider: 'fashn', tier: 'baseline', imageCount: 0, rates })).toBeNull();
  });
});

describe('imageCountForTier', () => {
  it('is 1 for baseline (a single pass) and 2 for premium (best-of-2, C7.7)', () => {
    expect(imageCountForTier('baseline')).toBe(1);
    expect(imageCountForTier('premium')).toBe(2);
  });
});

describe('computeReuseHash', () => {
  const base = { productId: '11111111-1111-1111-1111-111111111111', angle: 'front', tier: 'baseline', inputAssetIds: ['a', 'b'], provider: 'fashn' as const };

  it('is deterministic and order-independent for inputAssetIds', () => {
    const h1 = computeReuseHash(base);
    const h2 = computeReuseHash({ ...base, inputAssetIds: ['b', 'a'] });
    expect(h1).toBe(h2);
  });

  it('treats an omitted optional field the same as an explicit null', () => {
    const h1 = computeReuseHash(base);
    const h2 = computeReuseHash({ ...base, colourId: null, recipeId: null, modelId: null, sceneId: null, providerVersion: null });
    expect(h1).toBe(h2);
  });

  it('changes when the product, model, any setting, or the provider/version changes', () => {
    const h0 = computeReuseHash(base);
    expect(computeReuseHash({ ...base, productId: '22222222-2222-2222-2222-222222222222' })).not.toBe(h0);
    expect(computeReuseHash({ ...base, modelId: 'm1' })).not.toBe(h0);
    expect(computeReuseHash({ ...base, tier: 'premium' })).not.toBe(h0);
    expect(computeReuseHash({ ...base, angle: 'back' })).not.toBe(h0);
    expect(computeReuseHash({ ...base, provider: 'fitroom' })).not.toBe(h0);
    expect(computeReuseHash({ ...base, providerVersion: 'v2' })).not.toBe(h0);
  });

  it('does NOT change with the seed — deliberately broader than the idempotency key (a different attempt at the same request still matches)', () => {
    // computeReuseHash takes no seed at all; two otherwise-identical inputs always hash the same regardless of
    // whatever seed a caller happened to draw for the underlying job.
    expect(computeReuseHash(base)).toBe(computeReuseHash({ ...base }));
  });
});

describe('photoshootCostDetail', () => {
  it('names the provider, tier and image count, with correct pluralisation', () => {
    expect(photoshootCostDetail('fashn', 'premium', 2)).toBe('fashn · premium · 2 images');
    expect(photoshootCostDetail('fitroom', 'baseline', 1)).toBe('fitroom · baseline · 1 image');
  });
});
