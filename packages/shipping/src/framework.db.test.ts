// PR 175 on a real PostgreSQL (a throwaway database with the real migrations; skipped without TEST_DATABASE_ADMIN_URL):
// the courier accounts (practice mode until keyed; archived, never deleted), a parcel's events from the practice
// courier stored once each with its state worked out from them — the exceptions of SIM-F-017 with their reasons, out of
// order, unknown words — staff recording an exception, and the RTO cost book of SIM-F-027 (both legs, missing parts
// named, practice parcels never real cost). Every value is a made-up test value.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MOCK_COURIER_PROVIDER, MOCK_SCRIPTS, mockCourierWorld, type CourierApi, type MockScenario } from '@extas/adapters';
import { HAS_TEST_DB } from '@extas/auth/testing';
import { shippingSettings } from '@extas/settings';
import { addCourier, applyEvents, getParcel, listCouriers, listParcels, recordException, rtoBook, updateCourier } from './index';
import { setUpShipping, type ShippingFixture } from './testing';

describe.skipIf(!HAS_TEST_DB)('PR 175 · the courier framework (PostgreSQL)', () => {
  let f: ShippingFixture;
  let courierId: string;
  let api: CourierApi;
  const db = () => f.t.prisma;
  let n = 0;

  /** A parcel booked on the practice courier for a fresh order, as PR 176's booking writes it. */
  async function parcel(scenario: MockScenario, opts: { mode?: 'MOCK' | 'LIVE'; weightGrams?: number | null; chargeMinor?: number | null } = {}) {
    n += 1;
    const o = await f.place(`fw-${n}`, { phone: `0170000${String(1750 + n).padStart(4, '0')}` });
    const ref = `${o.number}-1`;
    mockCourierWorld(MOCK_COURIER_PROVIDER).plan(ref, scenario);
    const booked = await api.book({ merchantRef: ref, receiver: { name: 'Test Receiver', phone: '01700001750', address: 'House 1, Dhaka' }, zone: { cityId: null, zoneId: null, areaId: null }, codMinor: 0, declaredValueMinor: null, weightGrams: null, itemCount: 1, description: null, note: null }); // hardcode-ok: a made-up test number
    if (!booked.ok) throw new Error(booked.error);
    const s = await db().shipment.create({
      data: { storeId: f.S, orderId: o.orderId, courierAccountId: courierId, consignmentId: booked.consignmentId, trackingCode: booked.trackingCode, status: booked.status!, providerStatus: booked.rawStatus, mode: opts.mode ?? 'MOCK', merchantRef: ref, idempotencyKey: randomUUID(), bookedAt: f.clock.now, weightGrams: opts.weightGrams ?? null, chargeMinor: opts.chargeMinor ?? null },
    });
    return { shipmentId: s.id, orderId: o.orderId, number: o.number, consignmentId: booked.consignmentId, ref };
  }
  const poll = async (p: { shipmentId: string; consignmentId: string; ref: string }) => applyEvents(f.shippingDeps(), { storeId: f.S, shipmentId: p.shipmentId }, await api.track({ consignmentId: p.consignmentId, trackingCode: null, merchantRef: p.ref }), 'poll');
  const row = (id: string) => db().shipment.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    f = await setUpShipping('shipping_fw');
    courierId = await f.courier(MOCK_COURIER_PROVIDER, 'Practice courier');
    api = await f.api(MOCK_COURIER_PROVIDER);
    mockCourierWorld(MOCK_COURIER_PROVIDER).useClock(() => f.clock.now.getTime());
  });
  afterAll(async () => {
    mockCourierWorld(MOCK_COURIER_PROVIDER).useClock(null);
    await f?.t.drop();
  });

  it('courier accounts: practice mode until keyed, a known adapter only, no twins, archived (and switched off) — never deleted', async () => {
    const d = f.shippingDeps();
    const list = await listCouriers(d, f.looker);
    expect(list.providers).toContain(MOCK_COURIER_PROVIDER);
    expect(list.couriers.find((c) => c.id === courierId)).toMatchObject({ mode: 'MOCK', enabled: true, archived: false });
    await expect(addCourier(d, f.looker, { providerKey: MOCK_COURIER_PROVIDER, name: 'X' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(addCourier(d, f.shipper, { providerKey: 'teleport', name: 'X' })).rejects.toMatchObject({ code: 'UNKNOWN_PROVIDER' });
    const added = await addCourier(d, f.shipper, { providerKey: MOCK_COURIER_PROVIDER, name: 'Second practice' });
    expect(added).toMatchObject({ enabled: true, mode: 'MOCK' });
    await expect(addCourier(d, f.shipper, { providerKey: MOCK_COURIER_PROVIDER, name: 'Second practice' })).rejects.toMatchObject({ code: 'DUPLICATE' });
    const gone = await updateCourier(d, f.shipper, added.id, { archived: true });
    expect(gone).toMatchObject({ archived: true, enabled: false });
    expect((await listCouriers(d, f.looker)).couriers.map((c) => c.id)).not.toContain(added.id);
    expect((await listCouriers(d, f.looker, { includeArchived: true })).couriers.map((c) => c.id)).toContain(added.id);
    expect(await db().courierAccount.count({ where: { id: added.id } })).toBe(1);
    expect(await db().auditLog.count({ where: { entityId: added.id, action: { in: ['courier.add', 'courier.update'] } } })).toBe(2);
    // a connection keyed and tested shows its mode (the account follows its provider's connection)
    await db().integration.create({ data: { kind: 'COURIER', provider: MOCK_COURIER_PROVIDER, name: 'practice', mode: 'SANDBOX', enabled: true, storeId: f.S } });
    expect((await listCouriers(d, f.looker)).couriers.find((c) => c.id === courierId)?.mode).toBe('SANDBOX');
    await db().integration.updateMany({ where: { kind: 'COURIER' }, data: { enabled: false } });
  });

  it.each(['failedAttempt', 'addressProblem', 'lost', 'damaged'] as const)('SIM-F-017: a "%s" parcel shows its exception with the reason; a repeated poll stores nothing twice', async (scenario) => {
    const p = await parcel(scenario);
    const script = MOCK_SCRIPTS[scenario];
    const seen: string[] = [];
    let exception: { status: string; key: string | null } | null = null;
    for (let i = 0; i < script.length + 1; i++) {
      const r = await poll(p);
      const s = await row(p.shipmentId);
      seen.push(s.status);
      if (['ATTEMPT_FAILED', 'ADDRESS_PROBLEM', 'LOST', 'DAMAGED'].includes(s.status)) exception = { status: s.status, key: s.exceptionKey };
      expect(r.unmapped).toBe(0);
    }
    const expected = script.find((x) => x.reasonKey)!;
    expect(exception).toEqual({ status: expected.status, key: expected.reasonKey });
    const events = await db().shipmentEvent.count({ where: { shipmentId: p.shipmentId } });
    expect(events).toBe(script.length);
    // the courier sends the same history again: nothing new is stored, nothing changes
    const again = await poll(p);
    expect(again).toMatchObject({ added: 0, changed: false });
    expect(await db().shipmentEvent.count({ where: { shipmentId: p.shipmentId } })).toBe(events);
    const s = await row(p.shipmentId);
    expect(s.status).toBe(script[script.length - 1]!.status);
    expect(s.lastTrackedAt).toEqual(f.clock.now);
    expect(s.pickedAt).not.toBeNull();
    // the parcel page shows every event, newest first, with the courier's words and the reason
    const page = await getParcel(f.shippingDeps(), f.shipper, p.shipmentId);
    expect(page.events.find((e) => e.status === expected.status)).toMatchObject({ reasonKey: expected.reasonKey, source: 'poll' });
    expect(page.order.number).toBe(p.number);
  });

  it('out of order and unknown words: a late old event never moves the parcel back; an unknown word is kept raw and flagged', async () => {
    const p = await parcel('delivered');
    const t = (min: number) => new Date(f.clock.now.getTime() + min * 60_000);
    const e = (id: string, status: 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'PICKED_UP' | null, min: number, raw = String(status).toLowerCase()) => ({ providerEventId: id, status, rawStatus: raw, occurredAt: t(min), note: null, reasonKey: null, codCollectedMinor: null, chargeMinor: null });
    const ref = { storeId: f.S, shipmentId: p.shipmentId };
    expect(await applyEvents(f.shippingDeps(), ref, [e('x3', 'OUT_FOR_DELIVERY', 30)], 'webhook')).toMatchObject({ status: 'OUT_FOR_DELIVERY', changed: true });
    expect(await applyEvents(f.shippingDeps(), ref, [e('x1', 'PICKED_UP', 10), e('x2', 'IN_TRANSIT', 20)], 'poll')).toMatchObject({ added: 2, status: 'OUT_FOR_DELIVERY', changed: false });
    const odd = await applyEvents(f.shippingDeps(), ref, [e('x4', null, 40, 'hub_reshuffle')], 'poll');
    expect(odd).toMatchObject({ added: 1, unmapped: 1, status: 'OUT_FOR_DELIVERY', changed: false });
    const s = await row(p.shipmentId);
    expect(s.providerStatus).toBe('hub_reshuffle');
    expect(s.pickedAt).toEqual(t(10));
    const stored = await db().shipmentEvent.findFirstOrThrow({ where: { shipmentId: p.shipmentId, providerEventId: 'x4' } });
    expect(stored).toMatchObject({ status: 'OUT_FOR_DELIVERY', rawStatus: 'hub_reshuffle', data: { unmapped: true } });
  });

  it('SIM-F-017: staff record an exception the courier phoned in — a reason of that exception only, on a parcel the courier holds; audited', async () => {
    const p = await parcel('delivered');
    await poll(p);
    const d = f.shippingDeps();
    await expect(recordException(d, f.looker, p.shipmentId, { status: 'ATTEMPT_FAILED', reasonKey: 'receiverUnreachable' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(recordException(d, f.shipper, p.shipmentId, { status: 'ATTEMPT_FAILED', reasonKey: 'lostInTransit' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(recordException(d, f.shipper, p.shipmentId, { status: 'DELIVERED', reasonKey: 'other' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(recordException(d, f.shipper, randomUUID(), { status: 'LOST', reasonKey: 'other' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    f.clock.now = new Date(f.clock.now.getTime() + 3 * 3_600_000);
    const r = await recordException(d, f.shipper, p.shipmentId, { status: 'ADDRESS_PROBLEM', reasonKey: 'addressIncomplete', note: 'no house number' });
    expect(r).toMatchObject({ status: 'ADDRESS_PROBLEM', changed: true });
    expect(await row(p.shipmentId)).toMatchObject({ status: 'ADDRESS_PROBLEM', exceptionKey: 'addressIncomplete' });
    const ev = await db().shipmentEvent.findFirstOrThrow({ where: { shipmentId: p.shipmentId, source: 'staff' } });
    expect(ev).toMatchObject({ actorId: f.staffId, reasonKey: 'addressIncomplete', message: 'no house number' });
    expect(await db().auditLog.count({ where: { entityId: p.shipmentId, action: 'shipment.exception' } })).toBe(1);
    // listed under the exceptions
    const ex = await listParcels(d, f.shipper, { view: 'exceptions' });
    expect(ex.rows.map((x) => x.id)).toContain(p.shipmentId);
    expect(ex.counts.exceptions).toBeGreaterThanOrEqual(1);
    await expect(listParcels(d, f.looker, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // a finished parcel takes no exception
    const done = await parcel('delivered');
    for (let i = 0; i < 6; i++) await poll(done);
    expect((await row(done.shipmentId)).status).toBe('DELIVERED');
    await expect(recordException(d, f.shipper, done.shipmentId, { status: 'DAMAGED', reasonKey: 'wetOrTorn' })).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
  });

  it('SIM-F-027: the RTO cost book counts both legs, names what is not entered, and never treats a practice parcel as real cost', async () => {
    const d = f.shippingDeps();
    expect(shippingSettings['delivery.courier.rtoCost'].default).toMatchObject({ packagingMinor: null, handlingMinor: null, adShareMinor: null });
    // the owner's rate card for the outside band: 1 kg and 2 kg slabs, no return charge entered yet
    const band = await db().order.findFirstOrThrow({ where: { storeId: f.S, deliveryBandId: { not: null } }, select: { deliveryBand: { select: { key: true, id: true } } } });
    const zoneKey = band.deliveryBand!.key;
    await db().courierRateCard.createMany({
      data: [
        { storeId: f.S, courierAccountId: courierId, zoneKey, weightFromGrams: 0, weightToGrams: 1_000, chargeMinor: 6_000, validFrom: new Date(0) },
        { storeId: f.S, courierAccountId: courierId, zoneKey, weightFromGrams: 1_001, weightToGrams: 3_000, chargeMinor: 8_000, validFrom: new Date(0) },
      ],
    });
    const live = await parcel('refused', { mode: 'LIVE', weightGrams: 2_100 });
    const practice = await parcel('refused', { mode: 'MOCK', weightGrams: 400 });
    await db().order.updateMany({ where: { id: { in: [live.orderId, practice.orderId] } }, data: { deliveryBandId: band.deliveryBand!.id } });
    for (let i = 0; i < 7; i++) {
      await poll(live);
      await poll(practice);
    }
    expect((await row(live.shipmentId)).status).toBe('RETURNED');
    expect((await row(practice.shipmentId)).status).toBe('RETURNED');

    const book = await rtoBook(d, f.shipper, {});
    expect(book.rows.map((r) => r.shipmentId)).toEqual([live.shipmentId]);
    const r = book.rows[0]!;
    // the 2.1 kg parcel's forward leg from its own slab; the return charge and the owner's figures are named as missing
    expect(r.cost.parts.find((x) => x.key === 'forward')?.minor).toBe(8_000);
    expect(r.cost).toMatchObject({ knownMinor: 8_000, complete: false, missing: ['return', 'packaging', 'handling'] });
    expect(book.real).toMatchObject({ parcels: 1, knownMinor: 8_000, incomplete: 1, missing: { return: 1, packaging: 1, handling: 1, forward: 0, adShare: 0 } });
    expect(book.practice).toBeNull();
    // with practice parcels: listed and marked, summed apart, never in the real total
    const both = await rtoBook(d, f.shipper, { practice: '1' });
    expect(both.rows.find((x) => x.shipmentId === practice.shipmentId)).toMatchObject({ practice: true });
    expect(both.real.parcels).toBe(1);
    expect(both.practice).toMatchObject({ parcels: 1, knownMinor: 6_000 });
    // the owner enters his figures (and 0 for a courier that charges nothing back): the cost is complete
    await db().courierRateCard.updateMany({ where: { courierAccountId: courierId }, data: { returnChargeMinor: 0 } });
    f.overrides.set('delivery.courier.rtoCost', { ...shippingSettings['delivery.courier.rtoCost'].default, packagingMinor: 1_500, handlingMinor: 2_000 });
    const full = await rtoBook(d, f.shipper, {});
    expect(full.real).toMatchObject({ parcels: 1, knownMinor: 11_500, incomplete: 0 });
    // the courier's own reported charge wins over the card
    await db().shipment.update({ where: { id: live.shipmentId }, data: { chargeMinor: 9_000 } });
    expect((await rtoBook(d, f.shipper, {})).real.knownMinor).toBe(12_500);
    expect((await rtoBook(d, f.shipper, { from: new Date(f.clock.now.getTime() + 86_400_000).toISOString() })).rows).toHaveLength(0);
    f.overrides.delete('delivery.courier.rtoCost');
  });
});
