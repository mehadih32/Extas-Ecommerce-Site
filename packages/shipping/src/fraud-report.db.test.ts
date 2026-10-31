// PR 164 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the fraud report — what the risk steps caught and what became of it, what was wrong and what was missed, the advances
// paid, the orders stopped before the courier and the cost they probably saved — and SIM-F-027's acceptance test: the
// RTO cost book in taka from real returned parcels only (a practice parcel never counts), both courier legs plus the
// owner's packaging and handling, summed by district, campaign, product, courier and reason. Every value is a made-up
// test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_COURIER_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { BLOCKLIST_FLAG, REFUSER_FLAG, RISK_WATCH_FLAG } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { fraudReport } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 164 · the fraud report (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  const db = () => f.t.prisma;
  let n = 0;

  async function order(set: { status: string; flags?: string[]; cancelReasonCode?: string; handedOver?: boolean; areaId?: string; utmCampaign?: string }, lines?: { variantId: string }[]) {
    n += 1;
    const o = await f.place(`fr-${n}`, { phone: `0170000${String(2640 + n).padStart(4, '0')}`, ...(lines ? { lines } : {}) });
    await db().order.update({
      where: { id: o.orderId },
      data: {
        status: set.status as never,
        flags: set.flags ?? [],
        cancelReasonCode: set.cancelReasonCode ?? null,
        handedOverAt: set.handedOver ? f.clock.now : null,
        areaId: set.areaId ?? null,
        utmCampaign: set.utmCampaign ?? null,
      },
    });
    return o;
  }
  const event = (orderId: string, type: string, reasonCode: string | null = null) => db().orderEvent.create({ data: { storeId: f.S, orderId, type, actorType: 'SYSTEM', source: 'system', reasonCode } });
  const returned = (orderId: string, mode: 'LIVE' | 'MOCK', chargeMinor: number | null) =>
    db().shipment.create({ data: { storeId: f.S, orderId, courierAccountId: courierId, status: 'RETURNED', mode, chargeMinor, returnedAt: f.clock.now, idempotencyKey: randomUUID() } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_fraud');
    courierId = await f.courier(MOCK_COURIER_PROVIDER, 'Test courier');
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('needs risk.report; an empty period reads zero and no estimate', async () => {
    await expect(fraudReport(f.shippingDeps(), f.looker, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const r = await fraudReport(f.shippingDeps(), f.shipper, {});
    expect(r.caught.any.orders).toBe(0);
    expect(r).toMatchObject({ missed: 0, stopped: 0, wrong: { orders: 0, rate: null }, avoided: { upToMinor: null, likelyMinor: null }, cut: { orders: false, parcels: false } });
    expect(r.rto.real.parcels).toBe(0);
    await expect(fraudReport(f.shippingDeps(), f.shipper, { from: '2026-05-02', to: '2026-05-01' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(fraudReport(f.shippingDeps(), f.shipper, { days: 3 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('caught, wrong, missed, stopped and avoided; SIM-F-027: the RTO cost in taka from real parcels only, grouped', async () => {
    const d = f.shippingDeps();
    const start = f.clock.now;
    // a district with an area under it, and a second district (made-up places)
    const div = await db().geoArea.create({ data: { level: 'DIVISION', nameEn: 'Test Division', ancestorIds: [] } });
    const dist1 = await db().geoArea.create({ data: { level: 'DISTRICT', nameEn: 'Testpur', nameBn: 'টেস্টপুর', parentId: div.id, ancestorIds: [div.id] } });
    const area1 = await db().geoArea.create({ data: { level: 'AREA', nameEn: 'Test Bazar', parentId: dist1.id, ancestorIds: [div.id, dist1.id] } });
    const dist2 = await db().geoArea.create({ data: { level: 'DISTRICT', nameEn: 'Mockganj', parentId: div.id, ancestorIds: [div.id] } });

    await order({ status: 'DELIVERED', flags: [RISK_WATCH_FLAG] }); // caught, yet delivered: wrong
    const refused = await order({ status: 'RETURNED', flags: [BLOCKLIST_FLAG], areaId: area1.id, utmCampaign: 'eid-test' });
    await order({ status: 'CANCELLED', flags: [REFUSER_FLAG], cancelReasonCode: 'RISK_DECLINED' }); // stopped
    const reviewed = await order({ status: 'CANCELLED', cancelReasonCode: 'DUPLICATE_ORDER' });
    const advance = await order({ status: 'DELIVERED' });
    const missed = await order({ status: 'RETURNED', areaId: dist2.id }, [{ variantId: f.v.skyM }, { variantId: f.v.teeM }]);
    const practice = await order({ status: 'RETURNED' });
    await order({ status: 'CANCELLED', flags: [RISK_WATCH_FLAG], cancelReasonCode: 'CUSTOMER_BEFORE_CONFIRM' }); // the customer's own cancel
    await order({ status: 'PLACED', flags: [RISK_WATCH_FLAG] }); // still open
    await order({ status: 'DELIVERED' }); // never caught, delivered
    await db().fraudAlert.create({ data: { storeId: f.S, orderId: reviewed.orderId, proposedAction: 'HOLD', status: 'DECLINED' } });
    await event(advance.orderId, 'order.awaitAdvance');
    await event(advance.orderId, 'order.recordAdvance');
    await event(refused.orderId, 'return.reason', 'changed-mind');

    // the owner's rate card (both legs) and his packaging and handling
    const band = await db().order.findFirstOrThrow({ where: { storeId: f.S, deliveryBandId: { not: null } }, select: { deliveryBandId: true, deliveryBand: { select: { key: true } } } });
    await db().order.updateMany({ where: { storeId: f.S }, data: { deliveryBandId: band.deliveryBandId } });
    await db().courierRateCard.create({ data: { storeId: f.S, courierAccountId: courierId, zoneKey: band.deliveryBand!.key, weightFromGrams: 0, weightToGrams: 50_000, chargeMinor: 6_000, returnChargeMinor: 3_000, validFrom: new Date(0) } });
    f.overrides.set('delivery.courier.rtoCost', { ...shippingSettings['delivery.courier.rtoCost'].default, packagingMinor: 1_500, handlingMinor: 2_000 });
    await returned(refused.orderId, 'LIVE', null); // 6,000 + 3,000 + 1,500 + 2,000
    await returned(missed.orderId, 'LIVE', 8_000); // the courier's own charge: 8,000 + 3,000 + 1,500 + 2,000
    await returned(practice.orderId, 'MOCK', 5_000); // a practice parcel: never a real cost

    const r = await fraudReport(d, f.shipper, { from: start.toISOString() });
    expect(r.caught.any).toEqual({ orders: 7, delivered: 2, refused: 1, cancelled: 3, open: 1 });
    expect(r.caught.watch).toEqual({ orders: 3, delivered: 1, refused: 0, cancelled: 1, open: 1 });
    expect(r.caught.blocklist).toMatchObject({ orders: 1, refused: 1 });
    expect(r.caught.refuser).toMatchObject({ orders: 1, cancelled: 1 });
    expect(r.caught.review).toMatchObject({ orders: 1, cancelled: 1 });
    expect(r.caught.advance).toMatchObject({ orders: 1, delivered: 1 });
    expect(r.wrong.orders).toBe(2);
    expect(r.wrong.rate).toBeCloseTo(2 / 3);
    expect(r.missed).toBe(2); // the refused order nobody caught, and the practice one
    expect(r.advancePaid).toBe(1);
    expect(r.stopped).toBe(2); // the refuser's (risk declined) and the duplicate; never the customer's own cancel

    // SIM-F-027: real parcels only, every part in the cost, in taka
    expect(r.rto.real).toMatchObject({ parcels: 2, knownMinor: 12_500 + 14_500, incomplete: 0 });
    expect(r.avoided).toEqual({ perParcelMinor: 13_500, basisParcels: 2, upToMinor: 27_000, likelyMinor: 9_000 });
    expect(r.rto.groups.district).toEqual([
      { key: dist2.id, name: 'Mockganj', nameBn: null, parcels: 1, knownMinor: 14_500, incomplete: 0 },
      { key: dist1.id, name: 'Testpur', nameBn: 'টেস্টপুর', parcels: 1, knownMinor: 12_500, incomplete: 0 },
    ]);
    expect(r.rto.groups.campaign.map((g) => [g.key, g.knownMinor])).toEqual([
      [null, 14_500],
      ['eid-test', 12_500],
    ]);
    expect(r.rto.groups.courier).toEqual([{ key: 'Test courier', name: 'Test courier', nameBn: null, parcels: 2, knownMinor: 27_000, incomplete: 0 }]);
    expect(r.rto.groups.reason.map((g) => [g.key, g.knownMinor])).toEqual([
      [null, 14_500],
      ['changed-mind', 12_500],
    ]);
    // the shirt was in both parcels (half of the two-product one), the tee in one
    const products = r.rto.groups.product;
    expect(products.map((g) => [g.parcels, g.knownMinor])).toEqual([
      [2, 12_500 + 7_250],
      [1, 7_250],
    ]);
    expect(products.reduce((s, g) => s + g.knownMinor, 0)).toBe(27_000);

    // a part the owner has not entered is named, never zero: the parcels are then incomplete and set no average
    f.overrides.set('delivery.courier.rtoCost', { ...shippingSettings['delivery.courier.rtoCost'].default, packagingMinor: 1_500, handlingMinor: null });
    const floor = await fraudReport(d, f.shipper, { from: start.toISOString() });
    expect(floor.rto.real).toMatchObject({ parcels: 2, knownMinor: 23_000, incomplete: 2 });
    expect(floor.avoided).toMatchObject({ perParcelMinor: null, upToMinor: null });

    // the owner's size limit cuts the report short and says so
    f.overrides.set('risk.report', { days: 30, maxRows: 100 });
    expect((await fraudReport(d, f.shipper, { from: start.toISOString() })).cut).toEqual({ orders: false, parcels: false });
    // a period after everything: nothing
    const later = await fraudReport(d, f.shipper, { from: new Date(f.clock.now.getTime() + 86_400_000).toISOString() });
    expect(later.caught.any.orders).toBe(0);
    expect(later.rto.real.parcels).toBe(0);
    f.overrides.delete('risk.report');
    f.overrides.delete('delivery.courier.rtoCost');
  });
});
