// PR 125 — the checkout's order API on a real PostgreSQL (the checkout's own throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL), called the way the browser calls it: the bag cookie, same-site only, the page's order key
// and the fingerprint of the money it showed. The answer says where the page goes next, in the page's language.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkoutQuote } from '@extas/checkout';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { BAG_COOKIE, COUNT_COOKIE } from './bag-model';
import { draftHandler, paymentHandler, placeHandler, quoteHandler, type CheckoutApiDeps } from './checkout-api';

const ORIGIN = 'https://shop.example.test';
const FORM = { name: 'Test Customer', phone: '01700000125', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };

describe.skipIf(!HAS_TEST_DB)('the checkout order API on PostgreSQL (S04, PR 125)', () => {
  let f: CheckoutFixture;
  const deps = (): CheckoutApiDeps => ({ checkout: f.deps(), storeId: f.S });
  const req = (path: string, body: unknown, o: { cookie?: string; site?: string } = {}) =>
    new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'sec-fetch-site': o.site ?? 'same-origin', 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.125', ...(o.cookie ? { cookie: o.cookie } : {}) },
      body: JSON.stringify(body),
    });
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpCheckout('checkout_api');
    await f.priceBand('dhaka-city', 8_000);
    f.overrides.set('payment.cod.enabled', true);
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  async function page(name: string, payment: unknown = null) {
    const bag = await f.bag(name, [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }]);
    const cookie = `${BAG_COOKIE}=${bag.visitorId}`;
    const q = await read(await quoteHandler(req('/api/checkout/quote', { lang: 'bn', address: { line: FORM.address }, payment }, { cookie }), deps()));
    expect(q.status).toBe(200);
    const view = q.body.view as { fingerprint: string };
    const order = { idempotencyKey: randomUUID(), lang: 'bn', form: FORM, payment, fingerprint: view.fingerprint };
    return { ...bag, cookie, order };
  }

  it('places the order once; a second press gets the same order; the badge goes to 0', async () => {
    const p = await page('api-cod');
    const first = await placeHandler(req('/api/checkout/orders', p.order, { cookie: p.cookie }), deps());
    expect(first.status).toBe(201);
    expect(first.headers.getSetCookie().some((c) => c.startsWith(`${COUNT_COOKIE}=0;`))).toBe(true);
    const a = (await first.json()) as { number: string; next: string };
    expect(a.next).toBe(`/bn/checkout/thanks/${a.number}`);
    const again = await read(await placeHandler(req('/api/checkout/orders', p.order, { cookie: p.cookie }), deps()));
    expect(again).toMatchObject({ status: 200, body: { ok: true, number: a.number, replay: true } });
    const o = await f.t.prisma.order.findFirstOrThrow({ where: { number: a.number, storeId: f.S } });
    expect(o).toMatchObject({ ip: '192.0.2.125', visitorId: p.visitorId, deliveryChargeMinor: 8_000 });
  });

  it('refuses another site, a missing bag, an unfinished form and money that moved (with the checkout as it is now)', async () => {
    const p = await page('api-refuse');
    expect((await placeHandler(req('/api/checkout/orders', p.order, { cookie: p.cookie, site: 'cross-site' }), deps())).status).toBe(403);
    expect(await read(await placeHandler(req('/api/checkout/orders', p.order), deps()))).toMatchObject({ status: 409, body: { error: 'EMPTY' } });
    expect(await read(await placeHandler(req('/api/checkout/orders', { ...p.order, form: { ...FORM, name: '' } }, { cookie: p.cookie }), deps()))).toMatchObject({
      status: 400,
      body: { error: 'FORM', field: 'name', problem: 'empty' },
    });
    const moved = await read(await placeHandler(req('/api/checkout/orders', { ...p.order, fingerprint: 'a'.repeat(64) }, { cookie: p.cookie }), deps()));
    expect(moved).toMatchObject({ status: 409, body: { error: 'PRICE_CHANGED', view: { charge: { state: 'charge', chargeMinor: 8_000 } } } });
    expect(await f.t.prisma.order.count({ where: { visitorId: p.visitorId } })).toBe(0);
  });

  it('a prepaid order goes to its payment; the mock page fails it, tries again and pays it — one order', async () => {
    const p = await page('api-pay', { method: 'card', option: 'visa' });
    const placed = await read(await placeHandler(req('/api/checkout/orders', p.order, { cookie: p.cookie }), deps()));
    const number = placed.body.number as string;
    expect(placed.body.next).toBe(`/bn/checkout/pay/${number}`);
    const act = async (action: string) => read(await paymentHandler(req('/api/checkout/payments', { number, action, lang: 'en' }, { cookie: p.cookie }), deps()));
    expect(await act('fail')).toMatchObject({ status: 200, body: { status: 'FAILED', next: `/checkout/thanks/${number}` } });
    expect(await act('retry')).toMatchObject({ body: { status: 'INITIATED', next: `/checkout/pay/${number}` } });
    expect(await act('approve')).toMatchObject({ body: { status: 'PAID' } });
    expect(await read(await paymentHandler(req('/api/checkout/payments', { number, action: 'approve' }), deps()))).toMatchObject({ status: 404 });
    expect(await f.t.prisma.order.count({ where: { visitorId: p.visitorId } })).toBe(1);
  });

  it('keeps an unfinished checkout only with the owner\'s switch on', async () => {
    const p = await page('api-draft');
    const send = async () => read(await draftHandler(req('/api/checkout/draft', { form: FORM, step: 'details' }, { cookie: p.cookie }), deps()));
    expect(await send()).toMatchObject({ status: 200, body: { kept: false } });
    f.overrides.set('checkout.capture.enabled', true);
    try {
      expect(await send()).toMatchObject({ status: 200, body: { kept: true } });
    } finally {
      f.overrides.delete('checkout.capture.enabled');
    }
    expect(await f.t.prisma.checkoutDraft.count({ where: { visitorId: p.visitorId } })).toBe(1);
    // the order the same visitor places later is the one the quote shows
    const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: p.cartId, lang: 'bn', address: { line: FORM.address } });
    expect(q.fingerprint).toBe(p.order.fingerprint);
  });
});
