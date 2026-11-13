// PR 693 — the comment desk's pure rules.
import { describe, expect, it } from 'vitest';
import { classifyComment, COMMENT_MARK, commentWords, hasPhoneNumber, hasWord, inView, isCommentBody, needsReply, plainText } from './comments-pure';
import { SOCIAL_COMMENT_MARK } from './social-engagement';

const rules = { hidePhone: true, hideAbuse: true, keywords: ['price', 'koto', 'size', 'দাম'], abuseWords: ['chor', 'fake', 'চোর'] };

describe('PR 693 · comment desk (pure)', () => {
  it('reads Bengali digits and finds a mobile number however it is spread', () => {
    expect(plainText('০১৭১২')).toBe('01712');
    for (const t of ['01712559831 call me', '0171 255 9831', '01712-55 98 31 call me', '+8801712559831', 'amar number ০১৮১৯৪৪৩৩২২ e call den', 'call 88 01712 559831']) expect(hasPhoneNumber(t), t).toBe(true);
    for (const t of ['Price koto?', 'size 42 chest 40', 'order 2024 1500 tk', '0121234567', 'call 017125598']) expect(hasPhoneNumber(t), t).toBe(false);
  });

  it('matches a Latin word as a whole word and a Bengali word anywhere', () => {
    expect(hasWord('Price koto?', ['koto'])).toBe(true);
    expect(hasWord('prices are high', ['price'])).toBe(false);
    expect(hasWord('এটা কত', ['কত'])).toBe(true);
    expect(hasWord('anything', ['', ' '])).toBe(false);
  });

  it('hides a phone number first, then abuse, and never answers a hidden comment', () => {
    expect(classifyComment('01712559831 price?', rules)).toEqual({ hide: 'phone', question: false });
    expect(classifyComment('Fake product, chor company', rules)).toEqual({ hide: 'abuse', question: false });
    expect(classifyComment('Price koto?', rules)).toEqual({ hide: null, question: true });
    expect(classifyComment('Very nice 👍', rules)).toEqual({ hide: null, question: false });
    expect(classifyComment('01712559831', { ...rules, hidePhone: false })).toEqual({ hide: null, question: false });
    expect(classifyComment('chor', { ...rules, hideAbuse: false })).toEqual({ hide: null, question: false });
  });

  it('uses the same mark as the inbox', () => {
    expect(COMMENT_MARK).toBe(SOCIAL_COMMENT_MARK);
  });

  it('knows a comment body by its mark and strips it', () => {
    expect(isCommentBody(`${SOCIAL_COMMENT_MARK} Price?`)).toBe(true);
    expect(isCommentBody('Price?')).toBe(false);
    expect(isCommentBody(null)).toBe(false);
    expect(commentWords(`${SOCIAL_COMMENT_MARK} Price?`)).toBe('Price?');
  });

  it('puts a comment in its views', () => {
    const base = { hiddenAt: null, autoRepliedAt: null, answered: false, question: true };
    expect(needsReply(base)).toBe(true);
    expect(needsReply({ ...base, answered: true })).toBe(false);
    expect(needsReply({ ...base, question: false })).toBe(false);
    const hidden = { ...base, hiddenAt: new Date() };
    expect(inView(hidden, 'hidden')).toBe(true);
    expect(inView(hidden, 'need')).toBe(false);
    expect(inView({ ...base, autoRepliedAt: new Date() }, 'auto')).toBe(true);
    expect(inView(base, 'all')).toBe(true);
  });
});
