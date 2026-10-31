// PR 179 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout and
// booked with Steadfast on its practice world; skipped without TEST_DATABASE_ADMIN_URL): the print run lists booked
// parcels still with us without the customers' details; the sticker carries what the courier has — the live amount due
// (SIM-F-004), a gift's receiver, sender and day (SIM-F-007), the courier's consignment id and tracking code
// (follow-up 376); a change after booking is refused, never printed; every print is counted, noted and audited, and a
// second print is a reprint. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { bookOrders, printRun, printStickers } from './index';
import { addDays, courierPhone, localDay } from './pure';
import { setUpShipping, type ShippingFixture } from './testing';

async function refusal(p: Promise<unknown>): Promise<{ code: string; data?: Record<string, unknown> }> {
  try {
    await p;
    return { code: 'ok' };
  } catch (e) {
    return { code: (e as { code?: string }).code ?? String(e), data: (e as { data?: Record<string, unknown> }).data };
  }
}

const GIFT_ON = { enabled: true, advance: { required: true, type: 'full', amountMinor: null, percent: null }, noteMaxChars: 200, deliverAfterMaxDays: 30, hidePricesDefault: true };

describe.skipIf(!HAS_TEST_DB)('PR 179 · the courier sticker (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(1830 + ++n).padStart(4, '0')}`;
  const booked = async (name: string, opts: Parameters<ShippingFixture['place']>[1] = {}) => {
    const o = await f.place(name, { phone: phone(), ...opts });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId } });
    return { ...o, shipmentId: s.id, shipment: s };
  };
  const print = async (shipmentIds: string[], extra: Record<string, unknown> = {}) => (await printStickers(f.shippingDeps(), f.shipper, { shipmentIds, ...extra })).parcels;

  beforeAll(async () => {
    f = await setUpShipping('shipping_sticker');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('SIM-F-004: the sticker collects the live amount due (the courier\'s COD), nothing on a paid parcel; prints are counted and a second print is a reprint', async () => {
    const cod = await booked('st-cod');
    const paid = await booked('st-paid', { payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await db().shipment.update({ where: { id: cod.shipmentId }, data: { trackingCode: 'SF-TRK-1' } });
    const order = await db().order.findUniqueOrThrow({ where: { id: cod.orderId } });

    const run = await printRun(f.shippingDeps(), f.shipper);
    const mine = run.rows.filter((r) => [cod.shipmentId, paid.shipmentId].includes(r.shipmentId));
    expect(mine).toHaveLength(2);
    expect(mine.every((r) => r.problem === null && r.printCount === 0 && r.practice)).toBe(true);
    expect(run.maxPerPdf).toBe(shippingSettings['delivery.sticker.layout'].default.maxPerPdf);
    // the list carries no customer's details
    expect(JSON.stringify(run)).not.toContain(order.customerName!);
    expect(JSON.stringify(run)).not.toContain(order.phone!);

    const first = await print([cod.shipmentId, paid.shipmentId]);
    const c = first.find((s) => s.shipmentId === cod.shipmentId)!;
    const p = first.find((s) => s.shipmentId === paid.shipmentId)!;
    expect(c).toMatchObject({ orderNumber: order.number, courierName: 'Steadfast main', practice: true, consignmentId: cod.shipment.consignmentId, trackingCode: 'SF-TRK-1', collectMinor: order.totalMinor - order.walletAppliedMinor - order.paidMinor, currency: order.currency, reprint: null, gift: null });
    expect(c.collectMinor).toBeGreaterThan(0);
    expect(c.receiver).toEqual({ name: order.customerName, phone: courierPhone(order.phone), address: order.shippingAddressText, addressLatin: null });
    expect(c.items.length).toBeGreaterThan(0);
    expect(p.collectMinor).toBe(0);
    expect(await db().shipment.findUniqueOrThrow({ where: { id: cod.shipmentId } })).toMatchObject({ labelPrintCount: 1 });
    expect(await db().orderEvent.count({ where: { orderId: cod.orderId, type: 'shipment.stickerPrinted' } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityId: cod.shipmentId, action: 'shipment.sticker.print' } })).toBe(1);

    const again = await print([cod.shipmentId], { reason: 'Sticker torn' });
    expect(again[0]).toMatchObject({ reprint: 1 });
    expect((await printRun(f.shippingDeps(), f.shipper)).rows.find((r) => r.shipmentId === cod.shipmentId)).toMatchObject({ printCount: 2 });
    // printing never books again: still one parcel
    expect(await db().shipment.count({ where: { orderId: cod.orderId } })).toBe(1);
  });

  it('SIM-F-004: money taken or a receiver changed after booking is refused with its reason, never printed', async () => {
    const a = await booked('st-paid-later');
    const b = await booked('st-moved');
    const order = await db().order.findUniqueOrThrow({ where: { id: a.orderId } });
    await db().order.update({ where: { id: a.orderId }, data: { paidMinor: order.paidMinor + 10_000 } });
    await db().order.update({ where: { id: b.orderId }, data: { shippingAddressText: 'Village Pirganj, Rangpur' } });

    const rows = (await printRun(f.shippingDeps(), f.shipper)).rows;
    expect(rows.find((r) => r.shipmentId === a.shipmentId)).toMatchObject({ problem: 'COD_CHANGED' });
    expect(rows.find((r) => r.shipmentId === b.shipmentId)).toMatchObject({ problem: 'RECEIVER_CHANGED' });
    const r = await refusal(print([a.shipmentId, b.shipmentId]));
    expect(r.code).toBe('NOT_PRINTABLE');
    expect(r.data?.refused).toEqual(expect.arrayContaining([expect.objectContaining({ shipmentId: a.shipmentId, problem: 'COD_CHANGED' }), expect.objectContaining({ shipmentId: b.shipmentId, problem: 'RECEIVER_CHANGED' })]));
    expect((await db().shipment.findUniqueOrThrow({ where: { id: a.shipmentId } })).labelPrintCount).toBe(0);
  });

  it('SIM-F-007: a gift\'s sticker goes to the receiver with the sender and the day, never the sender\'s contact', async () => {
    f.overrides.set('checkout.gift', GIFT_ON);
    f.overrides.set('delivery.courier.booking', { ...shippingSettings['delivery.courier.booking'].default, giftLeadDays: 3 });
    try {
      const timeZone = await f.deps().settings.value('store.timeZone');
      const day = addDays(localDay(f.clock.now, timeZone), 3);
      const card = { senderName: 'Rafiq Sender', senderContact: '+44 7700 900123', note: 'Happy Eid!', deliverAfter: day }; // hardcode-ok: a made-up test number
      const g = await booked('st-gift', { phone: '01700001899', address: 'House 9, Road 2, Dhanmondi, Dhaka 1209', payment: { method: 'mobile', option: 'bkash' }, pay: true, gift: card }); // hardcode-ok: a made-up test number
      const [s] = await print([g.shipmentId]);
      expect(s).toMatchObject({ receiver: { phone: '01700001899', address: 'House 9, Road 2, Dhanmondi, Dhaka 1209' }, gift: { from: 'Rafiq Sender', deliverAfter: day, note: 'Happy Eid!' }, collectMinor: 0 }); // hardcode-ok: a made-up test number
      expect(JSON.stringify(s)).not.toContain('7700');
    } finally {
      f.overrides.delete('checkout.gift');
      f.overrides.delete('delivery.courier.booking');
    }
  });

  it('SIM-F-048: with the owner\'s switch on, a Bengali address carries its Latin line and its English place; never otherwise', async () => {
    const bn = await booked('st-bn', { address: 'বাসা ৪, রোড ৫, ধানমন্ডি, ঢাকা ১২০৯' });
    const en = await booked('st-en');
    const off = await print([bn.shipmentId, en.shipmentId]);
    expect(off.every((p) => p.receiver.addressLatin === null)).toBe(true);
    f.overrides.set('delivery.sticker.latin', { enabled: true });
    try {
      const on = await print([bn.shipmentId, en.shipmentId], { reason: 'latin line check' });
      const line = on.find((p) => p.shipmentId === bn.shipmentId)!.receiver.addressLatin!;
      expect(line.startsWith('Basa 4, Rod 5, Dhanmondi, Dhaka 1209')).toBe(true);
      const order = await db().order.findUniqueOrThrow({ where: { id: bn.orderId }, select: { area: { select: { nameEn: true } } } });
      if (order.area) expect(line).toContain(` · ${order.area.nameEn}`);
      // an address already in Latin letters needs no second line
      expect(on.find((p) => p.shipmentId === en.shipmentId)!.receiver.addressLatin).toBeNull();
    } finally {
      f.overrides.delete('delivery.sticker.latin');
    }
  });

  it('a parcel the courier has picked up is not in the run and is not printed; staff without the permission cannot print', async () => {
    const a = await booked('st-picked');
    await db().shipment.update({ where: { id: a.shipmentId }, data: { status: 'PICKED_UP' } });
    expect((await printRun(f.shippingDeps(), f.shipper)).rows.map((r) => r.shipmentId)).not.toContain(a.shipmentId);
    expect(await refusal(print([a.shipmentId]))).toMatchObject({ code: 'NOT_PRINTABLE', data: { refused: [expect.objectContaining({ problem: 'NOT_WITH_US' })] } });
    expect((await refusal(printStickers(f.shippingDeps(), f.looker, { shipmentIds: [a.shipmentId] }))).code).toBe('FORBIDDEN');
    expect((await refusal(print([]))).code).toBe('INVALID_INPUT');
    expect((await refusal(print(['00000000-0000-7000-8000-000000000000']))).code).toBe('NOT_FOUND');
  });
});
