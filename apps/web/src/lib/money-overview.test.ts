// S16 · PR 342 — Money → Overview: money received by window and method, COD the couriers still owe (by courier, the
// oldest's age), refunds owed to customers and failed payouts; every number from the rows, nothing invented.
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-money.bn.json';
import en from '../../messages/admin-money.en.json';
import { claimsToReceiveOf, dayIn, overviewOf, receivedByDay } from './money-overview';

const now = new Date('2026-10-31T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('money overview (PR 342)', () => {
  it('received: each window counts what arrived inside it; the month by method, biggest first', () => {
    const o = overviewOf(
      now,
      [
        { method: 'COD', amountMinor: 150_000, paidAt: hoursAgo(2) },
        { method: 'BKASH', amountMinor: 50_000, paidAt: hoursAgo(30) },
        { method: 'COD', amountMinor: 20_000, paidAt: hoursAgo(24 * 10) },
        { method: 'BKASH', amountMinor: 99_999, paidAt: null },
        { method: 'CARD', amountMinor: 1, paidAt: new Date(now.getTime() + 3_600_000) },
      ],
      [],
      [],
    );
    expect(o.received.windows).toEqual([
      { key: 'day', minor: 150_000, count: 1 },
      { key: 'week', minor: 200_000, count: 2 },
      { key: 'month', minor: 220_000, count: 3 },
    ]);
    expect(o.received.byMethod).toEqual([
      { method: 'COD', minor: 170_000, count: 2 },
      { method: 'BKASH', minor: 50_000, count: 1 },
    ]);
  });

  it('COD due: cash and a paid delivery charge, by courier, with the oldest in days', () => {
    const o = overviewOf(now, [], [
      { collectedMinor: 120_000, chargeCollectedMinor: 0, occurredAt: hoursAgo(24 * 3 + 1), courier: 'Courier A' },
      { collectedMinor: 0, chargeCollectedMinor: 6_000, occurredAt: hoursAgo(5), courier: 'Courier A' },
      { collectedMinor: 80_000, chargeCollectedMinor: 0, occurredAt: hoursAgo(1), courier: null },
    ], []);
    expect(o.cod).toEqual({
      minor: 206_000,
      parcels: 3,
      oldestDays: 3,
      byCourier: [
        { courier: 'Courier A', minor: 126_000, parcels: 2 },
        { courier: null, minor: 80_000, parcels: 1 },
      ],
    });
  });

  it('refunds: requested and approved are owed; failed payouts apart; none is none', () => {
    const o = overviewOf(now, [], [], [
      { status: 'REQUESTED', amountMinor: 30_000, createdAt: hoursAgo(50) },
      { status: 'APPROVED', amountMinor: 10_000, createdAt: hoursAgo(2) },
      { status: 'FAILED', amountMinor: 5_000, createdAt: hoursAgo(1) },
    ]);
    expect(o.refunds).toEqual({ waitingMinor: 40_000, waiting: 2, oldestDays: 2, failedMinor: 5_000, failed: 1 });
    expect(overviewOf(now, [], [], []).refunds).toEqual({ waitingMinor: 0, waiting: 0, oldestDays: null, failedMinor: 0, failed: 0 });
  });

  it('every word in both languages, with the same keys', () => {
    const keys = (o: object, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});

describe('cash received day by day (PR 642, the Lumen hero chart)', () => {
  it('the last N calendar days in the shop time zone, oldest first; empty days are 0; future or unpaid rows are left out', () => {
    // now = 2026-10-31 18:00 in Dhaka (UTC+6). 19:30Z on the 30th is already the 31st in Dhaka.
    const days = receivedByDay(
      now,
      [
        { method: 'COD', amountMinor: 1_000, paidAt: new Date('2026-10-31T01:00:00Z') },
        { method: 'COD', amountMinor: 2_000, paidAt: new Date('2026-10-30T19:30:00Z') },
        { method: 'BKASH', amountMinor: 500, paidAt: new Date('2026-10-29T10:00:00Z') },
        { method: 'CARD', amountMinor: 9_999, paidAt: new Date('2026-10-20T10:00:00Z') },
        { method: 'CARD', amountMinor: 7, paidAt: null },
        { method: 'CARD', amountMinor: 8, paidAt: new Date(now.getTime() + 60_000) },
      ],
      3,
      'Asia/Dhaka',
    );
    expect(days).toEqual([
      { day: '2026-10-29', minor: 500, count: 1 },
      { day: '2026-10-30', minor: 0, count: 0 },
      { day: '2026-10-31', minor: 3_000, count: 2 },
    ]);
  });

  it('30 days add up to the month window when every payment is inside it; a bad zone falls back to UTC', () => {
    const rows = [1, 5, 20, 29].map((d) => ({ method: 'COD', amountMinor: d * 100, paidAt: hoursAgo(d * 24 - 1) }));
    const days = receivedByDay(now, rows, 30, 'UTC');
    expect(days).toHaveLength(30);
    expect(days.reduce((s, d) => s + d.minor, 0)).toBe(5_500);
    expect(dayIn(now, 'Not/AZone')).toBe('2026-10-31');
  });
});

describe('courier claims to receive (PR 673)', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  it('adds the open claims per courier, biggest first, and counts the ones past their deadline', () => {
    const c = claimsToReceiveOf(now, [
      { courierAccountId: 'a', courier: 'Steadfast', claimedMinor: 5_000, deadlineAt: new Date('2026-11-09T00:00:00Z') },
      { courierAccountId: 'b', courier: 'RedX', claimedMinor: 9_000, deadlineAt: null },
      { courierAccountId: 'a', courier: 'Steadfast', claimedMinor: 2_000, deadlineAt: new Date('2026-11-20T00:00:00Z') },
    ]);
    expect(c).toEqual({
      minor: 16_000,
      count: 3,
      late: 1,
      byCourier: [
        { courierId: 'b', courier: 'RedX', minor: 9_000, count: 1 },
        { courierId: 'a', courier: 'Steadfast', minor: 7_000, count: 2 },
      ],
    });
  });
  it('is all zero when no claim is open', () => {
    expect(claimsToReceiveOf(now, [])).toEqual({ minor: 0, count: 0, late: 0, byCourier: [] });
  });
});
