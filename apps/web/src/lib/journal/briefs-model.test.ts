// S12 · PR 528 — the brief form, pure: the four things chosen before writing (topic, language, words, keywords), the
// lines and keywords as typed, the word limits from the setting, shop-only links and what is still missing.
import { describe, expect, it } from 'vitest';
import { briefGaps, briefInputSchema, keywordsOf, linesOf } from './briefs-model';

const limits = { wordsMin: 300, wordsMax: 3000 };
const base = { topicId: '0190a000-0000-7000-8000-000000000001', language: 'en', wordCount: 900, keywords: 'polo care' };
const parse = (v: object) => briefInputSchema(limits).safeParse({ ...base, ...v });

describe('the brief form (PR 528)', () => {
  it('reads lines and keywords as typed, without empty ones or repeats', () => {
    expect(linesOf('Why it curls\n\n  How to wash \nWhy it curls')).toEqual(['Why it curls', 'How to wash']);
    expect(keywordsOf('polo care, Polo Care,  collar  curl ,,')).toEqual(['polo care', 'collar curl']);
    expect(keywordsOf(['a', ' a ', 'b'])).toEqual(['a', 'b']);
  });

  it('needs a topic (or a new title), a language, the words within the setting and a keyword', () => {
    expect(parse({}).success).toBe(true);
    expect(parse({ topicId: null }).success).toBe(false);
    expect(parse({ topicId: null, title: 'Polo care guide' }).success).toBe(true);
    expect(parse({ language: 'fr' }).success).toBe(false);
    expect(parse({ wordCount: 299 }).success).toBe(false);
    expect(parse({ wordCount: 3001 }).success).toBe(false);
    expect(parse({ wordCount: '1200' }).success).toBe(true);
    expect(parse({ keywords: ' , ' }).success).toBe(false);
    expect(parse({ extra: 1 }).success).toBe(false);
  });

  it('keeps the links inside the shop and fills the defaults', () => {
    expect(parse({ links: '/collections/polos\nhttps://example.com/x' }).success).toBe(false);
    const ok = parse({ links: '/collections/polos\n/size-chart', outline: 'One\nTwo' });
    expect(ok.success && ok.data).toMatchObject({ links: ['/collections/polos', '/size-chart'], outline: ['One', 'Two'], intent: 'info', imagePolicy: 'own', notes: null });
  });

  it('says what is still missing', () => {
    expect(briefGaps({ topicId: 'x', language: 'bn', wordCount: 900, keywords: ['a'] })).toEqual([]);
    expect(briefGaps({ topicId: null, language: '', wordCount: 0, keywords: [] })).toEqual(['topic', 'language', 'words', 'keywords']);
  });
});
