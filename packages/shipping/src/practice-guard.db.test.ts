// S28 · PR 706 (CN-049) on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a practice order is "booked" on paper
// only. The courier is never called (its world sees no parcel), the parcel is marked practice and MOCK with a PRACTICE-
// consignment, it is not read from any courier afterwards, and a real order booked in the same press still goes to the
// courier. (The practice flag cannot be changed on a stored order, so the test switches that one guard off for its set-up.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { bookOrders, trackParcel, trackParcels } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('practice orders are never booked at a courier (PR 706)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const confirmed = async (name: string, practice: boolean) => {
    const o = await f.place(name, {
      phone: `0170000${String(1900 + ++n).padStart(4, '0')}`,
    });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    if (practice) {
      await db().$executeRawUnsafe('ALTER TABLE "Order" DISABLE TRIGGER "Order_practice_fixed"');
      await db().$executeRawUnsafe(`UPDATE "Order" SET "isPractice" = true WHERE "id" = '${o.orderId}'::uuid`);
      await db().$executeRawUnsafe('ALTER TABLE "Order" ENABLE TRIGGER "Order_practice_fixed"');
    }
    return o;
  };

  beforeAll(async () => {
    f = await setUpShipping('shipping_practice');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('books a practice order on paper: no parcel at the courier, a MOCK practice parcel here; a real order still goes to the courier', async () => {
    const practice = await confirmed('pg-practice', true);
    const real = await confirmed('pg-real', false);
    const r = await bookOrders(f.shippingDeps(), f.shipper, {
      courierAccountId: courierId,
      orderIds: [practice.orderId, real.orderId],
    });
    expect(Object.fromEntries(r.results.map((x) => [x.orderId, x.outcome]))).toEqual({ [practice.orderId]: 'booked', [real.orderId]: 'booked' });
    // the courier saw the real parcel only
    expect(world.booked()).toHaveLength(1);
    const pShip = await db().shipment.findFirstOrThrow({
      where: { orderId: practice.orderId },
    });
    expect(pShip).toMatchObject({
      isPractice: true,
      mode: 'MOCK',
      status: 'PENDING_PICKUP',
    });
    expect(pShip.consignmentId).toMatch(/^PRACTICE-/);
    expect(world.booked().some((b) => b.consignmentId === pShip.consignmentId)).toBe(false);
    const rShip = await db().shipment.findFirstOrThrow({
      where: { orderId: real.orderId },
    });
    expect(rShip.isPractice).toBe(false);
  });

  it('a practice parcel is never read from a courier: the tracking sweep skips it and one-parcel tracking refuses it', async () => {
    const pShip = await db().shipment.findFirstOrThrow({
      where: { isPractice: true },
    });
    await trackParcels(f.shippingDeps(), f.S);
    expect((await db().shipment.findUniqueOrThrow({ where: { id: pShip.id } })).lastTrackedAt).toBeNull();
    await expect(trackParcel(f.shippingDeps(), f.shipper, pShip.id)).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
  });
});
