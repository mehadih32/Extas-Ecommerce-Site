// S28 · PR 670 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): the Couriers section's reads. The overview
// cards (the default courier first, parcels on the way with their cash, the 30 days' success and days and cost per parcel,
// practice parcels counted aside and never in a figure), Courier 360's weeks, the parcel list with its filter and page, the
// savings line only while the courier choice by cost is on, and the default courier first in the booking list.
// Made-up test values.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PATHAO_PROVIDER, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { confirmOrder } from '@extas/orders';
import { couriersOverview, courierDetail, courierParcels, listCouriers } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

const DAY = 86_400_000;

describe.skipIf(!HAS_TEST_DB)('PR 670 · Couriers section reads (PostgreSQL)', () => {
  let f: ShippingFixture;
  let sf: string;
  let pt: string;
  const db = () => f.t.prisma;
  let n = 0;
  const parcel = async (courierAccountId: string, data: Record<string, unknown>) => {
    const o = await f.place(`cv5-${++n}`, { phone: `0170000${String(3670 + n).padStart(4, '0')}` });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    return db().shipment.create({
      data: {
        storeId: f.S,
        orderId: o.orderId,
        courierAccountId,
        idempotencyKey: `cv5-${n}`,
        consignmentId: `CN-${n}`,
        bookedAt: new Date(f.clock.now.getTime() - 6 * DAY),
        mode: 'LIVE',
        ...data,
      } as never,
    });
  };

  beforeAll(async () => {
    f = await setUpShipping('shipping_couriers_v5');
    sf = await f.courier(STEADFAST_PROVIDER, 'Steadfast main');
    pt = await f.courier(PATHAO_PROVIDER, 'Pathao main');
    const now = f.clock.now.getTime();
    // Steadfast: 3 delivered (two days each, 70 each), 1 returned, 1 on the way with 2100 to collect, 1 practice delivered
    for (let i = 0; i < 3; i++)
      await parcel(sf, { status: 'DELIVERED', pickedAt: new Date(now - (4 + i) * DAY), deliveredAt: new Date(now - (2 + i) * DAY), chargeMinor: 7000, codAmountMinor: 100_000 });
    await parcel(sf, { status: 'RETURNED', pickedAt: new Date(now - 5 * DAY), returnedAt: new Date(now - 1 * DAY), chargeMinor: 7000 });
    await parcel(sf, { status: 'IN_TRANSIT', pickedAt: new Date(now - 1 * DAY), codAmountMinor: 210_000 });
    await parcel(sf, { status: 'DELIVERED', pickedAt: new Date(now - 4 * DAY), deliveredAt: new Date(now - 2 * DAY), chargeMinor: 1, mode: 'MOCK' });
    // an old parcel (70 days ago) is outside the 30 days and outside the eight weeks
    await parcel(sf, { status: 'DELIVERED', pickedAt: new Date(now - 72 * DAY), deliveredAt: new Date(now - 70 * DAY), chargeMinor: 9999 });
    await parcel(pt, { status: 'DELIVERED', pickedAt: new Date(now - 3 * DAY), deliveredAt: new Date(now - 1 * DAY), chargeMinor: 8000 });
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('one card per courier: the first courier is the default until the owner picks one, the figures count real parcels of the last 30 days only', async () => {
    const ov = await couriersOverview(f.shippingDeps(), f.looker);
    expect(ov.cards.map((c) => c.name)).toEqual(['Steadfast main', 'Pathao main']);
    expect(ov.cards[0]).toMatchObject({ isDefault: true, isBackup: false, onTheWay: { parcels: 1, codMinor: 210_000 }, practiceParcels: 1, stuck: 0 });
    expect(ov.cards[0]!.last30).toMatchObject({ delivered: 3, returned: 1, finished: 4, successPct: 75, avgDays: 2, costMinor: 28_000, costParcels: 4, perParcelMinor: 7000 });
    expect(ov.cards[1]!.last30).toMatchObject({ delivered: 1, returned: 0, successPct: 100, perParcelMinor: 8000 });
    expect(ov.savings).toEqual({ enabled: false, savedMinor: null, compared: 0, leftOut: 0 });
  });

  it('the default courier set in Setup comes first in the cards and in the booking list; an unknown or archived one is ignored', async () => {
    f.overrides.set('delivery.couriers', { defaultCourierId: pt });
    const ov = await couriersOverview(f.shippingDeps(), f.looker);
    expect(ov.cards.map((c) => c.name)).toEqual(['Pathao main', 'Steadfast main']);
    expect(ov.defaultCourierId).toBe(pt);
    expect((await listCouriers(f.shippingDeps(), f.looker)).couriers.map((c) => c.name)).toEqual(['Pathao main', 'Steadfast main']);
    f.overrides.set('delivery.couriers', { defaultCourierId: '' });
    expect((await listCouriers(f.shippingDeps(), f.looker)).couriers.map((c) => c.name)).toEqual(['Steadfast main', 'Pathao main']);
  });

  it('Courier 360: eight weeks of success, oldest first, a parcel older than eight weeks not in them', async () => {
    const d = await courierDetail(f.shippingDeps(), f.looker, sf);
    expect(d.weekly).toHaveLength(8);
    expect(d.weekly.reduce((s, w) => s + w.finished, 0)).toBe(4);
    expect(d.weekly[7]).toMatchObject({ delivered: 3, finished: 4, successPct: 75 });
    await expect(courierDetail(f.shippingDeps(), f.looker, '00000000-0000-7000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('the parcel list: counts per filter, the filter, practice marked, paged, a courier of another id refused', async () => {
    const all = await courierParcels(f.shippingDeps(), f.looker, sf);
    expect(all.counts).toEqual({ all: 7, onTheWay: 1, delivered: 5, returned: 1, problem: 0 });
    expect(all.rows).toHaveLength(7);
    expect(all.rows.filter((r) => r.practice)).toHaveLength(1);
    const ret = await courierParcels(f.shippingDeps(), f.looker, sf, { filter: 'returned' });
    expect(ret.rows.map((r) => r.status)).toEqual(['RETURNED']);
    expect(ret.rows[0]).toMatchObject({ chargeMinor: 7000, practice: false });
    await expect(courierParcels(f.shippingDeps(), f.looker, sf, { filter: 'nonsense' })).rejects.toBeTruthy();
    await expect(courierParcels(f.shippingDeps(), f.looker, '00000000-0000-7000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await courierParcels(f.shippingDeps(), f.looker, sf, { page: 9 })).rows).toEqual([]);
  });

  it("the stuck count follows the owner's alert and hours; the savings line exists only while the courier choice by cost is on and never guesses", async () => {
    f.overrides.set('fulfilment.courierWatch', { stuckAlert: true, stuckHours: 12, backupCourierId: pt });
    const ov = await couriersOverview(f.shippingDeps(), f.looker);
    expect(ov.cards[0]).toMatchObject({ stuck: 1, isBackup: false });
    expect(ov.cards[1]).toMatchObject({ isBackup: true });
    f.overrides.set('delivery.courier.selection', { enabled: true, codFee: false });
    const on = await couriersOverview(f.shippingDeps(), f.looker);
    // no rate cards at all: every parcel is left out, nothing is saved by guess
    expect(on.savings).toMatchObject({ enabled: true, savedMinor: null, compared: 0 });
    expect(on.savings.leftOut).toBeGreaterThan(0);
  });

  it('seeing needs delivery.read', async () => {
    await expect(couriersOverview(f.shippingDeps(), { actor: { staffUserId: '00000000-0000-7000-8000-000000000001' }, storeId: f.S })).rejects.toBeTruthy();
  });
});
