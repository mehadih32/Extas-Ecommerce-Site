// S13 · PR 257 follow-up (go-live gate customer 360°) — `ads.attribution`: on as it ships (B3.10 locks "sales
// attributed to ads"), every number the owner's, and its words in both languages.
import { describe, expect, it } from 'vitest';
import { attributionSchema, lookup, messages, registry } from '../src/index';

describe('ads.attribution (PR 257 follow-up)', () => {
  const spec = registry['ads.attribution'];

  it('ships on, per store, with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    expect(spec.default).toEqual({ on: true, keepDays: 30, touch: 'last' });
    expect(attributionSchema.safeParse(spec.default).success).toBe(true);
    expect(spec.isOwnerData).toBe(false);
  });

  it('keeps the days within 1–90 and only the two touch rules', () => {
    expect(attributionSchema.safeParse({ on: true, keepDays: 0, touch: 'last' }).success).toBe(false);
    expect(attributionSchema.safeParse({ on: true, keepDays: 91, touch: 'last' }).success).toBe(false);
    expect(attributionSchema.safeParse({ on: true, keepDays: 7, touch: 'first' }).success).toBe(true);
    expect(attributionSchema.safeParse({ on: true, keepDays: 7, touch: 'any' }).success).toBe(false);
  });

  it('has its label and help in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '']) {
      expect(lookup(messages.en, k)).toBeTruthy();
      expect(lookup(messages.bn, k)).toBeTruthy();
    }
  });
});
