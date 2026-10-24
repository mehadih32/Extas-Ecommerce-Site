// PR 526 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): why a parcel came back. The courier's word on a door outcome is kept as the
// rider's note on its event; a person records the reason from the owner's list with the rider's note on the parcel's
// one return record (refused at the door, or the delivery charge paid); recording again replaces it, logged; only a
// parcel that came back takes a reason; the phone history reads it. Nothing moves money. Every value is a made-up test
// value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_COURIER_PROVIDER, mockCourierWorld } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, refusalKeys } from '@extas/orders';
import { applyEvents, bookOrders, RETURN_REASON_EVENT, recordReturnReason, returnReasonOf, syncOrder, trackParcel } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 526 · why a parcel came back (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(MOCK_COURIER_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(5260 + ++n).padStart(4, '0')}`;
  const booked = async (name: string, scenario: 'refused' | 'partial' | 'delivered' | 'failedAttempt') => {
    const o = await f.place(name, { phone: phone() });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    world.plan(`${o.number}-1`, scenario);
    await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId }, orderBy: { createdAt: 'desc' } });
    return { ...o, shipmentId: s.id };
  };
  const reads = async (shipmentId: string, times: number) => {
    for (let i = 0; i < times; i++) await trackParcel(f.shippingDeps(), f.shipper, shipmentId);
  };

  beforeAll(async () => {
    f = await setUpShipping('shipping_returns');
    courierId = await f.courier(MOCK_COURIER_PROVIDER, 'Practice returns');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it("SIM-F-038: the rider's note is kept; the reason goes on the parcel's one return record, the timeline and the phone history", async () => {
    const o = await booked('rr-refused', 'refused');
    await reads(o.shipmentId, 5); // picked up, in transit, out for delivery, returning, returned
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('RETURNED');
    const noted = await db().shipmentEvent.findMany({ where: { shipmentId: o.shipmentId, riderNote: { not: null } }, select: { status: true, riderNote: true } });
    expect(noted).toEqual([{ status: 'RETURNING', riderNote: 'refused at the door' }]);
    expect(await returnReasonOf(f.shippingDeps(), f.S, o.orderId)).toEqual({ shipmentId: o.shipmentId, returnId: null, reasonKey: null, riderNote: 'refused at the door' });

    expect(await code(recordReturnReason(f.shippingDeps(), f.looker, o.shipmentId, { reasonKey: 'did-not-like' }))).toBe('FORBIDDEN');
    expect(await code(recordReturnReason(f.shippingDeps(), f.shipper, o.shipmentId, { reasonKey: 'no-such-reason' }))).toBe('INVALID_INPUT');
    expect(await code(recordReturnReason(f.shippingDeps(), f.shipper, o.shipmentId, { reasonKey: 'other' }))).toBe('INVALID_INPUT'); // "other" needs the words

    const r = await recordReturnReason(f.shippingDeps(), f.shipper, o.shipmentId, { reasonKey: 'did-not-like' });
    expect(r).toMatchObject({ reasonKey: 'did-not-like', riderNote: 'refused at the door', created: true });
    const ret = await db().returnRecord.findUniqueOrThrow({ where: { id: r.returnId } });
    expect(ret).toMatchObject({ orderId: o.orderId, shipmentId: o.shipmentId, kind: 'REFUSED_AT_DOOR', reasonCode: 'did-not-like', riderNote: 'refused at the door', courierClaim: 'RETURNED', chargePaidMinor: 0, mismatch: false });
    expect(await refusalKeys(f.ordersDeps(), f.S, [o.orderId])).toEqual(new Map([[o.orderId, 'did-not-like']]));

    // recorded again: the same record, the reason replaced, both in the log
    const again = await recordReturnReason(f.shippingDeps(), f.shipper, o.shipmentId, { reasonKey: 'ordered-by-mistake', note: 'his brother ordered it' });
    expect(again).toMatchObject({ returnId: r.returnId, created: false, riderNote: 'his brother ordered it' });
    expect(await db().returnRecord.count({ where: { orderId: o.orderId } })).toBe(1);
    const events = await db().orderEvent.findMany({ where: { orderId: o.orderId, type: RETURN_REASON_EVENT }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.reasonCode)).toEqual(['did-not-like', 'ordered-by-mistake']);
    expect(events[1]!.data).toMatchObject({ before: 'did-not-like', returnId: r.returnId });
    expect(await db().auditLog.count({ where: { action: 'delivery.return.reason', entityId: r.returnId } })).toBe(2);
    expect(await refusalKeys(f.ordersDeps(), f.S, [o.orderId])).toEqual(new Map([[o.orderId, 'ordered-by-mistake']]));
    expect(await db().codCollection.count({ where: { orderId: o.orderId } })).toBe(0);
  });

  it('a return with the delivery charge collected is a charge-paid return, the charge noted; a partly delivered parcel takes a reason too', async () => {
    const o = await booked('rr-charge', 'refused');
    await reads(o.shipmentId, 3);
    await applyEvents(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId }, [{ providerEventId: `${o.shipmentId}:back`, status: 'RETURNED', rawStatus: 'returned', occurredAt: new Date(f.clock.now.getTime() + 10 * 60_000), note: 'tried it on, paid the charge', reasonKey: null, codCollectedMinor: 6_000, chargeMinor: null }], 'poll'); // hardcode-ok: made-up test amount
    await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId });
    const r = await recordReturnReason(f.shippingDeps(), f.shipper, o.shipmentId, { reasonKey: 'size-fit' });
    expect(await db().returnRecord.findUniqueOrThrow({ where: { id: r.returnId } })).toMatchObject({ kind: 'CHARGE_PAID_RETURN', chargePaidMinor: 6_000, riderNote: 'tried it on, paid the charge' });

    const p = await booked('rr-partial', 'partial');
    await reads(p.shipmentId, 4);
    expect((await db().shipment.findUniqueOrThrow({ where: { id: p.shipmentId } })).status).toBe('PARTIALLY_DELIVERED');
    const pr = await recordReturnReason(f.shippingDeps(), f.shipper, p.shipmentId, { reasonKey: 'not-as-pictured' });
    expect(await db().returnRecord.findUniqueOrThrow({ where: { id: pr.returnId } })).toMatchObject({ kind: 'REFUSED_AT_DOOR', riderNote: 'kept one piece', courierClaim: 'PARTIALLY_DELIVERED' });
  });

  it('only a parcel that came back takes a reason; a failed try keeps its note but is not a return; the shop\'s own record is completed, not doubled', async () => {
    const d = await booked('rr-delivered', 'failedAttempt');
    await reads(d.shipmentId, 4); // … attempt failed
    expect(await db().shipmentEvent.count({ where: { shipmentId: d.shipmentId, riderNote: 'receiver not answering' } })).toBe(1);
    expect(await code(recordReturnReason(f.shippingDeps(), f.shipper, d.shipmentId, { reasonKey: 'size-fit' }))).toBe('NOT_RETURNED');
    expect(await returnReasonOf(f.shippingDeps(), f.S, d.orderId)).toBeNull();
    expect(await code(recordReturnReason(f.shippingDeps(), f.shipper, '01a16af2-30f0-7462-aab8-719bb3ce51b1', { reasonKey: 'size-fit' }))).toBe('NOT_FOUND');

    const o = await booked('rr-known', 'refused');
    await reads(o.shipmentId, 5);
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    const known = await db().returnRecord.create({ data: { storeId: f.S, orderId: o.orderId, customerId: order.customerId, kind: 'REFUSED_AT_DOOR', receivedAt: f.clock.now } });
    const r = await recordReturnReason(f.shippingDeps(), f.shipper, o.shipmentId, { reasonKey: 'changed-mind' });
    expect(r).toMatchObject({ returnId: known.id, created: false });
    expect(await db().returnRecord.findUniqueOrThrow({ where: { id: known.id } })).toMatchObject({ shipmentId: o.shipmentId, reasonCode: 'changed-mind', riderNote: 'refused at the door' });
    expect(await returnReasonOf(f.shippingDeps(), f.S, o.orderId)).toMatchObject({ returnId: known.id, reasonKey: 'changed-mind' });
  });
});
