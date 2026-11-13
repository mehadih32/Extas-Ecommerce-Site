// S28 · PR 688 — the budget rules without a database: days in a month, and where a head stands (none, ok, at this pace, over).
import { describe, expect, it } from 'vitest';
import { budgetLine, daysInMonth } from '../src';

describe('budget rules (PR 688)', () => {
  it('counts the days of a month', () => {
    expect(daysInMonth('2026-11')).toBe(30);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
  });
  it('a head with no budget has no state', () => {
    expect(budgetLine('ADS', null, 5000, { day: 10, days: 30, fixed: false, warnAtPct: 100 }).state).toBe('none');
    expect(budgetLine('ADS', 0, 5000, { day: 10, days: 30, fixed: false, warnAtPct: 100 }).state).toBe('none');
  });
  it('spreads spent so far over the month, and flags the pace', () => {
    const l = budgetLine('ADS', 100_000, 40_000, { day: 10, days: 30, fixed: false, warnAtPct: 100 });
    expect(l.paceMinor).toBe(120_000);
    expect(l.state).toBe('pace');
    expect(budgetLine('ADS', 100_000, 20_000, { day: 10, days: 30, fixed: false, warnAtPct: 100 }).state).toBe('ok');
    expect(budgetLine('ADS', 100_000, 20_000, { day: 10, days: 30, fixed: false, warnAtPct: 50 }).state).toBe('pace');
  });
  it('over the budget is over; a fixed head is not spread', () => {
    expect(budgetLine('ADS', 100_000, 100_001, { day: 29, days: 30, fixed: false, warnAtPct: 100 }).state).toBe('over');
    const f = budgetLine('RENT', 50_000, 45_000, { day: 2, days: 30, fixed: true, warnAtPct: 100 });
    expect(f.paceMinor).toBe(45_000);
    expect(f.state).toBe('ok');
  });
});
