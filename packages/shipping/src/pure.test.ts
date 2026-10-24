// PR 175 — the parcel's rules without a database: its state from its events (out of order, unknown words, finished
// parcels, exceptions with their reasons), the rate card by destination and weight (SIM-F-029) and the cost of a
// returned parcel with every part named (SIM-F-027).
import { describe, expect, it } from 'vitest';
import { rateFor, rtoCostOf, stateOf, type EventFact, type RateCardRow } from './pure';

const T0 = new Date('2026-10-20T10:00:00Z').getTime(); // hardcode-ok: a fixed test clock
const at = (min: number) => new Date(T0 + min * 60_000);
const ev = (status: EventFact['status'], min: number, over: Partial<EventFact> = {}): EventFact => ({
  status,
  mapped: true,
  rawStatus: status.toLowerCase(),
  reasonKey: null,
  occurredAt: at(min),
  createdAt: at(min),
  codCollectedMinor: null,
  chargeMinor: null,
  ...over,
});
const booked = { status: 'PENDING_PICKUP' as const, chargeMinor: null, codCollectedMinor: null };

describe('a parcel state from its events (PR 175)', () => {
  it('the newest understood event wins, whatever order they arrived in', () => {
    const events = [ev('OUT_FOR_DELIVERY', 30, { createdAt: at(31) }), ev('PICKED_UP', 10, { createdAt: at(40) }), ev('IN_TRANSIT', 20, { createdAt: at(50) })];
    const s = stateOf(booked, events);
    expect(s.status).toBe('OUT_FOR_DELIVERY');
    expect(s.pickedAt).toEqual(at(10));
    expect(s.deliveredAt).toBeNull();
  });

  it('an unknown courier word is kept as the provider status but never moves the state', () => {
    const s = stateOf(booked, [ev('IN_TRANSIT', 10), ev('IN_TRANSIT', 20, { mapped: false, rawStatus: 'teleported' })]);
    expect(s.status).toBe('IN_TRANSIT');
    expect(s.providerStatus).toBe('teleported');
  });

  it('SIM-F-017: an exception shows with its reason; the next courier step clears it', () => {
    const fail = ev('ATTEMPT_FAILED', 40, { reasonKey: 'receiverUnreachable' });
    expect(stateOf(booked, [ev('OUT_FOR_DELIVERY', 30), fail])).toMatchObject({ status: 'ATTEMPT_FAILED', exceptionKey: 'receiverUnreachable' });
    expect(stateOf(booked, [ev('OUT_FOR_DELIVERY', 30), fail, ev('OUT_FOR_DELIVERY', 50)])).toMatchObject({ status: 'OUT_FOR_DELIVERY', exceptionKey: null });
    expect(stateOf(booked, [ev('IN_TRANSIT', 10), ev('LOST', 20, { reasonKey: 'lostInTransit' })])).toMatchObject({ status: 'LOST', exceptionKey: 'lostInTransit' });
  });

  it('a finished parcel stays finished, and a parcel whose cancel is asked stays with the order service (D5)', () => {
    expect(stateOf({ ...booked, status: 'DELIVERED' }, [ev('OUT_FOR_DELIVERY', 99)]).status).toBe('DELIVERED');
    expect(stateOf({ ...booked, status: 'RETURNED' }, [ev('IN_TRANSIT', 99)]).status).toBe('RETURNED');
    expect(stateOf({ ...booked, status: 'CANCEL_REQUESTED' }, [ev('PICKED_UP', 5)]).status).toBe('CANCEL_REQUESTED');
  });

  it('dates and amounts come only from what the courier reported (latest collected amount; the first charge is kept)', () => {
    const s = stateOf(booked, [
      ev('PICKED_UP', 5, { chargeMinor: 6_000 }),
      ev('DELIVERED', 50, { codCollectedMinor: 100_000 }),
      ev('DELIVERED', 60, { codCollectedMinor: 120_000, chargeMinor: 9_000 }),
    ]);
    expect(s).toMatchObject({ status: 'DELIVERED', deliveredAt: at(50), codCollectedMinor: 120_000, chargeMinor: 9_000 });
    expect(stateOf({ ...booked, chargeMinor: 5_000 }, [ev('PICKED_UP', 5, { chargeMinor: 6_000 })]).chargeMinor).toBe(5_000);
    expect(stateOf(booked, [ev('RETURNING', 5), ev('RETURNED', 9)])).toMatchObject({ returnedAt: at(9), deliveredAt: null });
  });
});

describe('the rate card (SIM-F-029)', () => {
  const card = (from: number, to: number, charge: number, over: Partial<RateCardRow> = {}): RateCardRow => ({ zoneKey: 'outside-dhaka', weightFromGrams: from, weightToGrams: to, chargeMinor: charge, returnChargeMinor: null, validFrom: at(-1_000), validTo: null, ...over });
  const cards = [card(0, 1_000, 11_000), card(1_001, 2_000, 13_000), card(2_001, 3_000, 15_000)];

  it('a 2.1 kg parcel is priced by its own slab, not the 1 kg one', () => {
    expect(rateFor(cards, { zoneKey: 'outside-dhaka', weightGrams: 2_100, at: at(0) })?.chargeMinor).toBe(15_000);
    expect(rateFor(cards, { zoneKey: 'outside-dhaka', weightGrams: 500, at: at(0) })?.chargeMinor).toBe(11_000);
  });

  it('no row, another zone, no weight with several slabs, or a card not valid then: no price (never the lightest by default)', () => {
    expect(rateFor(cards, { zoneKey: 'dhaka-city', weightGrams: 500, at: at(0) })).toBeNull();
    expect(rateFor(cards, { zoneKey: null, weightGrams: 500, at: at(0) })).toBeNull();
    expect(rateFor(cards, { zoneKey: 'outside-dhaka', weightGrams: null, at: at(0) })).toBeNull();
    expect(rateFor(cards, { zoneKey: 'outside-dhaka', weightGrams: 9_000, at: at(0) })).toBeNull();
    expect(rateFor([card(0, 5_000, 9_000)], { zoneKey: 'outside-dhaka', weightGrams: null, at: at(0) })?.chargeMinor).toBe(9_000);
    expect(rateFor([card(0, 5_000, 9_000, { validFrom: at(10) })], { zoneKey: 'outside-dhaka', weightGrams: 100, at: at(0) })).toBeNull();
  });

  it('a newer price list wins over an older one for the same slab', () => {
    const old = card(0, 1_000, 10_000, { validFrom: at(-1_000), validTo: at(-10) });
    const now = card(0, 1_000, 12_000, { validFrom: at(-10) });
    expect(rateFor([old, now], { zoneKey: 'outside-dhaka', weightGrams: 300, at: at(0) })?.chargeMinor).toBe(12_000);
    expect(rateFor([old, now], { zoneKey: 'outside-dhaka', weightGrams: 300, at: at(-500) })?.chargeMinor).toBe(10_000);
  });
});

describe('the cost of a returned parcel (SIM-F-027)', () => {
  const all = { forward: true, return: true, packaging: true, handling: true, adShare: false } as const;

  it('counts both courier legs — never only the return fee — plus packaging and handling', () => {
    const c = rtoCostOf({ forwardMinor: 10_000, returnMinor: 5_000, packagingMinor: 2_000, handlingMinor: 3_000, adShareMinor: 40_000 }, all);
    expect(c).toMatchObject({ knownMinor: 20_000, missing: [], complete: true });
    expect(c.parts.map((p) => p.key)).toEqual(['forward', 'return', 'packaging', 'handling']);
    expect(rtoCostOf({ forwardMinor: 10_000, returnMinor: 5_000, packagingMinor: 2_000, handlingMinor: 3_000, adShareMinor: 40_000 }, { ...all, adShare: true }).knownMinor).toBe(60_000);
  });

  it('a part not entered is named as missing, not counted as zero; a zero the owner typed is a real zero', () => {
    const c = rtoCostOf({ forwardMinor: 10_000, returnMinor: null, packagingMinor: null, handlingMinor: null, adShareMinor: null }, all);
    expect(c).toMatchObject({ knownMinor: 10_000, missing: ['return', 'packaging', 'handling'], complete: false });
    // a courier with no return charge: the owner enters 0 on its rate card
    expect(rtoCostOf({ forwardMinor: 10_000, returnMinor: 0, packagingMinor: 0, handlingMinor: 0, adShareMinor: null }, all)).toMatchObject({ knownMinor: 10_000, complete: true });
  });
});
