// PR 177 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): Pathao, the second courier, on its practice world beside Steadfast — the
// same booking and tracking code for both, Pathao's zone ids from the area mapping, a parcel without a weight never sent
// to a courier that charges by weight (SIM-F-029), and Pathao's exceptions read by the same poll (SIM-F-017). Every value
// is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, PATHAO_PROVIDER, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { bookOrders, listCouriers, recordException, trackParcels } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 177 · Pathao beside Steadfast (PostgreSQL)', () => {
  let f: ShippingFixture;
  let pathao: string;
  let steadfast: string;
  const pt = mockCourierWorld(PATHAO_PROVIDER);
  const sf = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const confirmed = async (name: string, lines?: { variantId: string; quantity?: number }[]) => {
    const o = await f.place(name, { phone: `0170000${String(1780 + ++n).padStart(4, '0')}`, ...(lines ? { lines } : {}) });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return o;
  };
  const book = (courierAccountId: string, orderIds: string[]) => bookOrders(f.shippingDeps(), f.shipper, { courierAccountId, orderIds });
  const parcelOf = async (orderId: string) => db().shipment.findFirstOrThrow({ where: { orderId }, orderBy: { attempt: 'desc' } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_pathao');
    pathao = await f.courier(PATHAO_PROVIDER, 'Pathao main');
    steadfast = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    for (const w of [pt, sf]) {
      w.reset();
      w.useClock(() => f.clock.now.getTime());
    }
    await db().productVariant.updateMany({ where: { id: { in: [f.v.skyM, f.v.whiteM] } }, data: { weightGrams: 350 } });
    await db().productVariant.update({ where: { id: f.v.linenM }, data: { weightGrams: null } });
  });
  afterAll(async () => {
    pt.reset();
    sf.reset();
    await f?.t.drop();
  });

  it('two couriers side by side: each on its practice world, each booked by the same press, each in its own words', async () => {
    const list = await listCouriers(f.shippingDeps(), f.looker);
    expect(list.providers).toEqual(expect.arrayContaining([STEADFAST_PROVIDER, PATHAO_PROVIDER]));
    expect(list.couriers.filter((c) => [pathao, steadfast].includes(c.id)).map((c) => c.mode)).toEqual(['MOCK', 'MOCK']);
    const a = await confirmed('pt-a');
    const b = await confirmed('pt-b');
    expect((await book(pathao, [a.orderId])).results[0]).toMatchObject({ outcome: 'booked' });
    expect((await book(steadfast, [b.orderId])).results[0]).toMatchObject({ outcome: 'booked' });
    const [pa, pb] = await Promise.all([parcelOf(a.orderId), parcelOf(b.orderId)]);
    expect(pa).toMatchObject({ courierAccountId: pathao, status: 'PENDING_PICKUP', providerStatus: 'Pickup_Requested', mode: 'MOCK', weightGrams: 350 });
    expect(pa.consignmentId).toMatch(/^MOCK-PT-/);
    expect(pb).toMatchObject({ courierAccountId: steadfast, status: 'IN_REVIEW', providerStatus: 'in_review' });
    expect(pb.consignmentId).toMatch(/^MOCK-SF-/);
    expect((await db().order.findUniqueOrThrow({ where: { id: a.orderId } })).courierAccountId).toBe(pathao);
  });

  it('Pathao gets its own zone ids from the area mapping; Steadfast, which takes none, gets none', async () => {
    const area = await db().geoArea.findFirstOrThrow({ select: { id: true } });
    await db().courierAreaMapping.create({ data: { storeId: f.S, courierAccountId: pathao, areaId: area.id, courierCityId: '1', courierZoneId: '52', courierAreaId: '1033' } });
    await db().courierAreaMapping.create({ data: { storeId: f.S, courierAccountId: steadfast, areaId: area.id, courierCityId: 'x', courierZoneId: 'y', courierAreaId: 'z' } });
    const a = await confirmed('pt-zone');
    const b = await confirmed('sf-zone');
    await db().order.updateMany({ where: { id: { in: [a.orderId, b.orderId] } }, data: { areaId: area.id } });
    await book(pathao, [a.orderId]);
    await book(steadfast, [b.orderId]);
    const [pa, pb] = await Promise.all([parcelOf(a.orderId), parcelOf(b.orderId)]);
    expect(pa).toMatchObject({ courierCityId: '1', courierZoneId: '52', courierAreaId: '1033' });
    expect(pt.byRef(pa.merchantRef!)!.zone).toEqual({ cityId: '1', zoneId: '52', areaId: '1033' });
    expect(sf.byRef(pb.merchantRef!)!.zone).toEqual({ cityId: null, zoneId: null, areaId: null });
  });

  it('SIM-F-029: a parcel without a weight is never sent to Pathao (it charges by weight) — it can still go with Steadfast', async () => {
    const o = await confirmed('pt-noweight', [{ variantId: f.v.skyM }, { variantId: f.v.linenM }]);
    expect((await book(pathao, [o.orderId])).results[0]).toMatchObject({ outcome: 'skipped', code: 'NO_WEIGHT', data: { pieces: [expect.any(String)] } });
    expect(await db().shipment.count({ where: { orderId: o.orderId } })).toBe(0);
    expect((await book(steadfast, [o.orderId])).results[0]).toMatchObject({ outcome: 'booked' });
    expect((await parcelOf(o.orderId)).weightGrams).toBeNull();
  });

  it('SIM-F-017: one poll reads both couriers; Pathao\'s failed delivery is a failed try; staff record an exception the same way', async () => {
    const o = await confirmed('pt-fail');
    const number = (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).number;
    pt.plan(`${number}-1`, 'failedAttempt');
    await book(pathao, [o.orderId]);
    const p = await parcelOf(o.orderId);
    let seen: { status: string; key: string | null } | null = null;
    for (let i = 0; i < 8; i++) {
      f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
      const run = await trackParcels(f.shippingDeps(), f.S);
      expect(run.failed).toBe(0);
      const s = await db().shipment.findUniqueOrThrow({ where: { id: p.id } });
      if (s.status === 'ATTEMPT_FAILED') seen = { status: s.status, key: s.exceptionKey };
    }
    expect(seen).toEqual({ status: 'ATTEMPT_FAILED', key: 'other' });
    expect((await db().shipment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('DELIVERED');
    // the Steadfast parcels of the earlier tests were read by the same runs
    expect(await db().shipmentEvent.count({ where: { source: 'poll', shipment: { courierAccountId: steadfast } } })).toBeGreaterThan(0);

    const q = await confirmed('pt-lost');
    await book(pathao, [q.orderId]);
    const lost = await parcelOf(q.orderId);
    expect(await recordException(f.shippingDeps(), f.shipper, lost.id, { status: 'LOST', reasonKey: 'lostInTransit', note: 'no scan for nine days' })).toMatchObject({ status: 'LOST', changed: true });
  });
});
