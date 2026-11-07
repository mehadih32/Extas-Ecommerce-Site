// S08 · PR 184 follow-up 450 on a real PostgreSQL (a throwaway database with the real migrations; an order placed through
// the real checkout and booked with Steadfast on its practice world, in Steadfast's own words; skipped without
// TEST_DATABASE_ADMIN_URL): Steadfast only ever says "cancelled" (returning), so its order stays in transit; "Back at the
// shop" by a person records the parcel returned once, audited, and the order follows (returned, the courier's return
// opened). Only on a returning parcel, only with `delivery.outcomes`. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { bookOrders, markBackAtShop, trackParcel } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('follow-up 450 · back at the shop (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const booked = async (name: string, scenario: 'refused' | 'delivered') => {
    const o = await f.place(name, { phone: `0170000${String(4500 + ++n).padStart(4, '0')}` });
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
    f = await setUpShipping('shipping_back_at_shop');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast returns');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('Steadfast stops at "returning"; Back at the shop makes the parcel returned once and the order follows', async () => {
    const o = await booked('bs-refused', 'refused');
    await reads(o.shipmentId, 8);
    const p = await db().shipment.findUniqueOrThrow({ where: { id: o.shipmentId } });
    expect(p).toMatchObject({ status: 'RETURNING', providerStatus: 'cancelled' });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('IN_TRANSIT');
    expect(await db().returnRecord.count({ where: { orderId: o.orderId } })).toBe(0);

    expect(await code(markBackAtShop(f.shippingDeps(), f.looker, o.shipmentId))).toBe('FORBIDDEN');
    const r = await markBackAtShop(f.shippingDeps(), f.shipper, o.shipmentId);
    expect(r).toMatchObject({ from: 'RETURNING', status: 'RETURNED', changed: true, order: { moved: ['returned'] } });
    expect((await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('RETURNED');
    // the courier's return of PR 189 opened, refused at the door
    expect(await db().returnRecord.findFirstOrThrow({ where: { orderId: o.orderId } })).toMatchObject({ kind: 'REFUSED_AT_DOOR' });
    const staff = await db().shipmentEvent.findMany({ where: { shipmentId: o.shipmentId, source: 'staff' } });
    expect(staff).toEqual([expect.objectContaining({ status: 'RETURNED', rawStatus: 'staff:returned', actorId: f.shipper.actor.staffUserId })]);
    expect(await db().auditLog.count({ where: { action: 'shipment.backAtShop', entityId: o.shipmentId } })).toBe(1);
    // pressed again (another tab): the parcel is back already, nothing more
    expect(await code(markBackAtShop(f.shippingDeps(), f.shipper, o.shipmentId))).toBe('NOT_RETURNING');
    expect(await db().shipmentEvent.count({ where: { shipmentId: o.shipmentId, source: 'staff' } })).toBe(1);
  });

  it('only on a parcel the courier says is returning; another store sees no such parcel', async () => {
    const o = await booked('bs-delivered', 'delivered');
    expect(await code(markBackAtShop(f.shippingDeps(), f.shipper, o.shipmentId))).toBe('NOT_RETURNING');
    expect(await code(markBackAtShop(f.shippingDeps(), f.shipper, '00000000-0000-7000-8000-000000000450'))).toBe('NOT_FOUND');
  });
});
