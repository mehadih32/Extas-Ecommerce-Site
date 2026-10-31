// PR 543 without a database: what a stored decision means (let go, kept, other), the rule keys of a review, the tally per
// rule (a review's final decision only) and per person (every decision), and the suggestions — never a "keep" for the
// blocklist proposal (nothing is ever blocked by itself). Every value is a made-up test value.
import { describe, expect, it } from 'vitest';
import { reviewKeys, suggestionsOf, tallyPeople, tallyRules, verdictOf, type LearnRow, type LearnTally } from './learning';

const row = (over: Partial<LearnRow>): LearnRow => ({ subject: 's1', kind: 'duplicate', decision: 'approve', verdict: 'letGo', keys: ['dup.A'], actorType: 'STAFF', actorId: 'u1', note: null, at: '2026-10-31T06:00:00.000Z', outcome: 'open', ...over });
const tally = (over: Partial<LearnTally>): LearnTally => ({ key: 'dup.A', decided: 10, letGo: 0, kept: 0, other: 0, letGoDelivered: 0, letGoRefused: 0, ...over });

describe('PR 543 · the learning, pure', () => {
  it('what a stored decision means', () => {
    expect(verdictOf('duplicate.approve')).toEqual({ kind: 'duplicate', decision: 'approve', verdict: 'letGo' });
    expect(verdictOf('risk.decline')?.verdict).toBe('kept');
    expect(verdictOf('duplicate.hold')?.verdict).toBe('kept');
    expect(verdictOf('duplicate.ask')?.verdict).toBe('other');
    expect(verdictOf('duplicate.merge')?.verdict).toBe('other');
    expect(verdictOf('holdProposal.dismiss')?.verdict).toBe('letGo');
    expect(verdictOf('holdProposal.hold')?.verdict).toBe('kept');
    expect(verdictOf('blockProposal.block')?.verdict).toBe('kept');
    expect(verdictOf('blockProposal.dismiss')?.verdict).toBe('letGo');
    for (const bad of ['approve', '.approve', 'refund.approve', 'duplicate.']) expect(verdictOf(bad), bad).toBeNull();
  });

  it('the rule keys of a review', () => {
    expect(reviewKeys('duplicate', { rules: [{ rule: 'A' }, { rule: 'D' }, { rule: 'A' }] })).toEqual(['dup.A', 'dup.D']);
    expect(reviewKeys('duplicate', null)).toEqual(['dup']);
    expect(reviewKeys('risk', { section: 'address' })).toEqual(['sec.address']);
    expect(reviewKeys('risk', {})).toEqual(['sec.unknown']);
  });

  it('per rule the final decision; per person every one', () => {
    const rows = [
      row({ subject: 's1', decision: 'approve', verdict: 'letGo', outcome: 'delivered', note: 'called' }),
      row({ subject: 's1', decision: 'hold', verdict: 'kept', outcome: 'delivered' }),
      row({ subject: 's2', decision: 'approve', verdict: 'letGo', outcome: 'refused', keys: ['dup.A', 'dup.D'], actorId: 'u2' }),
      row({ subject: 's3', decision: 'ask', verdict: 'other', keys: ['dup.D'], actorId: 'u2', note: 'no answer' }),
    ];
    expect(tallyRules(rows)).toEqual([
      { key: 'dup.A', decided: 2, letGo: 2, kept: 0, other: 0, letGoDelivered: 1, letGoRefused: 1 },
      { key: 'dup.D', decided: 2, letGo: 1, kept: 0, other: 1, letGoDelivered: 0, letGoRefused: 1 },
    ]);
    const people = tallyPeople(rows, new Map([['u1', 'Mim']]), 1);
    expect(people.map((p) => [p.name, p.decided, p.letGo, p.kept, p.other, p.letGoRefused])).toEqual([
      ['Mim', 2, 1, 1, 0, 0],
      [null, 2, 1, 0, 1, 1],
    ]);
    expect(people[0]!.notes).toEqual([{ decision: 'approve', kind: 'duplicate', note: 'called', at: rows[0]!.at }]);
    expect(people[0]!.rules).toEqual([{ key: 'dup.A', letGo: 1, kept: 1 }]);
  });

  it('the suggestions: relax when let go and delivered, keep when kept, never keep for the blocklist proposal, nothing below the fewest', () => {
    const opts = { minDecisions: 5, suggestPercent: 80 };
    expect(suggestionsOf([tally({ letGo: 9, kept: 1, letGoDelivered: 8, letGoRefused: 1 })], opts)).toEqual([{ key: 'dup.A', kind: 'relax', share: 90, decided: 10 }]);
    // too many of the let-go orders refused: no "relax"
    expect(suggestionsOf([tally({ letGo: 9, kept: 1, letGoRefused: 2 })], opts)).toEqual([]);
    expect(suggestionsOf([tally({ key: 'sec.address', letGo: 1, kept: 9 })], opts)).toEqual([{ key: 'sec.address', kind: 'keep', share: 90, decided: 10 }]);
    expect(suggestionsOf([tally({ key: 'blockProposal', letGo: 0, kept: 10 })], opts)).toEqual([]);
    expect(suggestionsOf([tally({ decided: 4, letGo: 4 })], opts)).toEqual([]);
    expect(suggestionsOf([tally({ letGo: 5, kept: 5 })], opts)).toEqual([]);
  });
});
