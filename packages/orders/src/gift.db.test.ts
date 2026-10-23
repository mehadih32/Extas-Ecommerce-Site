// PR 605 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): gift mode end to end — the checkout places
// it, the order keeps it, and every reader of the order (the admin's order view, the receipt the thank-you and invoice
// pages read) sees the same thing. SIM-F-007 (required): the parcel goes to the RECEIVER — his name, phone and address
// are the order's own, the delivery target the sticker (PR 179) and the booking (PR 176) read — with the sender, the
// gift note and "deliver on or after" beside them; no account is made for the receiver's number. Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkoutQuote, orderReceipt } from '@extas/checkout';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { getOrder } from './index';
import { setUpOrders, TEST_FORM, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<{ code: string; data?: unknown }> {
  try {
    await p;
    return { code: 'ok' };
  } catch (e) {
    return { code: (e as { code?: string }).code ?? String(e), data: (e as { data?: unknown }).data };
  }
}

const GIFT_ON = { enabled: true, advance: { required: true, type: 'full', amountMinor: null, percent: null }, noteMaxChars: 200, deliverAfterMaxDays: 30, hidePricesDefault: true };
const CARD = { senderName: 'Rafiq Sender', senderContact: '+44 7700 900123', note: 'Happy Eid!', deliverAfter: '2026-11-02' }; // hardcode-ok: a made-up test number
const RECEIVER = { phone: '01700006050', address: 'House 9, Road 2, Dhanmondi, Dhaka 1209' }; // hardcode-ok: a made-up test number

describe.skipIf(!HAS_TEST_DB)('PR 605 · gift mode (PostgreSQL)', () => {
  let f: OrdersFixture;
  const db = () => f.t.prisma;

  beforeAll(async () => {
    f = await setUpOrders('gift');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('off by default: a gift sent anyway is an ordinary order', async () => {
    const o = await f.place('gift-off', { ...RECEIVER, phone: '01700006051', gift: CARD });
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ isGift: false, giftSenderName: null, giftNote: null, paymentMethod: 'COD' });
  });

  it('SIM-F-007: the receiver is the order; the sender, the note and the day go with it; Cash on Delivery is not offered', async () => {
    f.overrides.set('checkout.gift', GIFT_ON);
    try {
      const bag = await f.bag('gift-cod', [{ variantId: f.v.skyM }]);
      const q = await checkoutQuote(f.deps(), { storeId: f.S, cartId: bag.cartId, lang: 'en', address: { line: RECEIVER.address, confirmed: null }, payment: { method: 'cod' }, gift: true });
      expect(q.pay).toMatchObject({ cod: false, codOff: 'GIFT' });
      expect(q.gift).toEqual({ advance: 'full', partMinor: null });

      const o = await f.place('gift-full', { ...RECEIVER, payment: { method: 'mobile', option: 'bkash' }, gift: CARD });
      const row = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(row).toMatchObject({
        isGift: true,
        customerName: TEST_FORM.name,
        phone: '+8801700006050',
        shippingAddressText: RECEIVER.address,
        giftSenderName: 'Rafiq Sender',
        giftSenderContact: '+447700900123',
        giftNote: 'Happy Eid!',
        giftHidePrices: true,
        paymentMethod: 'BKASH',
        codAmountMinor: 0,
        customerId: null,
      });
      expect(row.giftDeliverAfter?.toISOString().slice(0, 10)).toBe('2026-11-02');
      // no account for the receiver's number
      expect(await db().customer.count({ where: { storeId: f.S, phone: '+8801700006050' } })).toBe(0);

      // the delivery target every parcel reader uses (sticker PR 179, booking PR 176)
      const admin = await getOrder(f.ordersDeps(), f.reader, o.orderId);
      expect(admin.delivery).toEqual({
        name: TEST_FORM.name,
        phone: '+8801700006050',
        address: RECEIVER.address,
        addressTyped: RECEIVER.address,
        gift: { senderName: 'Rafiq Sender', senderContact: '+447700900123', note: 'Happy Eid!', deliverAfter: '2026-11-02', hidePrices: true },
      });
      // the thank-you page thanks the sender; the invoice hides the prices
      const r = await orderReceipt(f.deps(), { storeId: f.S, visitorId: o.visitorId, number: o.number });
      expect(r).toMatchObject({ firstName: 'Rafiq', name: TEST_FORM.name, gift: { senderName: 'Rafiq Sender', note: 'Happy Eid!', deliverAfter: '2026-11-02', hidePrices: true } });
    } finally {
      f.overrides.delete('checkout.gift');
    }
  });

  it('the gift card is checked like the page checks it; nothing is stored', async () => {
    f.overrides.set('checkout.gift', GIFT_ON);
    try {
      const before = await db().order.count({ where: { storeId: f.S } });
      const bad = await code(f.place('gift-bad-date', { ...RECEIVER, payment: { method: 'mobile', option: 'bkash' }, gift: { ...CARD, deliverAfter: '2027-01-01' } }));
      expect(bad).toMatchObject({ code: 'FORM', data: { field: 'deliverAfter', problem: 'date', gift: true } });
      const contact = await code(f.place('gift-bad-contact', { ...RECEIVER, payment: { method: 'mobile', option: 'bkash' }, gift: { ...CARD, senderContact: 'call me' } }));
      expect(contact).toMatchObject({ code: 'FORM', data: { field: 'senderContact', problem: 'contact' } });
      expect(await db().order.count({ where: { storeId: f.S } })).toBe(before);
    } finally {
      f.overrides.delete('checkout.gift');
    }
  });

  it('a part ahead: Cash on Delivery for the order, the part kept on it, flagged and one call task to collect it', async () => {
    f.overrides.set('checkout.gift', { ...GIFT_ON, advance: { required: true, type: 'percent', amountMinor: null, percent: 30 } });
    try {
      const o = await f.place('gift-part', { ...RECEIVER, phone: '01700006052', payment: { method: 'cod' }, gift: { ...CARD, deliverAfter: null } });
      const row = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      expect(row).toMatchObject({ isGift: true, paymentMethod: 'COD', giftDeliverAfter: null, advanceRequiredMinor: Math.ceil((row.codAmountMinor * 30) / 100) });
      expect(row.flags).toContain('GIFT_ADVANCE');
      expect(await db().callTask.findMany({ where: { orderId: o.orderId }, select: { reason: true } })).toEqual([{ reason: 'GIFT_ADVANCE' }]);
      const placed = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.placed' } });
      expect(placed.data).toMatchObject({ gift: { advance: 'part', partMinor: row.advanceRequiredMinor, hidePrices: true } });
    } finally {
      f.overrides.delete('checkout.gift');
    }
  });
});
