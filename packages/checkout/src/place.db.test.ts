// S04 · PR 125 — placing the order on a real PostgreSQL (a throwaway database with the real migrations, the sample
// catalogue and store, the default pack's delivery bands and the SAMPLE gazetteer; skipped without
// TEST_DATABASE_ADMIN_URL). Required acceptance tests (CN-017): SIM-F-003 "the charge shown is the charge stored" for a
// recognised address, an unrecognised one with the area he chose, a free-delivery order and an unresolved one; SIM-F-026
// the unfinished checkout kept and a failed payment kept, retried, still one order. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultSecurityPolicy, loginCustomer } from '@extas/auth';
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

    it('PR 565: free delivery is exempt from the band machinery — no band question, flag or call; a line with no place gets directions', async () => {
      await f.switchRule('delivery');
      try {
        const s = await shown('free-ask', { quantity: 20, line: 'House 9, Road 2, Gabtoli' });
        expect(s.q.charge.state).toBe('free');
        expect(s.q.delivery.state).toBe('ask');
        const o = await orderOf((await s.place()).orderId);
        expect(o).toMatchObject({ status: 'PLACED', addressUnclear: false, chargeFixed: true, deliveryChargeMinor: 0, totalMinor: s.q.totals.totalMinor, flags: [] });
        expect(o.addressResolution).toMatchObject({ status: 'ask', bandExempt: true, charge: { state: 'free' } });
        expect(await f.t.prisma.callTask.count({ where: { orderId: o.id } })).toBe(0);
        const r = await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: o.number });
        expect(r).toMatchObject({ freeDelivery: true, chargeFixed: true, addressUnclear: false, deliveryMinor: 0 });
        const lost = await shown('free-lost', { quantity: 20, line: 'Notun Para, Shahid Minar er pashe' });
        expect(lost.q.delivery).toMatchObject({ state: 'ask', reason: 'no-place' });
        const l = await orderOf((await lost.place()).orderId);
        expect(l).toMatchObject({ addressUnclear: false, chargeFixed: true, flags: ['ADDRESS_CHECK'] });
        expect((await f.t.prisma.callTask.findMany({ where: { orderId: l.id }, select: { reason: true } })).map((t) => t.reason)).toEqual(['ADDRESS_CHECK']);
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

    it('PR 563: with no Inside/Outside answer either, the order is placed — never held — and the page and the order agree', async () => {
      const s = await shown('no-answer', { line: 'Notun Para, Shahid Minar er pashe' });
      expect(s.q.delivery.state).toBe('ask');
      expect(s.q.charge.state).toBe('unknown');
      const r = await s.place();
      expect(r.next).toBe('thanks');
      const o = await orderOf(r.orderId);
      expect(o).toMatchObject({ status: 'PLACED', holdReasonCode: null, onHoldSince: null, addressUnclear: true, chargeFixed: false, deliveryChargeMinor: 0, totalMinor: s.q.totals.totalMinor, codAmountMinor: s.q.totals.dueMinor });
      expect(o.flags).toEqual(['ADDRESS_UNCLEAR']); // "para" is a detail: no second flag
      expect(await f.t.prisma.callTask.count({ where: { orderId: o.id } })).toBe(1);
    });

    it('SIM-F-030: a landmark-only village address settles its band silently, is placed, and goes to the call queue once', async () => {
      const s = await shown('landmark', { line: 'bazar er pashe, Kurigram' });
      expect(s.q.delivery.state).toBe('found');
      expect(s.q.charge).toEqual({ state: 'charge', chargeMinor: 13_000 });
      const o = await orderOf((await s.place()).orderId);
      expect(o).toMatchObject({ status: 'PLACED', addressUnclear: false, chargeFixed: true, deliveryChargeMinor: 13_000, deliveryBandId: outside, flags: ['ADDRESS_CHECK'] });
      expect(o.addressResolution).toMatchObject({ status: 'resolved', detail: false });
      const tasks = await f.t.prisma.callTask.findMany({ where: { orderId: o.id }, select: { reason: true, status: true } });
      expect(tasks).toEqual([{ reason: 'ADDRESS_CHECK', status: 'OPEN' }]);
    });

    it("SIM-F-030: an unclear and landmark-only line is one call (the weightiest reason); the owner's switch off flags nothing", async () => {
      const both = await orderOf((await (await shown('both', { line: 'masjid er samne, Notunbazar' })).place()).orderId);
      expect(both.flags).toEqual(['ADDRESS_UNCLEAR', 'ADDRESS_CHECK']);
      expect((await f.t.prisma.callTask.findMany({ where: { orderId: both.id }, select: { reason: true } })).map((t) => t.reason)).toEqual(['ADDRESS_UNCLEAR']);
      f.overrides.set('checkout.address.check', { enabled: false, words: ['house'] });
      try {
        const off = await orderOf((await (await shown('check-off', { line: 'bazar er pashe, Kurigram' })).place()).orderId);
        expect(off.flags).toEqual([]);
        expect(await f.t.prisma.callTask.count({ where: { orderId: off.id } })).toBe(0);
      } finally {
        f.overrides.delete('checkout.address.check');
      }
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
      // PR 136: the invoice's line facts are the stored ones (unit price, saving, SKU), never worked out again
      const item = await f.t.prisma.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
      expect(rc!.lines[0]).toMatchObject({ unitMinor: item.unitPriceMinor, lineDiscountMinor: item.discountMinor, sku: item.sku, amountMinor: item.lineTotalMinor });
      // PR 136: a staff member the caller has checked reads any placed order of the store; an unknown number is still none
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: null, staff: true, number: r.number })).toMatchObject({ number: r.number, totalMinor: rc!.totalMinor });
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: null, staff: true, number: 'NO-SUCH' })).toBeNull();
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

  describe('PR 129 · the account made with the first order (SIM-F-039: never a guessable password)', () => {
    const PHONE = '01700000129';
    const E164 = '+8801700000129';

    it('a guest order makes the account of its phone number: no password at all, the browser is not signed in', async () => {
      const s = await shown('acc-new');
      const r = await s.place({ form: { ...FORM, phone: PHONE } });
      const o = await orderOf(r.orderId);
      const c = await f.t.prisma.customer.findUniqueOrThrow({ where: { storeId_phone: { storeId: f.S, phone: E164 } }, include: { credential: true, sessions: true } });
      expect(o.customerId).toBe(c.id);
      expect(c).toMatchObject({ name: FORM.name, firstSource: 'WEBSITE', orderCount: 1, credential: null, sessions: [] });
      expect(o.events[0]!.data).toMatchObject({ account: 'created' });
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number })).toMatchObject({ account: 'created', phone: '01700-000129' });
      // PR 134: his account reads the order from any device, with its stored state; nobody else's account does
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: null, customerId: c.id, number: r.number })).toMatchObject({ number: r.number, status: 'PLACED', name: FORM.name, times: { confirmedAt: null, deliveredAt: null }, shipment: null });
      // PR 135: once a shipment is booked, the courier and its tracking code, as stored
      const courier = await f.t.prisma.courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test Courier' } });
      await f.t.prisma.shipment.create({ data: { storeId: f.S, orderId: r.orderId, courierAccountId: courier.id, trackingCode: 'TRK-135', idempotencyKey: 'test-ship-135' } });
      expect((await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number }))?.shipment).toEqual({ courier: 'Test Courier', tracking: 'TRK-135' });
      const other = await f.t.prisma.customer.create({ data: { storeId: f.S, phone: '+8801700000134', name: 'Someone Else' } });
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: 'test-visitor-other-0000000000', customerId: other.id, number: r.number })).toBeNull();
      expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: null, customerId: null, number: r.number })).toBeNull();
    });

    it('SIM-F-039 security test: the phone number as the password does not open the account', async () => {
      const policy = defaultSecurityPolicy({ customerPasswordMinLength: 6 });
      const deps = { db: f.t.prisma, policy, now: () => f.clock.now };
      for (const password of [PHONE, E164, '01700-000129']) {
        expect(await loginCustomer(deps, { storeId: f.S, phone: E164, password }, { ip: '192.0.2.129' })).toEqual({ kind: 'invalid' });
      }
      expect(await f.t.prisma.customerSession.count({ where: { customer: { phone: E164 } } })).toBe(0);
    });

    it('the next order with the same number joins the same account; two at once still make one', async () => {
      const a = await shown('acc-again');
      const b = await shown('acc-twin');
      const [ra, rb] = await Promise.all([a.place({ form: { ...FORM, phone: `+88 ${PHONE}`, name: 'Another Name' } }), b.place({ form: { ...FORM, phone: PHONE } })]);
      const rows = await f.t.prisma.customer.findMany({ where: { storeId: f.S, phone: E164 } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ orderCount: 3, name: FORM.name });
      for (const r of [ra, rb]) {
        const o = await orderOf(r.orderId);
        expect(o.customerId).toBe(rows[0]!.id);
        expect(o.events[0]!.data).toMatchObject({ account: 'existing' });
      }
    });

    it('an order placed while signed in belongs to the signed-in customer, whatever number is typed', async () => {
      const me = await f.t.prisma.customer.create({ data: { storeId: f.S, phone: '+8801700001290', name: 'Signed In' } });
      const s = await shown('acc-signed', { customerId: me.id });
      const r = await s.place({ form: { ...FORM, phone: '01700001291' } });
      const o = await orderOf(r.orderId);
      expect(o).toMatchObject({ customerId: me.id, phone: '+8801700001291' });
      expect(o.events[0]!.data).toMatchObject({ account: 'signedIn' });
      expect(await f.t.prisma.customer.count({ where: { storeId: f.S, phone: '+8801700001291' } })).toBe(0);
      expect(await f.t.prisma.customer.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({ orderCount: 1 });
    });

    it("with the owner's switch off a guest's order stays without an account", async () => {
      set({ 'account.autoCreate.enabled': false });
      try {
        const s = await shown('acc-off');
        const r = await s.place({ form: { ...FORM, phone: '01700001292' } });
        expect((await orderOf(r.orderId)).customerId).toBeNull();
        expect(await f.t.prisma.customer.count({ where: { storeId: f.S, phone: '+8801700001292' } })).toBe(0);
        expect(await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number })).toMatchObject({ account: null });
      } finally {
        f.overrides.delete('account.autoCreate.enabled');
      }
    });
  });
});
