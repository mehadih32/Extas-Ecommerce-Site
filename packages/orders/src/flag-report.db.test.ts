// S06 · PR 562 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — the flag outcome report, with SIM-F-016
// as its acceptance test: the advance-payment checkout mode (PR 560) and the one-click advance request (PR 542) both
// exist, and the report sees what every flagged customer did. Off (as shipped): the report reads nothing and the
// checkout keeps nothing new. On: a flagged bag is kept once; of the customers flagged at checkout — one paid the charge
// (and was delivered), one left the checkout, one ordered and was cancelled unpaid, one ordered under another number
// without the ask, one still waits — and of those asked after ordering, one paid and one walked away. A layer losing at
// least the owner's share is pointed out only from the fewest flags; the window moves on. Every value is a made-up test
// value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkoutQuote, FLAG_OUTCOMES, noteFlagShown, payAction, placeOrder, type CheckoutDeps, type CheckoutQuote, type PlaceInput } from '@extas/checkout';
import { applyOutcome } from '@extas/payments';
import { registry } from '@extas/settings';
import { askCheckoutAdvance, cancelOrder, checkoutFlag, FLAG_ASKED, FLAG_SHOWN, flagReport, recordAdvance, requestAdvance, systemBy } from './index';
import { setUpOrders, TEST_FORM, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 562 · SIM-F-016: the flag outcome report (PostgreSQL)', () => {
  let f: OrdersFixture;
  let layerId: string;
  const db = () => f.t.prisma;
  const cd = (): CheckoutDeps => ({
    ...f.deps(),
    advanceFlag: (i) => checkoutFlag(f.ordersDeps(), i),
    advancePaid: async (storeId, orderId) => void (await recordAdvance(f.ordersDeps(), { storeId, orderId }, systemBy('checkout'))),
  });
  let n = 0;
  /** A new number each time (the layer below flags a number with no orders yet). */
  const phone = () => `0171300${String(++n).padStart(4, '0')}`;
  const quote = (cartId: string, tel: string) => checkoutQuote(cd(), { storeId: f.S, cartId, lang: 'en', address: { line: TEST_FORM.address, confirmed: null }, details: { name: TEST_FORM.name, phone: tel }, payment: null });
  const shown = () => db().checkoutFlagEvent.count({ where: { outcome: FLAG_SHOWN } });
  const place = (bag: { visitorId: string }, tel: string, q: CheckoutQuote) =>
    placeOrder(cd(), { storeId: f.S, visitorId: bag.visitorId, ip: '192.0.2.20', input: { idempotencyKey: randomUUID(), lang: 'en', form: { ...TEST_FORM, phone: tel }, confirmed: null, payment: q.pay.chosen, fingerprint: q.fingerprint } satisfies PlaceInput });
  /** A flagged checkout as the app runs it: the quote, then the bag kept for the report. */
  const flagged = async (name: string) => {
    const tel = phone();
    const bag = await f.bag(name, [{ variantId: f.v.skyM }]);
    const q = await quote(bag.cartId, tel);
    expect(q.advance?.kind).toBe('delivery');
    return { tel, bag, q, kept: await noteFlagShown(cd(), { storeId: f.S, customerId: null, quote: q }) };
  };
  const report = () => flagReport(f.ordersDeps(), f.staff);

  beforeAll(async () => {
    f = await setUpOrders('flag_report');
    // the database stamps the order's flag event with its own clock: the report's clock runs from today
    f.clock.now = new Date();
    const layer = await db().checkoutParameterLayer.create({
      data: { storeId: f.S, name: 'Flag layer', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['newPhone'] }, requirement: 'DELIVERY_CHARGE' },
    });
    layerId = layer.id;
    f.overrides.set('checkout.advance', { enabled: true, maxLayers: 5 });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('the words match the checkout\'s; off (as shipped): nothing is kept and the report reads nothing; it needs risk.report', async () => {
    expect([FLAG_SHOWN, FLAG_ASKED]).toEqual([FLAG_OUTCOMES.shown, FLAG_OUTCOMES.asked]);
    expect(registry['risk.flagReport'].default.enabled).toBe(false);
    const a = await flagged('off');
    expect(a.kept).toBe(false);
    expect(await shown()).toBe(0);
    expect(await report()).toMatchObject({ enabled: false, cut: false, checkout: [], order: [], total: { flagged: 0 } });
    await expect(flagReport(f.ordersDeps(), f.reader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // a quote nobody flagged is never kept
    const plain = await f.bag('plain', [{ variantId: f.v.skyM }]);
    f.overrides.set('risk.flagReport', { ...registry['risk.flagReport'].default, enabled: true });
    expect(await noteFlagShown(cd(), { storeId: f.S, customerId: null, quote: await quote(plain.cartId, '0171') })).toBe(false);
    expect(await shown()).toBe(0);
  });

  it('SIM-F-016: on — of the customers flagged at checkout and after ordering: who paid, who walked away, who waits, who dodged; the money; the pointer', async () => {
    f.overrides.set('risk.flagReport', { ...registry['risk.flagReport'].default, enabled: true });
    const known = phone();
    await f.place('known', { phone: known });

    // paid: the delivery charge came in, then the parcel was delivered
    const paid = await flagged('paid');
    expect(paid.kept).toBe(true);
    // the same bag again is not a second flag
    expect(await noteFlagShown(cd(), { storeId: f.S, customerId: null, quote: await quote(paid.bag.cartId, paid.tel) })).toBe(false);
    const pp = await place(paid.bag, paid.tel, paid.q);
    expect(await askCheckoutAdvance(f.ordersDeps(), { storeId: f.S, orderId: pp.orderId })).toBe(true);
    expect((await payAction(cd(), { storeId: f.S, visitorId: paid.bag.visitorId, input: { number: pp.number, action: 'approve' } })).status).toBe('PAID');
    await db().order.update({ where: { id: pp.orderId }, data: { status: 'DELIVERED' } });
    const charge = paid.q.advance!.amountMinor;

    // left: never ordered from that bag
    expect((await flagged('left')).kept).toBe(true);

    // walked away: ordered, then cancelled unpaid
    const gone = await flagged('walked');
    const gp = await place(gone.bag, gone.tel, gone.q);
    await askCheckoutAdvance(f.ordersDeps(), { storeId: f.S, orderId: gp.orderId });
    await cancelOrder(f.ordersDeps(), f.staff, gp.orderId, { reasonCode: 'ADVANCE_NOT_PAID' });

    // dodged: flagged, then the same bag ordered under a number the layer does not flag
    const dodge = await flagged('dodged');
    const dq = await quote(dodge.bag.cartId, known);
    expect(dq.advance).toBeNull();
    await place(dodge.bag, known, dq);

    // still waiting for the advance
    const wait = await flagged('waiting');
    const wp = await place(wait.bag, wait.tel, wait.q);
    await askCheckoutAdvance(f.ordersDeps(), { storeId: f.S, orderId: wp.orderId });
    expect(await shown()).toBe(5);

    // after ordering: the team's "Request advance" — one paid, one cancelled unpaid
    const a1 = await f.place('after-paid', { phone: phone() });
    const r1 = await requestAdvance(f.ordersDeps(), f.staff, a1.orderId, { kind: 'full', channels: ['SMS'] });
    await db().$transaction((tx) => applyOutcome(tx, f.S, { paymentId: r1.paymentId, outcome: 'PAID', from: 'gateway', by: { actorType: 'CUSTOMER', actorId: null, source: 'pay-link' } }, new Date()));
    await recordAdvance(f.ordersDeps(), { storeId: f.S, orderId: a1.orderId }, systemBy('payments'));
    const a2 = await f.place('after-walked', { phone: phone() });
    await requestAdvance(f.ordersDeps(), f.staff, a2.orderId, { kind: 'full', channels: ['SMS'] });
    await cancelOrder(f.ordersDeps(), f.staff, a2.orderId, { reasonCode: 'ADVANCE_NOT_PAID' });
    // the report is read a minute after the last of them (the fixture's clock steps on with every bag and order)
    f.clock.now = new Date(Math.max(Date.now(), f.clock.now.getTime()) + 60_000);

    const r = await report();
    expect(r).toMatchObject({ enabled: true, cut: false, days: 30, warnLeftPercent: null });
    expect(r.checkout).toHaveLength(1);
    expect(r.checkout[0]).toMatchObject({ key: layerId, name: 'Flag layer', flagged: 5, paid: 1, left: 1, walked: 1, dodged: 1, waiting: 1, waived: 0, paidDelivered: 1, paidRefused: 0, collectedMinor: charge, lostShare: 2 / 5, warn: false });
    // the checkout's own wait (level "checkout") is counted with its layer, never twice
    expect(r.order.map((t) => t.key)).toEqual(['team.full']);
    expect(r.order[0]).toMatchObject({ flagged: 2, paid: 1, walked: 1, waiting: 0 });
    expect(r.total).toMatchObject({ flagged: 7, paid: 2, walked: 2, left: 1 });
    expect(r.total.collectedMinor).toBe(charge + r.order[0]!.collectedMinor);
    expect(r.order[0]!.collectedMinor).toBeGreaterThan(0);

    // the pointer: only with a share set, and only from the fewest flags
    f.overrides.set('risk.flagReport', { ...registry['risk.flagReport'].default, enabled: true, warnLeftPercent: 40, minFlags: 5 });
    expect((await report()).checkout[0]!.warn).toBe(true);
    f.overrides.set('risk.flagReport', { ...registry['risk.flagReport'].default, enabled: true, warnLeftPercent: 40, minFlags: 6 });
    expect((await report()).checkout[0]!.warn).toBe(false);

    // the window moves on: a month and a day later nothing is in it
    f.clock.now = new Date(f.clock.now.getTime() + 31 * 86_400_000);
    expect(await report()).toMatchObject({ checkout: [], order: [], total: { flagged: 0 } });
  });
});
