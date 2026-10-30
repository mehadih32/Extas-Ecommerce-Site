// CN-028 · PR 616 — the owner's books PIN, pure part (the database part is in packages/inventory/test/books-match.db.test.ts):
// digits only, long enough, never one digit repeated, never a straight run; the refusals answer the right HTTP status.
import { describe, expect, it } from 'vitest';
import { httpStatus, pinIssues, PIN_PERMISSIONS } from '../src';

const policy = { minLength: 6, maxLength: 12 };

describe('PR 616 · books PIN', () => {
  it('a good PIN has no issues; a weak one names why', () => {
    expect(pinIssues('480326', policy)).toEqual([]);
    expect(pinIssues('111111', policy)).toEqual(['one-digit']);
    expect(pinIssues('123456', policy)).toEqual(['straight-run']);
    expect(pinIssues('987654', policy)).toEqual(['straight-run']);
    expect(pinIssues('12ab56', policy)).toEqual(['not-digits']);
    expect(pinIssues('4803', policy)).toEqual(['too-short']);
    expect(pinIssues('4803261938475', policy)).toEqual(['too-long']);
  });

  it('the PIN guards the correction and the close keys; its refusals have their own status', () => {
    expect([...PIN_PERMISSIONS].sort()).toEqual(['books.adjust', 'books.close']);
    expect([httpStatus('PIN_REQUIRED'), httpStatus('WRONG_PIN'), httpStatus('PIN_LOCKED'), httpStatus('PIN_NOT_SET'), httpStatus('WEAK_PIN')]).toEqual([403, 403, 429, 409, 400]);
  });
});
