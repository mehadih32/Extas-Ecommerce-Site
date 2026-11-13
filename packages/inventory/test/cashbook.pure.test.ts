// S28 · PR 687 — the cashbook's signs, the month's money in and out, and the 14-day forecast, without a database.
import { describe, expect, it } from 'vitest';
import { cashForecast, cashMonth, cashSign } from '../src';

describe('cashbook signs and month (PR 687)', () => {
  it('knows which kinds bring money in and which send it out', () => {
    expect(['CAPITAL', 'OTHER_IN', 'COURIER', 'ONLINE', 'OPENING'].map(cashSign)).toEqual([1, 1, 1, 1, 1]);
    expect(['OWNER_TAKE', 'OTHER_OUT', 'REFUND', 'EXPENSE', 'ADS', 'ERP'].map(cashSign)).toEqual([-1, -1, -1, -1, -1, -1]);
    expect(cashSign('TRANSFER')).toBe(0);
    expect(cashSign('REVERSAL')).toBe(0);
  });

  it('does not count a move between own accounts or an opening balance as money in or out', () => {
    const m = cashMonth([
      { kind: 'TRANSFER', amountMinor: -50_000 },
      { kind: 'TRANSFER', amountMinor: 50_000 },
      { kind: 'OPENING', amountMinor: 900_000 },
      { kind: 'ONLINE', amountMinor: 120_000 },
      { kind: 'EXPENSE', amountMinor: -30_000 },
    ]);
    expect(m).toEqual({ inMinor: 120_000, outMinor: 30_000 });
  });

  it('a reversal takes its amount off the side of what it reversed', () => {
    const m = cashMonth([
      { kind: 'COURIER', amountMinor: 200_000 },
      { kind: 'REVERSAL', amountMinor: -200_000, reversesKind: 'COURIER' },
      { kind: 'ADS', amountMinor: -80_000 },
      { kind: 'REVERSAL', amountMinor: 80_000, reversesKind: 'ADS' },
      { kind: 'ONLINE', amountMinor: 10_000 },
      { kind: 'REVERSAL', amountMinor: 5, reversesKind: null },
    ]);
    expect(m).toEqual({ inMinor: 10_000, outMinor: 0 });
  });
});

describe('cash forecast (PR 687)', () => {
  const none = new Map<string, number>();

  it('adds the couriers cash evenly over the payout days with the remainder on the last, and keeps the sum exact', () => {
    const f = cashForecast({
      today: '2026-11-13',
      days: 14,
      openingMinor: 0,
      codHeldMinor: 1_000_003,
      codPayoutDays: 4,
      fixedByDay: none,
    });
    const total = f.days.reduce((n, d) => n + d.inMinor, 0);
    expect(total).toBe(1_000_003);
    expect(f.days.slice(0, 5).map((d) => d.inMinor)).toEqual([200_000, 200_000, 200_000, 200_000, 200_003]);
    expect(f.days[5]!.inMinor).toBe(0);
    expect(f.days).toHaveLength(14);
    expect(f.days[0]!.day).toBe('2026-11-14');
  });

  it('finds the tightest day and says whether the fixed costs are covered', () => {
    const fixed = new Map([['2026-11-15', 600_000]]);
    const f = cashForecast({
      today: '2026-11-13',
      days: 5,
      openingMinor: 500_000,
      codHeldMinor: 0,
      codPayoutDays: 0,
      fixedByDay: fixed,
    });
    expect(f.tightest).toEqual({ day: '2026-11-15', balanceMinor: -100_000 });
    expect(f.fixedMinor).toBe(600_000);
    expect(f.fixedCovered).toBe(false);
    const ok = cashForecast({
      today: '2026-11-13',
      days: 5,
      openingMinor: 900_000,
      codHeldMinor: 0,
      codPayoutDays: 0,
      fixedByDay: fixed,
    });
    expect(ok.fixedCovered).toBe(true);
    expect(ok.tightest).toEqual({ day: '2026-11-15', balanceMinor: 300_000 });
  });

  it('with no days there is nothing to forecast', () => {
    const f = cashForecast({
      today: '2026-11-13',
      days: 0,
      openingMinor: 5,
      codHeldMinor: 0,
      codPayoutDays: 0,
      fixedByDay: none,
    });
    expect(f.days).toEqual([]);
    expect(f.tightest).toBeNull();
    expect(f.fixedCovered).toBe(true);
  });
});
