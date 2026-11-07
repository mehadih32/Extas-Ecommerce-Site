// PR 177 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): Pathao, the second courier, on its practice world beside Steadfast — the
// same booking and tracking code for both, Pathao's zone ids from the area mapping, a parcel without a weight never sent
// to a courier that charges by weight (SIM-F-029), and Pathao's exceptions read by the same poll (SIM-F-017). Every value
// is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, PATHAO_PROVIDER, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { bookOrders, closeLostBooking, listCouriers, lostBookingOf, recordException, retryBooking, trackParcels } from './index';
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
  const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

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

  it('follow-up 373: a lost answer on Pathao is never booked again by guess; a person closes it from the Pathao panel, audited, never twice', async () => {
    const lostOn = async (courierAccountId: string, name: string) => {
      const o = await confirmed(name, [{ variantId: f.v.skyM }]);
      (courierAccountId === pathao ? pt : sf).failNext('timeout');
      expect((await book(courierAccountId, [o.orderId])).results[0]).toMatchObject({ outcome: 'unknown', code: 'NO_ANSWER' });
      return { ...o, parcel: await parcelOf(o.orderId) };
    };
    const close = (id: string, input: unknown, who = f.shipper) => closeLostBooking(f.shippingDeps(), who, id, input);

    // "the courier has it": the person read its consignment id in the Pathao panel
    const a = await lostOn(pathao, 'pt-lost-has');
    const lost = await lostBookingOf(db(), f.S, a.orderId);
    expect(lost).toMatchObject({ shipmentId: a.parcel.id, courierAccountId: pathao, courierName: 'Pathao main', merchantRef: a.parcel.merchantRef, lookup: false });
    expect(await code(retryBooking(f.shippingDeps(), f.shipper, a.parcel.id))).toBe('NOT_RETRYABLE');
    expect(await code(close(a.parcel.id, { outcome: 'notBooked' }, f.looker))).toBe('FORBIDDEN');
    expect(await code(close(a.parcel.id, { outcome: 'courierHasIt' }))).toBe('INVALID_INPUT');
    expect(await code(close(a.parcel.id, { outcome: 'courierHasIt', consignmentId: 'bad id!' }))).toBe('INVALID_INPUT');
    const inPanel = pt.booked().find((p) => p.parcel.merchantRef === a.parcel.merchantRef)!.consignmentId;
    expect(await close(a.parcel.id, { outcome: 'courierHasIt', consignmentId: inPanel, note: 'seen in the panel' })).toMatchObject({ outcome: 'courierHasIt', consignmentId: inPanel, booking: null });
    expect(await parcelOf(a.orderId)).toMatchObject({ id: a.parcel.id, status: 'PENDING_PICKUP', consignmentId: inPanel, bookingError: null });
    expect(await db().shipment.count({ where: { orderId: a.orderId } })).toBe(1);
    expect(await db().orderEvent.findFirstOrThrow({ where: { orderId: a.orderId, type: 'shipment.bookingClosed' } })).toMatchObject({ message: 'seen in the panel', actorId: f.staffId });
    expect(await db().auditLog.count({ where: { entityId: a.parcel.id, action: 'shipment.lostClosed' } })).toBe(1);
    expect(await lostBookingOf(db(), f.S, a.orderId)).toBeNull();
    // closed once: a second press (or a late Try again) changes nothing
    expect(await code(close(a.parcel.id, { outcome: 'notBooked' }))).toBe('NOT_RETRYABLE');

    // a consignment id another parcel has is refused
    const b = await lostOn(pathao, 'pt-lost-dup');
    expect(await code(close(b.parcel.id, { outcome: 'courierHasIt', consignmentId: inPanel }))).toBe('DUPLICATE');

    // "not booked: book again": closed as failed, then booked again with Pathao as a new try
    const r = await close(b.parcel.id, { outcome: 'notBooked' });
    expect(r).toMatchObject({ outcome: 'notBooked', consignmentId: null, booking: { outcome: 'booked' } });
    const tries = await db().shipment.findMany({ where: { orderId: b.orderId }, orderBy: { attempt: 'asc' } });
    expect(tries.map((t) => [t.attempt, t.status])).toEqual([
      [1, 'BOOKING_FAILED'],
      [2, 'PENDING_PICKUP'],
    ]);
    expect(tries[0]!.bookingError).toContain("courier's panel");
    expect(await db().auditLog.count({ where: { entityId: b.parcel.id, action: 'shipment.lostClosed' } })).toBe(1);

    // a courier that can be asked by reference (Steadfast) is tried again, never closed by hand
    const c = await lostOn(steadfast, 'sf-lost');
    expect((await lostBookingOf(db(), f.S, c.orderId))?.lookup).toBe(true);
    expect(await code(close(c.parcel.id, { outcome: 'notBooked' }))).toBe('LOOKUP_AVAILABLE');
    expect(await retryBooking(f.shippingDeps(), f.shipper, c.parcel.id)).toMatchObject({ outcome: 'booked', data: { recovered: true } });
  });

  it('follow-up 375: a practice parcel lives in the database — a process that never booked it (the worker) plays the same life', async () => {
    const o = await confirmed('pt-two-processes');
    const number = (await db().order.findUniqueOrThrow({ where: { id: o.orderId } })).number;
    pt.plan(`${number}-1`, 'refused');
    await book(pathao, [o.orderId]);
    const p = await parcelOf(o.orderId);
    expect(await db().practiceParcel.findUniqueOrThrow({ where: { provider_consignmentId: { provider: PATHAO_PROVIDER, consignmentId: p.consignmentId! } } })).toMatchObject({ merchantRef: `${number}-1`, scenario: 'refused', reached: 1 });
    // the worker's memory: empty (another process); it reads the parcel from the database and moves it on
    pt.reset();
    f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
    expect((await trackParcels(f.shippingDeps(), f.S)).failed).toBe(0);
    expect((await db().shipment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('PICKED_UP');
    expect((await db().practiceParcel.findFirstOrThrow({ where: { consignmentId: p.consignmentId! } })).reached).toBe(2);
    // and the web app, with its own empty memory, carries on from there
    pt.reset();
    for (let i = 0; i < 6; i++) {
      f.clock.now = new Date(f.clock.now.getTime() + 61 * 60_000);
      await trackParcels(f.shippingDeps(), f.S);
      pt.reset();
    }
    expect((await db().shipment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('RETURNED');
    // never a real parcel: only practice (MOCK) parcels are kept
    expect(await db().practiceParcel.count({ where: { consignmentId: { not: { startsWith: 'MOCK-' } } } })).toBe(0);
  });
});
