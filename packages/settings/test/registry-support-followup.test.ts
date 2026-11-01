// S22 · PR 433 (registry v183–184): follow-ups on chats without an order — never owner data, labelled in both
// languages, off as shipped (CN-018) with no coupon named, every number bounded, every text in both languages with only
// the listed tokens, and no words that promise money.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { FOLLOW_UP_BOUNDS, FOLLOW_UP_TEXTS, supportFollowUpSchema, supportFollowUpSettings, supportFollowUpWordsSchema } from '../src/registry-support-followup';

const on = supportFollowUpSettings['support.followUp'];
const words = supportFollowUpSettings['support.followUpWords'];

describe('support.followUp and support.followUpWords (v183–184)', () => {
  it('are in the registry at versions 183 and 184, store-level, labelled in English and Bengali', () => {
    expect(registry['support.followUp']).toBe(on);
    expect(registry['support.followUpWords']).toBe(words);
    expect([on.version, words.version]).toEqual([183, 184]);
    for (const s of [on, words]) {
      expect(s.scope).toBe('store');
      expect(s.isOwnerData).toBe(false);
      expect(s.isPublic).toBe(false);
      for (const lang of ['en', 'bn'] as const) for (const k of [s.labelKey, s.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
    }
  });

  it('ships off, with win-back off and no coupon named; every number is bounded; each rule once', () => {
    expect(on.default).toEqual({ enabled: false, rules: ['bag', 'products'], afterHours: 4, maxPerChat: 1, gapDays: 7, perDay: 20, windowMarginMinutes: 60, cancelledDays: 3, banglishReply: 'bn', offerCode: '' });
    expect(supportFollowUpSchema.safeParse(on.default).success).toBe(true);
    const bad: Record<string, unknown>[] = [{ enabled: 'yes' }, { extra: 1 }, { banglishReply: 'fr' }, { rules: ['refund'] }, { rules: ['bag', 'bag'] }, { offerCode: 'x'.repeat(41) }];
    for (const [k, b] of Object.entries(FOLLOW_UP_BOUNDS)) bad.push({ [k]: b.min - 1 }, { [k]: b.max + 1 }, { [k]: b.min + 0.5 });
    for (const b of bad) expect(supportFollowUpSchema.safeParse({ ...on.default, ...b }).success, JSON.stringify(b)).toBe(false);
  });

  it('has every text in both languages with only the listed tokens, and promises no money', () => {
    expect(supportFollowUpWordsSchema.safeParse(words.default).success).toBe(true);
    expect(Object.keys(words.default).sort()).toEqual([...FOLLOW_UP_TEXTS].sort());
    expect(supportFollowUpWordsSchema.safeParse({ ...words.default, bag: { en: 'Pay {amount}', bn: '{amount} দিন' } }).success).toBe(false);
    for (const t of Object.values(words.default)) expect(`${t.en} ${t.bn}`).not.toMatch(/refund|ফেরত|discount|ছাড়|free|ফ্রি|\d/i);
    expect(words.default.offer.en).toContain('{code}');
    expect(words.default.offer.bn).toContain('{code}');
  });
});
