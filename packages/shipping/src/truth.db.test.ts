// PR 525 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): the true-delivery check. A "Delivered" the shop's own records contradict
// (the courier collected only the delivery charge, a door record says returned, the return received at the shop) opens
// one check per parcel; while it is open the order is not marked delivered; a person resolves it through the order
// service — really delivered, came back with the charge paid, came back (an order already delivered is corrected) —
// and what really happened is kept beside the courier's claim. Nothing writes a door record or moves money. Every value
// is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_COURIER_PROVIDER, mockCourierWorld } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { applyEvents, bookOrders, CHECK_EVENTS, listDeliveryChecks, resolveDeliveryCheck, syncOrder, trackParcel, trackParcels } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

const ON = { enabled: true, holdOrder: true, lookbackDays: 30 };

describe.skipIf(!HAS_TEST_DB)('PR 525 · the true-delivery check (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(MOCK_COURIER_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(5250 + ++n).padStart(4, '0')}`;
  const status = async (orderId: string) => (await db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })).status;
  const booked = async (name: string) => {
    const o = await f.place(name, { phone: phone() });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    world.plan(`${o.number}-1`, 'delivered');
    await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId }, orderBy: { createdAt: 'desc' } });
    return { ...o, shipmentId: s.id };
  };
  const read = (shipmentId: string) => trackParcel(f.shippingDeps(), f.shipper, shipmentId);
  /** The courier reports the parcel delivered, collecting `collected` (its own words, as a poll would bring them). */
  const courierDelivered = async (o: { shipmentId: string }, collected: number | null) => {
    await applyEvents(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId }, [{ providerEventId: `${o.shipmentId}:dlv`, status: 'DELIVERED', rawStatus: 'delivered', occurredAt: new Date(f.clock.now.getTime() + 10 * 60_000), note: null, reasonKey: null, codCollectedMinor: collected, chargeMinor: null }], 'poll');
    return syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId });
  };
  const checkOf = (shipmentId: string) => db().deliveryCheck.findUnique({ where: { shipmentId } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_truth');
    courierId = await f.courier(MOCK_COURIER_PROVIDER, 'Practice truth');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
    f.overrides.set('delivery.truthCheck', ON);
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('SIM-F-005: "Delivered" with only the delivery charge collected is held; "came back, charge paid" records the truth, no money moves', async () => {
    const o = await booked('tc-charge');
    await read(o.shipmentId); // picked up → in transit
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    const synced = await courierDelivered(o, order.deliveryChargeMinor);
    expect(synced).toMatchObject({ moved: [] });
    expect(await status(o.orderId)).toBe('IN_TRANSIT');
    const c = await checkOf(o.shipmentId);
    expect(c).toMatchObject({ state: 'OPEN', courierClaim: 'DELIVERED', signals: ['CHARGE_ONLY'], collectedMinor: order.deliveryChargeMinor, customerId: order.customerId });
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: CHECK_EVENTS.opened } })).toBe(1);
    // a second read opens nothing more
    await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId });
    expect(await db().deliveryCheck.count({ where: { orderId: o.orderId } })).toBe(1);
    // the list shows it; resolving needs its own key
    const list = await listDeliveryChecks(f.shippingDeps(), f.shipper, { view: 'open' });
    expect(list.rows.map((r) => r.id)).toContain(c!.id);
    expect(list.rows.find((r) => r.id === c!.id)).toMatchObject({ order: { number: o.number }, parcel: { courier: 'Practice truth' } });
    expect(await code(resolveDeliveryCheck(f.shippingDeps(), f.looker, c!.id, { outcome: 'CHARGE_PAID_RETURN' }))).toBe('FORBIDDEN');
    expect(await code(resolveDeliveryCheck(f.shippingDeps(), f.shipper, c!.id, { outcome: 'DELIVERED', refusalKey: 'changed-mind' }))).toBe('INVALID_INPUT');

    const r = await resolveDeliveryCheck(f.shippingDeps(), f.shipper, c!.id, { outcome: 'CHARGE_PAID_RETURN', refusalKey: 'changed-mind', note: 'rider says he tried it on' });
    expect(r).toMatchObject({ orderStep: 'returned', check: { state: 'RESOLVED', resolution: 'CHARGE_PAID_RETURN' } });
    expect(await status(o.orderId)).toBe('RETURNED');
    const ret = await db().returnRecord.findFirstOrThrow({ where: { orderId: o.orderId } });
    expect(ret).toMatchObject({ kind: 'CHARGE_PAID_RETURN', courierClaim: 'DELIVERED', actualOutcome: 'CHARGE_PAID_RETURN', mismatch: true, chargePaidMinor: order.deliveryChargeMinor, reasonCode: 'changed-mind', shipmentId: o.shipmentId });
    expect(await db().codCollection.count({ where: { orderId: o.orderId } })).toBe(0);
    expect(await db().auditLog.count({ where: { action: 'delivery.check.resolve', entityId: c!.id } })).toBe(1);
    expect(await code(resolveDeliveryCheck(f.shippingDeps(), f.shipper, c!.id, { outcome: 'DELIVERED' }))).toBe('ALREADY_RESOLVED');
    // a resolved check never holds or reopens
    expect(await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId })).toMatchObject({ moved: [] });
    expect((await checkOf(o.shipmentId))!.state).toBe('RESOLVED');
  });

  it('a door record that says returned holds the "Delivered"; "really delivered" moves the order on', async () => {
    const o = await booked('tc-door');
    await read(o.shipmentId);
    await db().codCollection.create({
      data: { storeId: f.S, orderId: o.orderId, shipmentId: o.shipmentId, outcome: 'RETURNED', state: 'RECORDED', expectedMinor: 0, collectedMinor: 0, source: 'staff', idempotencyKey: `door-${o.orderId}`, occurredAt: f.clock.now }, // hardcode-ok: made-up test amounts
    });
    await courierDelivered(o, null);
    const c = await checkOf(o.shipmentId);
    expect(c).toMatchObject({ state: 'OPEN', signals: ['DOOR_RETURNED'] });
    expect(await status(o.orderId)).toBe('IN_TRANSIT');
    expect(await resolveDeliveryCheck(f.shippingDeps(), f.shipper, c!.id, { outcome: 'DELIVERED' })).toMatchObject({ orderStep: 'delivered', returnId: null });
    expect(await status(o.orderId)).toBe('DELIVERED');
    expect(await db().returnRecord.count({ where: { orderId: o.orderId } })).toBe(0);
  });

  it('a late sign (the return received at the shop) opens a check on a delivered order; "came back" corrects it, one return per parcel', async () => {
    const o = await booked('tc-late');
    for (let i = 0; i < 4; i++) await read(o.shipmentId);
    expect(await status(o.orderId)).toBe('DELIVERED');
    expect(await checkOf(o.shipmentId)).toBeNull();
    const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    // the shop received the parcel back (PR 189's receive writes this)
    const received = await db().returnRecord.create({ data: { storeId: f.S, orderId: o.orderId, customerId: order.customerId, kind: 'REFUSED_AT_DOOR', receivedAt: f.clock.now } });
    f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
    const run = await trackParcels(f.shippingDeps(), f.S);
    expect(run.checksOpened).toBeGreaterThanOrEqual(1);
    const c = await checkOf(o.shipmentId);
    expect(c).toMatchObject({ state: 'OPEN', signals: ['RETURN_RECEIVED'] });
    expect(await status(o.orderId)).toBe('DELIVERED');
    const r = await resolveDeliveryCheck(f.shippingDeps(), f.shipper, c!.id, { outcome: 'RETURNED', refusalKey: 'size-fit' });
    expect(r).toMatchObject({ orderStep: 'deliveryCorrected', returnId: received.id });
    expect(await status(o.orderId)).toBe('RETURNED');
    const rows = await db().returnRecord.findMany({ where: { orderId: o.orderId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'REFUSED_AT_DOOR', courierClaim: 'DELIVERED', actualOutcome: 'RETURNED', mismatch: true, shipmentId: o.shipmentId, reasonCode: 'size-fit' });
    const ev = await db().orderEvent.findFirstOrThrow({ where: { orderId: o.orderId, type: 'order.deliveryCorrected' } });
    expect(ev).toMatchObject({ fromStatus: 'DELIVERED', toStatus: 'RETURNED', actorType: 'STAFF', reasonCode: 'size-fit' });
  });

  it('off: nothing is checked and the courier\'s "Delivered" moves the order as before', async () => {
    f.overrides.set('delivery.truthCheck', { ...ON, enabled: false });
    try {
      const o = await booked('tc-off');
      await read(o.shipmentId);
      const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      await courierDelivered(o, order.deliveryChargeMinor);
      expect(await checkOf(o.shipmentId)).toBeNull();
      expect(await status(o.orderId)).toBe('DELIVERED');
    } finally {
      f.overrides.set('delivery.truthCheck', ON);
    }
  });

  it('"Hold the order" off: the check opens but the order is marked delivered; the correction still works', async () => {
    f.overrides.set('delivery.truthCheck', { ...ON, holdOrder: false });
    try {
      const o = await booked('tc-nohold');
      await read(o.shipmentId);
      const order = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
      await courierDelivered(o, 0);
      expect(await status(o.orderId)).toBe('DELIVERED');
      const c = await checkOf(o.shipmentId);
      expect(c).toMatchObject({ state: 'OPEN', signals: ['CHARGE_ONLY'] });
      expect(order.paymentMethod).toBe('COD');
      expect(await resolveDeliveryCheck(f.shippingDeps(), f.shipper, c!.id, { outcome: 'RETURNED' })).toMatchObject({ orderStep: 'deliveryCorrected' });
      expect(await status(o.orderId)).toBe('RETURNED');
    } finally {
      f.overrides.set('delivery.truthCheck', ON);
    }
  });
});
