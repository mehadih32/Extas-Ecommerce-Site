// S04 · PR 560 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL) — SIM-F-016, the advance-payment checkout
// mode as one customer meets it: off, nobody is flagged; on, a flagged customer sees Cash on Delivery go only once he
// has filled everything in, with one neutral line (never a score, a band or a layer's name); the money is exactly what
// Cash on Delivery would cost; the order waits for its advance, the payment page pays just that much, and the paid
// advance puts the order back in the queue with the rest to collect at the door. The full amount ahead is an ordinary
// prepaid order. A gift, a shop with Cash on Delivery off, or a shop with no prepaid method open is never flagged.
// Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { checkoutQuote, payAction, placeOrder, viewOf, type CheckoutDeps, type PlaceInput } from '@extas/checkout';
import { registry } from '@extas/settings';
import { askCheckoutAdvance, checkoutFlag, recordAdvance, systemBy } from './index';
import { setUpOrders, TEST_FORM, type OrdersFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 560 · SIM-F-016: the advance-payment checkout mode (PostgreSQL)', () => {
  let f: OrdersFixture;
  let layerId: string;
  /** The checkout as the app wires it: the Parameter for Checkout's look and the order service for a paid advance. */
  const cd = (): CheckoutDeps => ({
    ...f.deps(),
    advanceFlag: (i) => checkoutFlag(f.ordersDeps(), i),
    advancePaid: async (storeId, orderId) => void (await recordAdvance(f.ordersDeps(), { storeId, orderId }, systemBy('checkout'))),
  });
  let n = 0;
  /** A new number each time (the layer below flags a number with no orders yet). */
  const phone = () => `0171000${String(++n).padStart(4, '0')}`;
  const quote = (cartId: string, details: { name: string; phone: string } | null, more: { payment?: PlaceInput['payment']; gift?: boolean } = {}) =>
    checkoutQuote(cd(), { storeId: f.S, cartId, lang: 'en', address: { line: TEST_FORM.address, confirmed: null }, details, payment: more.payment ?? null, gift: more.gift === true });
  const setLayer = (requirement: string, partPercent: number | null = null) => f.t.prisma.checkoutParameterLayer.update({ where: { id: layerId }, data: { requirement: requirement as never, partPercent } });

  beforeAll(async () => {
    f = await setUpOrders('checkout_advance');
    const layer = await f.t.prisma.checkoutParameterLayer.create({
      data: { storeId: f.S, name: 'Secret layer name', position: 1, enabled: true, conditions: { minScore: null, bands: [], signals: ['newPhone'] }, requirement: 'DELIVERY_CHARGE' },
    });
    layerId = layer.id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off (as it ships): a flagged number still sees Cash on Delivery', async () => {
    expect(registry['checkout.advance'].default.enabled).toBe(false);
    const bag = await f.bag('off', [{ variantId: f.v.skyM }]);
    const q = await quote(bag.cartId, { name: TEST_FORM.name, phone: phone() });
    expect(q.pay).toMatchObject({ cod: true, codOff: null });
    expect(q.advance).toBeNull();
  });

  it('on: COD goes only once he has filled everything in; one neutral line; the money is the COD money; the order waits, pays the charge, and comes back', async () => {
    f.overrides.set('checkout.advance', { enabled: true, maxLayers: 5 });
    const tel = phone();
    const bag = await f.bag('delivery', [{ variantId: f.v.skyM }]);
    // not finished yet: no name, a half number, or no address — everything as before
    const cod = await quote(bag.cartId, null);
    expect(cod.pay).toMatchObject({ cod: true, codOff: null });
    expect((await quote(bag.cartId, { name: '', phone: tel })).pay.cod).toBe(true);
    expect((await quote(bag.cartId, { name: TEST_FORM.name, phone: '0171' })).pay.cod).toBe(true);
    // finished: the payment section is swapped on the same page
    const q = await quote(bag.cartId, { name: TEST_FORM.name, phone: tel });
    expect(q.pay).toMatchObject({ cod: false, codOff: 'ADVANCE' });
    expect(['mobile', 'card', 'online']).toContain(q.pay.chosen?.method);
    const charge = q.totals.deliveryMinor!;
    expect(charge).toBeGreaterThan(0);
    expect(q.advance).toEqual({ kind: 'delivery', amountMinor: charge, restMinor: q.totals.dueMinor - charge });
    // the money is exactly what Cash on Delivery costs: no reward, no other price
    expect(q.totals).toEqual(cod.totals);
    // never a score, a band or the layer's name on the page
    const page = JSON.stringify(viewOf(q));
    expect(page).not.toContain('Secret layer name');
    // (the page's own "band" is the delivery charge's band; the risk band, the score and the layer stay on the server)
    expect(viewOf(q)).not.toHaveProperty('flag');
    expect(page).not.toMatch(/score|layer|risk/i);
    expect(q.flag).toMatchObject({ layerId, layerName: 'Secret layer name' });

    const placed = await placeOrder(cd(), {
      storeId: f.S,
      visitorId: bag.visitorId,
      ip: '192.0.2.10',
      input: { idempotencyKey: randomUUID(), lang: 'en', form: { ...TEST_FORM, phone: tel }, confirmed: null, payment: q.pay.chosen, fingerprint: q.fingerprint } satisfies PlaceInput,
    });
    expect(placed.next).toBe('pay');
    const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(o).toMatchObject({ paymentMethod: 'COD', advanceRequirement: 'DELIVERY_CHARGE', advanceRequiredMinor: charge, codAmountMinor: q.totals.dueMinor, totalMinor: cod.totals.totalMinor });
    const pays = await f.t.prisma.payment.findMany({ where: { orderId: o.id } });
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ purpose: 'ADVANCE_DELIVERY_CHARGE', amountMinor: charge, status: 'INITIATED' });
    expect(pays[0]!.method).not.toBe('COD');
    const flag = await f.t.prisma.checkoutFlagEvent.findFirstOrThrow({ where: { orderId: o.id } });
    expect(flag).toMatchObject({ layerId, requirement: 'DELIVERY_CHARGE', outcome: 'ASKED' });
    const ev = await f.t.prisma.orderEvent.findFirstOrThrow({ where: { orderId: o.id, type: 'order.placed' } });
    expect(ev.data).toMatchObject({ codOff: 'ADVANCE', advance: { kind: 'delivery', amountMinor: charge } });

    // the order waits for its advance (never cancelled, never blocked), then the payment page pays just that
    expect(await askCheckoutAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.id })).toBe(true);
    expect((await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('AWAITING_ADVANCE');
    const paid = await payAction(cd(), { storeId: f.S, visitorId: bag.visitorId, input: { number: placed.number, action: 'approve' } });
    expect(paid.status).toBe('PAID');
    const after = await f.t.prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after).toMatchObject({ status: 'PLACED', paidMinor: charge, paymentMethod: 'COD' });
    expect(after.totalMinor - after.walletAppliedMinor - after.paidMinor).toBe(q.totals.dueMinor - charge);
    // asking again changes nothing
    expect(await askCheckoutAdvance(f.ordersDeps(), { storeId: f.S, orderId: o.id })).toBe(false);
  });

  it('a part ahead, and the full amount ahead as an ordinary prepaid order', async () => {
    await setLayer('PART_AMOUNT', 30);
    const b1 = await f.bag('part', [{ variantId: f.v.skyM }]);
    const p = await quote(b1.cartId, { name: TEST_FORM.name, phone: phone() });
    expect(p.advance).toEqual({ kind: 'part', amountMinor: Math.ceil((p.totals.dueMinor * 30) / 100), restMinor: p.totals.dueMinor - Math.ceil((p.totals.dueMinor * 30) / 100) });

    await setLayer('FULL_AMOUNT');
    const tel = phone();
    const b2 = await f.bag('full', [{ variantId: f.v.skyM }]);
    const q = await quote(b2.cartId, { name: TEST_FORM.name, phone: tel });
    expect(q.pay.codOff).toBe('ADVANCE');
    expect(q.advance).toEqual({ kind: 'full', amountMinor: q.totals.dueMinor, restMinor: 0 });
    const placed = await placeOrder(cd(), {
      storeId: f.S,
      visitorId: b2.visitorId,
      input: { idempotencyKey: randomUUID(), lang: 'en', form: { ...TEST_FORM, phone: tel }, confirmed: null, payment: q.pay.chosen, fingerprint: q.fingerprint } satisfies PlaceInput,
    });
    const o = await f.t.prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
    expect(o.paymentMethod).not.toBe('COD');
    expect(o).toMatchObject({ advanceRequirement: 'FULL_AMOUNT', advanceRequiredMinor: q.totals.dueMinor, codAmountMinor: 0 });
    expect(await f.t.prisma.payment.findFirst({ where: { orderId: o.id } })).toMatchObject({ purpose: 'FULL_ADVANCE', amountMinor: q.totals.dueMinor });
    await setLayer('DELIVERY_CHARGE');
  });

  it('never flagged: a gift, a shop with Cash on Delivery off, no prepaid method open, a layer switched off', async () => {
    const tel = phone();
    const b = await f.bag('never', [{ variantId: f.v.skyM }]);
    f.overrides.set('checkout.gift', { ...registry['checkout.gift'].default, enabled: true, advance: { required: false, type: 'full', amountMinor: null, percent: null } });
    expect((await quote(b.cartId, { name: TEST_FORM.name, phone: tel }, { gift: true })).advance).toBeNull();
    f.overrides.delete('checkout.gift');
    f.overrides.set('payment.cod.enabled', false);
    const off = await quote(b.cartId, { name: TEST_FORM.name, phone: tel });
    expect(off.pay.codOff).toBe('OFF');
    expect(off.advance).toBeNull();
    f.overrides.set('payment.cod.enabled', true);
    f.overrides.set('checkout.pay.mobile.enabled', false);
    f.overrides.set('checkout.pay.card.enabled', false);
    f.overrides.set('checkout.pay.online.enabled', false);
    const none = await quote(b.cartId, { name: TEST_FORM.name, phone: tel });
    expect(none.pay).toMatchObject({ cod: true, codOff: null });
    expect(none.advance).toBeNull();
    f.overrides.delete('checkout.pay.mobile.enabled');
    f.overrides.delete('checkout.pay.card.enabled');
    f.overrides.delete('checkout.pay.online.enabled');
    await f.t.prisma.checkoutParameterLayer.update({ where: { id: layerId }, data: { enabled: false } });
    expect((await quote(b.cartId, { name: TEST_FORM.name, phone: tel })).pay.cod).toBe(true);
    await f.t.prisma.checkoutParameterLayer.update({ where: { id: layerId }, data: { enabled: true } });
  });
});
