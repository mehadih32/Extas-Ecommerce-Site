// PR 284 — the customers rules without a database: masking a number, the merge-rule keys, the survivor pick and the
// merge checks. Every number is a made-up test value.
import { describe, expect, it } from 'vitest';
import { emailKey, groupPairs, maskPhone, mergeProblem, pairKey, phoneShown, pickSurvivor, textKey, type ProfileFacts } from './pure';

const P = '+8801700000284'; // hardcode-ok: a made-up test number
const facts = (id: string, o: Partial<ProfileFacts> = {}): ProfileFacts => ({ id, mergedIntoId: null, members: 0, orders: 0, createdAt: new Date('2026-10-01T00:00:00Z'), erased: false, archived: false, ...o });

describe('phone masking (Note 24.1, customers.phoneMask)', () => {
  it('keeps the first and last digits and hides the middle, however the number is written', () => {
    expect(maskPhone(P, { first: 3, last: 3 })).toBe('017•••••284');
    expect(maskPhone('01700000284', { first: 3, last: 3 })).toBe('017•••••284');
    expect(maskPhone(P, { first: 0, last: 2 })).toBe('•••••••••84');
  });
  it('hides every digit when the mask would show the whole number', () => {
    expect(maskPhone('12345', { first: 3, last: 3 })).toBe('•••••');
    expect(maskPhone('', { first: 3, last: 3 })).toBe('');
  });
  it('gives the full number and its dial form only to a person allowed it', () => {
    expect(phoneShown(P, true, { first: 3, last: 3 })).toEqual({ text: '01700-000284', dial: '01700000284', masked: false });
    expect(phoneShown(P, false, { first: 3, last: 3 })).toEqual({ text: '017•••••284', dial: null, masked: true });
    expect(phoneShown(null, true, { first: 3, last: 3 })).toBeNull();
  });
});

describe('merge-rule keys', () => {
  it('compares e-mails without case and spaces, and only real ones', () => {
    expect(emailKey('  Rahim@Example.com ')).toBe('rahim@example.com');
    expect(emailKey('not an email')).toBeNull();
    expect(emailKey(null)).toBeNull();
  });
  it('folds names and addresses (Bengali kept, punctuation gone)', () => {
    expect(textKey('  House 4,  Road-5 ')).toBe('house 4 road 5');
    expect(textKey('রহিম, উদ্দিন')).toBe('রহিম উদ্দিন');
    expect(textKey(' ,; ')).toBeNull();
  });
  it('one pair key whichever way round, and a group as pairs with its first', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
    expect(groupPairs(['a', 'b', 'c', 'b'], 10)).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
    expect(groupPairs(['a', 'b', 'c'], 1)).toEqual([['a', 'b']]);
  });
});

describe('which profile stays, and when a merge is refused', () => {
  it('the one others joined, else more orders, else the older one', () => {
    expect(pickSurvivor(facts('a'), facts('b', { members: 1 }))!.survivor.id).toBe('b');
    expect(pickSurvivor(facts('a', { orders: 1 }), facts('b', { orders: 3 }))!.survivor.id).toBe('b');
    expect(pickSurvivor(facts('a', { createdAt: new Date('2026-10-02T00:00:00Z') }), facts('b'))!.survivor.id).toBe('b');
    expect(pickSurvivor(facts('a', { members: 1 }), facts('b', { members: 2 }))).toBeNull();
  });
  it('never itself, never an erased or archived profile, one level only', () => {
    expect(mergeProblem(facts('a'), facts('a'))!.code).toBe('SAME_PROFILE');
    expect(mergeProblem(facts('a'), facts('b', { archived: true }))!.code).toBe('NOT_ACTIVE');
    expect(mergeProblem(facts('a', { mergedIntoId: 'x' }), facts('b'))).toEqual({ code: 'ALREADY_MERGED', data: { id: 'a', survivorId: 'x' } });
    expect(mergeProblem(facts('a'), facts('b', { members: 2 }))).toEqual({ code: 'HAS_MERGED', data: { id: 'b', members: 2 } });
    expect(mergeProblem(facts('a', { members: 2 }), facts('b'))).toBeNull();
  });
});
