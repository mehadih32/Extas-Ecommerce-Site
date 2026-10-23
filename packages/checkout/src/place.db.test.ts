// S04 · PR 125 — placing the order on a real PostgreSQL (a throwaway database with the real migrations, the sample
// catalogue and store, the default pack's delivery bands and the SAMPLE gazetteer; skipped without
// TEST_DATABASE_ADMIN_URL). Required acceptance tests (CN-017): SIM-F-003 "the charge shown is the charge stored" for a
// recognised address, an unrecognised one with the area he chose, a free-delivery order and an unresolved one; SIM-F-026
// the unfinished checkout kept and a failed payment kept, retried, still one order. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { findBag } from '@extas/cart';
import { captureDraft, payAction, payView, placeOrder, type PlaceInput } from './place';
import { checkoutQuote, type CheckoutRequest } from './quote';
import { orderReceipt } from './receipt';
import { setUpCheckout, type CheckoutFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const FORM = { name: 'Test Customer', phone: '01700000125', address: 'House 4, Road 5, Dhanmondi, Dhaka 1209' };

describe.skipIf(!HAS_TEST_DB)('placing the order on PostgreSQL (S04, PR 125)', () => {
  let f: CheckoutFixture;
  let city: string;
  let outside: string;
  const shirt = () => f.variant('oxford-cotton-shirt', 'sky', 'M');
  const set = (values: Record<string, unknown>) => Object.entries(values).forEach(([k, v]) => f.overrides.set(k, v));

  beforeAll(async () => {
    f = await setUpCheckout('place');
    city = await f.priceBand('dhaka-city', 8_000);
    outside = await f.priceBand('outside-dhaka', 13_000);
    set({ 'payment.cod.enabled': true });
    await f.t.prisma.stockLevel.updateMany({ where: { variantId: shirt().id }, data: { onHand: 100, available: 100 } });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  /** A visitor's bag, the quote his page shows, and the order he places from it. */
  async function shown(name: string, opts: { quantity?: number; line?: string; confirmed?: { bandId: string; areaId?: string | null } | null; payment?: PlaceInput['payment']; useWallet?: boolean; customerId?: string } = {}) {
    const bag = await f.bag(name, [{ variantId: shirt().id, quantity: opts.quantity }]);
    const line = opts.line ?? FORM.address;
    const req: CheckoutRequest = { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: opts.customerId ?? null, address: { line, confirmed: opts.confirmed ?? null }, payment: opts.payment ?? null, useWallet: opts.useWallet };
    const q = await checkoutQuote(f.deps(), req);
    const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form: { ...FORM, address: line }, confirmed: opts.confirmed ?? null, payment: opts.payment ?? null, useWallet: opts.useWallet, fingerprint: q.fingerprint };
    return { ...bag, q, input, place: (more: Partial<PlaceInput> = {}) => placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: opts.customerId ?? null, ip: '192.0.2.125', input: { ...input, ...more } }) };
  }
  const orderOf = (id: string) => f.t.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true, events: true, payments: true } });

  describe('SIM-F-003 · the delivery charge shown is the charge stored', () => {
    it('a recognised address: the band, place, charge and total the page showed', async () => {
      const s = await shown('known');
      expect(s.q.charge).toEqual({ state: 'charge', chargeMinor: 8_000 });
      const r = await s.place();
      expect(r).toMatchObject({ next: 'thanks', replay: false });
      const o = await orderOf(r.orderId);
      expect(o).toMatchObject({
        deliveryChargeMinor: s.q.totals.deliveryMinor,
        totalMinor: s.q.totals.totalMinor,
        subtotalMinor: s.q.bag.summary.subtotalMinor,
        codAmountMinor: s.q.totals.dueMinor,
        deliveryBandId: city,
        chargeFixed: true,
        addressUnclear: false,
        paymentMethod: 'COD',
        status: 'PLACED',
        source: 'WEBSITE',
        phone: '+8801700000125',
        customerName: FORM.name,
        shippingAddressText: FORM.address,
        visitorId: s.visitorId,
        ip: '192.0.2.125',
      });
      expect(o.areaId).toBe(s.q.delivery.state === 'found' ? s.q.delivery.place?.id : 'none');
      expect(o.items.reduce((a, i) => a + i.lineTotalMinor, 0)).toBe(s.q.bag.summary.subtotalMinor);
      expect(o.items[0]).toMatchObject({ sku: expect.any(String), productName: s.q.bag.items[0]!.nameEn, quantity: 1 });
      expect(o.events.map((e) => e.type)).toEqual(['order.placed']);
      expect(o.flags).toEqual([]);
    });

    it('an address nothing settles, with the area he chose: his choice is the contract, never a second reading of the text', async () => {
      const asked = await checkoutQuote(f.deps(), { storeId: f.S, cartId: (await f.bag('gab-q', [{ variantId: shirt().id }])).cartId, lang: 'en', address: { line: 'House 9, Road 2, Gabtoli' } });
      expect(asked.delivery.state).toBe('ask');
      const s = await shown('chosen', { line: 'House 9, Road 2, Gabtoli', confirmed: { bandId: outside } });
      expect(s.q.charge).toEqual({ state: 'charge', chargeMinor: 13_000 });
      const o = await orderOf((await s.place()).orderId);
      expect(o).toMatchObject({ deliveryChargeMinor: 13_000, deliveryBandId: outside, totalMinor: s.q.totals.totalMinor, chargeFixed: true, addressUnclear: false });
      expect(o.addressResolution).toMatchObject({ status: 'resolved', via: 'choice', charged: 'outside-dhaka' });
    });

    it('a free-delivery order stays free on the order (no figure creeps back)', async () => {
      await f.switchRule('delivery');
      try {
        const s = await shown('free', { quantity: 20 });
        expect(s.q.charge.state).toBe('free');
        const o = await orderOf((await s.place()).orderId);
        expect(o).toMatchObject({ deliveryChargeMinor: 0, totalMinor: s.q.totals.totalMinor, chargeFixed: true, deliveryBandId: city });
      } finally {
        await f.switchRule('delivery', false);
      }
    });

    it('an unresolved address still becomes an order: flagged unclear, the charge not fixed, a call task for the team', async () => {
      const s = await shown('unclear', { line: 'House 9, Road 2, Gabtoli' });
      expect(s.q.totals).toMatchObject({ deliveryMinor: null, known: false });
      const o = await orderOf((await s.place()).orderId);
      expect(o).toMatchObject({ addressUnclear: true, chargeFixed: false, deliveryChargeMinor: 0, deliveryBandId: null, areaId: null, totalMinor: s.q.totals.totalMinor, flags: ['ADDRESS_UNCLEAR'] });
      expect(await f.t.prisma.callTask.count({ where: { orderId: o.id, reason: 'ADDRESS_UNCLEAR', status: 'OPEN' } })).toBe(1);
    });

    it('money that moved after the page showed it is refused with the checkout as it is now; nothing is stored', async () => {
      const s = await shown('moved');
      await f.priceBand('dhaka-city', 9_000);
      try {
        const e = await s.place().catch((x: unknown) => x as { code: string; data: { view: { charge: unknown; fingerprint: string } } });
        expect(e).toMatchObject({ code: 'PRICE_CHANGED', data: { view: { charge: { state: 'charge', chargeMinor: 9_000 } } } });
        expect(await f.t.prisma.order.count({ where: { visitorId: s.visitorId } })).toBe(0);
        // pressing again on the page now showing ৳90 places it at ৳90
        const o = await orderOf((await s.place({ fingerprint: (e as { data: { view: { fingerprint: string } } }).data.view.fingerprint })).orderId);
        expect(o.deliveryChargeMinor).toBe(9_000);
      } finally {
        await f.priceBand('dhaka-city', 8_000);
      }
    });
  });

  describe('one press, one order', () => {
    it('the same key twice — one after the other, or at the same moment — is one order', async () => {
      const s = await shown('twice');
      const [a, b] = await Promise.all([s.place(), s.place()]);
      expect(a.orderId).toBe(b.orderId);
      expect([a.replay, b.replay].sort()).toEqual([false, true]);
      const c = await s.place();
      expect(c).toMatchObject({ orderId: a.orderId, number: a.number, replay: true });
      expect(await f.t.prisma.order.count({ where: { visitorId: s.visitorId } })).toBe(1);
      expect(await f.t.prisma.idempotencyKey.count({ where: { key: s.input.idempotencyKey, completedAt: { not: null } } })).toBe(1);
      // someone else's browser with the same key gets nothing
      expect(await code(placeOrder(f.deps(), { storeId: f.S, visitorId: 'test-visitor-other-0000000000', input: s.input }))).toBe('IDEMPOTENCY');
    });

    it('the bag becomes the order: its pieces held for the order, the bag closed, a new bag next time', async () => {
      const s = await shown('stock');
      const r = await s.place();
      expect(await f.t.prisma.stockReservation.count({ where: { orderId: r.orderId, status: 'CONVERTED' } })).toBeGreaterThan(0);
      expect(await f.t.prisma.cart.findUniqueOrThrow({ where: { id: s.cartId } })).toMatchObject({ status: 'CONVERTED', convertedOrderId: r.orderId });
      expect(await findBag(f.deps(), { storeId: f.S, visitorId: s.visitorId })).toBeNull();
      expect(await code(s.place({ idempotencyKey: randomUUID() }))).toBe('EMPTY');
    });

    it('order numbers follow the owner\'s prefix and first number, one more each time', async () => {
      set({ 'checkout.order.numberPrefix': 'TS-', 'checkout.order.numberStart': 5_000 });
      try {
        const a = await (await shown('num-a')).place();
        const b = await (await shown('num-b')).place();
        expect(a.number).toBe('TS-5000');
        expect(b.number).toBe('TS-5001');
      } finally {
        f.overrides.delete('checkout.order.numberPrefix');
        f.overrides.delete('checkout.order.numberStart');
      }
    });

    it('an unfinished form, a long note or no open payment is refused before anything is stored', async () => {
      const s = await shown('form');
      const e = await s.place({ form: { ...FORM, phone: '0123' } }).catch((x: unknown) => x as { code: string; data: unknown });
      expect(e).toMatchObject({ code: 'FORM', data: { field: 'phone', problem: 'phone' } });
      expect(await code(s.place({ note: 'x'.repeat(201) }))).toBe('INVALID_INPUT');
      set({ 'payment.cod.enabled': false, 'checkout.pay.mobile.enabled': false, 'checkout.pay.card.enabled': false, 'checkout.pay.online.enabled': false });
      try {
        const none = await shown('no-pay');
        expect(await code(none.place())).toBe('NO_PAYMENT');
      } finally {
        set({ 'payment.cod.enabled': true });
        ['checkout.pay.mobile.enabled', 'checkout.pay.card.enabled', 'checkout.pay.online.enabled'].forEach((k) => f.overrides.delete(k));
      }
      expect(await f.t.prisma.order.count({ where: { visitorId: { in: [s.visitorId] } } })).toBe(0);
    });

    it('the note, the marketing ticks and the wallet go on the order in the same transaction', async () => {
      const customer = await f.t.prisma.customer.create({ data: { storeId: f.S, phone: '+8801700000126', name: 'Test Wallet' } });
      const w = await f.t.prisma.walletAccount.create({ data: { storeId: f.S, customerId: customer.id, balanceMinor: 1_000, status: 'ACTIVE' } });
      const s = await shown('extras', { useWallet: true, customerId: customer.id });
      expect(s.q.totals.walletMinor).toBe(1_000);
      const r = await s.place({ note: '  Leave it with the guard  ', consent: { sms: true, whatsapp: false } });
      const o = await orderOf(r.orderId);
      expect(o).toMatchObject({ note: 'Leave it with the guard', smsMarketingConsent: true, whatsappMarketingConsent: false, walletAppliedMinor: 1_000, codAmountMinor: s.q.totals.dueMinor, customerId: customer.id });
      // follow-up 58: the thank-you page says the note back
      expect((await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number }))?.note).toBe('Leave it with the guard');
      expect(await f.t.prisma.walletAccount.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ balanceMinor: 0 });
      expect(await f.t.prisma.walletEntry.findMany({ where: { walletId: w.id } })).toMatchObject([{ direction: 'DEBIT', amountMinor: 1_000, balanceAfterMinor: 0, orderId: o.id }]);
      expect((await f.t.prisma.consentRecord.findMany({ where: { orderId: o.id }, orderBy: { channel: 'asc' } })).map((c) => [c.channel, c.granted])).toEqual([
        ['SMS', true],
        ['WHATSAPP', false],
      ]);
    });
  });

  describe('SIM-F-026 · failed payments and unfinished checkouts are kept', () => {
    it('a prepaid order waits for its payment; a failure is kept and flagged, "try again" pays it — still one order', async () => {
      const s = await shown('prepaid', { payment: { method: 'mobile', option: 'nagad' } });
      const r = await s.place();
      expect(r.next).toBe('pay');
      let o = await orderOf(r.orderId);
      expect(o).toMatchObject({ paymentMethod: 'NAGAD', codAmountMinor: 0, paidMinor: 0, flags: ['PAYMENT_PENDING'] });
      expect(o.payments).toMatchObject([{ status: 'INITIATED', amountMinor: s.q.totals.dueMinor, method: 'NAGAD', provider: 'nagad' }]);
      const who = { storeId: f.S, visitorId: s.visitorId };
      expect(await payView(f.deps(), { ...who, number: r.number })).toMatchObject({ amountMinor: s.q.totals.dueMinor, status: 'INITIATED' });
      // a second press after a lost answer goes back to the payment
      expect(await s.place()).toMatchObject({ orderId: r.orderId, next: 'pay', replay: true });

      expect(await payAction(f.deps(), { ...who, input: { number: r.number, action: 'fail' } })).toMatchObject({ status: 'FAILED' });
      o = await orderOf(r.orderId);
      expect(o.flags).toEqual(['PAYMENT_FAILED']);
      expect(o.payments.map((p) => p.status)).toEqual(['FAILED']);
      expect(await f.t.prisma.callTask.count({ where: { orderId: o.id, reason: 'PAYMENT_FAILED' } })).toBe(1);
      await payAction(f.deps(), { ...who, input: { number: r.number, action: 'fail' } }); // a second failure report: no second task
      expect(await f.t.prisma.callTask.count({ where: { orderId: o.id, reason: 'PAYMENT_FAILED' } })).toBe(1);

      expect(await payAction(f.deps(), { ...who, input: { number: r.number, action: 'retry' } })).toMatchObject({ status: 'INITIATED', next: 'pay' });
      expect(await payAction(f.deps(), { ...who, input: { number: r.number, action: 'approve' } })).toMatchObject({ status: 'PAID', next: 'thanks' });
      o = await orderOf(r.orderId);
      expect(o).toMatchObject({ paidMinor: s.q.totals.dueMinor, flags: [] });
      expect(o.payments.map((p) => p.status).sort()).toEqual(['FAILED', 'PAID']);
      expect(o.events.map((e) => e.type).sort()).toEqual(['order.placed', 'payment.failed', 'payment.paid', 'payment.retry']);
      expect(await f.t.prisma.order.count({ where: { visitorId: s.visitorId } })).toBe(1);
      // only the order's own browser can see or pay it
      expect(await code(payAction(f.deps(), { storeId: f.S, visitorId: 'test-visitor-other-0000000000', input: { number: r.number, action: 'approve' } }))).toBe('NOT_FOUND');
      expect(await payView(f.deps(), { storeId: f.S, visitorId: 'test-visitor-other-0000000000', number: r.number })).toBeNull();
    });

    it('what he typed and left is kept only with the owner\'s switch on, one draft per visitor, marked when he orders', async () => {
      const s = await shown('draft');
      const typed = { form: { ...FORM }, payment: { method: 'cod' as const }, step: 'payment' as const };
      expect(await captureDraft(f.deps(), { storeId: f.S, visitorId: s.visitorId, input: typed })).toEqual({ kept: false });
      expect(await f.t.prisma.checkoutDraft.count({ where: { visitorId: s.visitorId } })).toBe(0);
      set({ 'checkout.capture.enabled': true });
      try {
        expect(await captureDraft(f.deps(), { storeId: f.S, visitorId: s.visitorId, input: { ...typed, form: { ...FORM, phone: '01' } } })).toEqual({ kept: false });
        expect(await captureDraft(f.deps(), { storeId: f.S, visitorId: s.visitorId, input: typed })).toEqual({ kept: true });
        expect(await captureDraft(f.deps(), { storeId: f.S, visitorId: s.visitorId, input: { ...typed, form: { ...FORM, name: 'Test Customer Two' } } })).toEqual({ kept: true });
        const drafts = await f.t.prisma.checkoutDraft.findMany({ where: { visitorId: s.visitorId } });
        expect(drafts).toMatchObject([{ phone: '+8801700000125', name: 'Test Customer Two', addressText: FORM.address, cartId: s.cartId, lastStep: 'payment', convertedOrderId: null }]);
        const r = await s.place();
        expect(await f.t.prisma.checkoutDraft.findUniqueOrThrow({ where: { id: drafts[0]!.id } })).toMatchObject({ convertedOrderId: r.orderId });
      } finally {
        f.overrides.delete('checkout.capture.enabled');
      }
    });
  });

  describe('PR 126 · the thank-you page\'s receipt', () => {
    it('Cash on Delivery: the number, the band\'s promise, the lines and what is due at the door — for his browser only', async () => {
      const s = await shown('ty-cod');
      const r = await s.place();
      const rc = await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number });
      expect(rc).toMatchObject({
        number: r.number,
        firstName: 'Test',
        phone: '01700-000125',
        band: { nameEn: expect.any(String), hoursMin: 24, hoursMax: 48 },
        addressUnclear: false,
        deliveryMinor: 8_000,
        totalMinor: s.q.totals.totalMinor,
        pay: { kind: 'cod', dueMinor: s.q.totals.dueMinor },
      });
      expect(rc!.lines).toMatchObject([{ nameEn: s.q.bag.items[0]!.nameEn, quantity: 1, amountMinor: s.q.bag.items[0]!.lineMinor, colour: { key: 'sky' }, size: 'M' }]);
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: 'test-visitor-other-0000000000', number: r.number })).toBeNull();
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: 'NO-SUCH' })).toBeNull();
    });

    it('a prepaid order: due with "Pay now", failed with "Try again", then paid (marked as the test payment)', async () => {
      const s = await shown('ty-pay', { payment: { method: 'card', option: 'visa' } });
      const r = await s.place();
      const who = { storeId: f.S, visitorId: s.visitorId };
      const pay = async () => (await orderReceipt(f.deps(), { ...who, number: r.number }))!.pay;
      expect(await pay()).toEqual({ kind: 'due', dueMinor: s.q.totals.dueMinor, method: 'CARD', provider: 'visa' });
      await payAction(f.deps(), { ...who, input: { number: r.number, action: 'fail' } });
      expect(await pay()).toMatchObject({ kind: 'failed', dueMinor: s.q.totals.dueMinor });
      await payAction(f.deps(), { ...who, input: { number: r.number, action: 'retry' } });
      expect(await pay()).toMatchObject({ kind: 'due' });
      await payAction(f.deps(), { ...who, input: { number: r.number, action: 'approve' } });
      expect(await pay()).toEqual({ kind: 'paid', paidMinor: s.q.totals.dueMinor, method: 'CARD', provider: 'visa', mock: true });
    });

    it('an address being checked has no promise yet and its charge is not fixed', async () => {
      const s = await shown('ty-unclear', { line: 'House 9, Road 2, Gabtoli' });
      const r = await s.place();
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number })).toMatchObject({ band: null, addressUnclear: true, chargeFixed: false, deliveryMinor: 0 });
    });
  });
});
