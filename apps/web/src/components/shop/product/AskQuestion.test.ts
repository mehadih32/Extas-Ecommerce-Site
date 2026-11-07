// PR 66 follow-up 183 — what the shop's answer to "Ask a question" says to the customer.
import { describe, expect, it } from 'vitest';
import { askSaidOf, type AskWords } from './AskQuestion';

const w = Object.fromEntries(['open', 'label', 'send', 'sending', 'note', 'thanks', 'again', 'signIn', 'limit', 'invalid', 'closed', 'failed', 'chars'].map((k) => [k, k])) as unknown as AskWords;

describe('Ask a question answers (follow-up 183)', () => {
  it('thanks, or "already sent" for the same words today', () => {
    expect(askSaidOf(200, { again: false }, w)).toEqual({ kind: 'ok', text: 'thanks' });
    expect(askSaidOf(200, { again: true }, w)).toEqual({ kind: 'ok', text: 'again' });
  });
  it('signed out, the day limit, closed, bad words and anything else', () => {
    expect(askSaidOf(401, null, w)?.kind).toBe('signIn');
    expect(askSaidOf(429, null, w)?.text).toBe('limit');
    expect(askSaidOf(403, { error: 'ASK_OFF' }, w)?.text).toBe('closed');
    expect(askSaidOf(400, { error: 'INVALID_INPUT' }, w)?.text).toBe('invalid');
    expect(askSaidOf(503, null, w)?.text).toBe('failed');
  });
});
