// S07 · PR 170 — "Pay" through a gateway and the gateway's callback, on a real PostgreSQL (the checkout's own throwaway
// database; skipped without TEST_DATABASE_ADMIN_URL), with the practice gateway. The SIM-F-026 journey the way the
// browser walks it: place a prepaid order, "Pay" opens the gateway, the payment fails and the callback brings him back
// to the payment page, "Try again" and "Pay" once more, the callback (sent twice) brings him to the thank-you page —
// one order, one paid payment. A forged callback gets a plain 400 and changes nothing; a second press of "Place order"
// after a lost answer is the same order (same idempotency key). Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMockGateway, mockCallback } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import type { PaymentsDeps } from '@extas/payments';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { BAG_COOKIE } from './bag-model';
import { paymentHandler, placeHandler, quoteHandler, type CheckoutApiDeps } from './checkout-api';
import { paymentCallbackHandler } from './payment-callback';

const ORIGIN = 'https://shop.example.test';
const FORM = { name: 'Test Customer', phone: '01700000170', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };
const CALLBACK = `${ORIGIN}/api/payments/callback/visa`;

describe.skipIf(!HAS_TEST_DB)('PR 170 · Pay through a gateway and its callback (SIM-F-026)', () => {
  let f: CheckoutFixture;
  const mock = createMockGateway('visa');
  const pay = (): PaymentsDeps => ({ db: f.t.prisma, settings: f.deps().settings, now: f.deps().now, gateways: async () => ({ api: mock, mode: 'MOCK' }) });
  const deps = (): CheckoutApiDeps => ({
    checkout: f.deps(),
    storeId: f.S,
    payments: async () => pay(),
    callbackBase: (_r, provider, lang) => `${ORIGIN}/api/payments/callback/${provider}?lang=${lang}`,
  });
  const req = (path: string, body: unknown, cookie?: string) =>
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.170', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });
  const back = (params: Record<string, string>, method: 'GET' | 'POST' = 'GET') => {
    const u = new URL(CALLBACK);
    if (method === 'GET') for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return paymentCallbackHandler(
      new Request(u, method === 'GET' ? {} : { method, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() }),
      'visa',
      pay(),
    );
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpCheckout('payment_callback');
    await f.priceBand('dhaka-city', 8_000);
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('fail → try again → paid: one order, one paid payment; a repeated callback is one payment; a forged one changes nothing', async () => {
    const bag = await f.bag('cb-pay', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }]);
    const cookie = `${BAG_COOKIE}=${bag.visitorId}`;
    const payment = { method: 'card', option: 'visa' };
    const q = await read(await quoteHandler(req('/api/checkout/quote', { lang: 'en', address: { line: FORM.address }, payment }, cookie), deps()));
    const order = { idempotencyKey: randomUUID(), lang: 'en', form: FORM, payment, fingerprint: (q.body.view as { fingerprint: string }).fingerprint };
    const placed = await read(await placeHandler(req('/api/checkout/orders', order, cookie), deps()));
    const number = placed.body.number as string;
    // the answer was lost and he pressed again: the same order
    expect(await read(await placeHandler(req('/api/checkout/orders', order, cookie), deps()))).toMatchObject({ body: { number, replay: true } });

    // "Pay": the gateway's page (the practice gateway sends him straight back to our signed callback)
    const start = async () => read(await paymentHandler(req('/api/checkout/payments', { number, action: 'start', lang: 'en' }, cookie), deps()));
    const s1 = await start();
    expect(s1).toMatchObject({ status: 200, body: { ok: true, status: 'PENDING' } });
    expect(String(s1.body.next)).toMatch(/^https:\/\/shop\.example\.test\/api\/payments\/callback\/visa\?/);
    // someone else's bag cannot start his payment
    expect((await paymentHandler(req('/api/checkout/payments', { number, action: 'start' }, `${BAG_COOKIE}=${randomUUID()}`), deps())).status).toBe(404);

    // the payment failed: back to the payment page
    const first = await f.t.prisma.payment.findFirstOrThrow({ where: { order: { number } }, orderBy: { attempt: 'asc' } });
    const failed = await back(mockCallback('visa', CALLBACK, first.id, 'failure'));
    expect(failed.status).toBe(303);
    expect(failed.headers.get('location')).toBe(`/checkout/pay/${number}`);
    expect(await f.t.prisma.payment.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: 'FAILED', failureCode: 'MOCK_FAILURE' });

    // "Try again", "Pay" once more, and the gateway answers (twice, once as a form post)
    expect(await read(await paymentHandler(req('/api/checkout/payments', { number, action: 'retry', lang: 'en' }, cookie), deps()))).toMatchObject({ body: { status: 'INITIATED' } });
    const s2 = await start();
    const params = Object.fromEntries(new URL(String(s2.body.next)).searchParams.entries());
    const ok = await back(params);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`/checkout/thanks/${number}`);
    const again = await back(params, 'POST');
    expect(again.headers.get('location')).toBe(`/checkout/thanks/${number}`);

    // a forged callback (no signature) is a plain 400
    const forged = await back({ ...params, sig: 'x'.repeat(64) });
    expect(forged.status).toBe(400);

    const pays = await f.t.prisma.payment.findMany({ where: { order: { number } }, orderBy: { attempt: 'asc' }, select: { status: true, attempt: true } });
    expect(pays).toEqual([
      { status: 'FAILED', attempt: 1 },
      { status: 'PAID', attempt: 2 },
    ]);
    expect(await f.t.prisma.order.count({ where: { visitorId: bag.visitorId } })).toBe(1);
    expect(await f.t.prisma.webhookEvent.count({ where: { source: 'payment-visa', signatureValid: false } })).toBe(1);
  });

  it('answers 503 without a database and 405 to other methods', async () => {
    expect((await paymentCallbackHandler(new Request(CALLBACK), 'visa', null)).status).toBe(503);
    expect((await paymentCallbackHandler(new Request(CALLBACK, { method: 'PUT' }), 'visa', pay())).status).toBe(405);
  });
});
