// S12 · PR 239 — the journal's pure rules: the moves between states, the board's columns, the link, the words and the
// reading time, what an article lacks before it is published, the honest byline.
import { describe, expect, it } from 'vitest';
import { BLOG_STATES, actionsFor, byline, editSendsBack, isLive, nextState, postInputSchema, publishGaps, readingMinutes, slugOf, slugify, wordCount } from './model';

describe('journal states (PR 239)', () => {
  it('moves an idea through writing, three review steps, scheduling and publishing, and back', () => {
    expect(nextState('write', 'IDEA')).toBe('DRAFT');
    expect(nextState('pass', 'DRAFT')).toBe('PROOFREAD');
    expect(nextState('pass', 'PROOFREAD')).toBe('FACT_CHECKED');
    expect(nextState('pass', 'FACT_CHECKED')).toBe('SEO_CHECKED');
    expect(nextState('pass', 'SEO_CHECKED')).toBeNull();
    expect(nextState('schedule', 'SEO_CHECKED')).toBe('SCHEDULED');
    expect(nextState('schedule', 'DRAFT')).toBeNull();
    expect(nextState('publish', 'DRAFT')).toBeNull();
    expect(nextState('publish', 'SCHEDULED')).toBe('PUBLISHED');
    expect(nextState('unpublish', 'PUBLISHED')).toBe('UNPUBLISHED');
    expect(nextState('publish', 'UNPUBLISHED')).toBe('PUBLISHED');
    expect(nextState('back', 'SCHEDULED')).toBe('DRAFT');
    expect(nextState('back', 'DRAFT')).toBeNull();
  });

  it('never puts a live article away and restores a put-away one as a draft', () => {
    expect(nextState('archive', 'PUBLISHED')).toBeNull();
    expect(nextState('archive', 'UNPUBLISHED')).toBe('ARCHIVED');
    expect(nextState('archive', 'ARCHIVED')).toBeNull();
    expect(nextState('restore', 'ARCHIVED')).toBe('DRAFT');
    expect(actionsFor('ARCHIVED')).toEqual(['restore']);
    for (const s of BLOG_STATES) expect(actionsFor(s).length).toBeGreaterThan(0);
  });

  it('sends an edited article under review or scheduled back to writing, never a live one', () => {
    expect(editSendsBack('PROOFREAD')).toBe(true);
    expect(editSendsBack('SCHEDULED')).toBe(true);
    expect(editSendsBack('PUBLISHED')).toBe(false);
    expect(editSendsBack('DRAFT')).toBe(false);
  });

  it('is live when published, or scheduled and its time has come; never when put away', () => {
    const now = new Date('2026-11-06T06:00:00Z');
    expect(isLive({ status: 'PUBLISHED', scheduledAt: null, archivedAt: null }, now)).toBe(true);
    expect(isLive({ status: 'SCHEDULED', scheduledAt: new Date('2026-11-06T05:59:00Z'), archivedAt: null }, now)).toBe(true);
    expect(isLive({ status: 'SCHEDULED', scheduledAt: new Date('2026-11-06T06:01:00Z'), archivedAt: null }, now)).toBe(false);
    expect(isLive({ status: 'PUBLISHED', scheduledAt: null, archivedAt: now }, now)).toBe(false);
    expect(isLive({ status: 'SEO_CHECKED', scheduledAt: null, archivedAt: null }, now)).toBe(false);
  });
});

describe('journal words and links (PR 239)', () => {
  it('makes a link from an English title and needs one typed for a Bengali title', () => {
    expect(slugify('How to wash a Polo — 5 tips!')).toBe('how-to-wash-a-polo-5-tips');
    expect(slugOf({ slug: '', title: 'Linen in summer' })).toBe('linen-in-summer');
    expect(slugOf({ slug: '', title: 'পোলো ধোয়ার নিয়ম' })).toBeNull();
    expect(slugOf({ slug: 'polo-wash', title: 'পোলো ধোয়ার নিয়ম' })).toBe('polo-wash');
    expect(slugOf({ slug: 'bad slug', title: 'x' })).toBeNull();
  });

  it('counts words in both languages without the markers, and the reading time per language with a floor', () => {
    expect(wordCount('## Care\n\nWash it cold.\n\n[products]\n[fig polo navy | A polo]\n- dry flat')).toBe(6);
    expect(wordCount('পোলো শার্ট ঠান্ডা পানিতে ধুন')).toBe(5);
    const s = { wordsPerMinuteEn: 200, wordsPerMinuteBn: 150, minMinutes: 2 };
    expect(readingMinutes(1000, 'en', s)).toBe(5);
    expect(readingMinutes(1050, 'bn', s)).toBe(7);
    expect(readingMinutes(10, 'en', s)).toBe(2);
  });

  it('says what an article lacks before it can go live', () => {
    expect(publishGaps({ title: 'A', body: 'Some words', slug: 'a' })).toEqual([]);
    expect(publishGaps({ title: ' ', body: '[products]', slug: '' })).toEqual(['title', 'slug', 'body']);
  });

  it('takes an article input with its defaults and refuses a product twice or an unknown field', () => {
    const ok = postInputSchema.safeParse({ locale: 'en', title: 'Linen' });
    expect(ok.success && ok.data).toMatchObject({ slug: '', body: '', productIds: [], featured: false, categoryId: null, excerpt: null });
    const id = '0190a6e2-0000-7000-8000-000000000001';
    expect(postInputSchema.safeParse({ locale: 'en', title: 'x', productIds: [id, id] }).success).toBe(false);
    expect(postInputSchema.safeParse({ locale: 'fr', title: 'x' }).success).toBe(false);
    expect(postInputSchema.safeParse({ locale: 'en', title: 'x', status: 'PUBLISHED' }).success).toBe(false);
  });
});

describe('the honest byline (PR 239, C11.3)', () => {
  it('labels an AI author with the owner line or the shop words, and a person with none', () => {
    const ai = { displayName: 'Suta', isAiAuthor: true, reviewerLine: null };
    expect(byline(ai, 'bn', { en: '', bn: '' }, 'default')).toEqual({ name: 'Suta', ai: true, note: 'default', reviewer: null });
    expect(byline(ai, 'en', { en: 'Own line', bn: '' }, 'default').note).toBe('Own line');
    expect(byline({ displayName: 'Sample', isAiAuthor: false, reviewerLine: 'Checked by Sample' }, 'en', { en: 'x', bn: '' }, 'd')).toEqual({ name: 'Sample', ai: false, note: null, reviewer: 'Checked by Sample' });
    expect(byline(null, 'en', { en: '', bn: '' }, 'd').name).toBeNull();
  });
});
