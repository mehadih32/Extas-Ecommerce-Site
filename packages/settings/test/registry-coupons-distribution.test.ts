// S13 · PR 272 (registry v177): how coupon codes reach people — at version 177, never owner data, labelled in both
// languages, both parts off as it ships, every number bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { COUPON_BATCH_MAX, couponDistributionSchema, couponDistributionSettings } from '../src/registry-coupons-distribution';

describe('rules.coupons.distribution (v177)', () => {
  it('is in the registry at version 177, store-level, labelled in English and Bengali', () => {
    const spec = couponDistributionSettings['rules.coupons.distribution'];
    expect(registry['rules.coupons.distribution']).toBe(spec);
    expect(spec.version).toBe(177);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off and refuses what is out of range', () => {
    const d = couponDistributionSettings['rules.coupons.distribution'].default;
    expect(d).toMatchObject({ links: false, batches: false });
    expect(couponDistributionSchema.safeParse(d).success).toBe(true);
    for (const bad of [{ batchMax: 0 }, { batchMax: COUPON_BATCH_MAX + 1 }, { randomLength: 5 }, { randomLength: 17 }, { extra: 1 }]) expect(couponDistributionSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});
