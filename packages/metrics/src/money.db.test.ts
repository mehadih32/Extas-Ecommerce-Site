// S07 · PR 172 — the payments screens' money figures on a real PostgreSQL (a throwaway database with the real
// migrations; skipped without TEST_DATABASE_ADMIN_URL): the money owed to customers counts every refund asked, approved
// or whose payout failed, never a rejected or paid one, and only the store's own. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import { owedToCustomers } from './money';

describe.skipIf(!HAS_TEST_DB)('payments money figures (PR 172)', () => {
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
});
