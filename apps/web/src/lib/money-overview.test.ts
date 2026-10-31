// S16 · PR 342 — Money → Overview: money received by window and method, COD the couriers still owe (by courier, the
// oldest's age), refunds owed to customers and failed payouts; every number from the rows, nothing invented.
import { describe, expect, it } from 'vitest';
import bn from '../../messages/admin-money.bn.json';
import en from '../../messages/admin-money.en.json';
import { overviewOf } from './money-overview';

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
