// S13 · PR 266 — the owner's rate turns a cost in another currency into the store's: by the currencies' own digits,
// the rate in force on the cost's day, and the first rate for a day before any. Sample values.
import { describe, expect, it } from 'vitest';
import { convertMinor, rateOnDay } from './exchange-rate';

describe('the owner’s exchange rate (PR 266)', () => {
  it('converts minor units by each currency’s digits', () => {
    expect(convertMinor(1_000, 'USD', 'BDT', 120.25)).toBe(120_250); // $10.00 → ৳1,202.50
    expect(convertMinor(1, 'USD', 'BDT', 121.5)).toBe(122); // one cent, rounded to the poisha
    expect(convertMinor(500, 'JPY', 'BDT', 0.8)).toBe(40_000); // ¥500 (no minor digits) → ৳400.00
  });

  it('takes the rate of the day: the newest typed on or before it, else the first one', () => {
    const rows = [
      { id: 'a', day: '2026-11-01' },
      { id: 'b', day: '2026-11-04' },
      { id: 'c', day: '2026-11-04' },
    ];
    expect(rateOnDay(rows, '2026-10-20')?.id).toBe('a');
    expect(rateOnDay(rows, '2026-11-03')?.id).toBe('a');
    expect(rateOnDay(rows, '2026-11-04')?.id).toBe('c');
    expect(rateOnDay(rows, '2026-12-01')?.id).toBe('c');
    expect(rateOnDay([], '2026-12-01')).toBeNull();
  });
});
