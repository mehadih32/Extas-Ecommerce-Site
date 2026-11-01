// PR 433 — the follow-up rules without a database: when a chat is quiet enough, the reply window's margin, which rule
// holds (in the owner's order, win-back only while it is recent), one person across chats, the words and the coupon line.
import { registry } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { followUpBody, followUpDueAt, followUpLang, followUpOpen, followUpRuleOf, personKeysOf } from './followups-pure';

const cfg = { ...registry['support.followUp'].default, enabled: true };
const words = registry['support.followUpWords'].default;
const H = 3_600_000;
const now = new Date('2026-11-01T12:00:00Z');
const quiet = (hours: number, over: Partial<Parameters<typeof followUpOpen>[0]> = {}) => ({ status: 'WAITING', lastDirection: 'OUT', lastMessageAt: new Date(now.getTime() - hours * H), windowExpiresAt: null, ...over });

describe('PR 433 · follow-up rules', () => {
  it('is due afterHours after the shop answered last, never on a solved chat or one where the customer wrote last', () => {
    expect(followUpDueAt(quiet(1), cfg)).toEqual(new Date(now.getTime() + 3 * H));
    expect(followUpOpen(quiet(3.9), cfg, now)).toBe(false);
    expect(followUpOpen(quiet(4), cfg, now)).toBe(true);
    expect(followUpOpen(quiet(5, { status: 'OPEN' }), cfg, now)).toBe(true);
    expect(followUpOpen(quiet(5, { status: 'SOLVED' }), cfg, now)).toBe(false);
    expect(followUpOpen(quiet(5, { lastDirection: 'IN' }), cfg, now)).toBe(false);
    expect(followUpOpen(quiet(5, { lastMessageAt: null }), cfg, now)).toBe(false);
  });

  it('keeps out of a reply window that closes within the margin', () => {
    expect(followUpOpen(quiet(5, { windowExpiresAt: new Date(now.getTime() + 2 * H) }), cfg, now)).toBe(true);
    expect(followUpOpen(quiet(5, { windowExpiresAt: new Date(now.getTime() + 59 * 60_000) }), cfg, now)).toBe(false);
    expect(followUpOpen(quiet(5, { windowExpiresAt: new Date(now.getTime() - 1) }), cfg, now)).toBe(false);
    // a margin of 0 still never answers into a closed window
    expect(followUpOpen(quiet(5, { windowExpiresAt: new Date(now.getTime() + 30_000) }), { ...cfg, windowMarginMinutes: 0 }, now)).toBe(false);
  });

  it('picks the first rule that holds, in the owner\'s order; win-back is off as shipped and only while recent', () => {
    const none = { bagLines: 0, openShares: 0, cancelledAt: null };
    expect(followUpRuleOf(none, cfg, now)).toBeNull();
    expect(followUpRuleOf({ ...none, bagLines: 2, openShares: 1 }, cfg, now)).toBe('bag');
    expect(followUpRuleOf({ ...none, openShares: 1 }, cfg, now)).toBe('products');
    expect(followUpRuleOf({ ...none, openShares: 1 }, { ...cfg, rules: ['bag'] }, now)).toBeNull();
    const cancelled = { ...none, cancelledAt: new Date(now.getTime() - 2 * 24 * H) };
    expect(followUpRuleOf(cancelled, cfg, now)).toBeNull();
    expect(followUpRuleOf(cancelled, { ...cfg, rules: ['cancelled'] }, now)).toBe('cancelled');
    expect(followUpRuleOf(cancelled, { ...cfg, rules: ['cancelled'], cancelledDays: 1 }, now)).toBeNull();
  });

  it('counts one person by the customer and by the chat\'s first contact', () => {
    expect(personKeysOf(null, { id: 'a', mergedIntoId: null })).toEqual(['p:a']);
    expect(personKeysOf(null, { id: 'b', mergedIntoId: 'a' })).toEqual(['p:a']);
    expect(personKeysOf('c1', { id: 'b', mergedIntoId: 'a' })).toEqual(['c:c1', 'p:a']);
  });

  it('writes in Bengali for Bengali letters, else the owner\'s choice; the coupon line only with a code', () => {
    expect(followUpLang('দাম কত?', 'en')).toBe('bn');
    expect(followUpLang('dam koto?', 'en')).toBe('en');
    expect(followUpLang(null, 'bn')).toBe('bn');
    expect(followUpBody(words, 'products', 'en', { hello: 'Hi Rahim,', name: 'Rahim', product: 'Pique Polo', code: null })).toBe('Hi Rahim, did you like the Pique Polo we sent? Tell us your size and we can place the order for you here.');
    const withCode = followUpBody(words, 'bag', 'bn', { hello: 'আসসালামু আলাইকুম।', name: null, product: null, code: 'SAMPLE10' });
    expect(withCode).toContain('ব্যাগ');
    expect(withCode.endsWith('চেকআউটে SAMPLE10 কোডটা ব্যবহার করতে পারেন।')).toBe(true);
  });
});
