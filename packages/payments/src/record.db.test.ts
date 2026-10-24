// S07 · PR 165 — the payment model on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL):
// the one outcome writer (money in, a failure, a repeat, a late answer, a mismatch with its reason — SIM-F-028), what
// the rider collects after a part is paid (SIM-F-001), and money received outside the checkout recorded by permitted
// staff: off by default, confirmed, never above the amount due, once per reference and per key, audited. Every value
// is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { applyOutcome, orderMoney, PAYMENT_FLAGS, recordPayment, type OutcomeInput } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 165 · the payment model', () => {
  let f: PaymentsFixture;
  const by: OutcomeInput['by'] = { actorType: 'SYSTEM', actorId: null, source: 'test' };
  const apply = (paymentId: string, x: Partial<OutcomeInput> & Pick<OutcomeInput, 'outcome'>) =>
    f.t.prisma.$transaction((tx) => applyOutcome(tx, f.A, { paymentId, from: 'gateway', by, ...x }, f.clock.now));
  const orderOf = (id: string) => f.t.prisma.order.findUniqueOrThrow({ where: { id }, select: { paidMinor: true, codAmountMinor: true, flags: true, version: true, events: { select: { type: true, data: true } } } });

  beforeAll(async () => {
    f = await setUpPayments('payments_165');
  });
  afterAll(async () => f?.t.drop());

  it('money in: the payment PAID and PROVISIONAL, the order paid that much, nothing left for the rider; a repeat changes nothing', async () => {
    const o = await f.order({ number: 'P-1', paymentMethod: 'BKASH', deliveryChargeMinor: 8_000, flags: [PAYMENT_FLAGS.pending] });
    const p = await f.payment(o.id, { amountMinor: 158_000 });
    const r = await apply(p.id, { outcome: 'PAID', providerTrxId: 'TRX-1', receivedMinor: 158_000, currency: 'BDT' });
    expect(r).toMatchObject({ status: 'PAID', changed: true, mismatchReason: null, advanceMet: false, number: 'P-1' });
    const row = await f.t.prisma.payment.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: 'PAID', moneyStatus: 'PROVISIONAL', receivedMinor: 158_000, providerTrxId: 'TRX-1', mismatchReason: null });
    let ord = await orderOf(o.id);
    expect(ord).toMatchObject({ paidMinor: 158_000, codAmountMinor: 0, flags: [] });
    expect(ord.events.map((e) => e.type)).toEqual(['payment.paid']);
    // the same answer again (a gateway retries its callback): one payment, the order untouched
    expect(await apply(p.id, { outcome: 'PAID', providerTrxId: 'TRX-1' })).toMatchObject({ changed: false, status: 'PAID' });
    // a "failed" after the money came in never undoes it
    expect(await apply(p.id, { outcome: 'FAILED', failureCode: 'X' })).toMatchObject({ changed: false, status: 'PAID' });
    ord = await orderOf(o.id);
    expect(ord.paidMinor).toBe(158_000);
    expect(ord.events).toHaveLength(1);
  });

  it('a failure: closed with its code, the order flagged, one call task however often it is reported (SIM-F-026)', async () => {
    const o = await f.order({ number: 'P-2', paymentMethod: 'NAGAD', flags: [PAYMENT_FLAGS.pending] });
    const p = await f.payment(o.id, { method: 'NAGAD', provider: 'nagad' });
    expect(await apply(p.id, { outcome: 'FAILED', failureCode: 'INSUFFICIENT_BALANCE' })).toMatchObject({ changed: true, status: 'FAILED' });
    expect(await apply(p.id, { outcome: 'CANCELLED' })).toMatchObject({ changed: false, status: 'FAILED' });
    expect(await f.t.prisma.payment.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: 'FAILED', failureCode: 'INSUFFICIENT_BALANCE', moneyStatus: null });
    expect((await orderOf(o.id)).flags).toEqual([PAYMENT_FLAGS.failed]);
    expect(await f.t.prisma.callTask.count({ where: { orderId: o.id, reason: 'PAYMENT_FAILED', status: 'OPEN' } })).toBe(1);
    // the customer cancelled at the gateway on a second try: the same one call task
    const p2 = await f.payment(o.id, { method: 'NAGAD', provider: 'nagad' });
    expect(await apply(p2.id, { outcome: 'CANCELLED' })).toMatchObject({ changed: true, status: 'CANCELLED' });
    expect((await f.t.prisma.payment.findUniqueOrThrow({ where: { id: p2.id } })).failureCode).toBe('CUSTOMER_CANCELLED');
    expect(await f.t.prisma.callTask.count({ where: { orderId: o.id, reason: 'PAYMENT_FAILED' } })).toBe(1);
    // the third try pays: the call is closed as paid
    const p3 = await f.payment(o.id, { method: 'NAGAD', provider: 'nagad' });
    await apply(p3.id, { outcome: 'PAID' });
    expect(await f.t.prisma.callTask.findFirstOrThrow({ where: { orderId: o.id, reason: 'PAYMENT_FAILED' } })).toMatchObject({ status: 'DONE', outcome: 'PAID' });
    expect((await orderOf(o.id)).flags).toEqual([]);
  });

  it('SIM-F-028: money that does not fit is kept, with its reason, and the order is flagged', async () => {
    // another amount than asked
    const a = await f.order({ number: 'P-3', paymentMethod: 'BKASH' });
    const pa = await f.payment(a.id);
    expect(await apply(pa.id, { outcome: 'PAID', receivedMinor: 140_000 })).toMatchObject({ mismatchReason: 'AMOUNT_DIFFERS' });
    expect(await orderOf(a.id)).toMatchObject({ paidMinor: 140_000, flags: [PAYMENT_FLAGS.mismatch] });
    // money for a payment the shop had closed (given up as abandoned) — recorded, never lost
    const b = await f.order({ number: 'P-4', paymentMethod: 'BKASH' });
    const pb = await f.payment(b.id);
    await apply(pb.id, { outcome: 'ABANDONED', from: 'system', callTask: false });
    expect(await f.t.prisma.callTask.count({ where: { orderId: b.id } })).toBe(0);
    expect((await orderOf(b.id)).events.map((e) => e.type)).toEqual(['payment.abandoned']);
    expect(await code(apply(pb.id, { outcome: 'PAID', from: 'staff' }))).toBe('ILLEGAL_PAYMENT_MOVE');
    expect(await apply(pb.id, { outcome: 'PAID' })).toMatchObject({ changed: true, mismatchReason: 'PAID_AFTER_CLOSE' });
    // a second payment for an order already paid in full
    const pb2 = await f.payment(b.id);
    expect(await apply(pb2.id, { outcome: 'PAID' })).toMatchObject({ mismatchReason: 'DUPLICATE_PAYMENT' });
    expect((await orderOf(b.id)).paidMinor).toBe(300_000);
    // the payments screen lists every one with the owner's words
    const m = await orderMoney(f.deps(), f.viewer, b.id);
    expect(m?.mismatches.map((x) => [x.reason, x.en])).toEqual([
      ['PAID_AFTER_CLOSE', 'Money came in after the payment was closed'],
      ['DUPLICATE_PAYMENT', 'Money came in for an order already paid in full'],
    ]);
    expect(m?.mismatches.every((x) => x.bn.length > 0)).toBe(true);
  });

  it('an advance paid in full says so (the order service moves the order); REFUNDED is never set', async () => {
    const o = await f.order({ number: 'P-5', status: 'AWAITING_ADVANCE', deliveryChargeMinor: 12_000, advanceRequiredMinor: 12_000 });
    const p = await f.payment(o.id, { amountMinor: 12_000, purpose: 'ADVANCE_DELIVERY_CHARGE' });
    expect(await apply(p.id, { outcome: 'PAID' })).toMatchObject({ advanceMet: true });
    // SIM-F-001: the rider now collects the rest only
    expect(await orderOf(o.id)).toMatchObject({ paidMinor: 12_000, codAmountMinor: 150_000 });
    expect(await code(apply(randomUUID(), { outcome: 'PAID' }))).toBe('NOT_FOUND');
  });

  describe('money received outside the checkout (F-040)', () => {
    const input = { method: 'BKASH', purpose: 'ADVANCE_DELIVERY_CHARGE', amountMinor: 12_000, reference: 'bk 9x7 a1', confirm: true };
    let o: { id: string; number: string };
    beforeAll(async () => {
      o = await f.order({ number: 'R-1', status: 'AWAITING_ADVANCE', deliveryChargeMinor: 12_000, advanceRequiredMinor: 12_000 });
    });

    it('off by default; only with payments.record; a key and the confirm are needed', async () => {
      expect(await code(recordPayment(f.deps(), f.staff, o.id, input, { idempotencyKey: 'rec-000001' }))).toBe('MANUAL_OFF');
      f.overrides.set('payments.manual', { enabled: true, methods: ['BKASH', 'BANK_TRANSFER'] });
      expect(await code(recordPayment(f.deps(), f.viewer, o.id, input, { idempotencyKey: 'rec-000001' }))).toBe('FORBIDDEN');
      expect(await code(recordPayment(f.deps(), f.staff, o.id, input))).toBe('INVALID_INPUT');
      expect(await code(recordPayment(f.deps(), f.staff, o.id, { ...input, confirm: false }, { idempotencyKey: 'rec-000001' }))).toBe('CONFIRM_REQUIRED');
      expect(await code(recordPayment(f.deps(), f.staff, o.id, { ...input, method: 'NAGAD' }, { idempotencyKey: 'rec-000001' }))).toBe('METHOD_NOT_ALLOWED');
      expect(await code(recordPayment(f.deps(), f.staff, o.id, { ...input, amountMinor: 999_999 }, { idempotencyKey: 'rec-000001' }))).toBe('OVER_DUE');
    });

    it('recorded once: the due and the door amount go down by exactly that much, the order service is asked to move the order, the audit row is written', async () => {
      const moved: string[] = [];
      const deps = f.deps({ orders: { advancePaid: async (_s, id) => void moved.push(id) } });
      const r = await recordPayment(deps, f.staff, o.id, input, { idempotencyKey: 'rec-000001' });
      expect(r).toMatchObject({ number: 'R-1', amountMinor: 12_000, dueMinor: 150_000, codToCollectMinor: 150_000, advanceMet: true, replay: false });
      expect(moved).toEqual([o.id]);
      expect(await f.t.prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } })).toMatchObject({ status: 'PAID', method: 'BKASH', provider: 'manual:bkash', providerTrxId: 'BK9X7A1', recordedById: f.staffId, moneyStatus: 'PROVISIONAL' });
      expect((await orderOf(o.id)).events.map((e) => e.type)).toEqual(['payment.recorded']);
      const audit = await f.t.prisma.auditLog.findFirstOrThrow({ where: { action: 'payment.record', entityId: r.paymentId } });
      expect(audit).toMatchObject({ actorType: 'STAFF', actorId: f.staffId, before: { dueMinor: 162_000 }, after: { dueMinor: 150_000, amountMinor: 12_000, reference: 'BK9X7A1' } });
      // the same press again: the first answer, no second payment
      expect(await recordPayment(deps, f.staff, o.id, input, { idempotencyKey: 'rec-000001' })).toMatchObject({ paymentId: r.paymentId, replay: true });
      expect(await code(recordPayment(deps, f.staff, o.id, { ...input, amountMinor: 11_000 }, { idempotencyKey: 'rec-000001' }))).toBe('IDEMPOTENCY_MISMATCH');
      // the same transaction under another key, typed another way: refused
      expect(await code(recordPayment(deps, f.staff, o.id, { ...input, reference: 'BK9X7A1' }, { idempotencyKey: 'rec-000002' }))).toBe('DUPLICATE_REFERENCE');
      expect(await f.t.prisma.payment.count({ where: { orderId: o.id } })).toBe(1);
    });

    it('never on a cancelled order, never when nothing is due, and the screen shows the payment', async () => {
      const c = await f.order({ number: 'R-2', status: 'CANCELLED' });
      expect(await code(recordPayment(f.deps(), f.staff, c.id, input, { idempotencyKey: 'rec-000003' }))).toBe('ORDER_CLOSED');
      const paid = await f.order({ number: 'R-3', paymentMethod: 'BKASH', paidMinor: 150_000 });
      expect(await code(recordPayment(f.deps(), f.staff, paid.id, input, { idempotencyKey: 'rec-000004' }))).toBe('NOTHING_DUE');
      expect(await code(recordPayment(f.deps(), { ...f.staff, storeId: f.B }, o.id, input, { idempotencyKey: 'rec-000005' }))).toBe('FORBIDDEN');
      const m = await orderMoney(f.deps(), f.viewer, o.id);
      expect(m).toMatchObject({ number: 'R-1', paidMinor: 12_000, dueMinor: 150_000, codToCollectMinor: 150_000, pill: 'COD_TO_COLLECT', mismatches: [] });
      expect(m?.payments).toHaveLength(1);
      expect(await orderMoney(f.deps(), f.viewer, randomUUID())).toBeNull();
      f.overrides.delete('payments.manual');
    });
  });
});
