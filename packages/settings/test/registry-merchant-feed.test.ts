// S13 · PR 589 (registry v256): the Merchant Center feed — off as shipped, Bangladesh as the target country, sold-out
// products kept as "out of stock", every value bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { MERCHANT_FEED_DEFAULT, merchantFeedSchema, merchantFeedSettings } from '../src/registry-merchant-feed';

describe('merchant feed (v256)', () => {
  it('is in the registry at version 256, per store, labelled in English and Bengali, its default valid', () => {
    const s = merchantFeedSettings['ads.merchantFeed'];
    expect(registry['ads.merchantFeed']).toBe(s);
    expect(s.version).toBe(256);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off for Bangladesh', () => {
    expect(MERCHANT_FEED_DEFAULT).toEqual({ on: false, country: 'BD', maxItems: 5000, outOfStock: true });
  });

  it('takes a two-letter country only, bounded numbers, and no key or budget field', () => {
    const ok = (patch: Record<string, unknown>) => merchantFeedSchema.safeParse({ ...MERCHANT_FEED_DEFAULT, ...patch }).success;
    expect(ok({ on: true, country: 'IN', maxItems: 100_000 })).toBe(true);
    expect(ok({ country: 'bd' })).toBe(false);
    expect(ok({ country: 'BGD' })).toBe(false);
    expect(ok({ maxItems: 0 })).toBe(false);
    expect(ok({ apiKey: 'x' })).toBe(false);
    expect(ok({ dailyBudget: 1 })).toBe(false);
  });
});
