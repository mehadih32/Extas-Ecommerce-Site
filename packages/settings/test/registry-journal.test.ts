// S12 · PR 239 — `blog.journal`: off as it ships, every number the owner's within its range, and its words in both
// languages.
import { describe, expect, it } from 'vitest';
import { blogJournalSchema, lookup, messages, registry } from '../src/index';

describe('blog.journal (PR 239)', () => {
  const spec = registry['blog.journal'];

  it('ships off, per store, at version 222, with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    expect(spec.version).toBe(222);
    expect(spec.default.on).toBe(false);
    expect(spec.default.reviewByAnother).toBe(false);
    expect(spec.default.aiNote).toEqual({ en: '', bn: '' });
    expect(blogJournalSchema.safeParse(spec.default).success).toBe(true);
    expect(spec.isOwnerData).toBe(false);
  });

  it('keeps every number within its range and refuses unknown fields', () => {
    const ok = (v: object) => blogJournalSchema.safeParse({ ...spec.default, ...v }).success;
    expect(ok({ perPage: 5 })).toBe(false);
    expect(ok({ perPage: 49 })).toBe(false);
    expect(ok({ wordsPerMinuteEn: 59 })).toBe(false);
    expect(ok({ wordsPerMinuteBn: 401 })).toBe(false);
    expect(ok({ minMinutes: 0 })).toBe(false);
    expect(ok({ relatedProducts: 9 })).toBe(false);
    expect(ok({ aiNote: { en: 'x'.repeat(201), bn: '' } })).toBe(false);
    expect(ok({ on: true, perPage: 48, relatedProducts: 0, minMinutes: 10 })).toBe(true);
    expect(ok({ extra: 1 })).toBe(false);
  });

  it('has its words in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '', 'groups.blog']) {
      expect(lookup(messages.en, k), k).toBeTruthy();
      expect(lookup(messages.bn, k), k).toBeTruthy();
    }
  });
});
