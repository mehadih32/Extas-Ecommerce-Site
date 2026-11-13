// S25 · PR 482 — the image-to-video provider's mock: a pure cost estimate (never an invented number when the owner
// has not set a rate) and the honest-preview clip (the source still itself, never fabricated footage).
import { describe, expect, it } from 'vitest';
import { estimateFromRate, mockVideoProviderAdapter, VIDEO_ASPECTS } from '../src';

describe('estimateFromRate (pure)', () => {
  it('is null while the owner has not set a rate (CN-018: never an invented cost)', () => {
    expect(estimateFromRate({ durationSec: 8, aspect: '9:16', ratePerSecondMinor: 0 })).toEqual({ costMinor: null, currency: 'BDT' });
  });

  it('multiplies the owner\'s own rate by the duration once a rate is set', () => {
    expect(estimateFromRate({ durationSec: 8, aspect: '9:16', ratePerSecondMinor: 150 })).toEqual({ costMinor: 1200, currency: 'BDT' });
  });

  it('is null for a non-positive duration', () => {
    expect(estimateFromRate({ durationSec: 0, aspect: '1:1', ratePerSecondMinor: 150 }).costMinor).toBeNull();
  });

  it('leaving passes out prices a single pass, same as passes: 1', () => {
    const noPasses = estimateFromRate({ durationSec: 8, aspect: '9:16', ratePerSecondMinor: 150 });
    const onePass = estimateFromRate({ durationSec: 8, aspect: '9:16', ratePerSecondMinor: 150, passes: 1 });
    expect(noPasses).toEqual(onePass);
    expect(noPasses.costMinor).toBe(1200);
  });

  it('best-of-2 (passes: 2) costs exactly twice a single pass (Blueprint C8.2)', () => {
    expect(estimateFromRate({ durationSec: 8, aspect: '9:16', ratePerSecondMinor: 150, passes: 2 }).costMinor).toBe(2400);
  });

  it('is null for a non-positive passes count', () => {
    expect(estimateFromRate({ durationSec: 8, aspect: '9:16', ratePerSecondMinor: 150, passes: 0 }).costMinor).toBeNull();
  });
});

describe('mockVideoProviderAdapter', () => {
  it('declares every Blueprint C8.1 aspect', () => {
    expect(VIDEO_ASPECTS).toEqual(['9:16', '1:1', '4:5', '16:9']);
  });

  it('the mock estimates from the rate it is given, and refuses an unknown aspect', async () => {
    const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };
    const api = await mockVideoProviderAdapter.mock(ctx);
    expect(await api.estimate({ durationSec: 4, aspect: '1:1', ratePerSecondMinor: 100 })).toEqual({ costMinor: 400, currency: 'BDT' });
    await expect(api.estimate({ durationSec: 4, aspect: '21:9' as never, ratePerSecondMinor: 100 })).rejects.toThrow(/unknown aspect/);
  });

  it('the mock never fabricates footage: a clip job hands back the source still itself, marked practice', async () => {
    const ctx = { mode: 'MOCK' as const, config: {}, storeId: 1, secret: async () => null };
    const api = await mockVideoProviderAdapter.mock(ctx);
    const result = await api.createClip({ sourceAssetId: 'asset-1', durationSec: 6, aspect: '9:16' });
    expect(result).toMatchObject({ status: 'SUCCEEDED', outputAssetId: 'asset-1', practice: true });
  });

  it('`create` (a real LIVE provider) is not available yet', async () => {
    const ctx = { mode: 'LIVE' as const, config: {}, storeId: 1, secret: async () => null };
    await expect(mockVideoProviderAdapter.create(ctx)).rejects.toThrow(/no video provider is connected/);
  });
});
