// S04 · PR 125 — placing the order on a real PostgreSQL (a throwaway database with the real migrations, the sample
// catalogue and store, the default pack's delivery bands and the SAMPLE gazetteer; skipped without
// TEST_DATABASE_ADMIN_URL). Required acceptance tests (CN-017): SIM-F-003 "the charge shown is the charge stored" for a
// recognised address, an unrecognised one with the area he chose, a free-delivery order and an unresolved one; SIM-F-026
// the unfinished checkout kept and a failed payment kept, retried, still one order. Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultSecurityPolicy, loginCustomer } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { findBag, setBagCode } from '@extas/cart';
import { noteHold, openErpLink, sweepReservations, type InventoryDeps } from '@extas/inventory';
import { captureDraft, checkoutPaused, payAction, payView, placeOrder, type PlaceInput } from './place';
import { checkoutQuote, viewOf, type CheckoutRequest } from './quote';
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
    await f.t.prisma.stockLevel.updateMany({ where: { variantId: shirt().id }, data: { onHand: 200, available: 200 } }); // review R2: the hold tests keep more orders' pieces held
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  /** A visitor's bag, the quote his page shows, and the order he places from it. */
  async function shown(name: string, opts: { quantity?: number; line?: string; confirmed?: { bandId: string; areaId?: string | null } | null; payment?: PlaceInput['payment']; useWallet?: boolean; customerId?: string; code?: string; phone?: string } = {}) {
    const bag = await f.bag(name, [{ variantId: shirt().id, quantity: opts.quantity }]);
    if (opts.code) await setBagCode(f.deps(), { storeId: f.S, cartId: bag.cartId, code: opts.code });
    const line = opts.line ?? FORM.address;
    const phone = opts.phone ?? FORM.phone;
    const req: CheckoutRequest = { storeId: f.S, cartId: bag.cartId, lang: 'en', customerId: opts.customerId ?? null, address: { line, confirmed: opts.confirmed ?? null }, payment: opts.payment ?? null, useWallet: opts.useWallet, details: { name: FORM.name, phone } };
    const q = await checkoutQuote(f.deps(), req);
    const input: PlaceInput = { idempotencyKey: randomUUID(), lang: 'en', form: { ...FORM, phone, address: line }, confirmed: opts.confirmed ?? null, payment: opts.payment ?? null, useWallet: opts.useWallet, fingerprint: q.fingerprint };
    return { ...bag, q, input, place: (more: Partial<PlaceInput> = {}) => placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: opts.customerId ?? null, ip: '192.0.2.125', input: { ...input, ...more } }) };
  }
  const orderOf = (id: string) => f.t.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true, events: true, payments: true } });

  describe('PR 505 follow-up (go-live gate SIM-F-025/F-047) · the order keeps the language it was placed in', () => {
    it('a Bengali checkout writes bn, an English one en (his messages follow it)', async () => {
      const b = await shown('lang-bn', { phone: '01800000183' });
      expect((await orderOf((await b.place({ lang: 'bn' })).orderId)).lang).toBe('bn');
      const e = await shown('lang-en', { phone: '01800000184' });
      expect((await orderOf((await e.place()).orderId)).lang).toBe('en');
    });
  });

  describe('PR 159 · what the order keeps for the risk checks, and until when', () => {
    it('the IP, the device id and the shared point (rounded) with the day they are cleared; each switch keeps its own', async () => {
      const device = randomUUID();
      const s = await shown('keep');
      const r = await placeOrder(f.deps(), { storeId: f.S, visitorId: s.visitorId, customerId: null, ip: '192.0.2.159', deviceId: device, input: { ...s.input, gps: { lat: 23.7808875, lng: 90.4073 } } });
      const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: r.orderId }, select: { ip: true, deviceId: true, gpsLat: true, gpsLng: true, piiExpiresAt: true, placedAt: true } });
      expect(o).toMatchObject({ ip: '192.0.2.159', deviceId: device });
      expect(Number(o.gpsLat)).toBe(23.781);
      expect(Number(o.gpsLng)).toBe(90.407);
      expect(o.piiExpiresAt!.getTime() - o.placedAt.getTime()).toBeGreaterThanOrEqual(179 * 86_400_000);
      // the owner keeps nothing: no IP, no device, no point, no day
      f.overrides.set('risk.capture', { ip: false, device: false, gpsButton: false, gpsDecimals: 3, gpsWaitSeconds: 20, retentionDays: 30, purgeEveryMinutes: 60 });
      try {
        const n = await shown('keep-none');
        const r2 = await placeOrder(f.deps(), { storeId: f.S, visitorId: n.visitorId, customerId: null, ip: '192.0.2.159', deviceId: device, input: { ...n.input, gps: { lat: 23.78, lng: 90.4 } } });
        expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: r2.orderId }, select: { ip: true, deviceId: true, gpsLat: true, piiExpiresAt: true } })).toEqual({ ip: null, deviceId: null, gpsLat: null, piiExpiresAt: null });
      } finally {
        f.overrides.delete('risk.capture');
      }
      // a point off the earth is refused; a device id that is not the shop's own is not kept
      const bad = await shown('keep-bad');
      expect(await code(bad.place({ gps: { lat: 123, lng: 0 } }))).toBe('INVALID_INPUT');
      const odd = await placeOrder(f.deps(), { storeId: f.S, visitorId: bad.visitorId, customerId: null, ip: null, deviceId: 'not-a-device', input: bad.input });
      expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: odd.orderId }, select: { deviceId: true, piiExpiresAt: true } }))).toEqual({ deviceId: null, piiExpiresAt: null });
    });
  });

  describe('review R1 B1 · the code is redeemed in the order’s own transaction', () => {
    it('a code with one use in all: the first order redeems it; the next is refused with the checkout as it is now', async () => {
      await f.coupon('TEST-ONCE', 10_000, { usageLimit: 1 });
      const a = await shown('code-once-a', { code: 'test-once' });
      const b = await shown('code-once-b', { code: 'test-once', phone: '01800000125' });
      expect(a.q.bag.summary.offers.find((o) => o.code)).toMatchObject({ code: 'TEST-ONCE', amountMinor: 10_000 });
      expect(b.q.bag.summary.offers.find((o) => o.code)).toMatchObject({ code: 'TEST-ONCE' });
      const placed = await a.place();
      const o = await orderOf(placed.orderId);
      expect(o.couponCode).toBe('TEST-ONCE');
      expect(await f.t.prisma.coupon.findFirstOrThrow({ where: { storeId: f.S, code: 'TEST-ONCE' }, select: { usedCount: true } })).toEqual({ usedCount: 1 });
      expect(await f.t.prisma.couponRedemption.findMany({ where: { orderId: placed.orderId }, select: { phone: true, discountMinor: true } })).toEqual([{ phone: '+8801700000125', discountMinor: 10_000 }]);
      // the second bag was quoted with the code; placing it now finds it used up: nothing is stored
      const before = await f.t.prisma.order.count();
      let err: { code?: string; extra?: { view?: { code?: unknown } } } = {};
      try {
        await b.place();
      } catch (e) {
        err = e as typeof err;
      }
      expect(err.code).toBe('PRICE_CHANGED');
      expect(await f.t.prisma.order.count()).toBe(before);
      // the checkout he sees now: the code refused, the price without it — and that order goes through
      const again = await checkoutQuote(f.deps(), { storeId: f.S, cartId: b.cartId, lang: 'en', address: { line: FORM.address, confirmed: null }, details: { name: FORM.name, phone: '01800000125' } });
      expect(again.bag.summary.offers.some((x) => x.code)).toBe(false);
      const r = await b.place({ idempotencyKey: randomUUID(), fingerprint: again.fingerprint });
      expect((await orderOf(r.orderId)).couponCode).toBeNull();
    });

    it('one use per customer: a guest is counted by his phone, at the quote and at the order', async () => {
      await f.coupon('TEST-MINE', 5_000, { perCustomerLimit: 1 });
      await (await shown('code-mine-a', { code: 'test-mine' })).place();
      // the same phone again: the quote already says the code is used (no discount), and the order has none
      const again = await shown('code-mine-b', { code: 'test-mine' });
      expect(again.q.bag.summary.offers.some((x) => x.code)).toBe(false);
      expect((await orderOf((await again.place()).orderId)).couponCode).toBeNull();
      // another phone may use it
      const other = await shown('code-mine-c', { code: 'test-mine', phone: '01900000125' });
      expect(other.q.bag.summary.offers.find((x) => x.code)).toMatchObject({ code: 'TEST-MINE' });
      expect((await orderOf((await other.place()).orderId)).couponCode).toBe('TEST-MINE');
      expect(await f.t.prisma.coupon.findFirstOrThrow({ where: { storeId: f.S, code: 'TEST-MINE' }, select: { usedCount: true } })).toEqual({ usedCount: 2 });
    });

    it('two orders at the same moment on the last use: exactly one gets the code', async () => {
      await f.coupon('TEST-RACE', 5_000, { usageLimit: 1 });
      const a = await shown('code-race-a', { code: 'test-race', phone: '01600000125' });
      const b = await shown('code-race-b', { code: 'test-race', phone: '01500000125' });
      const results = await Promise.allSettled([a.place(), b.place()]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect((refused.reason as { code?: string }).code).toBe('PRICE_CHANGED');
      expect(await f.t.prisma.couponRedemption.count({ where: { coupon: { code: 'TEST-RACE' } } })).toBe(1);
    });
  });

  describe('review R1 M1 · an open order keeps its pieces past the hold time', () => {
    it('a placed order waiting 25 h keeps its hold (renewed); once cancelled, the next sweep lets it go', async () => {
      const s = await shown('hold-25h');
      const r = await s.place();
      const holds = () => f.t.prisma.stockReservation.findMany({ where: { orderId: r.orderId }, select: { status: true, releasedAt: true, expiresAt: true } });
      expect((await holds()).map((h) => [h.status, h.releasedAt])).toEqual([['CONVERTED', null]]);
      const at = f.clock.now;
      const inv = { db: f.t.prisma, settings: f.deps().settings, now: () => f.clock.now, connections: { use: () => Promise.reject(new Error('no ERP here')) } } as unknown as InventoryDeps;
      try {
        f.clock.now = new Date(at.getTime() + 25 * 3_600_000);
        const swept = await sweepReservations(inv);
        expect(swept.ordersRenewed).toBeGreaterThanOrEqual(1);
        const [h] = await holds();
        expect(h).toMatchObject({ status: 'CONVERTED', releasedAt: null });
        expect(h!.expiresAt.getTime()).toBeGreaterThan(f.clock.now.getTime());
        // cancelled: the hold is no longer the order's to keep
        await f.t.prisma.order.update({ where: { id: r.orderId }, data: { status: 'CANCELLED' } });
        f.clock.now = new Date(h!.expiresAt.getTime() + 1_000);
        expect((await sweepReservations(inv)).ordersTimedOut).toBeGreaterThanOrEqual(1);
        expect((await holds())[0]!.releasedAt).not.toBeNull();
      } finally {
        f.clock.now = at;
      }
    });
  });

  describe('review R2 M1/m1 · an unpaid order does not keep its pieces for ever; a kept hold never lapses', () => {
    const invOf = () => ({ db: f.t.prisma, settings: f.deps().settings, now: () => f.clock.now, connections: { use: () => Promise.reject(new Error('no ERP here')) } }) as unknown as InventoryDeps;
    const holdsOf = (orderId: string) => f.t.prisma.stockReservation.findMany({ where: { orderId }, select: { status: true, releasedAt: true, expiresAt: true } });

    it('an open order is renewed half its time before the hold runs out, so it counts the whole time', async () => {
      const r = await (await shown('hold-ahead')).place();
      const at = f.clock.now;
      const [first] = await holdsOf(r.orderId);
      try {
        f.clock.now = new Date(at.getTime() + 13 * 3_600_000);
        expect((await sweepReservations(invOf())).ordersRenewed).toBeGreaterThanOrEqual(1);
        const [h] = await holdsOf(r.orderId);
        expect(h).toMatchObject({ status: 'CONVERTED', releasedAt: null });
        expect(h!.expiresAt.getTime()).toBeGreaterThan(first!.expiresAt.getTime());
        expect(h!.expiresAt.getTime()).toBe(f.clock.now.getTime() + 24 * 3_600_000);
      } finally {
        f.clock.now = at;
      }
    });

    it('a placed order whose online payment never came in lets its pieces go after unpaidHoldHours; a COD one is kept', async () => {
      const unpaid = await (await shown('hold-unpaid')).place();
      const cod = await (await shown('hold-cod')).place();
      await f.t.prisma.order.update({ where: { id: unpaid.orderId }, data: { flags: ['PAYMENT_PENDING'] } });
      const at = f.clock.now;
      try {
        // half-way: the unpaid order is not renewed past its limit (placed + 24 h), the COD one is
        f.clock.now = new Date(at.getTime() + 13 * 3_600_000);
        await sweepReservations(invOf());
        expect((await holdsOf(unpaid.orderId))[0]!.expiresAt.getTime()).toBeLessThanOrEqual(at.getTime() + 24 * 3_600_000 + 1_000);
        f.clock.now = new Date(at.getTime() + 25 * 3_600_000);
        expect((await sweepReservations(invOf())).ordersTimedOut).toBeGreaterThanOrEqual(1);
        expect((await holdsOf(unpaid.orderId))[0]!.releasedAt).not.toBeNull();
        expect((await holdsOf(cod.orderId))[0]).toMatchObject({ status: 'CONVERTED', releasedAt: null });
        // the order itself is untouched: still placed, still waiting for its money
        expect(await f.t.prisma.order.findUniqueOrThrow({ where: { id: unpaid.orderId }, select: { status: true, flags: true } })).toEqual({ status: 'PLACED', flags: ['PAYMENT_PENDING'] });
      } finally {
        f.clock.now = at;
      }
    });

    it('an advance wait counts from when it was asked; 0 keeps an unpaid order’s pieces while it is open', async () => {
      const adv = await (await shown('hold-advance')).place();
      const at = f.clock.now;
      await f.t.prisma.order.update({ where: { id: adv.orderId }, data: { status: 'AWAITING_ADVANCE' } });
      await f.t.prisma.orderEvent.create({ data: { storeId: f.S, orderId: adv.orderId, type: 'order.awaitAdvance', actorType: 'STAFF', source: 'admin', createdAt: new Date(at.getTime() + 20 * 3_600_000) } });
      try {
        // asked at +20 h: kept until +44 h, not beyond
        f.clock.now = new Date(at.getTime() + 25 * 3_600_000);
        await sweepReservations(invOf());
        expect((await holdsOf(adv.orderId))[0]).toMatchObject({ releasedAt: null, expiresAt: new Date(at.getTime() + 44 * 3_600_000) });
        f.clock.now = new Date(at.getTime() + 45 * 3_600_000);
        await sweepReservations(invOf());
        expect((await holdsOf(adv.orderId))[0]!.releasedAt).not.toBeNull();
      } finally {
        f.clock.now = at;
      }
      const keep = await (await shown('hold-unpaid-0')).place();
      await f.t.prisma.order.update({ where: { id: keep.orderId }, data: { flags: ['PAYMENT_FAILED'] } });
      try {
        f.overrides.set('inventory.reservation.unpaidHoldHours', 0);
        f.clock.now = new Date(at.getTime() + 25 * 3_600_000);
        await sweepReservations(invOf());
        expect((await holdsOf(keep.orderId))[0]).toMatchObject({ releasedAt: null });
        expect((await holdsOf(keep.orderId))[0]!.expiresAt.getTime()).toBe(f.clock.now.getTime() + 24 * 3_600_000);
      } finally {
        f.overrides.delete('inventory.reservation.unpaidHoldHours');
        f.clock.now = at;
      }
    });
  });

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

    it('PR 561: a known number and a line with no place — nothing asked, shown or prefilled; the held address goes with the order', async () => {
      const phone = '01700000561';
      const c = await f.t.prisma.customer.create({ data: { storeId: f.S, phone: '+8801700000561', name: 'Sample Customer' } });
      const uttara = (await f.t.prisma.geoArea.findUniqueOrThrow({ where: { code: 'bd.dhaka.dhaka.uttara' }, select: { id: true } })).id;
      await f.t.prisma.customerAddress.create({ data: { storeId: f.S, customerId: c.id, name: 'Sample Customer', phone: '+8801700000561', addressLine: 'House 42, Road 12, Sector 7, Uttara', areaId: uttara, isDefault: true } });
      const typed = async (name: string, line: string, who = phone) => {
        const bag = await f.bag(name, [{ variantId: shirt().id }]);
        const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', address: { line, phone: who }, ip: '192.0.2.61' });
        const place = () =>
          placeOrder(f.deps(), { storeId: f.S, visitorId: bag.visitorId, customerId: null, ip: '192.0.2.61', input: { idempotencyKey: randomUUID(), lang: 'en', form: { ...FORM, phone: who, address: line }, fingerprint: q.fingerprint } });
        return { q, place };
      };
      // the owner's switch off (the default): he is asked, as before
      expect((await typed('bf-off', 'Road 12, House 42')).q.delivery.state).toBe('ask');
      set({ 'checkout.address.backfill': { enabled: true, orders: 'delivered' } });
      try {
        const s = await typed('bf-on', 'Road 12, House 42');
        expect(s.q.delivery).toMatchObject({ state: 'found', via: 'saved', place: null, band: { key: 'dhaka-city' } });
        expect(s.q.charge).toEqual({ state: 'charge', chargeMinor: 8_000 });
        expect(JSON.stringify(viewOf(s.q))).not.toMatch(/Sector 7|Uttara|উত্তরা/);
        const o = await orderOf((await s.place()).orderId);
        expect(o).toMatchObject({ shippingAddressText: 'Road 12, House 42', backfilledAddress: 'House 42, Road 12, Sector 7, Uttara', deliveryBandId: city, deliveryChargeMinor: 8_000, chargeFixed: true, addressUnclear: false, flags: [] });
        expect(o.addressResolution).toMatchObject({ status: 'resolved', via: 'saved', backfill: 'saved' });
        expect(await f.t.prisma.callTask.count({ where: { orderId: o.id } })).toBe(0);
        // a new address always wins over the stored one: he may have moved, or be sending a gift
        const moved = await typed('bf-moved', 'House 3, Road 1, Kurigram');
        expect(moved.q.delivery).toMatchObject({ state: 'found', via: 'line', band: { key: 'outside-dhaka' } });
        const m = await orderOf((await moved.place()).orderId);
        expect(m).toMatchObject({ backfilledAddress: null, deliveryBandId: outside, deliveryChargeMinor: 13_000 });
        // an unknown number is asked as usual, and an unclear order is placed as PR 563 says
        const stranger = await typed('bf-stranger', 'Road 12, House 42', '01700000562');
        expect(stranger.q.delivery.state).toBe('ask');
        expect((await orderOf((await stranger.place()).orderId)).flags).toEqual(['ADDRESS_UNCLEAR']);
      } finally {
        f.overrides.delete('checkout.address.backfill');
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

    it('review R2 (m5): a lost answer, then a new bag with the old key — refused, never answered with the old order', async () => {
      const s = await shown('lost-answer');
      const first = await s.place();
      // the same tab fills a new bag; its page shows a new checkout (another fingerprint) but sends the kept key
      const nb = await f.bag('lost-answer', [{ variantId: shirt().id, quantity: 2 }]);
      expect(nb.cartId).not.toBe(s.cartId);
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: nb.cartId, lang: 'en', address: { line: FORM.address, confirmed: null }, details: { name: FORM.name, phone: FORM.phone } });
      expect(q.fingerprint).not.toBe(s.input.fingerprint);
      expect(await code(s.place({ fingerprint: q.fingerprint }))).toBe('IDEMPOTENCY');
      // the same checkout again still gets its own order back (a retry after a lost answer)
      expect(await s.place()).toMatchObject({ orderId: first.orderId, replay: true });
      // with a new key, the new bag becomes its own order
      const next = await s.place({ idempotencyKey: randomUUID(), fingerprint: q.fingerprint });
      expect(next.orderId).not.toBe(first.orderId);
      expect(await f.t.prisma.order.count({ where: { visitorId: s.visitorId } })).toBe(2);
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

    it('follow-up 50 · the go-live guard: the test page answers only with test payments on and no real gateway', async () => {
      const s = await shown('golive', { payment: { method: 'mobile', option: 'bkash' } });
      const r = await s.place();
      const who = { storeId: f.S, visitorId: s.visitorId };
      const act = (deps: ReturnType<typeof f.deps>, action: string) => code(payAction(deps, { ...who, input: { number: r.number, action } }));
      // on staging (test payments switched on there; they ship off): the test page, no gateway
      expect(await payView(f.deps(), { ...who, number: r.number })).toMatchObject({ test: true, gateway: false });
      // a real gateway connected (sandbox or live): only its own answer pays the order
      const live = { ...f.deps(), paymentMode: async () => 'LIVE' as const };
      expect(await payView(live, { ...who, number: r.number })).toMatchObject({ test: false, gateway: true });
      expect(await act(live, 'approve')).toBe('TEST_PAYMENT_OFF');
      expect(await act({ ...f.deps(), paymentMode: async () => 'SANDBOX' as const }, 'fail')).toBe('TEST_PAYMENT_OFF');
      // a gateway that cannot be read is neither
      expect(await payView({ ...f.deps(), paymentMode: async () => Promise.reject(new Error('down')) }, { ...who, number: r.number })).toMatchObject({ test: false, gateway: false });
      // go-live day: test payments off — even on the practice gateway nothing answers "paid"
      f.overrides.set('payments.testPayments', false);
      try {
        expect(await payView(f.deps(), { ...who, number: r.number })).toMatchObject({ test: false, gateway: false });
        expect(await act(f.deps(), 'approve')).toBe('TEST_PAYMENT_OFF');
        // review R1 B1: and the checkout offers no method that still runs on the practice gateway
        const fresh = await f.bag('practice-off', [{ variantId: shirt().id }]);
        const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: fresh.cartId, lang: 'en', address: { line: FORM.address, confirmed: null }, payment: { method: 'mobile', option: 'bkash' } });
        expect([q.pay.mobile, q.pay.card, q.pay.online]).toEqual([[], [], false]);
        expect(q.pay.chosen?.method).toBe('cod');
        // a wallet whose real gateway is live is still offered
        const realBkash = { ...f.deps(), paymentMode: async (_s: number, p: string) => (p === 'bkash' ? ('LIVE' as const) : ('MOCK' as const)) };
        expect((await checkoutQuote(realBkash, { storeId: f.S, cartId: fresh.cartId, lang: 'en', address: { line: FORM.address, confirmed: null } })).pay.mobile).toEqual(['bkash']);
      } finally {
        f.overrides.delete('payments.testPayments');
      }
      expect((await orderOf(r.orderId)).payments.map((p) => p.status)).toEqual(['INITIATED']);
      expect(await act(f.deps(), 'approve')).toBe('ok');
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
    it("SIM-F-048: a district with its own promise — the checkout and the receipt show its hours, the charge stays the band's", async () => {
      const dhaka = await f.t.prisma.geoArea.findFirstOrThrow({ where: { level: 'DISTRICT', nameEn: 'Dhaka' }, select: { code: true } });
      f.overrides.set('delivery.promise.districts', { enabled: true, rows: [{ district: dhaka.code!, hoursMin: 6, hoursMax: 12 }] });
      try {
        const s = await shown('ty-district');
        expect(s.q.delivery).toMatchObject({ state: 'found', band: { hoursMin: 6, hoursMax: 12 } });
        const r = await s.place();
        const rc = await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number });
        expect(rc).toMatchObject({ band: { hoursMin: 6, hoursMax: 12 }, deliveryMinor: 8_000 });
        // without the settings reader (the invoice's call) the band's own hours stand
        expect((await orderReceipt({ db: f.t.prisma }, { storeId: f.S, visitorId: s.visitorId, number: r.number }))!.band).toMatchObject({ hoursMin: 24, hoursMax: 48 });
      } finally {
        f.overrides.delete('delivery.promise.districts');
      }
    });

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
      expect((await orderReceipt(f.deps(), { storeId: f.S, visitorId: s.visitorId, number: r.number }))?.shipment).toEqual({ courier: 'Test Courier', tracking: 'TRK-135', consignmentId: null, status: 'BOOKING' });
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

  describe('PR 610 · qa-gate I3: the page knows the pause before Confirm, by the very rule Confirm is refused with', () => {
    it('while the ERP holds a v6 store the bag and checkout read "paused", Confirm is refused and no order is made; the switch and the release open it', async () => {
      const s = await shown('paused');
      const integration = await f.t.prisma.integration.create({ data: { storeId: f.S, kind: 'ERP', provider: 'extasErp', name: 'extasErp', mode: 'MOCK', enabled: true, config: {}, secretNames: [] } });
      const link = await openErpLink(f.t.prisma, f.S, integration.id);
      f.overrides.set('erp.model', 'v6');
      try {
        expect(await checkoutPaused(f.deps(), f.S)).toBe(false);
        await noteHold(f.t.prisma, f.S, link.id, { onHold: true, reason: 'PAYMENT_OVERDUE' }, f.clock.now);
        expect(await checkoutPaused(f.deps(), f.S)).toBe(true);
        const before = await f.t.prisma.order.count({ where: { storeId: f.S } });
        expect(await code(s.place())).toBe('PAUSED');
        expect(await f.t.prisma.order.count({ where: { storeId: f.S } })).toBe(before);
        // the owner's switch off: no pause (the order would wait for the ERP instead)
        f.overrides.set('erp.hold.pauseCheckout', false);
        expect(await checkoutPaused(f.deps(), f.S)).toBe(false);
        f.overrides.delete('erp.hold.pauseCheckout');
        // on contract v5 a hold pauses nothing
        f.overrides.set('erp.model', 'v5');
        expect(await checkoutPaused(f.deps(), f.S)).toBe(false);
        f.overrides.set('erp.model', 'v6');
        await noteHold(f.t.prisma, f.S, link.id, { onHold: false }, f.clock.now);
        expect(await checkoutPaused(f.deps(), f.S)).toBe(false);
      } finally {
        f.overrides.delete('erp.model');
        f.overrides.delete('erp.hold.pauseCheckout');
        await f.t.prisma.erpStoreLink.update({ where: { id: link.id }, data: { endedAt: f.clock.now } });
      }
    });
  });
});
