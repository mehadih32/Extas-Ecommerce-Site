// S12 · PR 239 — `blog.journal`: off as it ships, every number the owner's within its range, and its words in both
// languages.
import { describe, expect, it } from 'vitest';
import { blogAiDraftSchema, blogScheduleSchema, blogBriefSchema, blogJournalSchema, lookup, messages, registry } from '../src/index';

describe('blog.journal (PR 239)', () => {
  const spec = registry['blog.journal'];

  it('ships off, per store, at version 222 (229 since PR 249, 257 since the PR 592 follow-up), with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    // PR 249 added "Read next" (relatedArticles, v229); the PR 592 follow-up tags, author pages, search and RSS (v257)
    expect(spec.version).toBe(257);
    expect(spec.default.on).toBe(false);
    expect(spec.default.reviewByAnother).toBe(false);
    expect(spec.default.aiNote).toEqual({ en: '', bn: '' });
    expect(blogJournalSchema.safeParse(spec.default).success).toBe(true);
    expect(spec.isOwnerData).toBe(false);
  });

  it('PR 249: "Read next" ships off (0), stays within 0–6, and a value saved before it existed reads 0', () => {
    expect(spec.default.relatedArticles).toBe(0);
    const { relatedArticles: _gone, ...old } = spec.default;
    expect(blogJournalSchema.parse(old).relatedArticles).toBe(0);
    expect(blogJournalSchema.safeParse({ ...spec.default, relatedArticles: 7 }).success).toBe(false);
    expect(blogJournalSchema.safeParse({ ...spec.default, relatedArticles: -1 }).success).toBe(false);
  });

  it('PR 592 follow-up: tags, author pages, search and RSS ship off, and a value saved before them reads them off', () => {
    expect(spec.default).toMatchObject({ tags: false, authorPages: false, search: false, rss: false, rssItems: 20 });
    const { tags: _t, authorPages: _a, search: _s, rss: _r, rssItems: _n, ...old } = spec.default;
    expect(blogJournalSchema.parse(old)).toMatchObject({ tags: false, authorPages: false, search: false, rss: false, rssItems: 20 });
    expect(blogJournalSchema.safeParse({ ...spec.default, rssItems: 4 }).success).toBe(false);
    expect(blogJournalSchema.safeParse({ ...spec.default, rssItems: 101 }).success).toBe(false);
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

describe('blog.brief (PR 528)', () => {
  const spec = registry['blog.brief'];

  it('ships with the brief optional for "Start writing", per store, at version 225', () => {
    expect(spec.scope).toBe('store');
    expect(spec.version).toBe(225);
    expect(spec.default.requireForStart).toBe(false);
    expect(blogBriefSchema.safeParse(spec.default).success).toBe(true);
    expect(spec.isOwnerData).toBe(false);
  });

  it('keeps the word counts in range and in order, and refuses unknown fields', () => {
    const ok = (v: object) => blogBriefSchema.safeParse({ ...spec.default, ...v }).success;
    expect(ok({ wordsMin: 99 })).toBe(false);
    expect(ok({ wordsMax: 10_001 })).toBe(false);
    expect(ok({ wordsMin: 1000, wordsDefault: 900 })).toBe(false);
    expect(ok({ wordsMax: 800, wordsDefault: 900 })).toBe(false);
    expect(ok({ requireForStart: true, wordsMin: 100, wordsDefault: 100, wordsMax: 10_000 })).toBe(true);
    expect(ok({ extra: 1 })).toBe(false);
  });

  it('has its words in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '']) {
      expect(lookup(messages.en, k), k).toBeTruthy();
      expect(lookup(messages.bn, k), k).toBeTruthy();
    }
  });
});

describe('blog.aiDraft (PR 243)', () => {
  const spec = registry['blog.aiDraft'];

  it('ships off, per store, at version 226, with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    expect(spec.version).toBe(226);
    expect(spec.default.enabled).toBe(false);
    expect(blogAiDraftSchema.safeParse(spec.default).success).toBe(true);
  });

  it('keeps the daily number in range and refuses unknown fields', () => {
    const ok = (v: object) => blogAiDraftSchema.safeParse({ ...spec.default, ...v }).success;
    expect(ok({ dailyMax: 0 })).toBe(false);
    expect(ok({ dailyMax: 51 })).toBe(false);
    expect(ok({ enabled: true, dailyMax: 50 })).toBe(true);
    expect(ok({ extra: 1 })).toBe(false);
  });

  it('has its words in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '']) {
      expect(lookup(messages.en, k), k).toBeTruthy();
      expect(lookup(messages.bn, k), k).toBeTruthy();
    }
  });
});

describe('blog.schedule (PR 245)', () => {
  const spec = registry['blog.schedule'];

  it('ships with placing by itself off, per store, at version 227, with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    expect(spec.version).toBe(227);
    expect(spec.default.autoFill).toBe(false);
    expect(blogScheduleSchema.safeParse(spec.default).success).toBe(true);
  });

  it('takes only real, distinct times and keeps at least ≤ target ≤ most', () => {
    const ok = (v: object) => blogScheduleSchema.safeParse({ ...spec.default, ...v }).success;
    expect(ok({ slots: '08:30' })).toBe(true);
    expect(ok({ slots: '' })).toBe(false);
    expect(ok({ slots: '24:00' })).toBe(false);
    expect(ok({ slots: '9:00' })).toBe(false);
    expect(ok({ slots: '09:00, 09:00' })).toBe(false);
    expect(ok({ perDayMin: 6, perDayTarget: 5 })).toBe(false);
    expect(ok({ perDayTarget: 7 })).toBe(false);
    expect(ok({ perDayMin: 1, perDayTarget: 1, perDayMax: 1 })).toBe(true);
    expect(ok({ daysAhead: 0 })).toBe(false);
    expect(ok({ leadMinutes: 1441 })).toBe(false);
    expect(ok({ weekStart: 7 })).toBe(false);
    expect(ok({ extra: 1 })).toBe(false);
  });

  it('has its words in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '']) {
      expect(lookup(messages.en, k), k).toBeTruthy();
      expect(lookup(messages.bn, k), k).toBeTruthy();
    }
  });
});
