// S13 · PR 589 (registry v256): the Merchant Center feed — off as shipped, Bangladesh as the target country, sold-out
// products kept as "out of stock", every value bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { MERCHANT_FEED_DEFAULT, merchantFeedSchema, merchantFeedSettings } from '../src/registry-merchant-feed';

describe('merchant feed (v256, v259, v260)', () => {
  it('is in the registry at version 260 (PR 589 follow-up 707), per store, labelled in English and Bengali, its default valid', () => {
    const s = merchantFeedSettings['ads.merchantFeed'];
    expect(registry['ads.merchantFeed']).toBe(s);
    expect(s.version).toBe(260);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off for Bangladesh', () => {
    expect(MERCHANT_FEED_DEFAULT).toEqual({ on: false, country: 'BD', maxItems: 5000, outOfStock: true, variants: false, salePrice: false, gender: '', ageGroup: '' });
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

  it('PR 589 follow-up: one item per size and colour is off as shipped, and a value saved before v259 reads as off', () => {
    const { variants: _v, ...before } = MERCHANT_FEED_DEFAULT;
    const read = merchantFeedSchema.safeParse(before);
    expect(read.success).toBe(true);
    expect(read.data?.variants).toBe(false);
    expect(merchantFeedSchema.safeParse({ ...MERCHANT_FEED_DEFAULT, variants: true }).success).toBe(true);
    expect(merchantFeedSchema.safeParse({ ...MERCHANT_FEED_DEFAULT, variants: 'yes' }).success).toBe(false);
  });

  it('PR 589 follow-up 707: the struck price is off and gender / age group empty as shipped; a value saved before v260 reads so', () => {
    const { salePrice: _s, gender: _g, ageGroup: _a, ...before } = MERCHANT_FEED_DEFAULT;
    const read = merchantFeedSchema.safeParse(before);
    expect(read.success).toBe(true);
    expect(read.data).toMatchObject({ salePrice: false, gender: '', ageGroup: '' });
    const ok = (patch: Record<string, unknown>) => merchantFeedSchema.safeParse({ ...MERCHANT_FEED_DEFAULT, ...patch }).success;
    expect(ok({ salePrice: true, gender: 'male', ageGroup: 'adult' })).toBe(true);
    expect(ok({ gender: 'men' })).toBe(false);
    expect(ok({ ageGroup: 'teen' })).toBe(false);
    expect(ok({ salePriceMinor: 100 })).toBe(false);
  });
});
