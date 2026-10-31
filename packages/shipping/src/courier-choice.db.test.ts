// PR 178 on a real PostgreSQL (a throwaway database with the real migrations; orders placed through the real checkout;
// skipped without TEST_DATABASE_ADMIN_URL): the courier picked by the real cost of the parcel. Off by default (nothing
// suggested, "Book with the cheapest" refused); on: each courier's own rate card for the parcel's band and weight
// (SIM-F-029: the weight changes the cost), the COD fee on the amount collected when counted, a courier with no card or
// no card for an unknown weight says why and is never guessed; "Book with the cheapest" books each order with its own
// cheapest, never touching the customer's delivery charge. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mockCourierWorld, STEADFAST_PROVIDER } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { codToCollect, confirmOrder } from '@extas/orders';
import { shippingSettings } from '@extas/settings';
import { bookCheapest, courierChoices } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)('PR 178 · courier by the real cost (PostgreSQL)', () => {
  let f: ShippingFixture;
  let alpha: string;
  let bravo: string;
  let charlie: string;
  let zoneKey: string;
  let bandId: string;
  const world = mockCourierWorld(STEADFAST_PROVIDER);
  const db = () => f.t.prisma;
  let n = 0;
  const phone = () => `0170000${String(1780 + ++n).padStart(4, '0')}`;
  const confirmed = async (name: string, lines: { variantId: string; quantity?: number }[]) => {
    const o = await f.place(name, { phone: phone(), lines });
    await confirmOrder(f.ordersDeps(), f.staff, o.orderId);
    await db().order.update({ where: { id: o.orderId }, data: { deliveryBandId: bandId } });
    return o;
  };
  const on = (codFee = true) => f.overrides.set('delivery.courier.selection', { enabled: true, codFee });

  beforeAll(async () => {
    f = await setUpShipping('shipping_choice');
    world.reset();
    world.useClock(() => f.clock.now.getTime());
    alpha = await f.courier(STEADFAST_PROVIDER, 'Alpha');
    bravo = await f.courier(STEADFAST_PROVIDER, 'Bravo');
    charlie = await f.courier(STEADFAST_PROVIDER, 'Charlie');
    const band = await db().deliveryBand.findFirstOrThrow({ where: { storeId: f.S }, select: { id: true, key: true } });
    zoneKey = band.key;
    bandId = band.id;
    await db().productVariant.update({ where: { id: f.v.skyM }, data: { weightGrams: 700 } });
    await db().productVariant.update({ where: { id: f.v.linenM }, data: { weightGrams: null } });
    // Alpha goes by weight with a 1% COD fee; Bravo one flat card; Charlie has no card for the band
    await db().courierRateCard.createMany({
      data: [
        { storeId: f.S, courierAccountId: alpha, zoneKey, weightFromGrams: 0, weightToGrams: 1_000, chargeMinor: 5_000, codFeeBps: 100, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: alpha, zoneKey, weightFromGrams: 1_001, weightToGrams: 3_000, chargeMinor: 7_000, codFeeBps: 100, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: bravo, zoneKey, weightFromGrams: 0, weightToGrams: 3_000, chargeMinor: 8_000, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: charlie, zoneKey: `${zoneKey}-other`, weightFromGrams: 0, weightToGrams: 3_000, chargeMinor: 1_000, validFrom: new Date(0) },
      ],
    });
  });
  afterAll(async () => {
    world.reset();
    await f?.t.drop();
  });

  it('is off by default: nothing suggested, "Book with the cheapest" refused', async () => {
    expect(shippingSettings['delivery.courier.selection'].default).toEqual({ enabled: false, codFee: true });
    const o = await confirmed('off', [{ variantId: f.v.skyM }]);
    const [c] = await courierChoices(f.shippingDeps(), f.shipper, [o.orderId]);
    expect(c).toMatchObject({ orderId: o.orderId, enabled: false, costs: [], cheapest: null });
    expect(await code(bookCheapest(f.shippingDeps(), f.shipper, { orderIds: [o.orderId] }))).toBe('SELECTION_OFF');
    expect(await db().shipment.count({ where: { orderId: o.orderId } })).toBe(0);
  });

  it('SIM-F-029: each courier\'s cost by band and weight, the COD fee counted when on, unknown ones say why', async () => {
    on();
    try {
      const heavy = await confirmed('heavy', [{ variantId: f.v.skyM, quantity: 2 }]);
      const light = await confirmed('light', [{ variantId: f.v.skyM }]);
      const unknown = await confirmed('unknown', [{ variantId: f.v.linenM }]);
      const order = await db().order.findUniqueOrThrow({ where: { id: heavy.orderId }, select: { paymentMethod: true, totalMinor: true, paidMinor: true, walletAppliedMinor: true } });
      const collect = codToCollect(order);
      expect(collect).toBeGreaterThan(0);
      const fee = Math.round(collect / 100);
      const all = await courierChoices(f.shippingDeps(), f.shipper, [heavy.orderId, light.orderId, unknown.orderId]);
      const h = all.find((c) => c.orderId === heavy.orderId)!;
      expect(h).toMatchObject({ enabled: true, zoneKey, weightGrams: 1_400 });
      const costOf = (c: typeof h) => Object.fromEntries(c.costs.map((x) => [x.name, x.costMinor ?? x.why]));
      expect(costOf(h)).toEqual({ Alpha: 7_000 + fee, Bravo: 8_000, Charlie: 'NO_RATE' });
      expect(h.cheapest).toBe(7_000 + fee < 8_000 ? alpha : bravo);
      expect(h.costs.at(-1)!.name).toBe('Charlie');
      const l = all.find((c) => c.orderId === light.orderId)!;
      expect(l.weightGrams).toBe(700);
      const lo = await db().order.findUniqueOrThrow({ where: { id: light.orderId }, select: { paymentMethod: true, totalMinor: true, paidMinor: true, walletAppliedMinor: true } });
      expect(costOf(l).Alpha).toBe(5_000 + Math.round(codToCollect(lo) / 100));
      // a piece with no weight: Alpha's cards go by weight (never guessed); Bravo's one flat card still fits
      const u = all.find((c) => c.orderId === unknown.orderId)!;
      expect(u.weightGrams).toBeNull();
      expect(costOf(u)).toMatchObject({ Alpha: 'NO_WEIGHT', Bravo: 8_000, Charlie: 'NO_RATE' });
      expect(u.cheapest).toBe(bravo);
      // the COD fee left out: Alpha's charge alone, the cheapest for the heavy parcel
      on(false);
      const [h2] = await courierChoices(f.shippingDeps(), f.shipper, [heavy.orderId]);
      expect(costOf(h2!)).toMatchObject({ Alpha: 7_000, Bravo: 8_000 });
      expect(h2!.cheapest).toBe(alpha);
      // an order with no delivery band: every courier says so
      await db().order.update({ where: { id: light.orderId }, data: { deliveryBandId: null } });
      const [nb] = await courierChoices(f.shippingDeps(), f.shipper, [light.orderId]);
      expect(nb!.costs.every((c) => c.why === 'NO_BAND')).toBe(true);
      expect(nb!.cheapest).toBeNull();
      await db().order.update({ where: { id: light.orderId }, data: { deliveryBandId: bandId } });
    } finally {
      f.overrides.delete('delivery.courier.selection');
    }
  });

  it('"Book with the cheapest" books each order with its own cheapest; no cost known is left for a person; the charge stays', async () => {
    on(false);
    try {
      const heavy = await confirmed('b-heavy', [{ variantId: f.v.skyM, quantity: 2 }]);
      const unknown = await confirmed('b-unknown', [{ variantId: f.v.linenM }]);
      const noBand = await confirmed('b-noband', [{ variantId: f.v.skyM }]);
      await db().order.update({ where: { id: noBand.orderId }, data: { deliveryBandId: null } });
      const before = await db().order.findMany({ where: { id: { in: [heavy.orderId, unknown.orderId] } }, select: { id: true, deliveryChargeMinor: true, totalMinor: true } });
      const run = await bookCheapest(f.shippingDeps(), f.shipper, { orderIds: [heavy.orderId, unknown.orderId, noBand.orderId] });
      expect(run.noCost).toEqual([noBand.orderId]);
      expect(Object.fromEntries(run.runs.map((r) => [r.courierAccountId, r.results.map((x) => [x.orderId, x.outcome])]))).toEqual({
        [alpha]: [[heavy.orderId, 'booked']],
        [bravo]: [[unknown.orderId, 'booked']],
      });
      const ships = await db().shipment.findMany({ where: { orderId: { in: [heavy.orderId, unknown.orderId, noBand.orderId] } }, select: { orderId: true, courierAccountId: true } });
      expect(Object.fromEntries(ships.map((s) => [s.orderId, s.courierAccountId]))).toEqual({ [heavy.orderId]: alpha, [unknown.orderId]: bravo });
      const after = await db().order.findMany({ where: { id: { in: [heavy.orderId, unknown.orderId] } }, select: { id: true, deliveryChargeMinor: true, totalMinor: true } });
      expect(after.sort((a, b) => a.id.localeCompare(b.id))).toEqual(before.sort((a, b) => a.id.localeCompare(b.id)));
    } finally {
      f.overrides.delete('delivery.courier.selection');
    }
  });

  it('needs delivery.book, and checks its input', async () => {
    expect(await code(courierChoices(f.shippingDeps(), f.looker, []))).toBe('FORBIDDEN');
    expect(await code(bookCheapest(f.shippingDeps(), f.looker, { orderIds: [] }))).toBe('FORBIDDEN');
    on();
    try {
      expect(await code(bookCheapest(f.shippingDeps(), f.shipper, { orderIds: [] }))).toBe('INVALID_INPUT');
      expect(await code(courierChoices(f.shippingDeps(), f.shipper, ['not-a-uuid']))).toBe('INVALID_INPUT');
    } finally {
      f.overrides.delete('delivery.courier.selection');
    }
  });
});
