// S02 · PR 59, 65 (registry v35): every key at version 35, never owner data, labelled in both languages, its default
// valid — and the two rules the owner's standing instructions put on this file: the trained ease is off, and nothing
// that costs money can be granted with the shipped defaults.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { reviewSettings, sizeAdviceSchema } from '../src/registry-reviews';

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
});
