// Go-live gate F-004 (follow-up of PR 176) on a real PostgreSQL (orders placed through the real checkout; skipped
// without TEST_DATABASE_ADMIN_URL): money that comes in after booking makes the courier's amount stale. The parcel is
// found while it is still with us (its sticker refuses to print), and "Re-book" — after a person cancelled the old
// consignment with the courier — closes the old parcel (CANCELLED, outcome REBOOKED, who, when, the courier's
// reference, on the timeline and in the audit log) and books the order again with the same courier at the live amount
// due. A parcel that still matches, an order with a cancel asked, and the same press twice are refused; nothing moves
// money and the order is never cancelled. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, deliveryTarget } from '@extas/orders';
import { bookedReceiver, bookOrders, rebookParcel, staleParcelOf, stickerProblem } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('gate F-004 · a stale parcel re-booked (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(4040 + ++n).padStart(4, '0')}`; // hardcode-ok: made-up test numbers
  const booked = async (name: string) => {
    const o = await f.place(name, { phone: phone() });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(r.counts.booked).toBe(1);
    return o;
  };
  const parcels = (orderId: string) => db().shipment.findMany({ where: { orderId }, orderBy: { attempt: 'asc' } });
  // money that came in after booking (what a payment recorded by hand writes on the order)
  const paidLater = (orderId: string, minor: number) => db().order.update({ where: { id: orderId }, data: { paidMinor: { increment: minor } } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_rebook');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('money after booking: the parcel is stale (its sticker refuses), re-booked once at the live amount due', async () => {
    const o = await booked('rb-cod');
    const [first] = await parcels(o.orderId);
    expect(await staleParcelOf(db(), f.S, o.orderId)).toBeNull();
    expect(await code(rebookParcel(f.shippingDeps(), f.shipper, first!.id, { cancelledVia: 'panel' }))).toBe('NOT_STALE');

    await paidLater(o.orderId, 50_000);
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    const due = order.totalMinor - order.walletAppliedMinor - order.paidMinor;
    const stale = await staleParcelOf(db(), f.S, o.orderId);
    expect(stale).toEqual({ shipmentId: first!.id, courierAccountId: courierId, consignmentId: first!.consignmentId, why: 'COD_CHANGED', bookedCodMinor: first!.codAmountMinor, dueMinor: due });
    // the sticker refuses it, as before (SIM-F-004)
    expect(stickerProblem({ status: first!.status, consignmentId: first!.consignmentId, codAmountMinor: first!.codAmountMinor, receiver: bookedReceiver(first!.receiver), order, target: deliveryTarget(order) })).toBe('COD_CHANGED');

    // the person must say how the old consignment was cancelled with the courier
    expect(await code(rebookParcel(f.shippingDeps(), f.shipper, first!.id, {}))).toBe('INVALID_INPUT');
    expect(await code(rebookParcel(f.shippingDeps(), f.shipper, first!.id, { cancelledVia: 'email' }))).toBe('INVALID_INPUT');
    const r = await rebookParcel(f.shippingDeps(), f.shipper, first!.id, { cancelledVia: 'panel', courierRef: 'SF-CXL-0001', note: 'paid the rest by bKash' });
    expect(r).toMatchObject({ cancelledShipmentId: first!.id, booking: { outcome: 'booked', orderId: o.orderId } });

    const [old, next] = await parcels(o.orderId);
    expect(old).toMatchObject({ id: first!.id, status: 'CANCELLED', cancelOutcome: 'REBOOKED', cancelRef: 'SF-CXL-0001', cancelConfirmedById: f.staffId });
    expect(next).toMatchObject({ attempt: 2, codAmountMinor: due, merchantRef: `${order.number}-2` });
    expect(next!.consignmentId).toMatch(/^MOCK-SF-/);
    expect(world.byRef(`${order.number}-2`)).toMatchObject({ codMinor: due });
    expect(await staleParcelOf(db(), f.S, o.orderId)).toBeNull();
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'shipment.rebook' } });
    expect(ev).toMatchObject({ reasonCode: 'COD_CHANGED', message: 'paid the rest by bKash', actorType: 'STAFF' });
    expect(ev.data).toMatchObject({ shipmentId: first!.id, bookedCodMinor: first!.codAmountMinor, dueMinor: due, cancelledVia: 'panel' });
    expect(await db().auditLog.count({ where: { action: 'shipment.rebook', entityId: first!.id } })).toBe(1);
    // the order is the same order, still open; no money moved here
    expect(await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).toMatchObject({ status: order.status, paidMinor: order.paidMinor, cancelledAt: null });
    // the same press again: the old parcel is closed, nothing more happens
    expect(await code(rebookParcel(f.shippingDeps(), f.shipper, first!.id, { cancelledVia: 'panel' }))).toBe('NOT_STALE');
    expect(await parcels(o.orderId)).toHaveLength(2);
  });

  it('an order with a cancel asked is not re-booked: the old parcel stays as it is', async () => {
    const o = await booked('rb-cancel-asked');
    const [first] = await parcels(o.orderId);
    await paidLater(o.orderId, 10_000);
    await db().order.update({ where: { id: o.orderId }, data: { cancelRequestedAt: f.clock.now, cancelRequestReason: 'changed my mind' } });
    expect(await code(rebookParcel(f.shippingDeps(), f.shipper, first!.id, { cancelledVia: 'phone' }))).toBe('CANCEL_REQUESTED');
    expect(await parcels(o.orderId)).toMatchObject([{ id: first!.id, status: first!.status, cancelOutcome: null }]);
  });

  it('an archived order is not re-booked', async () => {
    const o = await booked('rb-archived');
    const [first] = await parcels(o.orderId);
    await paidLater(o.orderId, 10_000);
    await db().order.update({ where: { id: o.orderId }, data: { archivedAt: f.clock.now } });
    expect(await staleParcelOf(db(), f.S, o.orderId)).toBeNull();
    expect(await code(rebookParcel(f.shippingDeps(), f.shipper, first!.id, { cancelledVia: 'phone' }))).toBe('NOT_STALE');
    expect(await parcels(o.orderId)).toHaveLength(1);
  });
});
