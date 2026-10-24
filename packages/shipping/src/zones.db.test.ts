// PR 554 on a real PostgreSQL (a throwaway database with the real migrations, the SAMPLE gazetteer, orders placed through
// the real checkout; skipped without TEST_DATABASE_ADMIN_URL): the courier zone sync with the practice courier's place
// list — read level by level within a budget, exact names paired on their own, an unclear name left for a person, a
// failed read archiving nothing, a dropped place archived (never deleted) and brought back, a person's pair never
// touched by a sync — and SIM-F-017's zone ids: a booking to an area the courier does not know waits with its reason
// (never sent to fail), a paired area carries the courier's ids. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_COURIER_PROVIDER, mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { bookOrders, courierZones, mapArea, requestZoneSync, runZoneSync, searchCourierPlaces, unmapArea, zoneSyncTurn } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 554 · courier zone sync (PostgreSQL)', () => {
  let f: ShippingFixture;
  let practice: string;
  let steadfast: string;
  const world = mockCourierWorld(MOCK_COURIER_PROVIDER);
  const db = () => f.t.prisma;
  const deps = () => f.shippingDeps();
  let n = 0;
  const area = async (code: string) => (await db().geoArea.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
  const pairOf = (areaId: string) => db().courierAreaMapping.findUnique({ where: { courierAccountId_areaId: { courierAccountId: practice, areaId } } });
  const sync = async (budget?: number) => {
    const run = await requestZoneSync(deps(), f.shipper, practice);
    return runZoneSync(deps(), f.S, run.id, budget ? { budget } : {});
  };
  const confirmedIn = async (areaId: string) => {
    const o = await f.place(`zone-${++n}`, { phone: `0170000${String(5540 + n).padStart(4, '0')}` });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await db().order.update({ where: { id: o.orderId }, data: { areaId } });
    return o.orderId;
  };
  const book = async (orderId: string) => (await bookOrders(deps(), f.shipper, { courierAccountId: practice, orderIds: [orderId] })).results[0]!;
  const tick = (ms: number) => {
    f.clock.now = new Date(f.clock.now.getTime() + ms);
  };
  const ALWAYS = { ...shippingSettings['delivery.courier.zoneSync'].default, unmapped: 'always' as const };

  beforeAll(async () => {
    f = await setUpShipping('shipping_zones');
    practice = await f.courier(MOCK_COURIER_PROVIDER, 'Practice');
    steadfast = await f.courier(STEADFAST_PROVIDER, 'Steadfast');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('a courier without a place list (Steadfast) has nothing to sync; a reader cannot start one', async () => {
    expect(await code(requestZoneSync(deps(), f.shipper, steadfast))).toBe('NO_ZONE_LIST');
    expect(await code(requestZoneSync(deps(), f.looker, practice))).not.toBe('ok');
    expect(await db().courierZoneSync.count()).toBe(0);
  });

  it('reads the list within its budget over several turns, then pairs the exact names on their own', async () => {
    const first = await sync(3);
    expect(first).toMatchObject({ status: 'RUNNING', calls: 3 });
    expect(first.left).toBeGreaterThan(0);
    // a second press while it runs is the same run
    expect((await requestZoneSync(deps(), f.shipper, practice)).id).toBe(first.id);
    const done = await runZoneSync(deps(), f.S, first.id);
    expect(done.status).toBe('SUCCEEDED');
    expect(done.stats).toMatchObject({ seen: { city: 8 }, archivedPlaces: 0 });
    expect(done.stats!.autoPaired).toBeGreaterThan(5);
    // every level was asked: the cities once, each city's zones, each zone's areas
    expect(world.placeReads().filter((r) => r.level === 'city')).toHaveLength(1);
    expect(await db().courierPlace.count({ where: { courierAccountId: practice, archivedAt: null } })).toBe(8 + 26 + 14);
    expect(await pairOf(await area('bd.dhaka.dhaka'))).toMatchObject({ courierCityId: '1', courierZoneId: null, source: 'auto', matchedBy: 'city' });
    expect(await pairOf(await area('bd.dhaka.dhaka.mirpur'))).toMatchObject({ courierCityId: '1', courierZoneId: '101', source: 'auto' });
    expect(await pairOf(await area('bd.dhaka.dhaka.pallabi'))).toMatchObject({ courierCityId: '1', courierZoneId: '101', courierAreaId: '1003' });
    expect(await pairOf(await area('bd.rajshahi.bogura'))).toMatchObject({ courierCityId: '5' });
    // Mirpur of Kushtia is not Mirpur of Dhaka (Kushtia is no city of this courier)
    expect(await pairOf(await area('bd.khulna.kushtia.mirpur'))).toBeNull();
  });

  it('an unclear name (two "Uttara" zones) is never guessed: it waits on the courier page with both candidates', async () => {
    const uttara = await area('bd.dhaka.dhaka.uttara');
    expect(await pairOf(uttara)).toBeNull();
    const page = await courierZones(deps(), f.looker, practice, { tab: 'unmapped', q: 'Uttara' });
    const row = page.rows.find((r) => r.area.id === uttara)!;
    expect(row.candidates.map((c) => c.providerId).sort()).toEqual(['105', '106']);
    expect(page.counts.places).toEqual({ city: 8, zone: 26, area: 14 });
    expect(page.lastRun?.status).toBe('SUCCEEDED');
    // a person picks one: the pair is the staff's, with the zone's city
    const zone = (await searchCourierPlaces(deps(), f.looker, practice, { q: 'uttara' })).find((p) => p.providerId === '106')!;
    expect(zone.path).toEqual(['Dhaka']);
    expect(await code(mapArea(deps(), f.looker, practice, { areaId: uttara, placeId: zone.id }))).not.toBe('ok');
    await mapArea(deps(), f.shipper, practice, { areaId: uttara, placeId: zone.id });
    expect(await pairOf(uttara)).toMatchObject({ courierCityId: '1', courierZoneId: '106', source: 'staff', mappedById: f.staffId });
  });

  it('SIM-F-017: a booking to an area the courier does not know waits with its reason; once paired it carries the ids', async () => {
    f.overrides.set('delivery.courier.zoneSync', ALWAYS);
    try {
      const kushtia = await area('bd.khulna.kushtia.mirpur');
      const orderId = await confirmedIn(kushtia);
      expect(await book(orderId)).toMatchObject({ outcome: 'skipped', code: 'AREA_UNMAPPED', data: { areaId: kushtia, need: 'city' } });
      // pressing again writes no second note, and nothing reached the courier
      await book(orderId);
      expect(await db().orderEvent.count({ where: { orderId, type: 'shipment.areaHeld' } })).toBe(1);
      expect(await db().shipment.count({ where: { orderId } })).toBe(0);
      const page = await courierZones(deps(), f.looker, practice, { tab: 'needed' });
      expect(page.rows.map((r) => [r.area.id, r.held])).toEqual([[kushtia, 1]]);
      expect(page.counts.needed).toBe(1);
      // no resolved area at all: AREA_UNKNOWN
      const unknown = await confirmedIn(kushtia);
      await db().order.update({ where: { id: unknown }, data: { areaId: null } });
      expect(await book(unknown)).toMatchObject({ outcome: 'skipped', code: 'AREA_UNKNOWN' });
      // a person pairs it with the courier's Khulna zone: the parcel goes, with the ids
      const sonadanga = (await searchCourierPlaces(deps(), f.shipper, practice, { q: 'Sonadanga' }))[0]!;
      await mapArea(deps(), f.shipper, practice, { areaId: kushtia, placeId: sonadanga.id });
      expect(await book(orderId)).toMatchObject({ outcome: 'booked' });
      const s = await db().shipment.findFirstOrThrow({ where: { orderId } });
      expect(s).toMatchObject({ courierCityId: '8', courierZoneId: '801', courierAreaId: null });
      expect(world.byRef(s.merchantRef!)!.zone).toEqual({ cityId: '8', zoneId: '801', areaId: null });
      expect((await courierZones(deps(), f.looker, practice, { tab: 'needed' })).counts.needed).toBe(0);
      // an area with no pair of its own books with the nearest pair above it (Uttara West → Dhaka)
      const west = await confirmedIn(await area('bd.dhaka.dhaka.uttara-west'));
      expect(await book(west)).toMatchObject({ outcome: 'booked' });
      expect(await db().shipment.findFirstOrThrow({ where: { orderId: west } })).toMatchObject({ courierCityId: '1', courierZoneId: null });
    } finally {
      f.overrides.delete('delivery.courier.zoneSync');
    }
  });

  it('by default ("only when the courier needs them") an area without a pair still books, with the address only', async () => {
    const orderId = await confirmedIn(await area('bd.khulna.kushtia'));
    expect(await book(orderId)).toMatchObject({ outcome: 'booked' });
    expect(await db().shipment.findFirstOrThrow({ where: { orderId } })).toMatchObject({ courierCityId: null, courierZoneId: null });
  });

  it('a failed read stops the run and archives nothing', async () => {
    world.dropPlace('city', '7');
    world.failPlaceReads(1);
    const before = await db().courierPlace.count({ where: { courierAccountId: practice, archivedAt: null } });
    tick(60_000);
    const r = await sync();
    expect(r.status).toBe('FAILED');
    expect(r.error).toMatch(/did not answer/);
    expect(await db().courierPlace.count({ where: { courierAccountId: practice, archivedAt: null } })).toBe(before);
    world.addPlace('city', { id: '7', name: 'Rajshahi', parentId: null });
    world.addPlace('zone', { id: '701', name: 'Boalia', parentId: '7' });
  });

  it('a place the courier drops is archived with its pair (never deleted), and both come back when it is listed again', async () => {
    const khulna = await area('bd.khulna.khulna');
    expect(await pairOf(khulna)).toMatchObject({ courierCityId: '8', archivedAt: null });
    world.dropPlace('city', '8');
    tick(60_000);
    const r = await sync();
    expect(r.stats).toMatchObject({ archivedPlaces: 2, archivedPairs: 3 });
    expect(await pairOf(khulna)).toMatchObject({ archivedReason: 'courierDropped' });
    expect((await pairOf(khulna))!.archivedAt).not.toBeNull();
    // the person's Kushtia pair pointed at the dropped zone: archived too, kept for the record
    expect(await pairOf(await area('bd.khulna.kushtia.mirpur'))).toMatchObject({ archivedReason: 'courierDropped' });
    expect(await db().courierPlace.count({ where: { courierAccountId: practice, providerId: '8', level: 'CITY' } })).toBe(1);
    const dropped = await courierZones(deps(), f.looker, practice, { tab: 'dropped' });
    expect(dropped.rows.map((x) => x.area.id)).toContain(khulna);
    expect(dropped.rows.find((x) => x.area.id === khulna)!.place).toMatchObject({ providerId: '8', archived: true });

    // a parcel to Khulna now waits ("always"), instead of going with an id the courier no longer knows
    f.overrides.set('delivery.courier.zoneSync', ALWAYS);
    try {
      const orderId = await confirmedIn(await area('bd.khulna.khulna.sonadanga'));
      expect(await book(orderId)).toMatchObject({ outcome: 'skipped', code: 'AREA_UNMAPPED' });
    } finally {
      f.overrides.delete('delivery.courier.zoneSync');
    }

    world.addPlace('city', { id: '8', name: 'Khulna', parentId: null });
    world.addPlace('zone', { id: '801', name: 'Sonadanga', parentId: '8' });
    tick(60_000);
    const back = await sync();
    expect(back.stats).toMatchObject({ restoredPairs: 3, archivedPlaces: 0 });
    expect(await pairOf(khulna)).toMatchObject({ archivedAt: null, archivedReason: null });
    expect(await db().courierPlace.findFirstOrThrow({ where: { courierAccountId: practice, providerId: '8', level: 'CITY' } })).toMatchObject({ archivedAt: null });
  });

  it("a person's pair is never changed by a sync; a pair taken away is archived and not paired again on its own", async () => {
    const uttara = await area('bd.dhaka.dhaka.uttara');
    const mirpur = await area('bd.dhaka.dhaka.mirpur');
    await unmapArea(deps(), f.shipper, practice, mirpur);
    expect(await pairOf(mirpur)).toMatchObject({ archivedReason: 'staff' });
    tick(60_000);
    await sync();
    expect(await pairOf(uttara)).toMatchObject({ courierZoneId: '106', source: 'staff', archivedAt: null });
    expect(await pairOf(mirpur)).toMatchObject({ archivedReason: 'staff' });
    expect((await pairOf(mirpur))!.archivedAt).not.toBeNull();
    expect(await code(unmapArea(deps(), f.shipper, practice, mirpur))).toBe('NOT_FOUND');
    // the audit log has every change a person made
    expect(await db().auditLog.count({ where: { action: { in: ['courier.area.map', 'courier.area.unmap'] } } })).toBe(3);
  });

  it("the worker's turn: a list read recently is left alone; one older than the owner's days is read again", async () => {
    const runs = await db().courierZoneSync.count();
    expect(await zoneSyncTurn(deps(), f.S)).toMatchObject({ started: 0, ran: 0 });
    tick(8 * 86_400_000);
    expect(await zoneSyncTurn(deps(), f.S)).toMatchObject({ started: 1, ran: 1, finished: 1 });
    expect(await db().courierZoneSync.count()).toBe(runs + 1);
    // switched off: nothing new is started
    f.overrides.set('delivery.courier.zoneSync', { ...ALWAYS, enabled: false });
    tick(8 * 86_400_000);
    expect(await zoneSyncTurn(deps(), f.S)).toMatchObject({ started: 0 });
    f.overrides.delete('delivery.courier.zoneSync');
  });
});
