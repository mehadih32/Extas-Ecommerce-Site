// PR 858 — the courier statement's "To check / Claimed or resolved / All" split.
import { describe, expect, it } from 'vitest';
import { chipCounts, splitLines, statementShow } from './statement-view';

const open = [{ id: 'a', shipmentId: 's1' }, { id: 'b', shipmentId: 's2' }, { id: 'c', shipmentId: null }];

describe('statement chips', () => {
  it('opens on "To check" unless the address names another chip', () => {
    expect(statementShow(undefined)).toBe('check');
    expect(statementShow('nope')).toBe('check');
    expect(statementShow('done')).toBe('done');
    expect(statementShow('all')).toBe('all');
  });
  it('a line with a claim moves out of "To check"; a line without a parcel always needs checking', () => {
    const s = splitLines(open, ['s2'], [{ id: 'r' }]);
    expect(s.check.map((l) => l.id)).toEqual(['a', 'c']);
    expect(s.claimed.map((l) => l.id)).toEqual(['b']);
    expect(chipCounts(s)).toEqual({ check: 2, done: 2, all: 4 });
  });
  it('nothing claimed and nothing resolved: every open line is still to check', () => {
    expect(chipCounts(splitLines(open, [], []))).toEqual({ check: 3, done: 0, all: 3 });
  });
});
