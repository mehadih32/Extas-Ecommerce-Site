// S22 · PR 432 (registry v180–181): EXTAS AI's draft answers — never owner data, labelled in both languages, off as
// shipped (CN-018), every number bounded, every text in both languages with only the listed tokens.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { DRAFT_TEXTS, DRAFT_WORD_LISTS, supportDraftKeywordsSchema, supportDraftsSchema, supportDraftsSettings, supportDraftWordsSchema } from '../src/registry-support-drafts';

const on = supportDraftsSettings['support.drafts'];
const words = supportDraftsSettings['support.draftWords'];
const keys = supportDraftsSettings['support.draftKeywords'];

describe('support.drafts and support.draftWords (v180–182)', () => {
  it('are in the registry at versions 180, 181 and 182, store-level, labelled in English and Bengali', () => {
    expect(registry['support.drafts']).toBe(on);
    expect(registry['support.draftWords']).toBe(words);
    expect(registry['support.draftKeywords']).toBe(keys);
    expect([on.version, words.version, keys.version]).toEqual([180, 181, 182]);
    for (const s of [on, words, keys]) {
      expect(s.scope).toBe('store');
      expect(s.isOwnerData).toBe(false);
      expect(s.isPublic).toBe(false);
      for (const lang of ['en', 'bn'] as const) for (const k of [s.labelKey, s.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
    }
  });

  it('ships off; the bulk count is bounded; each question is handed over once', () => {
    expect(on.default).toEqual({ enabled: false, banglishReply: 'bn', handover: ['complaint', 'bulk', 'unknown'], bulkPieces: 10 });
    for (const bad of [{ enabled: 'yes' }, { extra: 1 }, { banglishReply: 'fr' }, { bulkPieces: 1 }, { bulkPieces: 1001 }, { bulkPieces: 2.5 }, { handover: ['refund'] }, { handover: ['bulk', 'bulk'] }])
      expect(supportDraftsSchema.safeParse({ ...on.default, ...bad }).success, JSON.stringify(bad)).toBe(false);
  });

  it('has every text in both languages, only the listed tokens, and every word list filled', () => {
    expect(supportDraftWordsSchema.safeParse(words.default).success).toBe(true);
    expect(supportDraftKeywordsSchema.safeParse(keys.default).success).toBe(true);
    expect(Object.keys(words.default).sort()).toEqual([...DRAFT_TEXTS].sort());
    expect(Object.keys(keys.default).sort()).toEqual([...DRAFT_WORD_LISTS].sort());
    for (const k of DRAFT_WORD_LISTS) expect(keys.default[k].split(',').filter((w) => w.trim()).length, k).toBeGreaterThan(0);
    expect(supportDraftKeywordsSchema.safeParse({ ...keys.default, cancel: 'x'.repeat(601) }).success).toBe(false);
    const bad = { ...words.default, cancel: { en: 'Refund {amount}', bn: 'ফেরত {amount}' } };
    expect(supportDraftWordsSchema.safeParse(bad).success).toBe(false);
    // a draft never promises money: no amount token, no refund words in the defaults
    for (const t of Object.values(words.default)) expect(`${t.en} ${t.bn}`).not.toMatch(/refund|ফেরত|discount|ছাড়/i);
  });
});
