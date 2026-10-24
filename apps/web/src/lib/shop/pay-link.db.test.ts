// S06 · PR 542 — the advance pay link the way the customer's phone walks it, on a real PostgreSQL (skipped without
// TEST_DATABASE_ADMIN_URL), with the practice gateway. SIM-F-016: a person asks the advance from the order; the link's
// test page pays it and the order goes back to PLACED (the order hook); a failure through the gateway's callback brings
// him back to the link's own page, "Try again" and "Pay" once more; same site only; an unknown token is 404. Every value
// is made up.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMockGateway, mockCallback } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { recordAdvance, requestAdvance } from '@extas/orders';
import { setUpOrders, type OrdersFixture } from '@extas/orders/testing';
import type { PaymentsDeps } from '@extas/payments';
import { paymentCallbackHandler } from './payment-callback';
import { payLinkHandler, type PayLinkApiDeps } from './pay-link';

const ORIGIN = 'https://shop.example.test';
const CALLBACK = `${ORIGIN}/api/payments/callback/bkash`;

describe.skipIf(!HAS_TEST_DB)('PR 542 · the advance pay link on the shop (SIM-F-016)', () => {
  let f: OrdersFixture;
  const mock = createMockGateway('bkash');
  const pay = (real = false): PaymentsDeps => ({
    db: f.t.prisma,
    settings: f.deps().settings,
    now: f.deps().now,
    gateways: async () => ({ api: mock, mode: real ? 'SANDBOX' : 'MOCK' }),
    orders: { advancePaid: async (storeId, orderId) => void (await recordAdvance(f.ordersDeps(), { storeId, orderId }, { actorType: 'SYSTEM', actorId: null, source: 'pay-link' })) },
  });
  const deps = (real = false): PayLinkApiDeps => ({ payments: async () => pay(real), callbackBase: (_r, provider, lang) => `${ORIGIN}/api/payments/callback/${provider}?lang=${lang}` });
  const req = (body: unknown, site = 'same-origin') =>
    new Request(`${ORIGIN}/api/pay/link`, { method: 'POST', headers: { 'sec-fetch-site': site, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.42' }, body: JSON.stringify(body) });
  const read = async (r: Response) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> });
  const ask = async (name: string, phone: string) => {
    const o = await f.place(name, { phone });
    const r = await requestAdvance(f.ordersDeps(), f.staff, o.orderId, { kind: 'full', channels: ['SMS'] });
    return { o, r };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    f = await setUpOrders('pay_link_shop');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await f?.t.drop();
  });

  it('the test page pays the advance; the order goes back to PLACED; same site only; an unknown token is 404', async () => {
    const { o, r } = await ask('pl-pay', '01700000601');
    expect((await payLinkHandler(req({ token: r.token, action: 'approve', lang: 'en' }, 'cross-site'), deps())).status).toBe(403);
    expect((await read(await payLinkHandler(req({ token: 'no-such-token-0000000000', action: 'approve' }), deps()))).status).toBe(404);
    const paid = await read(await payLinkHandler(req({ token: r.token, action: 'approve', lang: 'bn' }), deps()));
    expect(paid).toMatchObject({ status: 200, body: { ok: true, status: 'PAID', next: `/bn/pay/${r.token}` } });
    expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true } })).toEqual({ status: 'PLACED' });
    expect((await payLinkHandler(new Request(`${ORIGIN}/api/pay/link`), deps())).status).toBe(405);
  });

  it('on a gateway: "Pay" opens it, a failure comes back to the link page, "Try again" and "Pay" once more, paid', async () => {
    const { o, r } = await ask('pl-gateway', '01700000602');
    // a real gateway connected: the test answers are refused
    expect(await read(await payLinkHandler(req({ token: r.token, action: 'approve' }), deps(true)))).toMatchObject({ status: 409, body: { error: 'TEST_PAYMENTS_OFF' } });
    const s1 = await read(await payLinkHandler(req({ token: r.token, action: 'start', lang: 'en' }), deps()));
    expect(s1).toMatchObject({ status: 200, body: { ok: true, status: 'PENDING' } });
    const failed = await paymentCallbackHandler(new Request(new URL(`?${new URLSearchParams(mockCallback('bkash', CALLBACK, r.paymentId, 'failure'))}`, CALLBACK)), 'bkash', pay());
    expect(failed.status).toBe(303);
    expect(failed.headers.get('location')).toBe(`/pay/${r.token}`);
    expect(await read(await payLinkHandler(req({ token: r.token, action: 'retry', lang: 'en' }), deps()))).toMatchObject({ body: { status: 'INITIATED' } });
    const s2 = await read(await payLinkHandler(req({ token: r.token, action: 'start', lang: 'en' }), deps()));
    const ok = await paymentCallbackHandler(new Request(new URL(`?${new URLSearchParams(Object.fromEntries(new URL(String(s2.body.next)).searchParams.entries()))}`, CALLBACK)), 'bkash', pay());
    expect(ok.headers.get('location')).toBe(`/pay/${r.token}`);
    expect((await f.t.prisma.payment.findMany({ where: { linkToken: r.token }, orderBy: { attempt: 'asc' }, select: { status: true, attempt: true } })).map((p) => p.status)).toEqual(['FAILED', 'PAID']);
    expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.orderId }, select: { status: true } })).toEqual({ status: 'PLACED' });
  });
});
