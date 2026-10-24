// PR 176 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): booking with Steadfast on its practice world (no keys in the test) through
// the order service — "Book all" never books a cancelled, held, unconfirmed or in-review order (SIM-F-002, SIM-F-014);
// the amount due and the parcel are frozen once booked, every edit refused (SIM-F-004); a gift goes to its receiver with
// the gift line and waits for its day (SIM-F-007); the pieces' weight (SIM-F-029); a refused booking, a lost answer
// recovered by reference (never booked twice); status polling with Steadfast's exceptions (SIM-F-017). Every value is a
// made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { addLine, cancelOrder, confirmOrder, editOrder, holdOrder } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { bookOrders, readyToBook, retryBooking, trackParcel, trackParcels, updateCourier } from './index';
import { addDays, localDay } from './pure';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const GIFT_ON = { enabled: true, advance: { required: true, type: 'full', amountMinor: null, percent: null }, noteMaxChars: 200, deliverAfterMaxDays: 30, hidePricesDefault: true };

describe.skipIf(!HAS_TEST_DB)('PR 176 · booking and tracking with Steadfast (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(1760 + ++n).padStart(4, '0')}`;
  const confirmed = async (name: string, opts: Parameters<ShippingFixture['place']>[1] = {}) => {
    const o = await f.place(name, { phone: phone(), ...opts });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return o;
  };
  const book = (orderIds: string[], courier = courierId) => bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courier, orderIds });
  const shipments = (orderId: string) => db().shipment.findMany({ where: { orderId }, orderBy: { attempt: 'asc' } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_book');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('SIM-F-002, SIM-F-014: "Book all" books only the orders ready to book — never cancelled, held, unconfirmed or in review', async () => {
    const ready = await confirmed('ba-ready');
    const cancelled = await confirmed('ba-cancelled');
    await cancelOrder(f.ordersDeps(), f.staff, cancelled.orderId, { reasonCode: 'NOT_ORDERED' });
    const held = await confirmed('ba-held');
    await holdOrder(f.ordersDeps(), f.staff, held.orderId, { reasonKey: 'customer-wait' });
    const placed = await f.place('ba-placed', { phone: phone() });
    const review = await confirmed('ba-review');
    const alert = await db().fraudAlert.create({ data: { storeId: f.S, orderId: review.orderId, matchedOrderIds: [], severity: 'high', proposedAction: 'HOLD', status: 'OPEN', summary: { section: 'duplicate' } } });

    const preview = await readyToBook(f.shippingDeps(), f.shipper);
    expect(preview.rows.map((r) => r.orderId)).toEqual([ready.orderId]);
    expect(preview).toMatchObject({ total: 1, giftsWaiting: 0, perPress: shippingSettings['delivery.courier.booking'].default.maxPerRun });
    expect(preview.rows[0]).toMatchObject({ problems: [], codMinor: expect.any(Number) });

    const all = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, all: true });
    expect(all.results.map((r) => [r.orderId, r.outcome])).toEqual([[ready.orderId, 'booked']]);
    expect(all).toMatchObject({ mode: 'MOCK', counts: { booked: 1, failed: 0, unknown: 0, skipped: 0 }, left: 0 });

    // ticked by hand: the order service refuses each one, and nothing is written for them
    const ticked = await book([cancelled.orderId, held.orderId, placed.orderId, review.orderId]);
    expect(Object.fromEntries(ticked.results.map((r) => [r.orderId, [r.outcome, r.code]]))).toEqual({
      [cancelled.orderId]: ['skipped', 'ILLEGAL_TRANSITION'],
      [held.orderId]: ['skipped', 'ILLEGAL_TRANSITION'],
      [placed.orderId]: ['skipped', 'ILLEGAL_TRANSITION'],
      [review.orderId]: ['skipped', 'IN_REVIEW'],
    });
    expect(await db().shipment.count({ where: { orderId: { in: [cancelled.orderId, held.orderId, placed.orderId, review.orderId] } } })).toBe(0);

    // the review decided: the order is ready to book and books
    await db().fraudAlert.update({ where: { id: alert.id }, data: { status: 'APPROVED' } });
    expect((await readyToBook(f.shippingDeps(), f.shipper)).rows.map((r) => r.orderId)).toEqual([review.orderId]);
    expect((await book([review.orderId])).results[0]).toMatchObject({ outcome: 'booked' });
    // booked once: a second press is refused by the order service
    expect((await book([review.orderId])).results[0]).toMatchObject({ outcome: 'skipped', code: 'BOOKED' });
    expect(await shipments(review.orderId)).toHaveLength(1);
  });

  it('SIM-F-004: the parcel carries the amount due when booked; after booking every edit and added piece is refused', async () => {
    const cod = await confirmed('fz-cod');
    const paid = await f.place('fz-paid', { phone: phone(), payment: { method: 'mobile', option: 'bkash' }, pay: true });
    await confirmOrder(f.ordersDeps(), f.staff, paid.orderId);
    const r = await book([cod.orderId, paid.orderId]);
    expect(r.counts.booked).toBe(2);
    const [codOrder, paidOrder] = await Promise.all([db().order.findUniqueOrThrow({ where: { id: cod.orderId } }), db().order.findUniqueOrThrow({ where: { id: paid.orderId } })]);
    const [codParcel] = await shipments(cod.orderId);
    const [paidParcel] = await shipments(paid.orderId);
    expect(codParcel).toMatchObject({ status: 'IN_REVIEW', providerStatus: 'in_review', codAmountMinor: codOrder.totalMinor - codOrder.walletAppliedMinor - codOrder.paidMinor, mode: 'MOCK', attempt: 1, merchantRef: `${codOrder.number}-1`, bookedById: f.staffId });
    expect(codParcel!.consignmentId).toMatch(/^MOCK-SF-/);
    expect(paidParcel!.codAmountMinor).toBe(0);
    expect(world.byRef(`${codOrder.number}-1`)).toMatchObject({ codMinor: codParcel!.codAmountMinor });
    expect(world.byRef(`${paidOrder.number}-1`)).toMatchObject({ codMinor: 0 });
    expect(codOrder.courierAccountId).toBe(courierId);
    // the order's own status is the order service's: still confirmed
    expect(codOrder.status).toBe('CONFIRMED');
    expect(await code(editOrder(f.ordersDeps(), f.staff, cod.orderId, { reasonKey: 'wrong-phone', phone: '01700001799' }, { version: codOrder.version }))).toBe('BOOKED'); // hardcode-ok: a made-up test number
    expect(await code(addLine(f.ordersDeps(), f.staff, cod.orderId, { variantId: f.v.teeM }))).toBe('BOOKED');
    expect((await db().order.findUniqueOrThrow({ where: { id: cod.orderId } })).totalMinor).toBe(codOrder.totalMinor);
    // audit and timeline
    expect(await db().auditLog.count({ where: { entityId: codParcel!.id, action: 'shipment.booked' } })).toBe(1);
    expect(await db().shipmentEvent.count({ where: { shipmentId: codParcel!.id, source: 'booking' } })).toBe(1);
  });

  it('SIM-F-007: a gift goes to its receiver with the gift line, never the sender\'s contact, and waits for its booking day', async () => {
    f.overrides.set('checkout.gift', GIFT_ON);
    const timeZone = await f.deps().settings.value('store.timeZone');
    const day = addDays(localDay(f.clock.now, timeZone), 3);
    try {
      const card = { senderName: 'Rafiq Sender', senderContact: '+44 7700 900123', note: 'Happy Eid!', deliverAfter: day }; // hardcode-ok: a made-up test number
      const g = await f.place('gift-1', { phone: '01700001790', address: 'House 9, Road 2, Dhanmondi, Dhaka 1209', payment: { method: 'mobile', option: 'bkash' }, pay: true, gift: card }); // hardcode-ok: a made-up test number
      await confirmOrder(f.ordersDeps(), f.staff, g.orderId);
      const preview = await readyToBook(f.shippingDeps(), f.shipper);
      expect(preview.rows.map((r) => r.orderId)).not.toContain(g.orderId);
      expect(preview.giftsWaiting).toBe(1);
      expect((await book([g.orderId])).results[0]).toMatchObject({ outcome: 'skipped', code: 'GIFT_DATE', data: { bookFrom: day } });
      expect((await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, all: true })).results.map((r) => r.orderId)).not.toContain(g.orderId);

      // the owner books gifts three days ahead: it is due today
      f.overrides.set('delivery.courier.booking', { ...shippingSettings['delivery.courier.booking'].default, giftLeadDays: 3 });
      const r = await book([g.orderId]);
      expect(r.results[0]).toMatchObject({ outcome: 'booked' });
      const order = await db().order.findUniqueOrThrow({ where: { id: g.orderId } });
      const sent = world.byRef(`${order.number}-1`)!;
      expect(sent.receiver).toEqual({ name: order.customerName, phone: '01700001790', address: 'House 9, Road 2, Dhanmondi, Dhaka 1209' }); // hardcode-ok: a made-up test number
      expect(sent.note).toBe(`Gift from Rafiq Sender: deliver on or after ${day}. Happy Eid!`);
      expect(JSON.stringify(sent)).not.toContain('7700');
      const [parcel] = await shipments(g.orderId);
      expect(parcel!.receiver).toMatchObject({ phone: '01700001790', gift: { senderName: 'Rafiq Sender', deliverAfter: day } }); // hardcode-ok: a made-up test number
      expect(parcel!.bookingNote).toBe(sent.note);
    } finally {
      f.overrides.delete('checkout.gift');
      f.overrides.delete('delivery.courier.booking');
    }
  });

  it('SIM-F-029: the parcel weighs its pieces (2.1 kg sent as 2100 g); an unknown piece weight is never guessed', async () => {
    await db().productVariant.update({ where: { id: f.v.skyM }, data: { weightGrams: 700 } });
    await db().productVariant.update({ where: { id: f.v.linenM }, data: { weightGrams: null } });
    const heavy = await confirmed('w-heavy', { lines: [{ variantId: f.v.skyM, quantity: 3 }] });
    const unknown = await confirmed('w-unknown', { lines: [{ variantId: f.v.skyM }, { variantId: f.v.linenM }] });
    await book([heavy.orderId, unknown.orderId]);
    const [h] = await shipments(heavy.orderId);
    const [u] = await shipments(unknown.orderId);
    expect(h!.weightGrams).toBe(2100);
    expect(world.byRef(h!.merchantRef!)).toMatchObject({ weightGrams: 2100, itemCount: 3 });
    expect(world.byRef(h!.merchantRef!)!.description).toContain('x3');
    expect(u!.weightGrams).toBeNull();
    expect(world.byRef(u!.merchantRef!)).toMatchObject({ weightGrams: null, itemCount: 2 });
    expect(h!.declaredValueMinor).toBeGreaterThan(0);
  });

  it('a refused booking fails the parcel and the order is ready again; a lost answer is recovered by reference, never booked twice', async () => {
    const a = await confirmed('rt-refused');
    world.failNext('error');
    expect((await book([a.orderId])).results[0]).toMatchObject({ outcome: 'failed', code: 'COURIER_REFUSED' });
    const [failed] = await shipments(a.orderId);
    expect(failed).toMatchObject({ status: 'BOOKING_FAILED', consignmentId: null });
    expect(failed!.bookingError).toContain('refused');
    expect(await db().orderEvent.count({ where: { orderId: a.orderId, type: 'shipment.bookingFailed' } })).toBe(1);
    expect((await readyToBook(f.shippingDeps(), f.shipper)).rows.map((r) => r.orderId)).toContain(a.orderId);
    const again = await retryBooking(f.shippingDeps(), f.shipper, failed!.id);
    expect(again).toMatchObject({ outcome: 'booked' });
    const both = await shipments(a.orderId);
    expect(both.map((s) => [s.attempt, s.status])).toEqual([
      [1, 'BOOKING_FAILED'],
      [2, 'IN_REVIEW'],
    ]);
    expect(both[1]!.merchantRef).toMatch(/-2$/);
    // the failed try is history now
    expect(await code(retryBooking(f.shippingDeps(), f.shipper, failed!.id))).toBe('NOT_RETRYABLE');

    const b = await confirmed('rt-timeout');
    world.failNext('timeout');
    expect((await book([b.orderId])).results[0]).toMatchObject({ outcome: 'unknown', code: 'NO_ANSWER' });
    const [lost] = await shipments(b.orderId);
    expect(lost).toMatchObject({ status: 'BOOKING', consignmentId: null });
    // while the answer is unknown the order counts as booked: no second parcel, no edits
    expect((await book([b.orderId])).results[0]).toMatchObject({ outcome: 'skipped', code: 'BOOKED' });
    const recovered = await retryBooking(f.shippingDeps(), f.shipper, lost!.id);
    expect(recovered).toMatchObject({ outcome: 'booked', shipmentId: lost!.id, data: { recovered: true } });
    expect(await shipments(b.orderId)).toHaveLength(1);
    expect((await shipments(b.orderId))[0]).toMatchObject({ status: 'IN_REVIEW', bookingError: null });
    expect(world.booked().filter((p) => p.parcel.merchantRef === lost!.merchantRef)).toHaveLength(1);
    // a parcel the courier holds is not "tried again"
    expect(await code(retryBooking(f.shippingDeps(), f.shipper, lost!.id))).toBe('NOT_RETRYABLE');
  });

  it('refusals: a switched-off courier, no permission, too many in one press, a receiver the courier cannot call', async () => {
    const o = await confirmed('rf-1');
    expect(await code(bookOrders(f.shippingDeps(), f.looker, { courierAccountId: courierId, orderIds: [o.orderId] }))).toBe('FORBIDDEN');
    expect(await code(bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId }))).toBe('INVALID_INPUT');
    const off = await f.courier(STEADFAST_PROVIDER, 'Steadfast off');
    await updateCourier(f.shippingDeps(), f.shipper, off, { enabled: false });
    expect(await code(book([o.orderId], off))).toBe('COURIER_OFF');
    f.overrides.set('delivery.courier.booking', { ...shippingSettings['delivery.courier.booking'].default, maxPerRun: 1 });
    try {
      expect(await code(book([o.orderId, (await confirmed('rf-2')).orderId]))).toBe('TOO_MANY');
    } finally {
      f.overrides.delete('delivery.courier.booking');
    }
    await db().order.update({ where: { id: o.orderId }, data: { shippingAddressText: '  ', backfilledAddress: null } });
    expect((await book([o.orderId])).results[0]).toMatchObject({ outcome: 'skipped', code: 'NO_RECEIVER', data: { missing: ['address'] } });
  });

  it('SIM-F-017: polling reads each due parcel once per interval; Steadfast\'s "hold" is a failed try with its reason', async () => {
    const o = await confirmed('tr-hold');
    const number = (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).number;
    world.plan(`${number}-1`, 'failedAttempt');
    await book([o.orderId]);
    const [p] = await shipments(o.orderId);
    const seen: string[] = [];
    let exception: { status: string; key: string | null } | null = null;
    for (let i = 0; i < 8; i++) {
      f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
      const run = await trackParcels(f.shippingDeps(), f.S);
      expect(run).toMatchObject({ off: false, failed: 0 });
      const s = await db().shipment.findUniqueOrThrow({ where: { id: p!.id } });
      seen.push(s.status);
      if (s.status === 'ATTEMPT_FAILED') exception = { status: s.status, key: s.exceptionKey };
    }
    expect(exception).toEqual({ status: 'ATTEMPT_FAILED', key: 'receiverAskedLater' });
    expect(seen[seen.length - 1]).toBe('DELIVERED');
    const final = await db().shipment.findUniqueOrThrow({ where: { id: p!.id } });
    expect(final).toMatchObject({ providerStatus: 'delivered', codCollectedMinor: null });
    expect(final.deliveredAt).not.toBeNull();
    // read within the interval: nothing is due
    const quiet = await trackParcels(f.shippingDeps(), f.S);
    expect(quiet.read).toBe(0);
    // switched off: nothing is read; staff can still read a parcel the courier holds now
    f.overrides.set('delivery.courier.tracking', { enabled: false, everyMinutes: 60, batch: 200 });
    try {
      expect(await trackParcels(f.shippingDeps(), f.S)).toMatchObject({ off: true, read: 0 });
    } finally {
      f.overrides.delete('delivery.courier.tracking');
    }
    expect(await code(trackParcel(f.shippingDeps(), f.shipper, p!.id))).toBe('NOT_ACTIVE');
    const live = await confirmed('tr-now');
    await book([live.orderId]);
    const [lp] = await shipments(live.orderId);
    expect(await trackParcel(f.shippingDeps(), f.shipper, lp!.id)).toMatchObject({ from: 'IN_REVIEW', status: 'IN_TRANSIT', changed: true });
    expect(await code(trackParcel(f.shippingDeps(), f.looker, lp!.id))).toBe('FORBIDDEN');
  });
});
