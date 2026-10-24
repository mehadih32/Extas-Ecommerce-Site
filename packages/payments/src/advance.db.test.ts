// S07 · PR 173 — partial payment and the pre-order advance on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL): off by default; a Cash on Delivery order's advance asked with a key and [confirm], within
// the owner's cap, one waiting at a time; the quote the screens show; and, once the customer's money comes in through
// the one outcome writer, the rider collects only the rest — a full advance leaves 0 at the door, a partial one
// total − advance. Asking moves no money. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { advanceQuote, applyOutcome, requestAdvance } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 173 · partial payment and the pre-order advance', () => {
  let f: PaymentsFixture;
  const ON = { enabled: true, capPercent: 10, minMinor: null, allowFull: false };

  beforeAll(async () => {
    f = await setUpPayments('payments_173');
  });
  afterAll(async () => f?.t.drop());

  const pay = (paymentId: string) => f.t.prisma.$transaction((tx) => applyOutcome(tx, f.A, { paymentId, outcome: 'PAID', from: 'gateway', by: { actorType: 'SYSTEM', actorId: null, source: 'gateway:bkash' } }, f.clock.now));
  const cod = async (orderId: string) => (await f.t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).codAmountMinor;

  it('off by default; then a key, the cap and [confirm]; one waiting at a time; audited and on the timeline', async () => {
    const o = await f.order({ number: 'A-1', status: 'PLACED', lines: [200_000] });
    const ask = { method: 'BKASH', amountMinor: 15_000, confirm: true };
    expect(await code(requestAdvance(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'advance-0001' }))).toBe('PARTIAL_OFF');
    expect(await advanceQuote(f.deps(), f.viewer, o.id)).toMatchObject({ enabled: false, blocked: 'PARTIAL_OFF', capMinor: 0, advanceMinor: null });
    f.overrides.set('payments.partial', ON);
    try {
      expect(await advanceQuote(f.deps(), f.viewer, o.id)).toMatchObject({ enabled: true, blocked: null, capMinor: 20_000, advanceMinor: 20_000, codNowMinor: 200_000, codAfterMinor: 180_000, allowFull: false });
      expect(await code(requestAdvance(f.deps(), f.viewer, o.id, ask, { idempotencyKey: 'advance-0001' }))).toBe('FORBIDDEN');
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, ask))).toBe('INVALID_INPUT');
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, { ...ask, amountMinor: 20_001 }, { idempotencyKey: 'advance-0002' }))).toBe('OVER_CAP');
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, { method: 'BKASH', full: true, confirm: true }, { idempotencyKey: 'advance-0003' }))).toBe('OVER_CAP');
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, { ...ask, confirm: false }, { idempotencyKey: 'advance-0004' }))).toBe('CONFIRM_REQUIRED');
      const r = await requestAdvance(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'advance-0001' });
      expect(r).toMatchObject({ advanceMinor: 15_000, capMinor: 20_000, codAfterMinor: 185_000, replay: false, number: 'A-1' });
      expect(await requestAdvance(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'advance-0001' })).toMatchObject({ paymentId: r.paymentId, replay: true });
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, { ...ask, amountMinor: 1_000 }, { idempotencyKey: 'advance-0001' }))).toBe('IDEMPOTENCY_MISMATCH');
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, ask, { idempotencyKey: 'advance-0005' }))).toBe('ALREADY_RECORDED');
      expect(await advanceQuote(f.deps(), f.viewer, o.id)).toMatchObject({ blocked: 'ALREADY_RECORDED', openPaymentId: r.paymentId });
      // asking moved no money: the rider still collects everything
      expect(await cod(o.id)).toBe(200_000);
      const p = await f.t.prisma.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
      expect(p).toMatchObject({ purpose: 'PREORDER_ADVANCE', status: 'INITIATED', amountMinor: 15_000, provider: 'bkash', idempotencyKey: 'advance:advance-0001' });
      expect(await f.t.prisma.orderEvent.count({ where: { orderId: o.id, type: 'payment.advance.requested' } })).toBe(1);
      expect(await f.t.prisma.auditLog.count({ where: { action: 'payment.advance', entityId: r.paymentId } })).toBe(1);
    } finally {
      f.overrides.delete('payments.partial');
    }
  });

  it('a partial advance paid: the rider collects total − advance', async () => {
    const o = await f.order({ number: 'A-2', status: 'CONFIRMED', lines: [150_000], deliveryChargeMinor: 10_000 });
    f.overrides.set('payments.partial', ON);
    try {
      const r = await requestAdvance(f.deps(), f.staff, o.id, { method: 'NAGAD', confirm: true }, { idempotencyKey: 'advance-0101' });
      expect(r).toMatchObject({ advanceMinor: 16_000, codAfterMinor: 144_000 });
      await pay(r.paymentId);
      expect(await cod(o.id)).toBe(160_000 - 16_000);
      expect(await advanceQuote(f.deps(), f.viewer, o.id)).toMatchObject({ dueMinor: 144_000, codNowMinor: 144_000, blocked: null });
    } finally {
      f.overrides.delete('payments.partial');
    }
  });

  it('a full advance paid (when the owner allows it): nothing is collected at the door', async () => {
    const o = await f.order({ number: 'A-3', status: 'PLACED', lines: [120_000], walletAppliedMinor: 5_000 });
    f.overrides.set('payments.partial', { ...ON, allowFull: true });
    try {
      const r = await requestAdvance(f.deps(), f.staff, o.id, { method: 'CARD', provider: 'sslcommerz', full: true, confirm: true }, { idempotencyKey: 'advance-0201' });
      expect(r).toMatchObject({ advanceMinor: 115_000, codAfterMinor: 0 });
      await pay(r.paymentId);
      expect(await cod(o.id)).toBe(0);
      expect(await code(requestAdvance(f.deps(), f.staff, o.id, { method: 'BKASH', confirm: true }, { idempotencyKey: 'advance-0202' }))).toBe('NOTHING_DUE');
    } finally {
      f.overrides.delete('payments.partial');
    }
  });

  it('only a Cash on Delivery order before it leaves the shop; never a cancelled one', async () => {
    f.overrides.set('payments.partial', { ...ON, minMinor: 5_000 });
    try {
      const prepaid = await f.order({ number: 'A-4', status: 'PLACED', paymentMethod: 'BKASH' });
      const gone = await f.order({ number: 'A-5', status: 'IN_TRANSIT' });
      const cancelled = await f.order({ number: 'A-6', status: 'CANCELLED' });
      const small = await f.order({ number: 'A-7', status: 'PLACED', lines: [100_000] });
      const ask = { method: 'BKASH', confirm: true };
      expect(await code(requestAdvance(f.deps(), f.staff, prepaid.id, ask, { idempotencyKey: 'advance-0301' }))).toBe('ADVANCE_NOT_ALLOWED');
      expect(await code(requestAdvance(f.deps(), f.staff, gone.id, ask, { idempotencyKey: 'advance-0302' }))).toBe('ADVANCE_NOT_ALLOWED');
      expect(await code(requestAdvance(f.deps(), f.staff, cancelled.id, ask, { idempotencyKey: 'advance-0303' }))).toBe('ORDER_CLOSED');
      expect(await code(requestAdvance(f.deps(), f.staff, small.id, { ...ask, amountMinor: 4_999 }, { idempotencyKey: 'advance-0304' }))).toBe('BELOW_MIN');
      expect(await advanceQuote(f.deps(), f.viewer, gone.id)).toMatchObject({ blocked: 'ADVANCE_NOT_ALLOWED' });
      expect(await advanceQuote(f.deps(), f.viewer, '00000000-0000-4000-8000-000000000000')).toBeNull();
    } finally {
      f.overrides.delete('payments.partial');
    }
  });
});
