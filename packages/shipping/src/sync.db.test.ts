// PR 184 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): the order follows its parcel through the order service — picked up → in
// transit (the pick-up is the hand-over), the courier's "out for delivery" once per trip on the timeline, delivered →
// delivered, refused and back → returned, a partial only once a person named the kept pieces; a lost parcel never moves
// the order; the late list (SIM-F-018); the catch-up of an order left behind. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_COURIER_PROVIDER, mockCourierWorld, type MockScenario } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder, getOrder } from '@extas/orders';
import { bookOrders, listParcels, OUT_FOR_DELIVERY_EVENT, syncLagging, syncOrder, trackParcel, trackParcels } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 184 · the order follows its parcel (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(MOCK_COURIER_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(1840 + ++n).padStart(4, '0')}`;
  const status = async (orderId: string) => (await db().order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })).status;
  /** A confirmed order booked with the practice courier on `scenario`; returns the order and its parcel. */
  const booked = async (name: string, scenario: MockScenario = 'delivered', lines?: { variantId: string; quantity?: number }[]) => {
    const o = await f.place(name, { phone: phone(), ...(lines ? { lines } : {}) });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    world.plan(`${o.number}-1`, scenario);
    const r = await bookOrders(f.shippingDeps(), f.shipper, { courierAccountId: courierId, orderIds: [o.orderId] });
    expect(r.results[0]).toMatchObject({ outcome: 'booked' });
    const s = await db().shipment.findFirstOrThrow({ where: { orderId: o.orderId }, orderBy: { createdAt: 'desc' } });
    return { ...o, shipmentId: s.id };
  };
  /** Reads the parcel now ("Read now"), one courier step each time. */
  const read = (shipmentId: string) => trackParcel(f.shippingDeps(), f.shipper, shipmentId);

  beforeAll(async () => {
    f = await setUpShipping('shipping_sync');
    courierId = await f.courier(MOCK_COURIER_PROVIDER, 'Practice sync');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('picked up → in transit (from confirmed: the pick-up is the hand-over), out for delivery once on the timeline, delivered → delivered', async () => {
    const o = await booked('sy-delivered');
    expect(await status(o.orderId)).toBe('CONFIRMED');
    const r1 = await read(o.shipmentId); // PICKED_UP
    expect(r1.order).toMatchObject({ moved: ['courierPickedUp'], waits: null });
    const after = await db().order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(after.status).toBe('IN_TRANSIT');
    expect(after.handedOverAt).not.toBeNull();
    await read(o.shipmentId); // IN_TRANSIT: nothing more to do
    const r3 = await read(o.shipmentId); // OUT_FOR_DELIVERY
    expect(r3.order).toMatchObject({ moved: [], outForDelivery: true });
    // the same trip read again writes nothing more
    expect(await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId })).toMatchObject({ outForDelivery: false });
    const r4 = await read(o.shipmentId); // DELIVERED
    expect(r4.order).toMatchObject({ moved: ['delivered'] });
    expect(await status(o.orderId)).toBe('DELIVERED');
    // a sync of a finished order plans nothing (safe any number of times)
    expect(await syncOrder(f.shippingDeps(), { storeId: f.S, shipmentId: o.shipmentId })).toMatchObject({ moved: [], waits: null });
    const d = await getOrder(f.ordersDeps(), f.staff, o.orderId);
    const types = d.timeline.map((e) => e.type);
    expect(types.filter((t) => t === OUT_FOR_DELIVERY_EVENT)).toHaveLength(1);
    const picked = d.timeline.find((e) => e.type === 'order.courierPickedUp')!;
    expect(picked).toMatchObject({ actorType: 'COURIER', source: `courier:${MOCK_COURIER_PROVIDER}`, fromStatus: 'CONFIRMED', toStatus: 'IN_TRANSIT' });
    expect(picked.data).toMatchObject({ shipmentId: o.shipmentId, courierStatus: 'PICKED_UP' });
    // the order page reads the courier's last word with the parcel
    expect(d.shipments[0]).toMatchObject({ status: 'DELIVERED', providerStatus: expect.any(String) });
    expect(d.shipments[0]!.lastTrackedAt).not.toBeNull();
  });

  it('a second trip after a failed try is its own timeline row; the failed try itself never moves the order', async () => {
    const o = await booked('sy-failed', 'failedAttempt');
    for (let i = 0; i < 4; i++) await read(o.shipmentId); // … OUT_FOR_DELIVERY, ATTEMPT_FAILED
    const p = await db().shipment.findUniqueOrThrow({ where: { id: o.shipmentId } });
    expect(p).toMatchObject({ status: 'ATTEMPT_FAILED', exceptionKey: 'receiverUnreachable' });
    expect(await status(o.orderId)).toBe('IN_TRANSIT');
    await read(o.shipmentId); // OUT_FOR_DELIVERY again
    await read(o.shipmentId); // DELIVERED
    expect(await status(o.orderId)).toBe('DELIVERED');
    expect(await db().orderEvent.count({ where: { orderId: o.orderId, type: OUT_FOR_DELIVERY_EVENT } })).toBe(2);
  });

  it('refused at the door and back → returned; a lost parcel stays in transit for a person', async () => {
    const back = await booked('sy-refused', 'refused');
    for (let i = 0; i < 5; i++) await read(back.shipmentId);
    expect((await db().shipment.findUniqueOrThrow({ where: { id: back.shipmentId } })).status).toBe('RETURNED');
    expect(await status(back.orderId)).toBe('RETURNED');
    const lost = await booked('sy-lost', 'lost');
    for (let i = 0; i < 3; i++) await read(lost.shipmentId);
    expect((await db().shipment.findUniqueOrThrow({ where: { id: lost.shipmentId } })).status).toBe('LOST');
    expect(await status(lost.orderId)).toBe('IN_TRANSIT');
  });

  it('a partial waits for the kept pieces a person named at the door; the catch-up then moves the order', async () => {
    const o = await booked('sy-partial', 'partial', [{ variantId: f.v.skyM }, { variantId: f.v.teeM }]);
    for (let i = 0; i < 4; i++) await read(o.shipmentId);
    expect((await db().shipment.findUniqueOrThrow({ where: { id: o.shipmentId } })).status).toBe('PARTIALLY_DELIVERED');
    expect(await status(o.orderId)).toBe('IN_TRANSIT');
    expect((await syncLagging(f.shippingDeps(), f.S, 50)).moved).toBe(0);
    const kept = (await db().orderItem.findFirstOrThrow({ where: { orderId: o.orderId, variantId: f.v.skyM } })).id;
    await db().codCollection.create({
      data: { storeId: f.S, orderId: o.orderId, shipmentId: o.shipmentId, outcome: 'PARTIAL', state: 'RECORDED', expectedMinor: 1000, collectedMinor: 500, keptItemIds: [kept], source: 'staff', idempotencyKey: `door-${o.orderId}`, occurredAt: f.clock.now }, // hardcode-ok: made-up test amounts
    });
    const caught = await syncLagging(f.shippingDeps(), f.S, 50);
    expect(caught.moved).toBeGreaterThanOrEqual(1);
    expect(await status(o.orderId)).toBe('PARTIALLY_DELIVERED');
  });

  it('SIM-F-018: a parcel past its band\'s promise is in the late list until it is delivered', async () => {
    const o = await booked('sy-late');
    await read(o.shipmentId);
    const late = () => listParcels(f.shippingDeps(), f.shipper, { view: 'late' });
    expect((await late()).rows.map((r) => r.id)).not.toContain(o.shipmentId);
    f.clock.now = new Date(f.clock.now.getTime() + 49 * 3_600_000);
    const now = await late();
    expect(now.rows.map((r) => r.id)).toContain(o.shipmentId);
    expect(now.counts.late).toBeGreaterThanOrEqual(1);
    // the owner's grace hours push the promise out
    f.overrides.set('account.track.late', { enabled: true, graceHours: 72 });
    try {
      expect((await late()).rows.map((r) => r.id)).not.toContain(o.shipmentId);
    } finally {
      f.overrides.delete('account.track.late');
    }
    for (let i = 0; i < 3; i++) await read(o.shipmentId);
    expect((await late()).rows.map((r) => r.id)).not.toContain(o.shipmentId);
  });

  it('the worker\'s run reads the due parcels and moves their orders', async () => {
    const o = await booked('sy-worker');
    f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
    const run = await trackParcels(f.shippingDeps(), f.S);
    expect(run).toMatchObject({ off: false, failed: 0 });
    expect(run.ordersMoved).toBeGreaterThanOrEqual(1);
    expect(await status(o.orderId)).toBe('IN_TRANSIT');
  });
});
