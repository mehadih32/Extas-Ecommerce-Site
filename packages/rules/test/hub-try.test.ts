// parity F4 · PR 848 — "Try on last 30 days' orders": the typed numbers counted against past orders, read only.
import { describe, expect, it } from 'vitest';
import { isTryable, repeatCount, tryRow, type TryOrder } from '../src/hub-try';

const D = 86_400_000;
const t0 = Date.UTC(2026, 10, 1);
const order = (goods: number, charge: number, phone: string | null, day: number): TryOrder => ({ goodsMinor: goods, chargeMinor: charge, phone, at: new Date(t0 + day * D) });

describe('free delivery', () => {
  const orders = [order(100_000, 12_000, 'a', 0), order(250_000, 12_000, 'b', 1), order(500_000, 12_000, 'c', 2), order(900_000, 0, 'd', 3)];
  it('counts the orders the typed limit frees, the charge they would not pay, and the saved limit beside it', () => {
    const r = tryRow('free', 500_000, { '': 200_000 }, orders);
    expect(r).toMatchObject({ row: 'free', total: 4, now: 2, tried: 3, waivedMinor: 12_000 + 12_000 + 0 });
  });
  it('a limit that is not set frees nothing; an untouched row tries the saved limit', () => {
    expect(tryRow('free', null, {}, orders)).toMatchObject({ now: 0, tried: 0, waivedMinor: 0 });
    expect(tryRow('free', 500_000, {}, orders)).toMatchObject({ now: 2, tried: 2 });
    expect(tryRow('free', 500_000, { '': null }, orders)).toMatchObject({ tried: 0 });
  });
});

describe('repeat orders (duplicates and merging)', () => {
  const orders = [order(1, 0, '017', 0), order(1, 0, '017', 2), order(1, 0, '017', 9), order(1, 0, '018', 3), order(1, 0, null, 3), order(1, 0, null, 4)];
  it('an order counts when the same number ordered within the look-back days before it', () => {
    expect(repeatCount(orders, 1)).toBe(0);
    expect(repeatCount(orders, 2)).toBe(1);
    expect(repeatCount(orders, 7)).toBe(2);
    expect(repeatCount(orders, 30)).toBe(2);
  });
  it('tries the typed look-back beside the saved one, and a switched-off row catches nothing', () => {
    expect(tryRow('dup', { enabled: true, lookbackDays: 2 }, { lookbackDays: 7 }, orders)).toMatchObject({ now: 1, tried: 2 });
    expect(tryRow('dup', { enabled: true, lookbackDays: 2 }, { enabled: false }, orders)).toMatchObject({ now: 1, tried: 0 });
    expect(tryRow('merge', { enabled: false, lookBackDays: 7 }, { lookBackDays: 7 }, orders)).toMatchObject({ now: 0, tried: 0 });
    expect(tryRow('merge', { enabled: false, lookBackDays: 7 }, { enabled: true, lookBackDays: 7 }, orders)).toMatchObject({ tried: 2 });
  });
});

it('only the rows with a count that means something can be tried', () => {
  expect(['free', 'dup', 'merge', 'quiet', 'peak', 'gift'].filter(isTryable)).toEqual(['free', 'dup', 'merge']);
});
