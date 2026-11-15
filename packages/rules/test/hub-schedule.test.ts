// PR 858 — "Start on a later date": the date rules and the due / waiting split.
import { describe, expect, it } from 'vitest';
import { SCHEDULE_MAX_DAYS, scheduleDateProblem, splitDue, withEntry } from '../src/hub-schedule';

const e = (rowId: string, from: string) => ({ rowId, from, values: { x: 1 }, by: null, at: '2026-11-01T00:00:00.000Z' });

describe('scheduleDateProblem', () => {
  it('takes a real day after today', () => {
    expect(scheduleDateProblem('2026-11-17', '2026-11-16')).toBeNull();
  });
  it('refuses today, the past, a day that does not exist and words', () => {
    expect(scheduleDateProblem('2026-11-16', '2026-11-16')).toBe('past');
    expect(scheduleDateProblem('2026-11-01', '2026-11-16')).toBe('past');
    expect(scheduleDateProblem('2026-02-30', '2026-11-16')).toBe('date');
    expect(scheduleDateProblem('soon', '2026-11-16')).toBe('date');
    expect(scheduleDateProblem(undefined, '2026-11-16')).toBe('date');
  });
  it('refuses a day too far ahead (a typo in the year)', () => {
    expect(scheduleDateProblem('2030-01-01', '2026-11-16')).toBe('far');
    expect(SCHEDULE_MAX_DAYS).toBeGreaterThan(300);
  });
});

describe('splitDue / withEntry', () => {
  it('a change starts on its own day, not before; the oldest goes first', () => {
    const { due, waiting } = splitDue([e('b', '2026-11-20'), e('a', '2026-11-16'), e('c', '2026-11-10')], '2026-11-16');
    expect(due.map((x) => x.rowId)).toEqual(['c', 'a']);
    expect(waiting.map((x) => x.rowId)).toEqual(['b']);
  });
  it('a row has one scheduled change: a new one replaces it and null cancels it', () => {
    const one = withEntry([e('a', '2026-11-20')], 'a', e('a', '2026-12-01'));
    expect(one).toHaveLength(1);
    expect(one[0]!.from).toBe('2026-12-01');
    expect(withEntry(one, 'a', null)).toEqual([]);
  });
});
