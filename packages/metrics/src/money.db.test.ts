// S07 · PR 172, 174 — the payments screens' money figures on a real PostgreSQL (a throwaway database with the real
// migrations; skipped without TEST_DATABASE_ADMIN_URL): the money owed to customers counts every refund asked, approved
// or whose payout failed, never a rejected or paid one, and only the store's own; the money each gateway brought in
// during a period counts only online payments paid in it (never Cash on Delivery or the wallet). Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { owedToCustomers, paymentsReceived } from './money';

describe.skipIf(!HAS_TEST_DB)('payments money figures (PR 172, 174)', () => {
  let t: TestDatabase;
  let A = 0;
  let B = 0;
  let n = 0;

  const order = async (storeId: number) => {
    n += 1;
    return t.prisma.order.create({ data: { storeId, number: `M172-${n}`, source: 'WEBSITE', currency: 'BDT', status: 'CONFIRMED', placedAt: new Date(), totalMinor: 0, subtotalMinor: 0, paymentMethod: 'BKASH', idempotencyKey: `m172-${n}` }, select: { id: true } });
  };
  const refund = async (storeId: number, status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'FAILED', amountMinor: number) => {
    const o = await order(storeId);
    n += 1;
    await t.prisma.refund.create({ data: { storeId, orderId: o.id, amountMinor, method: 'original', reason: 'OTHER', source: 'OTHER', status, idempotencyKey: `m172-r-${n}` } });
  };

  beforeAll(async () => {
    t = await createTestDatabase('metrics_172');
    [A, B] = await seedSampleStores(t.prisma);
  });
  afterAll(async () => t?.drop());

  it('owed to customers: asked + approved + failed payouts; never rejected or paid; store-scoped', async () => {
    expect(await owedToCustomers(t.prisma, A)).toEqual({ count: 0, requestedMinor: 0, approvedMinor: 0, failedMinor: 0, totalMinor: 0 });
    await refund(A, 'REQUESTED', 1_000);
    await refund(A, 'REQUESTED', 2_000);
    await refund(A, 'APPROVED', 4_000);
    await refund(A, 'FAILED', 8_000);
    await refund(A, 'REJECTED', 16_000);
    await refund(A, 'COMPLETED', 32_000);
    await refund(B, 'REQUESTED', 64_000);
    expect(await owedToCustomers(t.prisma, A)).toEqual({ count: 4, requestedMinor: 3_000, approvedMinor: 4_000, failedMinor: 8_000, totalMinor: 15_000 });
    expect((await owedToCustomers(t.prisma, B)).totalMinor).toBe(64_000);
  });

  it('money in through each gateway: paid online payments in the period, by provider; COD and other periods left out', async () => {
    const o = await order(A);
    let k = 0;
    const pay = async (provider: string, method: 'BKASH' | 'NAGAD' | 'COD', status: 'PAID' | 'FAILED' | 'REFUNDED', paidAt: Date, minor: number, storeId = A) => {
      k += 1;
      await t.prisma.payment.create({ data: { storeId, orderId: o.id, method, provider, purpose: 'ORDER', status, amountMinor: minor, receivedMinor: minor, currency: 'BDT', paidAt, idempotencyKey: `m174-${k}` } });
    };
    const inside = new Date('2026-10-10T00:00:00Z');
    await pay('bkash', 'BKASH', 'PAID', inside, 1_000);
    await pay('bkash', 'BKASH', 'REFUNDED', inside, 2_000);
    await pay('bkash', 'BKASH', 'FAILED', inside, 4_000);
    await pay('bkash', 'BKASH', 'PAID', new Date('2026-11-01T00:00:00Z'), 8_000);
    await pay('nagad', 'NAGAD', 'PAID', inside, 16_000);
    await pay('cod', 'COD', 'PAID', inside, 32_000);
    await pay('bkash', 'BKASH', 'PAID', inside, 64_000, B);
    expect(await paymentsReceived(t.prisma, A, { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') })).toEqual([
      { provider: 'bkash', count: 2, receivedMinor: 3_000 },
      { provider: 'nagad', count: 1, receivedMinor: 16_000 },
    ]);
  });
});
