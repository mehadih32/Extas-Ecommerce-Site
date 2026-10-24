// S02 · PR 59, 65 (registry v35): every key at version 35, never owner data, labelled in both languages, its default
// valid — and the two rules the owner's standing instructions put on this file: the trained ease is off, and nothing
// that costs money can be granted with the shipped defaults.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { reviewPhotoRewardSchema, reviewSettings, reviewSubmitSchema, sizeAdviceSchema } from '../src/registry-reviews';

describe('reviews and size-advice settings (v35)', () => {
  it('every key is in the registry at version 35, never owner data, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(reviewSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(35);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 59: Find My Size learning never touches the finder until the owner switches the trained ease on', () => {
    const d = reviewSettings['catalogue.sizeAdvice'].default;
    expect(d.useTrainedEase).toBe(false);
    expect(d.report.minAnswers).toBeGreaterThan(0);
    expect(d.train.maxEaseAdjustInch).toBeGreaterThan(0);
    expect(sizeAdviceSchema.safeParse({ ...d, useTrainedEase: 'yes' }).success).toBe(false);
    expect(sizeAdviceSchema.safeParse({ ...d, report: { ...d.report, minAnswers: 0 } }).success).toBe(false);
    expect(sizeAdviceSchema.safeParse({ ...d, train: { ...d.train, maxEaseAdjustInch: 9 } }).success).toBe(false);
    expect(sizeAdviceSchema.safeParse({ ...d, train: { ...d.train, stepInch: 0 } }).success).toBe(false);
  });

  it('PR 65: nothing is paid for a review with the shipped defaults, and no amount is even set', () => {
    const r = reviewSettings['reviews.photoReward'].default;
    expect(r.enabled).toBe(false);
    expect(r.amountMinor).toBeNull(); // CN-018: the owner types his own figure, we never ship one
    expect(r.onePerOrder).toBe(true);
    expect(reviewPhotoRewardSchema.safeParse({ ...r, amountMinor: -1 }).success).toBe(false);
    expect(reviewPhotoRewardSchema.safeParse({ ...r, minRating: 6 }).success).toBe(false);
    expect(reviewPhotoRewardSchema.safeParse({ ...r, enabled: true, amountMinor: 5_000 }).success).toBe(true);
  });

  it('PR 65: only a buyer of a delivered order writes a review, and every review waits for the shop\'s check', () => {
    const s = reviewSettings['reviews.submit'].default;
    expect(s.onlyDelivered).toBe(true);
    expect(s.withinDays).toBeGreaterThan(0);
    expect(s.bodyMax).toBeGreaterThan(0);
    expect(reviewSettings['reviews.moderation'].default.oneReviewPerLine).toBe(true);
    expect(reviewSubmitSchema.safeParse({ ...s, withinDays: -1 }).success).toBe(false);
    expect(reviewSubmitSchema.safeParse({ ...s, photos: { ...s.photos, maxMb: 0 } }).success).toBe(false);
  });

  it('PR 65: the product page block shows at most a handful of reviews, photos first', () => {
    const p = reviewSettings['pdp.reviews'].default;
    expect(p.on).toBe(true);
    expect(p.max).toBe(3); // the demo's row (V12.2 `pdp_reviewsSection`)
    expect(p.photosFirst).toBe(true);
  });
});
