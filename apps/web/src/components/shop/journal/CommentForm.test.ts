// S12 · PR 251 — what the shop's answer to a comment tells the reader: thanks (or "already have it"), sign in, the day's
// limit, closed, a name or a length to fix, else "could not send".
import { describe, expect, it } from 'vitest';
import { saidOf, type CommentFormWords } from './CommentForm';

const w = Object.fromEntries(['write', 'label', 'name', 'send', 'sending', 'note', 'thanks', 'again', 'signIn', 'limit', 'invalid', 'needName', 'closed', 'failed', 'chars'].map((k) => [k, k])) as unknown as CommentFormWords;

describe('comment box answers (PR 251)', () => {
  it('maps each answer to the reader’s words', () => {
    expect(saidOf(200, { again: false }, w)).toEqual({ kind: 'ok', text: 'thanks' });
    expect(saidOf(200, { again: true }, w)).toEqual({ kind: 'ok', text: 'again' });
    expect(saidOf(401, { error: 'SIGNED_OUT' }, w)).toEqual({ kind: 'signIn', text: 'signIn' });
    expect(saidOf(429, { error: 'DAY_LIMIT' }, w)?.text).toBe('limit');
    expect(saidOf(403, { error: 'COMMENTS_OFF' }, w)?.text).toBe('closed');
    expect(saidOf(400, { error: 'INVALID_INPUT', details: ['name'] }, w)?.text).toBe('needName');
    expect(saidOf(400, { error: 'INVALID_INPUT', details: ['body'] }, w)?.text).toBe('invalid');
    expect(saidOf(403, { error: 'cross-site-request' }, w)?.text).toBe('failed');
    expect(saidOf(503, null, w)?.text).toBe('failed');
  });
});
