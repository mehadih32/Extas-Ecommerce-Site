// PR 125 — the checkout's order API on a real PostgreSQL (the checkout's own throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL), called the way the browser calls it: the bag cookie, same-site only, the page's order key
// and the fingerprint of the money it showed. The answer says where the page goes next, in the page's language.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkoutQuote } from '@extas/checkout';
import { setUpCheckout, type CheckoutFixture } from '@extas/checkout/testing';
import { checkoutFlag, recordAdvance, systemBy } from '@extas/orders';
import { BAG_COOKIE, COUNT_COOKIE, DEVICE_COOKIE } from './bag-model';
import { callMeHandler, draftHandler, paymentHandler, phoneRiskHandler, voiceHandler, placeHandler, quoteHandler, transitAnswerHandler, transitHandler, type CheckoutApiDeps } from './checkout-api';
import { ATTRIBUTION_COOKIE, encodeTouch, touchOf } from '../tracking/attribution';

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

  async function page(name: string, payment: unknown = null, size = 'M') {
    const bag = await f.bag(name, [{ variantId: f.variant('oxford-cotton-shirt', 'sky', size).id }]);
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
    // S06 · PR 156: the owner's risk score is off by default, so the order is never scored
    expect(o.riskScore).toBeNull();
  });

  it('S18 · PR 379: an order sent like a program still goes through; the quiet bot check only writes a note', async () => {
    // one more order than the other tests use: room in the sample stock for it
    await f.t.prisma.stockLevel.updateMany({ where: { variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }, data: { onHand: { increment: 1 }, available: { increment: 1 } } });
    const p = await page('api-bot');
    const r = await placeHandler(req('/api/checkout/orders', { ...p.order, human: { ms: 300, inputs: 0, auto: true } }, { cookie: p.cookie }), deps());
    expect(r.status).toBe(201);
    const ev = await f.t.prisma.securityEvent.findFirst({ where: { kind: 'bot.signal', storeId: f.S }, orderBy: { createdAt: 'desc' } });
    expect(ev?.details).toMatchObject({ form: 'checkout', score: 100, reasons: ['automation', 'tooFast', 'noInput'] });
    expect(JSON.stringify(ev?.details)).not.toContain('192.0.2.125');
  });

  it('S06 · PR 159: a new browser gets the shop\'s own device id (kept the owner\'s days); the next order keeps the same one; a shared point is kept rounded', async () => {
    // two more orders than the other tests use: room in the sample stock for them
    await f.t.prisma.stockLevel.updateMany({ where: { variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }, data: { onHand: { increment: 2 }, available: { increment: 2 } } });
    const p = await page('api-dev');
    const first = await placeHandler(req('/api/checkout/orders', { ...p.order, gps: { lat: 23.7808875, lng: 90.4073 } }, { cookie: p.cookie }), deps());
    const set = first.headers.getSetCookie().find((c) => c.startsWith(`${DEVICE_COOKIE}=`));
    expect(set).toMatch(/HttpOnly; Secure; SameSite=Lax; Max-Age=15552000$/);
    const device = decodeURIComponent(set!.split(';')[0]!.split('=')[1]!);
    const a = (await first.json()) as { number: string };
    expect(await f.t.prisma.order.findFirstOrThrow({ where: { number: a.number, storeId: f.S }, select: { deviceId: true, gpsLat: true } })).toMatchObject({ deviceId: device });
    // the same browser again: the same id
    const q = await page('api-dev-2');
    const second = (await (await placeHandler(req('/api/checkout/orders', q.order, { cookie: `${q.cookie}; ${DEVICE_COOKIE}=${device}` }), deps())).json()) as { number: string };
    expect((await f.t.prisma.order.findFirstOrThrow({ where: { number: second.number, storeId: f.S }, select: { deviceId: true } })).deviceId).toBe(device);
  });

  it('PR 257 follow-up (go-live gate customer 360°): an order after an ad visit keeps its source, campaign and platform; off keeps none', async () => {
    await f.t.prisma.stockLevel.updateMany({ where: { variantId: f.variant('oxford-cotton-shirt', 'sky', 'M').id }, data: { onHand: { increment: 2 }, available: { increment: 2 } } });
    const visit = encodeTouch(touchOf(new URLSearchParams('utm_source=facebook&utm_medium=paid_social&utm_campaign=eid-polo&fbclid=IwAR3sampleClickId_02'), 'https://l.facebook.com/', 'shop.example.test', Date.now())!);
    const p = await page('api-utm');
    const a = (await (await placeHandler(req('/api/checkout/orders', p.order, { cookie: `${p.cookie}; ${ATTRIBUTION_COOKIE}=${visit}` }), deps())).json()) as { number: string };
    expect(await f.t.prisma.order.findFirstOrThrow({ where: { number: a.number, storeId: f.S }, select: { utmSource: true, utmMedium: true, utmCampaign: true, adPlatform: true, referrer: true, source: true } })).toEqual({ utmSource: 'facebook', utmMedium: 'paid_social', utmCampaign: 'eid-polo', adPlatform: 'META', referrer: 'https://l.facebook.com', source: 'WEBSITE' });
    f.overrides.set('ads.attribution', { on: false, keepDays: 30, touch: 'last' });
    try {
      const q = await page('api-utm-off');
      const b = (await (await placeHandler(req('/api/checkout/orders', q.order, { cookie: `${q.cookie}; ${ATTRIBUTION_COOKIE}=${visit}` }), deps())).json()) as { number: string };
      expect(await f.t.prisma.order.findFirstOrThrow({ where: { number: b.number, storeId: f.S }, select: { utmSource: true, adPlatform: true } })).toEqual({ utmSource: null, adPlatform: null });
    } finally {
      f.overrides.delete('ads.attribution');
    }
  });

  it('S06 · PR 156: with the owner\'s risk score on, the order is scored once as it lands (team only)', async () => {
    f.overrides.set('risk.score', { enabled: true, afterEdit: true, showOnOrder: true });
    try {
      const on = await page('api-risk-on');
      const first = await read(await placeHandler(req('/api/checkout/orders', on.order, { cookie: on.cookie }), deps()));
      expect(first.status).toBe(201);
      // the customer's answer never carries a score or a level
      expect(JSON.stringify(first.body)).not.toMatch(/risk|score/i);
      const o = await f.t.prisma.order.findFirstOrThrow({ where: { number: first.body.number as string, storeId: f.S }, select: { id: true, riskScore: true, riskBand: true, status: true } });
      expect(o).toMatchObject({ riskScore: expect.any(Number), riskBand: expect.any(String), status: 'PLACED' });
      // a second press of the same order is a replay: not scored twice
      await placeHandler(req('/api/checkout/orders', on.order, { cookie: on.cookie }), deps());
      expect(await f.t.prisma.riskAssessment.count({ where: { orderId: o.id } })).toBe(1);
    } finally {
      f.overrides.delete('risk.score');
    }
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

  it('follow-up 50: with a real gateway connected the test page cannot mark an order paid (409 TEST_PAYMENT_OFF)', async () => {
    const p = await page('api-golive', { method: 'card', option: 'visa' }, 'L');
    const number = (await read(await placeHandler(req('/api/checkout/orders', p.order, { cookie: p.cookie }), deps()))).body.number as string;
    const live = (): CheckoutApiDeps => ({ ...deps(), checkout: { ...f.deps(), paymentMode: async () => 'LIVE' } });
    expect(await read(await paymentHandler(req('/api/checkout/payments', { number, action: 'approve' }, { cookie: p.cookie }), live()))).toMatchObject({ status: 409, body: { error: 'TEST_PAYMENT_OFF' } });
    expect(await read(await paymentHandler(req('/api/checkout/payments', { number, action: 'fail' }, { cookie: p.cookie }), live()))).toMatchObject({ status: 409, body: { error: 'TEST_PAYMENT_OFF' } });
    expect((await f.t.prisma.payment.findFirstOrThrow({ where: { order: { number } } })).status).toBe('INITIATED');
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

  it('S04 · PR 560 (SIM-F-016): a flagged checkout pays the delivery charge ahead on the same page; the order waits for it and comes back', async () => {
    // the app's wiring: the Parameter for Checkout's look and the order service for a paid advance
    const od = () => ({ db: f.t.prisma, settings: f.deps().settings });
    const wired = (): CheckoutApiDeps => ({
      ...deps(),
      checkout: { ...f.deps(), advanceFlag: (i) => checkoutFlag(od(), i), advancePaid: async (storeId, orderId) => void (await recordAdvance(od(), { storeId, orderId }, systemBy('checkout'))) },
    });
    await f.t.prisma.checkoutParameterLayer.create({ data: { storeId: f.S, name: 'Sample layer', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['newPhone'] }, requirement: 'DELIVERY_CHARGE' } });
    f.overrides.set('checkout.advance', { enabled: true, maxLayers: 5 });
    try {
      const bag = await f.bag('api-advance', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'S').id }]);
      const cookie = `${BAG_COOKIE}=${bag.visitorId}`;
      const form = { ...FORM, phone: '01700000560' };
      const quote = async (details: unknown) => read(await quoteHandler(req('/api/checkout/quote', { lang: 'en', address: { line: FORM.address }, details }, { cookie }), wired()));
      // before the details are finished: Cash on Delivery as always
      expect((await quote(null)).body.view).toMatchObject({ pay: { cod: true, codOff: null }, advance: null });
      const q = await quote({ name: form.name, phone: form.phone });
      const view = q.body.view as { pay: { cod: boolean; codOff: string; chosen: unknown }; advance: { kind: string; amountMinor: number }; fingerprint: string };
      expect(view).toMatchObject({ pay: { cod: false, codOff: 'ADVANCE' }, advance: { kind: 'delivery', amountMinor: 8_000 } });
      expect(JSON.stringify(q.body)).not.toMatch(/Sample layer|score|risk/i);
      const placed = await read(await placeHandler(req('/api/checkout/orders', { idempotencyKey: randomUUID(), lang: 'en', form, payment: view.pay.chosen, fingerprint: view.fingerprint }, { cookie }), wired()));
      expect(placed.status).toBe(201);
      const number = placed.body.number as string;
      expect(placed.body.next).toBe(`/checkout/pay/${number}`);
      expect(JSON.stringify(placed.body)).not.toMatch(/Sample layer|score|risk/i);
      const o = await f.t.prisma.order.findFirstOrThrow({ where: { number, storeId: f.S } });
      expect(o).toMatchObject({ status: 'AWAITING_ADVANCE', paymentMethod: 'COD', advanceRequirement: 'DELIVERY_CHARGE', advanceRequiredMinor: 8_000 });
      expect(await read(await paymentHandler(req('/api/checkout/payments', { number, action: 'approve', lang: 'en' }, { cookie }), wired()))).toMatchObject({ status: 200, body: { status: 'PAID' } });
      expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: 'PLACED', paidMinor: 8_000, paymentMethod: 'COD' });
    } finally {
      f.overrides.delete('checkout.advance');
    }
  });

  it('CN-020 (3) · SIM-F-046: "Call me" puts one call-back in the Support inbox, only with the switch on', async () => {
    const p = await page('api-callme');
    const tap = async (b: Record<string, unknown> = {}, o: { cookie?: string; site?: string } = { cookie: p.cookie }) =>
      read(await callMeHandler(req('/api/checkout/call-me', { phone: '০১৭০০-০০০১২৫', name: FORM.name, reason: 'tries', field: 'address', lang: 'bn', ...b }, o), deps()));
    expect(await tap()).toMatchObject({ status: 200, body: { ok: false, error: 'CALLBACK_OFF' } });
    f.overrides.set('checkout.callMe', { enabled: true, failedTries: 3, idleSeconds: 90, perPhonePerDay: 1 });
    try {
      expect(await tap({}, { cookie: p.cookie, site: 'cross-site' })).toMatchObject({ status: 403 });
      expect(await tap({}, {})).toMatchObject({ status: 400, body: { error: 'NO_BAG' } });
      expect(await tap({ phone: '12345' })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
      expect(await tap()).toMatchObject({ status: 200, body: { ok: true, duplicate: false } });
      expect(await tap()).toMatchObject({ status: 200, body: { ok: true, duplicate: true } });
      const conv = await f.t.prisma.conversation.findFirstOrThrow({ where: { storeId: f.S, channel: { kind: 'callback' } }, include: { contact: true } });
      expect(conv.tags).toContain('callback');
      expect(conv.contact.phone).toBe('+8801700000125');
      // another visitor with the same number past the day's limit: a calm answer, nothing new
      const other = await page('api-callme-2');
      expect(await tap({ reason: 'idle', field: undefined }, { cookie: other.cookie })).toMatchObject({ status: 200, body: { ok: false, error: 'TOO_MANY' } });
      expect(await f.t.prisma.message.count({ where: { conversationId: conv.id } })).toBe(1);
    } finally {
      f.overrides.delete('checkout.callMe');
    }
  });

  it('CN-020 (4) · SIM-F-047: the address mic saves one recording for this bag, its words back; off as shipped', async () => {
    const p = await page('api-voice');
    const kept: number[] = [];
    const wired = (): CheckoutApiDeps => ({ ...deps(), voice: () => ({ keep: async (_s, body) => (kept.push(body.byteLength), randomUUID()), transcribe: async () => ({ text: null, confidence: null }) }) });
    const send = async (fields: Record<string, string | Blob>, o: { cookie?: string; site?: string } = { cookie: p.cookie }) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.set(k, v);
      const r = new Request(`${ORIGIN}/api/checkout/voice`, { method: 'POST', headers: { 'sec-fetch-site': o.site ?? 'same-origin', ...(o.cookie ? { cookie: o.cookie } : {}) }, body: form });
      return read(await voiceHandler(r, wired()));
    };
    const audio = new Blob([new Uint8Array([26, 69, 223, 163, 9, 9])], { type: 'audio/webm' });
    expect(await send({ transcript: 'House 4' })).toMatchObject({ status: 200, body: { ok: false, error: 'NOT_OPEN' } });
    f.overrides.set('checkout.voice', { enabled: true, speechLang: 'bn-BD', minConfidence: 0.6, keepRecording: true, maxSeconds: 30, maxKb: 64, maxPerHour: 10 });
    try {
      expect(await send({ transcript: 'House 4' }, { cookie: p.cookie, site: 'cross-site' })).toMatchObject({ status: 403 });
      expect(await send({ transcript: 'House 4' }, {})).toMatchObject({ status: 400, body: { error: 'NO_BAG' } });
      expect(await send({ durationMs: '1200' })).toMatchObject({ status: 400, body: { error: 'INVALID_INPUT' } });
      const phone = await send({ transcript: 'House 4, Road 5', confidence: '0.83', durationMs: '3100', audio });
      expect(phone).toMatchObject({ status: 200, body: { ok: true, transcript: 'House 4, Road 5', confidence: 0.83, engine: 'BROWSER', low: false, kept: true } });
      expect(kept).toEqual([6]);
      // no words from the phone: the server's speech connection (here hearing nothing) — unsure, the team listens
      expect(await send({ audio })).toMatchObject({ status: 200, body: { ok: true, transcript: null, engine: 'SERVER', low: true } });
      const row = await f.t.prisma.checkoutVoice.findUniqueOrThrow({ where: { id: phone.body.id as string } });
      expect(row).toMatchObject({ visitorId: p.visitorId, storeId: f.S, durationMs: 3100 });
    } finally {
      f.overrides.delete('checkout.voice');
    }
  });

  it('S06 · PR 556: the phone check names the bag line already on its way from this browser (off: nothing); the answer is kept once', async () => {
    await f.t.prisma.stockLevel.updateMany({ where: { variantId: f.variant('oxford-cotton-shirt', 'sky', 'L').id }, data: { onHand: { increment: 2 }, available: { increment: 2 } } });
    const p = await page('api-transit', null, 'L');
    const placed = (await (await placeHandler(req('/api/checkout/orders', p.order, { cookie: p.cookie }), deps())).json()) as { number: string };
    await f.t.prisma.order.updateMany({ where: { storeId: f.S, number: placed.number }, data: { status: 'IN_TRANSIT' } });
    // the same browser starts a new bag with the same piece
    const again = await f.bag('api-transit-2', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'L').id }]);
    await f.t.prisma.cart.update({ where: { id: again.cartId }, data: { visitorId: p.visitorId } });
    await f.t.prisma.cart.updateMany({ where: { storeId: f.S, visitorId: p.visitorId, id: { not: again.cartId } }, data: { status: 'CONVERTED' } });
    const ask = async (b: unknown, site?: string) => read(await transitHandler(req('/api/checkout/transit', b, { cookie: p.cookie, site }), deps()));
    expect(await ask({ phone: FORM.phone })).toMatchObject({ status: 200, body: { ok: true, enabled: false, notices: [] } });
    f.overrides.set('checkout.transitDuplicate', { enabled: true, include: 'shipped', windowDays: 30, byPhoneAlone: false, reportDays: 30 });
    try {
      expect((await ask({ phone: FORM.phone }, 'cross-site')).status).toBe(403);
      expect((await ask({ phone: FORM.phone, extra: 1 })).status).toBe(400);
      const r = await ask({ phone: FORM.phone, campaign: { source: 'facebook', campaign: 'api-test' } });
      const notices = r.body.notices as { eventId: string; number: string; href: string }[];
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ number: placed.number, href: `/account/orders/${placed.number}` });
      const answer = async (b: unknown) => read(await transitAnswerHandler(req('/api/checkout/transit/answer', b, { cookie: p.cookie }), deps()));
      expect(await answer({ eventId: notices[0]!.eventId, action: 'removed' })).toMatchObject({ status: 200, body: { ok: true, action: 'removed' } });
      expect(await answer({ eventId: notices[0]!.eventId, action: 'kept' })).toMatchObject({ status: 200, body: { action: 'removed' } });
      expect((await answer({ eventId: randomUUID(), action: 'kept' })).status).toBe(404);
      expect(await f.t.prisma.duplicateNoticeEvent.count({ where: { storeId: f.S, campaignRef: 'api-test' } })).toBe(2);
    } finally {
      f.overrides.delete('checkout.transitDuplicate');
    }
  });

  it('S06 · PR 559: the phone-entry check always answers just {ok: true} — off or on — and never anything about the number', async () => {
    const ask = async (b: unknown, site?: string) => read(await phoneRiskHandler(req('/api/checkout/phone-risk', b, { site }), deps()));
    const counted = () => f.t.prisma.securityEvent.count({ where: { storeId: f.S, kind: 'checkout.phoneRisk.lookup' } });
    expect(await ask({ phone: FORM.phone })).toEqual({ status: 200, body: { ok: true } });
    expect(await counted()).toBe(0);
    f.overrides.set('checkout.phoneRisk', { enabled: true, budgetMs: 1500, cacheHours: 24 });
    try {
      expect((await ask({ phone: FORM.phone }, 'cross-site')).status).toBe(403);
      expect((await ask({ phone: FORM.phone, extra: 1 })).status).toBe(400);
      // no courier check is wired in these deps (PR 567: `fraudSources`): the answer is the same, nothing is asked or kept
      expect(await ask({ phone: FORM.phone })).toEqual({ status: 200, body: { ok: true } });
      expect(await ask({ phone: '017' })).toEqual({ status: 200, body: { ok: true } });
      expect(await f.t.prisma.courierFraudCheck.count({ where: { storeId: f.S } })).toBe(0);
    } finally {
      f.overrides.delete('checkout.phoneRisk');
    }
  });

  it('S06 · PR 567: the connected fraud checks are looked up only while the check is on; each answer is kept, his reply never changes', async () => {
    const looked: number[] = [];
    const phone = '01700000126'; // hardcode-ok: a made-up test number
    const wired = (): CheckoutApiDeps => ({
      ...deps(),
      fraudSources: async (storeId) => {
        looked.push(storeId);
        return [
          { provider: 'steadfast', check: async () => ({ delivered: 10, cancelled: 1 }) },
          { provider: 'aggregator', check: async () => ({ delivered: 2, cancelled: 8 }) },
        ];
      },
    });
    const ask = async () => read(await phoneRiskHandler(req('/api/checkout/phone-risk', { phone }), wired()));
    expect(await ask()).toEqual({ status: 200, body: { ok: true } });
    expect(looked).toEqual([]);
    f.overrides.set('checkout.phoneRisk', { enabled: true, budgetMs: 1500, cacheHours: 24 });
    try {
      expect(await ask()).toEqual({ status: 200, body: { ok: true } });
      expect(looked).toEqual([f.S]);
      const kept = await f.t.prisma.courierFraudCheck.findMany({ where: { storeId: f.S, phone: '+8801700000126' }, orderBy: { provider: 'asc' } });
      expect(kept.map((k) => [k.provider, k.deliveredCount, k.cancelledCount])).toEqual([
        ['aggregator', 2, 8],
        ['steadfast', 10, 1],
      ]);
    } finally {
      f.overrides.delete('checkout.phoneRisk');
    }
  });

  it('S06 · PR 562: a flagged bag is kept once for the flag outcome report — only while the report is on; never his number', async () => {
    const od = () => ({ db: f.t.prisma, settings: f.deps().settings });
    const wired = (): CheckoutApiDeps => ({ ...deps(), checkout: { ...f.deps(), advanceFlag: (i) => checkoutFlag(od(), i) } });
    if (!(await f.t.prisma.checkoutParameterLayer.count({ where: { storeId: f.S, enabled: true } })))
      await f.t.prisma.checkoutParameterLayer.create({ data: { storeId: f.S, name: 'Sample layer', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['newPhone'] }, requirement: 'DELIVERY_CHARGE' } });
    f.overrides.set('checkout.advance', { enabled: true, maxLayers: 5 });
    const shown = () => f.t.prisma.checkoutFlagEvent.count({ where: { storeId: f.S, outcome: 'SHOWN' } });
    try {
      const bag = await f.bag('api-flag-shown', [{ variantId: f.variant('oxford-cotton-shirt', 'sky', 'S').id }]);
      const cookie = `${BAG_COOKIE}=${bag.visitorId}`;
      const details = { name: FORM.name, phone: '01700000562' };
      const quote = async () => read(await quoteHandler(req('/api/checkout/quote', { lang: 'en', address: { line: FORM.address }, details }, { cookie }), wired()));
      // off (as shipped): flagged, and nothing kept
      expect((await quote()).body.view).toMatchObject({ pay: { codOff: 'ADVANCE' } });
      expect(await shown()).toBe(0);
      f.overrides.set('risk.flagReport', { enabled: true, days: 30, warnLeftPercent: null, minFlags: 10, maxRows: 5000 });
      const a = await quote();
      const b = await quote();
      // the page sees the same checkout either way
      expect(b.body.view).toEqual(a.body.view);
      expect(await shown()).toBe(1);
      const row = await f.t.prisma.checkoutFlagEvent.findFirstOrThrow({ where: { storeId: f.S, outcome: 'SHOWN' } });
      expect(row).toMatchObject({ requirement: 'DELIVERY_CHARGE', orderId: null });
      expect(row.explanation).toMatchObject({ cartId: bag.cartId, kind: 'delivery' });
      expect(JSON.stringify(row.explanation)).not.toContain('1700000562');
    } finally {
      f.overrides.delete('checkout.advance');
      f.overrides.delete('risk.flagReport');
    }
  });
});
