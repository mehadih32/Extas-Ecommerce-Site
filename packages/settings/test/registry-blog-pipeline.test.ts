// S12 · PR 591 (registry v254): the blog content pipeline — off as shipped, 3 a day for two weeks then 5 while healthy,
// waiting for Google's indexing numbers, every number bounded, labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { BLOG_PIPELINE_DEFAULT, blogPipelineSchema, blogPipelineSettings } from '../src/registry-blog-pipeline';

describe('blog content pipeline (v254)', () => {
  it('is in the registry at version 254, per store, labelled in English and Bengali, its default valid', () => {
    const s = blogPipelineSettings['blog.pipeline'];
    expect(registry['blog.pipeline']).toBe(s);
    expect(s.version).toBe(254);
    expect(s.scope).toBe('store');
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
    }
  });

  it('ships off with the content plan’s pace: 3 a day for 14 days, then 5 only while healthy', () => {
    expect(BLOG_PIPELINE_DEFAULT).toMatchObject({ on: false, startPerDay: 3, fullPerDay: 5, rampDays: 14, waitForIndexing: true });
  });

  it('keeps every number inside its bounds, the start never above the full pace, and refuses unknown fields', () => {
    const ok = (patch: Record<string, unknown>) => blogPipelineSchema.safeParse({ ...BLOG_PIPELINE_DEFAULT, ...patch }).success;
    expect(ok({ on: true, startPerDay: 5, fullPerDay: 5, rampDays: 0 })).toBe(true);
    expect(ok({ startPerDay: 6, fullPerDay: 5 })).toBe(false);
    expect(ok({ startPerDay: 0 })).toBe(false);
    expect(ok({ maxBackPct: 101 })).toBe(false);
    expect(ok({ refreshDays: 10 })).toBe(false);
    expect(ok({ writer: 'ai' })).toBe(false);
  });
});
