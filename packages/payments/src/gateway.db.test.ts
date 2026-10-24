// S07 · PR 170 — payments through a gateway on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL), with the practice gateway and a scripted one. The SIM-F-026 acceptance tests: a failed
// payment, then "Try again", ends with exactly one order and one paid payment; a repeated callback is one payment; a
// forged callback is stored and never processed; a gateway that does not answer leaves the payment for the sweep,
// which records the money that really came in; an unanswered payment is given up as abandoned only when the owner
// says so; failed and abandoned payments are listed for the team. Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkCallbackSignature, createMockGateway, mockCallback, signedCallbackUrl, type GatewayOutcome, type PaymentGateway } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { connectionGateways, FAILURE_CODES, paymentIssues, receiveCallback, startPayment, sweepPending, type GatewayResolver } from './index';
import { setUpPayments, type PaymentsFixture } from './testing';

const BASE = 'https://shop.example.test/api/payments/callback/bkash';
const MIN = 60_000;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

/** A scripted gateway: our own signed callback, and the answers the test sets. */
function scripted() {
  const s = { confirm: null as GatewayOutcome | Error | null, query: null as GatewayOutcome | Error | null, queries: 0 };
  const api: PaymentGateway = {
    provider: 'bkash',
    async initiate(i) {
      return { providerRef: `TR-${i.paymentId.slice(-6)}`, redirectUrl: 'https://pay.example.test/session', expiresAt: null };
    },
    readCallback({ params }) {
      const c = checkCallbackSignature('scripted-key', 'bkash', params);
      if (!c.ok) return c;
      return { ok: true, paymentId: c.paymentId, providerRef: params.paymentID ?? '', claim: (params.status ?? 'success') as 'success', eventKey: `${params.paymentID}:${params.status}` };
    },
    async confirm() {
      if (s.confirm instanceof Error) throw s.confirm;
      return s.confirm!;
    },
    async query() {
      s.queries += 1;
      if (s.query instanceof Error) throw s.query;
      return s.query!;
    },
  };
  const params = (paymentId: string, ref: string, status: string) => ({ ...Object.fromEntries(new URL(signedCallbackUrl('scripted-key', 'bkash', BASE, paymentId)).searchParams.entries()), paymentID: ref, status });
  return { s, api, params };
}
const paid = (ref: string, amountMinor: number | null = null): GatewayOutcome => ({ state: 'PAID', providerRef: ref, providerTrxId: `BKX-${ref}`, amountMinor, currency: 'BDT', failureCode: null });

describe('PR 170 · the gateway resolver from the connection layer', () => {
  it('a provider with no adapter yet runs on the practice gateway; bKash goes through its connection', async () => {
    const asked: string[] = [];
    const connections = { use: async (_k: string, w: { provider: string }) => (asked.push(w.provider), { api: { provider: w.provider }, mode: 'LIVE' }) } as never;
    const resolve = connectionGateways(connections);
    const visa = await resolve(1, 'visa');
    expect(visa.mode).toBe('MOCK');
    expect(visa.api.provider).toBe('visa');
    expect(await resolve(1, 'bkash')).toMatchObject({ mode: 'LIVE', api: { provider: 'bkash' } });
    expect(asked).toEqual(['bkash']);
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 170 · payment callbacks, the sweep and SIM-F-026', () => {
  let f: PaymentsFixture;
  const mock = createMockGateway('bkash');
  const mockGateways: GatewayResolver = async () => ({ api: mock, mode: 'MOCK' });
  const prepaid = async (number: string, amountMinor = 150_000) => {
    const o = await f.order({ number, paymentMethod: 'BKASH', flags: ['PAYMENT_PENDING'] });
    const p = await f.payment(o.id, { amountMinor, key: `${number}:pay:1` });
    return { o, p };
  };
  const orderOf = (id: string) => f.t.prisma.order.findUniqueOrThrow({ where: { id }, select: { paidMinor: true, codAmountMinor: true, flags: true } });
  const paymentOf = (id: string) => f.t.prisma.payment.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    f = await setUpPayments('payments_170');
  });
  afterAll(async () => f?.t.drop());

  it('start opens the gateway session; the practice gateway only while test payments are on', async () => {
    const { p } = await prepaid('G-3001');
    expect(await code(startPayment(f.deps(), { storeId: f.A, paymentId: p.id, callbackBaseUrl: BASE }))).toBe('GATEWAY_ERROR');
    f.overrides.set('payments.testPayments', false);
    expect(await code(startPayment(f.deps({ gateways: mockGateways }), { storeId: f.A, paymentId: p.id, callbackBaseUrl: BASE }))).toBe('TEST_PAYMENTS_OFF');
    f.overrides.delete('payments.testPayments');
    const s = await startPayment(f.deps({ gateways: mockGateways }), { storeId: f.A, paymentId: p.id, callbackBaseUrl: BASE });
    expect(s).toMatchObject({ paymentId: p.id, providerRef: `mock-${p.id}`, mode: 'MOCK' });
    expect(await paymentOf(p.id)).toMatchObject({ status: 'PENDING', providerRef: `mock-${p.id}` });
    expect(await code(startPayment(f.deps({ gateways: mockGateways }), { storeId: f.B, paymentId: p.id, callbackBaseUrl: BASE }))).toBe('NOT_FOUND');
    // the practice gateway comes straight back to our callback: one paid payment
    const params = Object.fromEntries(new URL(s.redirectUrl).searchParams.entries());
    expect(await receiveCallback(f.deps({ gateways: mockGateways }), { provider: 'bkash', params })).toMatchObject({ code: 'PROCESSED', status: 'PAID', number: 'G-3001' });
    expect(await code(startPayment(f.deps({ gateways: mockGateways }), { storeId: f.A, paymentId: p.id, callbackBaseUrl: BASE }))).toBe('NOT_OPEN');
  });

  it('a repeated callback is one payment; a forged one is stored and never processed', async () => {
    const { o, p } = await prepaid('G-3002');
    const d = f.deps({ gateways: mockGateways });
    const ok = mockCallback('bkash', BASE, p.id, 'success');
    const first = await receiveCallback(d, { provider: 'bkash', params: ok });
    expect(first).toMatchObject({ code: 'PROCESSED', status: 'PAID' });
    const again = await receiveCallback(d, { provider: 'bkash', params: ok });
    expect(again).toMatchObject({ code: 'DUPLICATE', status: 'PAID', eventId: first.eventId });
    expect((await orderOf(o.id)).paidMinor).toBe(150_000);
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: o.id, type: 'payment.paid' } })).toBe(1);
    expect(await f.t.prisma.webhookEvent.findUniqueOrThrow({ where: { id: first.eventId! } })).toMatchObject({ source: 'payment-bkash', signatureValid: true, status: 'PROCESSED', storeId: f.A });

    const { p: q } = await prepaid('G-3003');
    const forged = { ...mockCallback('bkash', BASE, q.id, 'success'), sig: '0'.repeat(64) };
    const bad = await receiveCallback(d, { provider: 'bkash', params: forged });
    expect(bad).toMatchObject({ code: 'INVALID', paymentId: null });
    expect(await receiveCallback(d, { provider: 'bkash', params: forged })).toMatchObject({ code: 'INVALID', eventId: bad.eventId });
    expect(await f.t.prisma.webhookEvent.findUniqueOrThrow({ where: { id: bad.eventId! } })).toMatchObject({ signatureValid: false, status: 'IGNORED' });
    expect((await f.t.prisma.webhookEvent.findUniqueOrThrow({ where: { id: bad.eventId! } })).payload).not.toHaveProperty('sig');
    // another payment's signature, an unknown payment, another provider
    expect(await receiveCallback(d, { provider: 'bkash', params: { ...mockCallback('bkash', BASE, p.id, 'success'), pid: q.id } })).toMatchObject({ code: 'INVALID' });
    expect(await receiveCallback(d, { provider: 'bkash', params: mockCallback('bkash', BASE, '00000000-0000-4000-8000-000000000000', 'success') })).toMatchObject({ code: 'INVALID' });
    expect(await receiveCallback(d, { provider: 'nagad', params: mockCallback('nagad', BASE, q.id, 'success') })).toMatchObject({ code: 'INVALID' });
    expect(await paymentOf(q.id)).toMatchObject({ status: 'INITIATED' });
  });

  it('SIM-F-026: a failed payment, then try again, ends with one order and one paid payment', async () => {
    const { o, p } = await prepaid('G-3004');
    const d = f.deps({ gateways: mockGateways });
    expect(await receiveCallback(d, { provider: 'bkash', params: mockCallback('bkash', BASE, p.id, 'failure') })).toMatchObject({ code: 'PROCESSED', status: 'FAILED' });
    expect(await paymentOf(p.id)).toMatchObject({ status: 'FAILED', failureCode: 'MOCK_FAILURE' });
    expect((await orderOf(o.id)).flags).toContain('PAYMENT_FAILED');
    expect(await f.t.prisma.callTask.count({ where: { orderId: o.id, reason: 'PAYMENT_FAILED', status: 'OPEN' } })).toBe(1);
    // the failed payment is on the team's list
    expect((await paymentIssues(f.deps(), f.viewer, { state: 'failed' })).map((x) => x.number)).toContain('G-3004');
    // "Try again" (the checkout makes the second try for the same order)
    const p2 = await f.payment(o.id, { key: 'G-3004:pay:2' });
    await f.t.prisma.payment.update({ where: { id: p2.id }, data: { attempt: 2 } });
    expect(await receiveCallback(d, { provider: 'bkash', params: mockCallback('bkash', BASE, p2.id, 'success') })).toMatchObject({ status: 'PAID' });
    // a late repeat of the old failure changes nothing
    expect(await receiveCallback(d, { provider: 'bkash', params: mockCallback('bkash', BASE, p.id, 'failure') })).toMatchObject({ code: 'DUPLICATE' });
    expect(await f.t.prisma.order.count({ where: { number: 'G-3004' } })).toBe(1);
    expect(await f.t.prisma.payment.count({ where: { orderId: o.id, status: 'PAID' } })).toBe(1);
    expect(await orderOf(o.id)).toMatchObject({ paidMinor: 150_000, codAmountMinor: 0 });
    expect((await orderOf(o.id)).flags).not.toContain('PAYMENT_FAILED');
    expect(await f.t.prisma.callTask.findFirstOrThrow({ where: { orderId: o.id, reason: 'PAYMENT_FAILED' } })).toMatchObject({ status: 'DONE', outcome: 'PAID' });
    expect((await paymentIssues(f.deps(), f.viewer, { state: 'failed' })).find((x) => x.number === 'G-3004')).toMatchObject({ orderPaid: true });
  });

  it('only the gateway’s answer counts: a claimed success it does not confirm is not money; another amount is a mismatch', async () => {
    const g = scripted();
    const d = f.deps({ gateways: async () => ({ api: g.api, mode: 'LIVE' }) });
    const { o, p } = await prepaid('G-3005');
    g.s.confirm = { state: 'FAILED', providerRef: 'TR-5', providerTrxId: null, amountMinor: null, currency: null, failureCode: '2023' };
    expect(await receiveCallback(d, { provider: 'bkash', params: g.params(p.id, 'TR-5', 'success') })).toMatchObject({ code: 'PROCESSED', status: 'FAILED' });
    expect(await paymentOf(p.id)).toMatchObject({ status: 'FAILED', failureCode: '2023' });
    expect((await orderOf(o.id)).paidMinor).toBe(0);

    const { o: o2, p: p2 } = await prepaid('G-3006');
    g.s.confirm = paid('TR-6', 140_000);
    await receiveCallback(d, { provider: 'bkash', params: g.params(p2.id, 'TR-6', 'success') });
    expect(await paymentOf(p2.id)).toMatchObject({ status: 'PAID', receivedMinor: 140_000, mismatchReason: 'AMOUNT_DIFFERS', providerTrxId: 'BKX-TR-6', moneyStatus: 'PROVISIONAL' });
    expect(await orderOf(o2.id)).toMatchObject({ paidMinor: 140_000 });
    expect((await orderOf(o2.id)).flags).toContain('PAYMENT_MISMATCH');
  });

  it('a gateway that does not answer leaves the payment open; the sweep records the money that came in', async () => {
    const g = scripted();
    const d = f.deps({ gateways: async () => ({ api: g.api, mode: 'LIVE' }) });
    const { o, p } = await prepaid('G-3007');
    await startPayment(d, { storeId: f.A, paymentId: p.id, callbackBaseUrl: BASE });
    g.s.confirm = new Error('socket hang up');
    const r = await receiveCallback(d, { provider: 'bkash', params: g.params(p.id, 'TR-7', 'success') });
    expect(r).toMatchObject({ code: 'PENDING', status: 'PENDING' });
    expect(await f.t.prisma.webhookEvent.findUniqueOrThrow({ where: { id: r.eventId! } })).toMatchObject({ status: 'FAILED', error: expect.stringContaining('GATEWAY_ERROR') });
    // too early for the sweep
    g.s.query = paid(`TR-${p.id.slice(-6)}`);
    expect(await sweepPending(d, f.A)).toMatchObject({ checked: 0 });
    f.advance(11 * MIN);
    expect(await sweepPending(d, f.A)).toMatchObject({ paid: 1, errors: 0 });
    expect(await paymentOf(p.id)).toMatchObject({ status: 'PAID' });
    expect((await orderOf(o.id)).paidMinor).toBe(150_000);
    // the payment answered by the sweep is not asked again
    const before = g.s.queries;
    f.advance(11 * MIN);
    await sweepPending(d, f.A);
    expect(g.s.queries).toBe(before);
  });

  it('an unanswered payment is given up as abandoned only when the owner says so; a late payment is still recorded', async () => {
    const d = f.deps({ gateways: mockGateways });
    const { o, p } = await prepaid('G-3008');
    await startPayment(d, { storeId: f.A, paymentId: p.id, callbackBaseUrl: BASE });
    f.advance(120 * MIN);
    // off by default: the practice gateway knows nothing, the payment waits (and is listed as waiting)
    expect(await sweepPending(d, f.A)).toMatchObject({ abandoned: 0, stillOpen: expect.any(Number) });
    expect((await paymentIssues(f.deps(), f.viewer, { state: 'waiting' })).map((x) => x.number)).toContain('G-3008');
    f.overrides.set('payments.pending', { recoverAfterMinutes: 10, abandonAfterMinutes: 60, callTaskOnAbandon: false, everyMinutes: 5 });
    try {
      expect(await sweepPending(d, f.A)).toMatchObject({ abandoned: expect.any(Number), errors: 0 });
    } finally {
      f.overrides.delete('payments.pending');
    }
    expect(await paymentOf(p.id)).toMatchObject({ status: 'CANCELLED', failureCode: FAILURE_CODES.abandoned });
    expect((await orderOf(o.id)).flags).toContain('PAYMENT_FAILED');
    expect(await f.t.prisma.callTask.count({ where: { orderId: o.id } })).toBe(0);
    expect(await f.t.prisma.orderEvent.count({ where: { orderId: o.id, type: 'payment.abandoned' } })).toBe(1);
    expect((await paymentIssues(f.deps(), f.viewer, { state: 'abandoned' })).map((x) => x.number)).toContain('G-3008');
    expect(await code(paymentIssues(f.deps(), { ...f.viewer, storeId: f.B }, {}))).toBe('FORBIDDEN');
    // the money came in after all: recorded, and named
    expect(await receiveCallback(d, { provider: 'bkash', params: mockCallback('bkash', BASE, p.id, 'success') })).toMatchObject({ status: 'PAID' });
    expect(await paymentOf(p.id)).toMatchObject({ status: 'PAID', mismatchReason: 'PAID_AFTER_CLOSE' });
  });
});
