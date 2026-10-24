// S06 · PR 542 — the advance pay link on a real PostgreSQL (throwaway database; skipped without TEST_DATABASE_ADMIN_URL).
// SIM-F-016: the customer opens `/pay/<token>`; the token alone finds the try; paying it (the test page while test
// payments are on and no real gateway is connected) writes the money through the one outcome writer and runs the order
// hook once the advance is met; a failure is kept and "Try again" makes a new try with the same token; with test
// payments off the test answers are refused; an order that no longer waits has nothing to pay. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMockGateway } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { linkPayAction, linkPayView, linkTokenOf, startLinkPayment } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

describe.skipIf(!HAS_TEST_DB)('PR 542 · the advance pay link (PostgreSQL)', () => {
  let f: PaymentsFixture;
  const db = () => f.t.prisma;
  let seq = 0;
  /** An order waiting for its advance with a link, as the order service makes it. */
  const waiting = async (amountMinor = 12_000) => {
    seq += 1;
    const o = await f.order({ number: `ADV-${seq}`, status: 'AWAITING_ADVANCE', deliveryChargeMinor: 12_000, advanceRequiredMinor: amountMinor });
    const token = `tok${seq}`.padEnd(24, 'x');
    const p = await db().payment.create({ data: { storeId: f.A, orderId: o.id, method: 'BKASH', provider: 'bkash', purpose: 'ADVANCE_DELIVERY_CHARGE', status: 'INITIATED', amountMinor, currency: 'BDT', idempotencyKey: `advance:${token}:1`, attempt: 1, linkToken: token, statusAt: f.clock.now } });
    return { o, token, paymentId: p.id };
  };

  beforeAll(async () => {
    f = await setUpPayments('advance_link');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the token finds the try; an unknown or malformed token is no link; the page shows the order number and amount only', async () => {
    const { o, token, paymentId } = await waiting();
    const v = (await linkPayView(f.deps(), token))!;
    expect(v).toMatchObject({ token, paymentId, number: o.number, amountMinor: 12_000, currency: 'BDT', status: 'INITIATED', open: true, closed: false, canRetry: false, test: true, gateway: false });
    expect(Object.keys(v)).not.toContain('phone');
    expect(await linkPayView(f.deps(), 'no-such-token-0000000000')).toBeNull();
    expect(await linkPayView(f.deps(), '../x')).toBeNull();
    expect(await linkTokenOf(f.deps(), paymentId)).toBe(token);
  });

  it('SIM-F-016: paid on the test page → the money on the order through the one writer, and the order hook once the advance is met', async () => {
    const { o, token, paymentId } = await waiting();
    const moved: string[] = [];
    const deps = f.deps({ orders: { advancePaid: async (_s, orderId) => void moved.push(orderId) } });
    const r = await linkPayAction(deps, { token, action: 'approve' });
    expect(r).toMatchObject({ status: 'PAID', advanceMet: true });
    expect(moved).toEqual([o.id]);
    expect(await db().payment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({ status: 'PAID', receivedMinor: 12_000, moneyStatus: 'PROVISIONAL' });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.id }, select: { paidMinor: true } })).paidMinor).toBe(12_000);
    expect(await db().orderEvent.count({ where: { orderId: o.id, type: 'payment.paid', source: 'pay-link' } })).toBe(1);
    // a second press changes nothing
    expect(await linkPayAction(deps, { token, action: 'approve' })).toMatchObject({ status: 'PAID', advanceMet: false });
    expect(moved).toHaveLength(1);
  });

  it('a failure is kept (the team gets a call task); "Try again" is a new try with the same token, only while the order waits', async () => {
    const { o, token, paymentId } = await waiting();
    expect(await linkPayAction(f.deps(), { token, action: 'fail' })).toMatchObject({ status: 'FAILED' });
    expect((await linkPayView(f.deps(), token))!).toMatchObject({ status: 'FAILED', open: false, canRetry: true });
    expect(await db().callTask.count({ where: { orderId: o.id, status: 'OPEN' } })).toBe(1);
    await linkPayAction(f.deps(), { token, action: 'retry' });
    const v = (await linkPayView(f.deps(), token))!;
    expect(v).toMatchObject({ status: 'INITIATED', open: true });
    expect(v.paymentId).not.toBe(paymentId);
    expect(await db().payment.findUniqueOrThrow({ where: { id: v.paymentId } })).toMatchObject({ attempt: 2, linkToken: token, amountMinor: 12_000 });
    // retry on an open try does nothing more
    await linkPayAction(f.deps(), { token, action: 'retry' });
    expect(await db().payment.count({ where: { linkToken: token } })).toBe(2);
  });

  it('test payments off: the test answers are refused; an order that no longer waits has nothing to pay', async () => {
    const a = await waiting();
    f.overrides.set('payments.testPayments', false);
    expect((await linkPayView(f.deps(), a.token))!).toMatchObject({ test: false, gateway: false, open: true });
    expect(await code(linkPayAction(f.deps(), { token: a.token, action: 'approve' }))).toBe('TEST_PAYMENTS_OFF');
    f.overrides.delete('payments.testPayments');
    await db().order.update({ where: { id: a.o.id }, data: { status: 'PLACED' } });
    expect((await linkPayView(f.deps(), a.token))!).toMatchObject({ open: false, closed: true, canRetry: false });
    expect(await code(linkPayAction(f.deps(), { token: a.token, action: 'approve' }))).toBe('ORDER_CLOSED');
    expect(await code(startLinkPayment(f.deps(), { token: a.token, callbackBaseUrl: 'https://shop.example.test/api/payments/callback/bkash' }))).toBe('ORDER_CLOSED');
  });

  it('"Pay" on a gateway opens its session for the open try', async () => {
    const { token, paymentId } = await waiting();
    const deps = f.deps({ gateways: async () => ({ api: createMockGateway('bkash'), mode: 'MOCK' }) });
    const s = await startLinkPayment(deps, { token, callbackBaseUrl: 'https://shop.example.test/api/payments/callback/bkash' });
    expect(s.paymentId).toBe(paymentId);
    expect((await db().payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('PENDING');
  });
});
