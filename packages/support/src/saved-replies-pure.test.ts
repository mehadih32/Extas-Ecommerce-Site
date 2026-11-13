// PR 692 — the quick replies' pure rules.
import { describe, expect, it } from 'vitest';
import { cleanShortcut, replyBody, savedReplyInput, slashShortcut, SHORTCUT, STARTER_REPLIES } from './saved-replies-pure';

describe('PR 692 · quick replies (pure)', () => {
  it('cleans a typed short name to one lower-case word', () => {
    expect(cleanShortcut(' /Size ')).toBe('size');
    expect(cleanShortcut('c-o-d!')).toBe('cod');
    expect(cleanShortcut('///')).toBe('');
    expect(cleanShortcut('a'.repeat(40))).toHaveLength(24);
  });

  it('reads /name alone in the box, and nothing else', () => {
    expect(slashShortcut('/size')).toBe('size');
    expect(slashShortcut('/Size ')).toBe('size');
    expect(slashShortcut('/size please')).toBeNull();
    expect(slashShortcut('hello /size')).toBeNull();
    expect(slashShortcut('/')).toBeNull();
  });

  it('puts the chat language first and falls back to the other text', () => {
    const r = { shortcut: 'x', bodyEn: 'Hi', bodyBn: 'হ্যালো' };
    expect(replyBody(r, 'bn')).toBe('হ্যালো');
    expect(replyBody(r, 'en')).toBe('Hi');
    expect(replyBody({ ...r, bodyBn: ' ' }, 'bn')).toBe('Hi');
  });

  it('checks the input: a word, at least one text, a length limit', () => {
    const s = savedReplyInput(20);
    expect(s.parse({ shortcut: '/Price', bodyEn: ' ok ', bodyBn: '' })).toEqual({ shortcut: 'price', bodyEn: 'ok', bodyBn: '' });
    expect(s.safeParse({ shortcut: 'price', bodyEn: '', bodyBn: '' }).success).toBe(false);
    expect(s.safeParse({ shortcut: '', bodyEn: 'x', bodyBn: '' }).success).toBe(false);
    expect(s.safeParse({ shortcut: 'price', bodyEn: 'x'.repeat(21), bodyBn: '' }).success).toBe(false);
    expect(s.safeParse({ shortcut: 'price', bodyEn: 'x', bodyBn: '', extra: 1 }).success).toBe(false);
  });

  it('has 8 starters with unique valid short names and both languages', () => {
    expect(STARTER_REPLIES).toHaveLength(8);
    expect(new Set(STARTER_REPLIES.map((r) => r.shortcut)).size).toBe(8);
    for (const r of STARTER_REPLIES) {
      expect(r.shortcut).toMatch(SHORTCUT);
      expect(r.bodyEn.length).toBeGreaterThan(0);
      expect(r.bodyBn.length).toBeGreaterThan(0);
    }
  });
});
