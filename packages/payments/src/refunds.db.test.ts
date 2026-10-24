// S07 · PR 172 — refunds on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL): a person
// asks within the owner's rules (B3.6: none after delivery except the rider's overcharge; never more than the money not
// yet held by another refund; to the wallet only when allowed), the owner approves with [confirm] (four eyes when
// switched on), and a person pays it out — to the wallet through the ledger, or the way it came with the reference of
// the money he sent back — and the payment becomes PARTIALLY_REFUNDED / REFUNDED. A failed payout is tried again. The
// returned prepaid parcel's refund (SIM-F-041) is asked once. The money owed to customers is always on the list (F-041).
// Nothing pays out by itself. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { approveRefund, completeRefund, failRefund, listRefunds, rejectRefund, requestRefund, requestReturnRefund, walletOf } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 172 · refunds', () => {
  let f: PaymentsFixture;

  beforeAll(async () => {
    f = await setUpPayments('payments_172');
  });
  afterAll(async () => f?.t.drop());

  /** A prepaid order with its PAID bKash payment. */
  const paidOrder = async (number: string, status: 'CONFIRMED' | 'DELIVERED' | 'RETURNED', extra: { customerId?: string; deliveryChargeMinor?: number; walletAppliedMinor?: number } = {}) => {
    const lines = [100_000];
    const total = 100_000 + (extra.deliveryChargeMinor ?? 0);
    const paidMinor = total - (extra.walletAppliedMinor ?? 0);
    const o = await f.order({ number, status, paymentMethod: 'BKASH', lines, paidMinor, ...extra });
    const p = await f.payment(o.id, { amountMinor: paidMinor });
    await f.t.prisma.payment.update({ where: { id: p.id }, data: { status: 'PAID', receivedMinor: paidMinor, paidAt: f.clock.now } });
    return { ...o, paymentId: p.id, paidMinor };
  };

  it('asking: a key, the rules (no refund after delivery but the rider overcharge), the money left, audited and on the timeline', async () => {
    const o = await paidOrder('R-1', 'CONFIRMED');
    const ask = { source: 'OUR_MISTAKE', amountMinor: 40_000, note: 'wrong colour sent to the warehouse', paymentId: o.paymentId };
    expect(await code(requestRefund(f.deps(), f.viewer, o.id, ask, { idempotencyKey: 'refund-rq-0001' }))).toBe('FORBIDDEN');
    expect(await code(requestRefund(f.deps(), f.staff, o.id, ask))).toBe('INVALID_INPUT');
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, amountMinor: undefined }, { idempotencyKey: 'refund-rq-0002' }))).toBe('INVALID_INPUT');
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, method: 'wallet' }, { idempotencyKey: 'refund-rq-0003' }))).toBe('METHOD_NOT_ALLOWED');
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, amountMinor: 100_001 }, { idempotencyKey: 'refund-rq-0004' }))).toBe('OVER_REFUNDABLE');
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, source: 'RTO' }, { idempotencyKey: 'refund-rq-0005' }))).toBe('REFUND_NOT_ALLOWED');
    const r = await requestRefund(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'refund-rq-0001' });
    expect(r).toMatchObject({ replay: false, refund: { status: 'REQUESTED', amountMinor: 40_000, method: 'original', source: 'OUR_MISTAKE', number: 'R-1', requestedById: f.staffId } });
    expect(await requestRefund(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'refund-rq-0001' })).toMatchObject({ replay: true, refund: { id: r.refund.id } });
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, amountMinor: 1_000 }, { idempotencyKey: 'refund-rq-0001' }))).toBe('IDEMPOTENCY_MISMATCH');
    // 60,000 is left; a second ask for more is refused
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, amountMinor: 60_001 }, { idempotencyKey: 'refund-rq-0006' }))).toBe('OVER_REFUNDABLE');
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: o.id, type: 'refund.requested' } })).toBe(1);
    expect(await f.t.prisma.auditLog.count({ where: { action: 'refund.request', entityId: r.refund.id } })).toBe(1);
    // nothing moved: the payment is still PAID, no wallet entry
    expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('PAID');

    const d = await paidOrder('R-2', 'DELIVERED');
    expect(await code(requestRefund(f.deps(), f.staff, d.id, { ...ask, paymentId: undefined }, { idempotencyKey: 'refund-rq-0007' }))).toBe('REFUND_NOT_ALLOWED');
    f.overrides.set('payments.refunds', { toWallet: false, afterDelivery: true, afterDeliverySources: [], rtoDeliveryCharge: 'REFUND', fourEyes: false });
    try {
      expect(await code(requestRefund(f.deps(), f.staff, d.id, { ...ask, paymentId: undefined }, { idempotencyKey: 'refund-rq-0007' }))).toBe('OK');
    } finally {
      f.overrides.delete('payments.refunds');
    }
  });

  it("CN-018 #7 — the rider's overcharge: after delivery, never more than the door records show he over-collected", async () => {
    const o = await f.order({ number: 'R-3', status: 'DELIVERED', lines: [100_000] });
    await f.t.prisma.codCollection.create({
      data: { storeId: f.A, orderId: o.id, outcome: 'DELIVERED', expectedMinor: 100_000, collectedMinor: 103_000, varianceReason: 'OVER_COLLECTED', source: 'test', idempotencyKey: 'door-r3', occurredAt: f.clock.now },
    });
    const ask = { source: 'RIDER_OVERCHARGE', amountMinor: 3_001, note: 'rider took 30 taka extra' };
    expect(await code(requestRefund(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'refund-rq-0101' }))).toBe('OVER_REFUNDABLE');
    expect(await requestRefund(f.deps(), f.staff, o.id, { ...ask, amountMinor: 3_000 }, { idempotencyKey: 'refund-rq-0102' })).toMatchObject({ refund: { amountMinor: 3_000 } });
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { ...ask, amountMinor: 1 }, { idempotencyKey: 'refund-rq-0103' }))).toBe('OVER_REFUNDABLE');
  });

  it("the owner's decision: [confirm], to the wallet only when allowed, four eyes, a rejection gives the room back", async () => {
    const c = await f.customer('Refund Customer');
    const o = await paidOrder('R-4', 'CONFIRMED', { customerId: c.id });
    const r = (await requestRefund(f.deps(), f.staff, o.id, { source: 'OTHER', amountMinor: 30_000, note: 'customer changed his mind', paymentId: o.paymentId }, { idempotencyKey: 'refund-rq-0201' })).refund;
    expect(await code(approveRefund(f.deps(), f.viewer, r.id, { confirm: true }))).toBe('FORBIDDEN');
    expect(await code(approveRefund(f.deps(), f.staff, r.id, {}))).toBe('CONFIRM_REQUIRED');
    expect(await code(approveRefund(f.deps(), f.staff, r.id, { method: 'wallet', confirm: true }))).toBe('METHOD_NOT_ALLOWED');
    // paying out before the OK is refused
    expect(await code(completeRefund(f.deps(), f.staff, r.id, { reference: 'TRX-1', confirm: true }, { idempotencyKey: 'refund-pay-0201' }))).toBe('NOT_PENDING');
    f.overrides.set('payments.refunds', { toWallet: true, afterDelivery: false, afterDeliverySources: [], rtoDeliveryCharge: 'REFUND', fourEyes: true });
    try {
      expect(await code(approveRefund(f.deps(), f.staff, r.id, { confirm: true }))).toBe('SAME_PERSON');
      const owner = await f.t.prisma.staffUser.create({ data: { email: 'owner-172@example.com', displayName: 'Owner', passwordHash: 'not-a-login' } });
      const role = await f.t.prisma.staffRoleAssignment.findFirstOrThrow({ where: { staffUserId: f.staffId } });
      await f.t.prisma.staffRoleAssignment.create({ data: { staffUserId: owner.id, roleId: role.roleId, storeId: f.A } });
      const ownerWho = { actor: { staffUserId: owner.id }, storeId: f.A };
      const a = await approveRefund(f.deps(), ownerWho, r.id, { method: 'wallet', note: 'store credit agreed', confirm: true });
      expect(a).toMatchObject({ replay: false, refund: { status: 'APPROVED', method: 'wallet', approvedById: owner.id, decisionNote: 'store credit agreed' } });
      expect(await approveRefund(f.deps(), ownerWho, r.id, { confirm: true })).toMatchObject({ replay: true });
      expect(await code(rejectRefund(f.deps(), ownerWho, r.id, { note: '' }))).toBe('INVALID_INPUT');
    } finally {
      f.overrides.delete('payments.refunds');
    }
    // a rejection gives its room back
    const r2 = (await requestRefund(f.deps(), f.staff, o.id, { source: 'OTHER', amountMinor: 70_000, note: 'the rest of it' }, { idempotencyKey: 'refund-rq-0202' })).refund;
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { source: 'OTHER', amountMinor: 1, note: 'one more' }, { idempotencyKey: 'refund-rq-0203' }))).toBe('NOTHING_DUE');
    expect(await rejectRefund(f.deps(), f.staff, r2.id, { note: 'asked twice by mistake' })).toMatchObject({ refund: { status: 'REJECTED' } });
    expect(await code(approveRefund(f.deps(), f.staff, r2.id, { confirm: true }))).toBe('NOT_PENDING');
    expect(await code(requestRefund(f.deps(), f.staff, o.id, { source: 'OTHER', amountMinor: 1, note: 'one more' }, { idempotencyKey: 'refund-rq-0203' }))).toBe('OK');
  });

  it('paying out: to the wallet through the ledger, or the way it came with its reference; the payment becomes refunded', async () => {
    const c = await f.customer('Payout Customer');
    const o = await paidOrder('R-5', 'CONFIRMED', { customerId: c.id });
    f.overrides.set('payments.refunds', { toWallet: true, afterDelivery: false, afterDeliverySources: [], rtoDeliveryCharge: 'REFUND', fourEyes: false });
    try {
      const w = (await requestRefund(f.deps(), f.staff, o.id, { source: 'OUR_MISTAKE', amountMinor: 20_000, method: 'wallet', note: 'late, store credit', paymentId: o.paymentId }, { idempotencyKey: 'refund-rq-0301' })).refund;
      await approveRefund(f.deps(), f.staff, w.id, { confirm: true });
      expect(await code(completeRefund(f.deps(), f.staff, w.id, { confirm: true }))).toBe('INVALID_INPUT');
      expect(await code(completeRefund(f.deps(), f.staff, w.id, {}, { idempotencyKey: 'refund-pay-0301' }))).toBe('CONFIRM_REQUIRED');
      const done = await completeRefund(f.deps(), f.staff, w.id, { confirm: true }, { idempotencyKey: 'refund-pay-0301' });
      expect(done).toMatchObject({ replay: false, refund: { status: 'COMPLETED', walletEntryId: expect.any(String), executedById: f.staffId } });
      expect(await completeRefund(f.deps(), f.staff, w.id, { confirm: true }, { idempotencyKey: 'refund-pay-0301' })).toMatchObject({ replay: true });
      expect(await code(failRefund(f.deps(), f.staff, w.id, { note: 'cannot fail' }))).toBe('METHOD_NOT_ALLOWED');
      const wallet = await walletOf(f.deps(), f.viewer, c.id);
      expect(wallet).toMatchObject({ balanceMinor: 20_000, ledgerMinor: 20_000 });
      expect(wallet!.entries[0]).toMatchObject({ reason: 'REFUND', direction: 'CREDIT', amountMinor: 20_000 });
      expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('PARTIALLY_REFUNDED');

      const b = (await requestRefund(f.deps(), f.staff, o.id, { source: 'OUR_MISTAKE', amountMinor: 80_000, note: 'the rest back to bKash', paymentId: o.paymentId }, { idempotencyKey: 'refund-rq-0302' })).refund;
      await approveRefund(f.deps(), f.staff, b.id, { confirm: true });
      expect(await code(completeRefund(f.deps(), f.staff, b.id, { confirm: true }, { idempotencyKey: 'refund-pay-0302' }))).toBe('INVALID_INPUT');
      // the first send did not go through; the owed figure keeps it, then it is paid on the second try
      expect(await failRefund(f.deps(), f.staff, b.id, { note: 'wrong bKash number' })).toMatchObject({ refund: { status: 'FAILED', failureNote: 'wrong bKash number' } });
      const owed = (await listRefunds(f.deps(), f.viewer, { state: 'owed' })).owed;
      expect(owed.failedMinor).toBeGreaterThanOrEqual(80_000);
      const paid = await completeRefund(f.deps(), f.staff, b.id, { reference: ' bk 9x7 ', confirm: true }, { idempotencyKey: 'refund-pay-0302' });
      expect(paid.refund).toMatchObject({ status: 'COMPLETED', payoutReference: 'BK9X7', walletEntryId: null, failureNote: null });
      expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: o.paymentId } })).status).toBe('REFUNDED');
      expect(await f.t.prisma.orderEvent.count({ where: { orderId: o.id, type: 'refund.completed' } })).toBe(2);
      expect(await f.t.prisma.auditLog.count({ where: { action: 'refund.complete', entityId: { in: [w.id, b.id] } } })).toBe(2);
    } finally {
      f.overrides.delete('payments.refunds');
    }
  });

  it("SIM-F-041 — a returned prepaid parcel's refund is asked once, by the owner's rule, and waits for his OK", async () => {
    const c = await f.customer('Returned Customer');
    const o = await paidOrder('R-6', 'RETURNED', { customerId: c.id, deliveryChargeMinor: 10_000, walletAppliedMinor: 5_000 });
    f.overrides.set('payments.refunds', { toWallet: false, afterDelivery: false, afterDeliverySources: [], rtoDeliveryCharge: 'KEEP', fourEyes: false });
    try {
      const ids = await f.t.prisma.$transaction((tx) => requestReturnRefund(tx, f.deps(), f.A, o.id));
      expect(ids).toHaveLength(2);
      expect(await f.t.prisma.$transaction((tx) => requestReturnRefund(tx, f.deps(), f.A, o.id))).toEqual(ids);
      const rows = await f.t.prisma.refund.findMany({ where: { orderId: o.id }, orderBy: { idempotencyKey: 'asc' } });
      // paid 105,000; the owner keeps the 10,000 delivery charge; the 5,000 of wallet goes back to the wallet
      expect(rows.map((r) => [r.idempotencyKey, r.method, r.amountMinor, r.status, r.paymentId])).toEqual([
        [`rto:${o.id}`, 'original', 95_000, 'REQUESTED', o.paymentId],
        [`rto:${o.id}:wallet`, 'wallet', 5_000, 'REQUESTED', null],
      ]);
      // a person's RTO ask on the same order now finds no room past the system's
      expect(await code(requestRefund(f.deps(), f.staff, o.id, { source: 'RTO', note: 'parcel came back' }, { idempotencyKey: 'refund-rq-0401' }))).toBe('OVER_REFUNDABLE');
    } finally {
      f.overrides.delete('payments.refunds');
    }
  });

  it('the list: by state, newest first, with the money owed to customers always on top (F-041)', async () => {
    const all = await listRefunds(f.deps(), f.viewer);
    expect(all.rows.length).toBeGreaterThan(3);
    expect(all.owed.totalMinor).toBe(all.owed.requestedMinor + all.owed.approvedMinor + all.owed.failedMinor);
    const owedSum = all.rows.filter((r) => ['REQUESTED', 'APPROVED', 'FAILED'].includes(r.status)).reduce((s, r) => s + r.amountMinor, 0);
    expect(all.owed.totalMinor).toBe(owedSum);
    const req = await listRefunds(f.deps(), f.viewer, { state: 'requested', limit: 2 });
    expect(req.rows).toHaveLength(2);
    expect(req.rows.every((r) => r.status === 'REQUESTED')).toBe(true);
    expect(await code(listRefunds(f.deps(), f.viewer, { state: 'PAID' }))).toBe('INVALID_INPUT');
  });
});
