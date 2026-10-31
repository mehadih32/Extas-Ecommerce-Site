// S16 · PR 342 — Money → Overview on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): only this store's
// money; a payment counts when it came in (also refunded since), never a failed or unpaid one; COD owed is cash a rider
// collected that no courier payout settled, never a rejected record or a settled one; refunds owed are asked or
// approved, a failed payout apart, never a rejected or paid one. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { moneyOverview } from './money-overview';

describe.skipIf(!HAS_TEST_DB)('money overview on PostgreSQL (PR 342)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let n = 0;
  const now = new Date('2026-10-31T12:00:00Z');
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  const order = async (storeId: number) => {
    n += 1;
    return t.prisma.order.create({ data: { storeId, number: `M342-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', placedAt: hoursAgo(100), totalMinor: 0, subtotalMinor: 0, paymentMethod: 'COD', idempotencyKey: `m342-${n}` }, select: { id: true } });
  };
  const pay = async (storeId: number, method: 'COD' | 'BKASH', status: 'PAID' | 'FAILED' | 'REFUNDED' | 'PENDING', paidAt: Date | null, minor: number, received: number | null = minor) => {
    const o = await order(storeId);
    n += 1;
    await t.prisma.payment.create({ data: { storeId, orderId: o.id, method, provider: method.toLowerCase(), purpose: 'ORDER', status, amountMinor: minor, receivedMinor: received, currency: 'BDT', paidAt, idempotencyKey: `m342-p-${n}` } });
  };
  const cod = async (storeId: number, outcome: 'DELIVERED' | 'RETURNED_CHARGE_PAID' | 'RETURNED', state: 'RECORDED' | 'APPROVED' | 'REJECTED', collected: number, charge: number, occurredAt: Date) => {
    const o = await order(storeId);
    n += 1;
    await t.prisma.codCollection.create({ data: { storeId, orderId: o.id, outcome, state, expectedMinor: collected, collectedMinor: collected, chargeCollectedMinor: charge, source: 'staff', occurredAt, idempotencyKey: `m342-c-${n}` } });
  };
  const refund = async (storeId: number, status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'FAILED', amountMinor: number) => {
    const o = await order(storeId);
    n += 1;
    await t.prisma.refund.create({ data: { storeId, orderId: o.id, amountMinor, method: 'original', reason: 'OTHER', source: 'OTHER', status, idempotencyKey: `m342-r-${n}` } });
  };

  beforeAll(async () => {
    t = await createTestDatabase('money_342');
    [A, B] = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('an empty shop shows nothing owed and nothing received', async () => {
    const o = await moneyOverview(t.prisma, A, now);
    expect(o.received.windows.map((w) => w.minor)).toEqual([0, 0, 0]);
    expect(o.cod).toEqual({ minor: 0, parcels: 0, oldestDays: null, byCourier: [] });
    expect(o.refunds.waiting).toBe(0);
  });

  it('counts only what came in, what a courier owes and what customers are owed, in this store only', async () => {
    await pay(A, 'COD', 'PAID', hoursAgo(3), 150_000);
    await pay(A, 'BKASH', 'REFUNDED', hoursAgo(50), 50_000, 49_000);
    await pay(A, 'BKASH', 'FAILED', hoursAgo(1), 7_000);
    await pay(A, 'BKASH', 'PENDING', null, 9_000);
    await pay(A, 'COD', 'PAID', hoursAgo(24 * 40), 11_000);
    await pay(B, 'COD', 'PAID', hoursAgo(1), 99_000);
    await cod(A, 'DELIVERED', 'RECORDED', 120_000, 0, hoursAgo(24 * 2 + 1));
    await cod(A, 'RETURNED_CHARGE_PAID', 'APPROVED', 0, 6_000, hoursAgo(4));
    await cod(A, 'RETURNED', 'RECORDED', 0, 0, hoursAgo(4));
    await cod(A, 'DELIVERED', 'REJECTED', 80_000, 0, hoursAgo(4));
    await cod(B, 'DELIVERED', 'RECORDED', 70_000, 0, hoursAgo(4));
    await refund(A, 'REQUESTED', 3_000);
    await refund(A, 'APPROVED', 4_000);
    await refund(A, 'FAILED', 8_000);
    await refund(A, 'REJECTED', 16_000);
    await refund(A, 'COMPLETED', 32_000);
    await refund(B, 'REQUESTED', 64_000);

    const o = await moneyOverview(t.prisma, A, now);
    expect(o.received.windows).toEqual([
      { key: 'day', minor: 150_000, count: 1 },
      { key: 'week', minor: 199_000, count: 2 },
      { key: 'month', minor: 199_000, count: 2 },
    ]);
    expect(o.received.byMethod).toEqual([
      { method: 'COD', minor: 150_000, count: 1 },
      { method: 'BKASH', minor: 49_000, count: 1 },
    ]);
    expect(o.cod).toEqual({ minor: 126_000, parcels: 2, oldestDays: 2, byCourier: [{ courier: null, minor: 126_000, parcels: 2 }] });
    expect(o.refunds).toMatchObject({ waitingMinor: 7_000, waiting: 2, failedMinor: 8_000, failed: 1 });
  });
});
