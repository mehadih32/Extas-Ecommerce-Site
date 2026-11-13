// S15 · PR 581 — the two pure figures campaign-control.ts's guardrail check and this page both read: a trailing
// cost-per-purchase and whether a value has crossed a ceiling. No database.
import { describe, expect, it } from 'vitest';
import { ceilingBreach, cpaMinorOf } from './campaign-control';

describe('PR 581 · cpaMinorOf (cost per delivered purchase)', () => {
  it('spend ÷ delivered, rounded to the minor unit', () => {
    expect(cpaMinorOf(10_000, 4)).toBe(2500);
    expect(cpaMinorOf(10_000, 3)).toBe(3333);
  });
  it('null while spend is unknown or nothing delivered yet', () => {
    expect(cpaMinorOf(null, 4)).toBeNull();
    expect(cpaMinorOf(10_000, 0)).toBeNull();
    expect(cpaMinorOf(10_000, -1)).toBeNull();
  });
});

describe('PR 581 · ceilingBreach', () => {
  it('crosses only while the ceiling is set and the value is known and over it', () => {
    expect(ceilingBreach(1_100, 1_000)).toBe(true);
    expect(ceilingBreach(1_000, 1_000)).toBe(false);
    expect(ceilingBreach(900, 1_000)).toBe(false);
  });
  it('a ceiling of 0 (off) never breaches, whatever the value', () => {
    expect(ceilingBreach(1_000_000, 0)).toBe(false);
  });
  it('an unknown value (null) never breaches', () => {
    expect(ceilingBreach(null, 1_000)).toBe(false);
  });
});
