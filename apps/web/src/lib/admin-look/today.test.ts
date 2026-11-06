// PR 631 (CN-036) — the Lumen Today page's own pieces: the month of the goal ring and the settings cards' changes.
import { describe, expect, it } from 'vitest';
import { adminTodaySettings } from '@extas/settings';
import { mayRead, monthOf } from './dashboard-data';
import { todayAfter } from './today-api';

const SHIPPED = adminTodaySettings['admin.today'].default;

describe('the monthly goal ring', () => {
  it('counts from the first of the month and knows the days left', () => {
    expect(monthOf('2026-11-06')).toEqual({ from: '2026-11-01', daysLeft: 24 });
    expect(monthOf('2026-02-28')).toEqual({ from: '2026-02-01', daysLeft: 0 });
    expect(monthOf('2028-02-28')).toEqual({ from: '2028-02-01', daysLeft: 1 });
    expect(monthOf('2026-12-31')).toEqual({ from: '2026-12-01', daysLeft: 0 });
  });
  it('is off as shipped, and the feed lists six orders', () => {
    expect(SHIPPED).toEqual({ liveRows: 6, goal: { on: false, amountMinor: 0 } });
  });
  it('is read only with metrics.read; the feed only with orders.read', () => {
    const v = (perms: string[]) => ({ perms: new Set(perms), owner: false });
    expect(mayRead('goal', v(['orders.read']))).toBe(false);
    expect(mayRead('goal', v(['metrics.read']))).toBe(true);
    expect(mayRead('feed', v(['metrics.read']))).toBe(false);
    expect(mayRead('feed', v(['orders.read']))).toBe(true);
  });
});

describe('the Today settings cards', () => {
  it('turns the goal on with an amount in whole units of the currency', () => {
    expect(todayAfter(SHIPPED, { key: 'goal', on: true, values: { amount: 600000 } }, 100)).toEqual({ liveRows: 6, goal: { on: true, amountMinor: 60_000_000 } });
    expect(todayAfter(SHIPPED, { key: 'goal', on: false, values: { amount: 0 } }, 100)?.goal).toEqual({ on: false, amountMinor: 0 });
  });
  it('turns the feed off (0 rows) or on with 1–20 rows', () => {
    expect(todayAfter(SHIPPED, { key: 'feed', on: false, values: { rows: 6 } }, 100)?.liveRows).toBe(0);
    expect(todayAfter(SHIPPED, { key: 'feed', on: true, values: { rows: 10 } }, 100)?.liveRows).toBe(10);
    expect(todayAfter(SHIPPED, { key: 'feed', on: true, values: { rows: 0 } }, 100)).toBeNull();
    expect(todayAfter(SHIPPED, { key: 'feed', on: true, values: { rows: 21 } }, 100)).toBeNull();
  });
  it('refuses anything it cannot read', () => {
    expect(todayAfter(SHIPPED, { key: 'goal', on: 'yes', values: { amount: 5 } }, 100)).toBeNull();
    expect(todayAfter(SHIPPED, { key: 'goal', on: true, values: { amount: -5 } }, 100)).toBeNull();
    expect(todayAfter(SHIPPED, { key: 'goal', on: true, values: { amount: 1.5 } }, 100)).toBeNull();
    expect(todayAfter(SHIPPED, { key: 'cod', on: true, values: {} }, 100)).toBeNull();
  });
});
