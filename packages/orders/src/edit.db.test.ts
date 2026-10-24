// PR 142 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the team's edit through the one order service.
// Required acceptance tests: SIM-F-037 (staff correct a phone number with a log: before → after, who, when, why, where
// the customer asked, in the timeline and the audit log), SIM-F-038 (the real-life reasons: "did not order" as a cancel
// reason that is never a risk signal, "arrived after Eid" as a refusal reason) and SIM-F-004 (an edit after booking is
// refused, so it never silently diverges from the parcel). Also: a size at the same price with the stock moved, a piece
// taken out with the money consistent, a paid order's overpaid part only a refund REQUEST, the version check, the keys,
// and the duplicate check run again after a phone change (B1.10). Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { cancelOrder, confirmOrder, editChoices, editOrder, orderStep, systemBy } from './index';
import { setUpOrders, type OrdersFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 142 · the team edits an order (PostgreSQL)', () => {
  let f: OrdersFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  const d = () => f.ordersDeps();
  const held = (orderId: string, variantId: string) => db().stockReservation.aggregate({ where: { orderId, variantId, status: 'CONVERTED', releasedAt: null }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0);
  const version = async (id: string) => (await db().order.findUniqueOrThrow({ where: { id }, select: { version: true } })).version;
  const book = (orderId: string) => db().shipment.create({ data: { storeId: f.S, orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', idempotencyKey: randomUUID(), bookedAt: f.clock.now } });

  beforeAll(async () => {
    f = await setUpOrders('edit');
    courierId = (await db().courierAccount.create({ data: { storeId: f.S, providerKey: 'mock', name: 'Test courier', enabled: true } })).id;
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('SIM-F-037: a wrong number is corrected with a log — before → after, who, when, why, where he asked', async () => {
    const o = await f.place('edit-phone', { phone: '01710000071' });
    const v = await version(o.orderId);
    const r = await editOrder(d(), f.staff, o.orderId, { phone: '01710-000072', reasonKey: 'wrong-phone', channel: 'phone-call', note: 'He called from his wife’s phone' }, { version: v });
    expect(r).toMatchObject({ command: 'edit', status: 'PLACED', version: v + 1 });
    const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(after.phone).toBe('+8801710000072');
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.edit' } });
    expect(ev).toMatchObject({ actorType: 'STAFF', actorId: f.staffId, source: 'admin', reasonCode: 'wrong-phone', message: 'He called from his wife’s phone', fromStatus: 'PLACED', toStatus: null });
    expect(ev.data).toMatchObject({ fields: [{ field: 'phone', before: '+8801710000071', after: '+8801710000072' }], channel: { key: 'phone-call' }, reason: { en: expect.any(String), bn: expect.any(String) } });
    const audit = await db().auditLog.findFirstOrThrow({ where: { entityId: o.orderId, action: 'order.edit' } });
    expect(audit).toMatchObject({ actorType: 'STAFF', actorId: f.staffId });
    expect(audit.before).toMatchObject({ phone: '+8801710000071', version: v });
    expect(audit.after).toMatchObject({ phone: '+8801710000072', version: v + 1 });
    // the screen's old version is refused, a stranger's key too, and nothing changes
    expect(await code(editOrder(d(), f.staff, o.orderId, { phone: '01710000073', reasonKey: 'wrong-phone' }, { version: v }))).toBe('STALE');
    expect(await code(editOrder(d(), f.reader, o.orderId, { phone: '01710000073', reasonKey: 'wrong-phone' }))).toBe('FORBIDDEN');
    expect(await code(editOrder(d(), f.staff, o.orderId, { phone: '0171000007', reasonKey: 'wrong-phone' }))).toBe('BAD_PHONE');
    expect(await code(editOrder(d(), f.staff, o.orderId, { phone: '+880 1710-000072', reasonKey: 'wrong-phone' }))).toBe('NOTHING_CHANGED');
    expect(await code(editOrder(d(), f.staff, o.orderId, { phone: '01710000073', reasonKey: 'no-such-reason' }))).toBe('REASON_REQUIRED');
    expect(await code(editOrder(d(), f.staff, o.orderId, { phone: '01710000073', reasonKey: 'other' }))).toBe('REASON_REQUIRED');
    expect(await code(editOrder(d(), f.staff, o.orderId, { phone: '01710000073', reasonKey: 'wrong-phone', channel: 'pigeon' }))).toBe('INVALID_INPUT');
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).phone).toBe('+8801710000072');
  });

  it('name, address and the parcel note: the delivery area and its charge stay exactly as the checkout stored them', async () => {
    const o = await f.place('edit-address');
    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    await db().order.update({ where: { id: o.orderId }, data: { backfilledAddress: 'the old full address' } });
    await editOrder(d(), f.staff, o.orderId, { customerName: 'Rahim Uddin', address: 'House 9, Road 2, Pirganj, Rangpur', deliveryNote: 'Call at the gate', reasonKey: 'address-detail', channel: 'whatsapp' });
    const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(after).toMatchObject({ customerName: 'Rahim Uddin', shippingAddressText: 'House 9, Road 2, Pirganj, Rangpur', note: 'Call at the gate', backfilledAddress: null });
    expect(after).toMatchObject({ areaId: before.areaId, deliveryBandId: before.deliveryBandId, deliveryChargeMinor: before.deliveryChargeMinor, totalMinor: before.totalMinor, codAmountMinor: before.codAmountMinor });
  });

  it('a size at the same price: the line keeps its id and money, the new size is held and the old one let go; never another piece or price', async () => {
    const o = await f.place('edit-size', { lines: [{ variantId: f.v.skyM }] });
    const line = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId } });
    const choices = await editChoices(d(), f.reader, o.orderId);
    expect(choices[0]!.swaps.map((s) => s.variantId)).toContain(f.v.skyL);
    expect(choices[0]!.removeRefusal).toBe('LAST_LINE');
    expect(await held(o.orderId, f.v.skyM)).toBe(1);
    await editOrder(d(), f.staff, o.orderId, { lines: [{ lineId: line.id, variantId: f.v.skyL }], reasonKey: 'size-change' });
    const now = await db().orderItem.findUniqueOrThrow({ where: { id: line.id } });
    expect(now).toMatchObject({ variantId: f.v.skyL, sizeLabel: 'L', unitPriceMinor: line.unitPriceMinor, lineTotalMinor: line.lineTotalMinor, discountMinor: line.discountMinor, status: 'ACTIVE' });
    expect(await held(o.orderId, f.v.skyM)).toBe(0);
    expect(await held(o.orderId, f.v.skyL)).toBe(1);
    expect(await code(editOrder(d(), f.staff, o.orderId, { lines: [{ lineId: line.id, variantId: f.v.linenM }], reasonKey: 'size-change' }))).toBe('NOT_SAME_PIECE');
    const m = await db().productVariant.findUniqueOrThrow({ where: { id: f.v.skyM }, select: { priceMinor: true } });
    await db().productVariant.update({ where: { id: f.v.skyM }, data: { priceMinor: m.priceMinor! + 10_000 } });
    try {
      expect(await code(editOrder(d(), f.staff, o.orderId, { lines: [{ lineId: line.id, variantId: f.v.skyM }], reasonKey: 'size-change' }))).toBe('PRICE_DIFFERS');
    } finally {
      await db().productVariant.update({ where: { id: f.v.skyM }, data: { priceMinor: m.priceMinor } });
    }
    expect(await code(editOrder(d(), f.staff, o.orderId, { lines: [{ lineId: line.id, remove: true }], reasonKey: 'size-change' }))).toBe('LAST_LINE');
  });

  it('a piece taken out: the total and the amount to collect fall by exactly that line, its pieces go back, the line stays (REMOVED)', async () => {
    const o = await f.place('edit-remove', { lines: [{ variantId: f.v.skyM }, { variantId: f.v.teeM }] });
    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(before.discountMinor).toBe(0);
    const tee = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, variantId: f.v.teeM } });
    await editOrder(d(), f.staff, o.orderId, { lines: [{ lineId: tee.id, remove: true }], reasonKey: 'customer-asked', channel: 'phone-call' });
    const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(after).toMatchObject({ subtotalMinor: before.subtotalMinor - tee.lineTotalMinor, totalMinor: before.totalMinor - tee.lineTotalMinor, codAmountMinor: before.codAmountMinor - tee.lineTotalMinor, deliveryChargeMinor: before.deliveryChargeMinor });
    expect((await db().orderItem.findUniqueOrThrow({ where: { id: tee.id } })).status).toBe('REMOVED');
    expect(await held(o.orderId, f.v.teeM)).toBe(0);
    expect(await held(o.orderId, f.v.skyM)).toBe(1);
    expect(await db().refund.count({ where: { orderId: o.orderId } })).toBe(0);
  });

  it('a paid order: what is paid beyond the new total becomes a refund REQUEST for the owner — no money moves', async () => {
    const o = await f.place('edit-paid', { lines: [{ variantId: f.v.skyM }, { variantId: f.v.teeM }], payment: { method: 'mobile', option: 'bkash' }, pay: true });
    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(before.paidMinor).toBe(before.totalMinor);
    const payments = await db().payment.findMany({ where: { orderId: o.orderId }, select: { id: true, status: true, amountMinor: true } });
    const tee = await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, variantId: f.v.teeM } });
    const r = await editOrder(d(), f.staff, o.orderId, { lines: [{ lineId: tee.id, remove: true }], reasonKey: 'customer-asked' });
    expect(r.refundRequestIds).toHaveLength(1);
    const refund = await db().refund.findUniqueOrThrow({ where: { id: r.refundRequestIds[0]! } });
    expect(refund).toMatchObject({ status: 'REQUESTED', amountMinor: tee.lineTotalMinor, source: 'EDIT', requestedById: f.staffId });
    expect(await db().payment.findMany({ where: { orderId: o.orderId }, select: { id: true, status: true, amountMinor: true } })).toEqual(payments);
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).paidMinor).toBe(before.paidMinor);
  });

  it('SIM-F-004: once a courier is booked every edit is refused (the parcel is the parcel), and nothing changes', async () => {
    const o = await f.place('edit-booked');
    await confirmOrder(d(), f.staff, o.orderId);
    await book(o.orderId);
    const before = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    const e = await editOrder(d(), f.staff, o.orderId, { address: 'House 1, Village Road, Pirganj, Rangpur', reasonKey: 'address-detail' }).catch((x) => x);
    expect(e.code).toBe('BOOKED');
    expect(e.data.allowed).toContain('cancelAfterBooking');
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).toEqual(before);
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: 'order.edit' } })).toBe(0);
  });

  it('B1.10: a phone changed to a number with an open look-alike order runs the duplicate check again and opens a review', async () => {
    const first = await f.place('edit-dup-1', { phone: '01810000001' });
    const second = await f.place('edit-dup-2', { phone: '01810000002' });
    await editOrder(d(), f.staff, second.orderId, { phone: '01810000001', reasonKey: 'wrong-phone' });
    const check = await db().orderEvent.findFirstOrThrow({ where: { orderId: second.orderId, type: 'order.duplicateCheck' } });
    expect(check).toMatchObject({ actorType: 'STAFF', actorId: f.staffId });
    expect(check.data).toMatchObject({ after: 'edit', matches: [{ orderId: first.orderId, severity: 'high' }] });
    expect(await db().fraudAlert.count({ where: { orderId: second.orderId, status: 'OPEN' } })).toBe(1);
    // the review now holds the confirm; a second edit makes no second open review
    expect(await code(confirmOrder(d(), f.staff, second.orderId))).toBe('IN_REVIEW');
    await editOrder(d(), f.staff, second.orderId, { customerName: 'Another Name', phone: '01810000001 ', reasonKey: 'customer-asked' });
    expect(await db().fraudAlert.count({ where: { orderId: second.orderId } })).toBe(1);
  });

  it('SIM-F-038: "did not order" cancels without a risk signal; a refused parcel records "arrived after Eid"', async () => {
    const a = await f.place('edit-not-ordered');
    await cancelOrder(d(), f.staff, a.orderId, { reasonCode: 'NOT_ORDERED' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: a.orderId, type: 'order.cancel' } });
    expect(ev.reasonCode).toBe('NOT_ORDERED');
    expect(ev.data).toMatchObject({ riskSignal: false });

    const b = await f.place('edit-refused');
    const by = systemBy('test');
    const ref = { storeId: f.S, orderId: b.orderId };
    await confirmOrder(d(), f.staff, b.orderId);
    await orderStep(d(), ref, by, 'pack');
    await book(b.orderId);
    await orderStep(d(), ref, by, 'handover');
    expect(await code(orderStep(d(), ref, by, 'returned', { refusalKey: 'no-such' }))).toBe('REASON_REQUIRED');
    expect(await code(orderStep(d(), ref, by, 'courierPickedUp', { refusalKey: 'after-eid' }))).toBe('INVALID_INPUT');
    await orderStep(d(), ref, by, 'returned', { refusalKey: 'after-eid' });
    const ret = await db().orderEvent.findFirstOrThrow({ where: { orderId: b.orderId, type: 'order.returned' } });
    expect(ret.reasonCode).toBe('after-eid');
    expect(ret.data).toMatchObject({ refusal: { en: 'Arrived after Eid' } });
  });
});
