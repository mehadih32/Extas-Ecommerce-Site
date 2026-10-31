// S08 · PR 564 — the charge mismatch log on a real PostgreSQL (throwaway database; skipped without
// TEST_DATABASE_ADMIN_URL). Off as shipped. On: a courier's charge that fits exactly one other band's rate card at the
// parcel's weight is written once, with the gap; nothing on the order changes and nobody is messaged (SIM-F-003: the
// charge the customer saw and paid stays the stored one). Never guessed: no card, a charge that fits several bands or
// none, the paid band itself, practice parcels. A free delivery has no gap. The monthly figure counts the cases and what
// they came to; the log is append-only. Every value is made up.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STEADFAST_PROVIDER } from '@extas/adapters';
import { createRole } from '@extas/auth';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { chargeMismatchSettings } from '@extas/settings';
import { chargeMismatchReport, noteCourierCharge, noteStatementCharges, type Who } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 564 · the charge mismatch log (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  let reporter: Who;
  const bands: Record<'city' | 'sub' | 'out', { id: string; key: string }> = {} as never;
  const db = () => f.t.prisma;
  let n = 0;
  const on = () => f.overrides.set('delivery.chargeMismatch', { enabled: true });

  /** A placed order charged for `band` (its delivery charge `paidMinor`), and a booked parcel with `chargeMinor`. */
  async function parcel(band: keyof typeof bands, opts: { chargeMinor?: number | null; paidMinor?: number; mode?: 'MOCK' | 'LIVE'; weightGrams?: number; codMinor?: number } = {}) {
    n += 1;
    const o = await f.place(`cm-${n}`, { phone: `0170000${String(5640 + n).padStart(4, '0')}` });
    await db().order.update({ where: { id: o.orderId }, data: { deliveryBandId: bands[band].id, deliveryChargeMinor: opts.paidMinor ?? 8_000 } });
    const s = await db().shipment.create({
      data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, status: 'PENDING_PICKUP', mode: opts.mode ?? 'LIVE', idempotencyKey: randomUUID(), bookedAt: f.clock.now, weightGrams: opts.weightGrams ?? 500, chargeMinor: opts.chargeMinor === undefined ? null : opts.chargeMinor, codAmountMinor: opts.codMinor ?? 0 },
    });
    return { shipmentId: s.id, orderId: o.orderId };
  }
  const check = (p: { shipmentId: string }, source: 'booking' | 'tracking' | 'statement' = 'tracking') => noteCourierCharge(f.shippingDeps(), { storeId: f.S, shipmentId: p.shipmentId }, source);
  const rowOf = (shipmentId: string) => db().chargeMismatch.findUnique({ where: { shipmentId } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_mismatch');
    courierId = await f.courier(STEADFAST_PROVIDER, 'Alpha');
    const all = await db().deliveryBand.findMany({ where: { storeId: f.S }, orderBy: { sortOrder: 'asc' }, select: { id: true, key: true } });
    expect(all.length).toBeGreaterThanOrEqual(3);
    [bands.city, bands.sub, bands.out] = [all[0]!, all[1]!, all[2]!];
    // the shop's own charges of the three bands, and the courier's cards: 60 / 100 / 110, a 1% COD fee
    await db().deliveryBand.update({ where: { id: bands.city.id }, data: { chargeMinor: 8_000 } });
    await db().deliveryBand.update({ where: { id: bands.sub.id }, data: { chargeMinor: 10_000 } });
    await db().deliveryBand.update({ where: { id: bands.out.id }, data: { chargeMinor: 13_000 } });
    await db().courierRateCard.createMany({
      data: [
        { storeId: f.S, courierAccountId: courierId, zoneKey: bands.city.key, weightFromGrams: 0, weightToGrams: 1_000, chargeMinor: 6_000, codFeeBps: 100, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: courierId, zoneKey: bands.sub.key, weightFromGrams: 0, weightToGrams: 1_000, chargeMinor: 10_000, codFeeBps: 100, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: courierId, zoneKey: bands.out.key, weightFromGrams: 0, weightToGrams: 1_000, chargeMinor: 11_000, codFeeBps: 100, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: courierId, zoneKey: bands.out.key, weightFromGrams: 1_001, weightToGrams: 3_000, chargeMinor: 10_000, codFeeBps: 100, validFrom: new Date(0) },
      ],
    });
    const role = await createRole(db(), { staffUserId: null }, { key: 'test-reports-564', nameEn: 'reports', nameBn: 'reports', permissions: ['reports.read'] });
    const u = await db().staffUser.create({ data: { email: 'reports-564@example.com', displayName: 'Reports', passwordHash: 'not-a-login' } });
    await db().staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: f.S } });
    reporter = { actor: { staffUserId: u.id }, storeId: f.S };
  });
  afterAll(async () => {
    await f?.t.drop();
  });

  it('is off as shipped: a charge of another band writes nothing', async () => {
    expect(chargeMismatchSettings['delivery.chargeMismatch'].default).toEqual({ enabled: false });
    const p = await parcel('city', { chargeMinor: 11_000 });
    expect(await check(p)).toBe('off');
    expect(await rowOf(p.shipmentId)).toBeNull();
    expect((await chargeMismatchReport(f.shippingDeps(), reporter)).enabled).toBe(false);
  });

  it('SIM-F-003: the courier read another band — recorded once with the gap, the order and the customer untouched', async () => {
    on();
    const p = await parcel('city', { chargeMinor: 11_000 });
    const before = await db().order.findUniqueOrThrow({ where: { id: p.orderId } });
    const sent = await db().notificationAttempt.count();
    expect(await check(p)).toBe('recorded');
    expect(await rowOf(p.shipmentId)).toMatchObject({
      orderId: p.orderId,
      courierAccountId: courierId,
      chargedBandKey: bands.city.key,
      courierBandKey: bands.out.key,
      chargedBandMinor: 8_000,
      courierBandMinor: 13_000,
      differenceMinor: 5_000,
      freeDelivery: false,
      courierChargeMinor: 11_000,
      weightGrams: 500,
      source: 'tracking',
    });
    const after = await db().order.findUniqueOrThrow({ where: { id: p.orderId } });
    expect({ band: after.deliveryBandId, charge: after.deliveryChargeMinor, total: after.totalMinor, status: after.status }).toEqual({ band: before.deliveryBandId, charge: before.deliveryChargeMinor, total: before.totalMinor, status: before.status });
    expect(await db().notificationAttempt.count()).toBe(sent);
    // once per parcel, whatever reads it again
    expect(await check(p, 'statement')).toBe('already');
    expect(await db().chargeMismatch.count({ where: { shipmentId: p.shipmentId } })).toBe(1);
  });

  it('the charge with its COD fee counts; the other way round is a negative gap', async () => {
    on();
    // outside band paid, the courier charged the city card plus 1% of ৳1,000 COD
    const p = await parcel('out', { chargeMinor: 7_000, paidMinor: 13_000, codMinor: 100_000 });
    expect(await check(p, 'booking')).toBe('recorded');
    expect(await rowOf(p.shipmentId)).toMatchObject({ chargedBandKey: bands.out.key, courierBandKey: bands.city.key, differenceMinor: -5_000, source: 'booking' });
  });

  it('never guessed: the paid band itself, no charge, no band, no fitting card, several fitting bands, practice parcels', async () => {
    on();
    expect(await check(await parcel('city', { chargeMinor: 6_000 }))).toBe('same');
    expect(await check(await parcel('city', { chargeMinor: null }))).toBe('noCharge');
    expect(await check(await parcel('city', { chargeMinor: 9_999 }))).toBe('unread');
    const loose = await parcel('city', { chargeMinor: 11_000 });
    await db().order.update({ where: { id: loose.orderId }, data: { deliveryBandId: null } });
    expect(await check(loose)).toBe('noBand');
    // ৳110 with ৳1,000 COD fits the sub-area card with its 1% fee and the outside card as it is: two bands, not read
    expect(await check(await parcel('city', { chargeMinor: 11_000, codMinor: 100_000 }))).toBe('unread');
    expect(await check(await parcel('city', { chargeMinor: 11_000, mode: 'MOCK' }))).toBe('practice');
    // the weight picks the card: at 2 kg only the outside card of ৳100 fits
    expect(await check(await parcel('city', { chargeMinor: 10_000, weightGrams: 2_000 }))).toBe('recorded');
  });

  it('a free delivery is recorded with no gap', async () => {
    on();
    const p = await parcel('city', { chargeMinor: 11_000, paidMinor: 0 });
    expect(await check(p)).toBe('recorded');
    expect(await rowOf(p.shipmentId)).toMatchObject({ freeDelivery: true, differenceMinor: 0 });
  });

  it("a statement's charge wins over the parcel's own, and one bad line never stops the rest", async () => {
    on();
    const a = await parcel('city', { chargeMinor: 6_000 });
    const b = await parcel('city');
    expect(await noteStatementCharges(f.shippingDeps(), f.S, [{ shipmentId: a.shipmentId, chargeMinor: 11_000 }, { shipmentId: randomUUID(), chargeMinor: 11_000 }, { shipmentId: b.shipmentId, chargeMinor: 0 }])).toBe(1);
    expect(await rowOf(a.shipmentId)).toMatchObject({ courierBandKey: bands.out.key, courierChargeMinor: 11_000, source: 'statement' });
    expect(await rowOf(b.shipmentId)).toBeNull();
  });

  it('the log is append-only', async () => {
    const r = await db().chargeMismatch.findFirstOrThrow({ where: { storeId: f.S } });
    await expect(db().chargeMismatch.update({ where: { id: r.id }, data: { differenceMinor: 0 } })).rejects.toThrow();
    await expect(db().chargeMismatch.delete({ where: { id: r.id } })).rejects.toThrow();
  });

  it('the monthly figure: cases, paid less and paid more, the latest cases with names; reports.read only', async () => {
    on();
    await expect(chargeMismatchReport(f.shippingDeps(), f.looker)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const rows = await db().chargeMismatch.findMany({ where: { storeId: f.S } });
    const r = await chargeMismatchReport(f.shippingDeps(), reporter, { months: 3, recent: 50 });
    expect(r.enabled).toBe(true);
    expect(r.months).toHaveLength(3);
    expect(r.months[1]).toMatchObject({ cases: 0, underMinor: 0, overMinor: 0 });
    expect(r.months[0]).toEqual({
      month: r.months[0]!.month,
      cases: rows.length,
      underMinor: rows.filter((x) => x.differenceMinor > 0).reduce((s, x) => s + x.differenceMinor, 0),
      overMinor: rows.filter((x) => x.differenceMinor < 0).reduce((s, x) => s - x.differenceMinor, 0),
    });
    expect(r.recent).toHaveLength(rows.length);
    const band = await db().deliveryBand.findUniqueOrThrow({ where: { id: bands.out.id } });
    expect(r.recent.find((x) => x.courierBandKey === bands.out.key)).toMatchObject({ courier: 'Alpha', courierBand: band.nameEn });
  });
});
