// S08 · PR 192 — the courier performance report and the RTO cost book's groups on a real PostgreSQL (throwaway
// database; skipped without TEST_DATABASE_ADMIN_URL). SIM-F-017: the exceptions a parcel went through are counted.
// SIM-F-018: on time against the band's promise, and the parcels past it now listed. SIM-F-027: the book reads the
// shop's own returned parcels only (practice never), is off until the owner switches it on, and every group adds up.
// Every value is made up.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { STEADFAST_PROVIDER } from '@extas/adapters';
import { courierPerformance, rtoReport, type Who } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

const H = 3_600_000;

describe.skipIf(!HAS_TEST_DB)('PR 192 · courier performance and the RTO cost book', () => {
  let f: ShippingFixture;
  let reporter: Who;
  let steadfast: string;
  let pathao: string;
  let area: string;
  let n = 0;
  const db = () => f.t.prisma;

  beforeAll(async () => {
    f = await setUpShipping('shipping_192');
    const role = await createRole(db(), { staffUserId: null }, { key: 'test-reports', nameEn: 'reports', nameBn: 'reports', permissions: ['reports.read'] });
    const u = await db().staffUser.create({ data: { email: 'reports-192@example.com', displayName: 'Reports', passwordHash: 'not-a-login' } });
    await db().staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    reporter = { actor: { staffUserId: u.id }, storeId: f.S };
    steadfast = await f.courier(STEADFAST_PROVIDER, 'Steadfast 192');
    pathao = await f.courier('pathao', 'Pathao 192');
    const district = await db().geoArea.create({ data: { level: 'DISTRICT', code: 'test.192.bogura', nameEn: 'Bogura', nameBn: 'বগুড়া', aliases: [], postcodes: [], ancestorIds: [] } });
    area = (await db().geoArea.create({ data: { level: 'AREA', code: 'test.192.bogura.gabtali', nameEn: 'Gabtali', parentId: district.id, aliases: [], postcodes: [], ancestorIds: [district.id] } })).id;
  });
  afterAll(async () => f?.t.drop());

  /** A finished (or moving) parcel of a new order placed `ageH` hours before the clock, on a band with a promise. */
  const parcel = async (courierAccountId: string, o: { status: 'DELIVERED' | 'RETURNED' | 'IN_TRANSIT'; ageH: number; tookH?: number; mode?: 'LIVE' | 'MOCK'; band?: string; refused?: boolean; ourFault?: boolean; exception?: 'ATTEMPT_FAILED' | 'LOST'; campaign?: string }) => {
    n += 1;
    const { orderId, number } = await f.place(`perf-${n}`);
    const placedAt = new Date(f.clock.now.getTime() - o.ageH * H);
    await db().order.update({ where: { id: orderId }, data: { placedAt, deliveryBandId: o.band ?? null, areaId: area, utmCampaign: o.campaign ?? null } });
    const at = new Date(placedAt.getTime() + (o.tookH ?? 20) * H);
    const s = await db().shipment.create({
      data: {
        storeId: f.S,
        orderId,
        courierAccountId,
        consignmentId: `PF-${n}`,
        status: o.status,
        mode: o.mode ?? 'LIVE',
        idempotencyKey: `perf-${n}`,
        bookedAt: placedAt,
        chargeMinor: 6_000,
        ...(o.status === 'DELIVERED' ? { deliveredAt: at } : o.status === 'RETURNED' ? { returnedAt: at } : {}),
      },
    });
    if (o.exception) await db().shipmentEvent.create({ data: { storeId: f.S, shipmentId: s.id, status: o.exception, occurredAt: placedAt, source: 'courier' } });
    if (o.status === 'RETURNED' && o.refused !== undefined)
      await db().returnRecord.create({ data: { storeId: f.S, orderId, shipmentId: s.id, kind: o.refused ? 'REFUSED_AT_DOOR' : 'RETURNED', reasonCode: 'changedMind', ourFault: o.ourFault ?? false } });
    return { orderId, number, shipmentId: s.id };
  };

  it('SIM-F-017/018: delivered, on time, refused (not our fault) and exceptions per courier, zone and district; practice left out', async () => {
    const dhaka = await f.priceBand('dhaka-city', 8_000, [24, 48]);
    const far = await f.priceBand('outside-dhaka', 13_000, [48, 72]);
    await parcel(steadfast, { status: 'DELIVERED', ageH: 100, tookH: 30, band: dhaka });
    await parcel(steadfast, { status: 'DELIVERED', ageH: 100, tookH: 60, band: dhaka, exception: 'ATTEMPT_FAILED' });
    await parcel(steadfast, { status: 'RETURNED', ageH: 100, band: far, refused: true });
    await parcel(steadfast, { status: 'RETURNED', ageH: 100, band: far, refused: true, ourFault: true });
    await parcel(pathao, { status: 'DELIVERED', ageH: 100, tookH: 50, band: far });
    await parcel(pathao, { status: 'DELIVERED', ageH: 100, band: dhaka, mode: 'MOCK' });
    const late = await parcel(pathao, { status: 'IN_TRANSIT', ageH: 100, band: dhaka, exception: 'LOST' });
    await parcel(pathao, { status: 'IN_TRANSIT', ageH: 1, band: dhaka });

    const period = { from: new Date(f.clock.now.getTime() - 10 * 24 * H).toISOString(), to: new Date(f.clock.now.getTime() + H).toISOString() };
    await expect(courierPerformance(f.shippingDeps(), f.looker, period)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(courierPerformance(f.shippingDeps(), reporter, { ...period, to: period.from })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const r = await courierPerformance(f.shippingDeps(), reporter, period);
    expect(r.practiceLeftOut).toBe(1);
    expect(r.total).toMatchObject({ parcels: 5, delivered: 3, promised: 3, onTime: 2, late: 1, returned: 2, refused: 1 });
    expect(r.total.exceptions.ATTEMPT_FAILED).toBe(1);
    const sf = r.byCourier.find((x) => x.key === steadfast)!;
    expect(sf).toMatchObject({ label: 'Steadfast 192', parcels: 4, delivered: 2, onTime: 1, refused: 1 });
    expect(sf.refusalRate).toBeCloseTo(0.25);
    expect(r.byZone.map((z) => z.key).sort()).toEqual([`${pathao}:outside-dhaka`, `${steadfast}:dhaka-city`, `${steadfast}:outside-dhaka`].sort());
    expect(r.byZone.find((z) => z.key === `${steadfast}:dhaka-city`)).toMatchObject({ parcels: 2, onTime: 1, late: 1 });
    expect(r.byDistrict).toEqual([expect.objectContaining({ key: 'Bogura', parcels: 5 })]);
    // the lost parcel is still with the courier and past its promise: listed, with its promise
    expect(r.lateNow.count).toBe(1);
    expect(r.lateNow.rows[0]).toMatchObject({ shipmentId: late.shipmentId, orderNumber: late.number, courier: 'Pathao 192' });
    // one courier's own page (delivery.read): only its parcels, the district in Bengali
    const own = await courierPerformance(f.shippingDeps(), f.looker, { ...period, courierAccountId: pathao, lang: 'bn' }, 'delivery.read');
    expect(own.total.parcels).toBe(1);
    expect(own.byDistrict[0]?.label).toBe('বগুড়া');
    expect(own.lateNow.count).toBe(1);
    expect((await courierPerformance(f.shippingDeps(), f.looker, { ...period, courierAccountId: steadfast }, 'delivery.read')).lateNow.count).toBe(0);
  });

  it('SIM-F-027: the RTO cost book is off until switched on; then the real returned parcels only, grouped, adding up', async () => {
    const w = { from: new Date(f.clock.now.getTime() - 10 * 24 * H), to: new Date(f.clock.now.getTime() + H) };
    await expect(rtoReport(f.shippingDeps(), f.looker, w)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await rtoReport(f.shippingDeps(), reporter, w)).toEqual({ enabled: false });
    f.overrides.set('delivery.courier.rtoBook', { enabled: true });
    try {
      await parcel(pathao, { status: 'RETURNED', ageH: 50, refused: true, campaign: 'eid-push' });
      await parcel(pathao, { status: 'RETURNED', ageH: 50, refused: true, mode: 'MOCK' });
      const r = await rtoReport(f.shippingDeps(), reporter, w);
      if (!r.enabled) throw new Error('expected the book');
      expect(r.summary.parcels).toBe(3);
      for (const dim of ['district', 'campaign', 'product', 'courier', 'reason'] as const) expect(r.groups[dim].reduce((s, g) => s + g.knownMinor, 0)).toBe(r.summary.knownMinor);
      expect(r.groups.campaign.map((g) => g.key)).toContain('eid-push');
      expect(r.groups.district[0]).toMatchObject({ key: 'Bogura', parcels: 3 });
      expect(r.groups.reason[0]).toMatchObject({ key: 'changedMind' });
      expect(r.groups.courier.map((g) => g.key).sort()).toEqual(['Pathao 192', 'Steadfast 192']);
      const bn = await rtoReport(f.shippingDeps(), reporter, { ...w, lang: 'bn' });
      expect(bn.enabled && bn.groups.district[0]?.key).toBe('বগুড়া');
    } finally {
      f.overrides.delete('delivery.courier.rtoBook');
    }
  });
});
