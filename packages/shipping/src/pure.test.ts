// PR 175 — the parcel's rules without a database: its state from its events (out of order, unknown words, finished
// parcels, exceptions with their reasons), the rate card by destination and weight (SIM-F-029) and the cost of a
// returned parcel with every part named (SIM-F-027). PR 176: booking's rules — the phone a courier takes, a gift's
// booking day (SIM-F-007), the rider's note, the parcel's description and weight (SIM-F-029).
import { describe, expect, it } from 'vitest';
import { addDays, bookingNoteOf, cameBack, correctionStep, courierPhone, RIDER_NOTE_STATES, returnKindOf, fillTemplate, giftBooking, lateOf, localDay, orderMovesFor, truthSignals, parcelDescription, parcelWeight, rateFor, rtoCostOf, stateOf, type EventFact, type ParcelLine, type RateCardRow } from './pure';

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

describe('booking rules (PR 176)', () => {
  it('a courier calls a Bangladeshi mobile 01XXXXXXXXX; the order\'s +880 form is turned into it, anything else is refused', () => {
    expect(courierPhone('+8801700001760')).toBe('01700001760'); // hardcode-ok: a made-up test number
    expect(courierPhone('01700001760')).toBe('01700001760'); // hardcode-ok: a made-up test number
    expect(courierPhone('+447700900123')).toBeNull(); // hardcode-ok: a made-up test number
    expect(courierPhone('01200001760')).toBeNull(); // hardcode-ok: a made-up test number (no such operator)
    expect(courierPhone(null)).toBeNull();
  });

  it('SIM-F-007: a gift waits until its day less the lead days, in the store\'s own calendar', () => {
    expect(localDay(new Date('2026-10-23T19:30:00Z'), 'Asia/Dhaka')).toBe('2026-10-24'); // hardcode-ok: a fixed test clock
    expect(addDays('2026-10-30', -3)).toBe('2026-10-27'); // hardcode-ok: a fixed test day
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02'); // hardcode-ok: a fixed test day
    expect(giftBooking(null, 2, '2026-10-24')).toEqual({ bookFrom: null, waits: false }); // hardcode-ok: a fixed test day
    expect(giftBooking('2026-10-27', 0, '2026-10-24')).toEqual({ bookFrom: '2026-10-27', waits: true }); // hardcode-ok: a fixed test day
    expect(giftBooking('2026-10-27', 3, '2026-10-24')).toEqual({ bookFrom: '2026-10-24', waits: false }); // hardcode-ok: a fixed test day
  });

  it('the rider\'s note: the owner\'s gift line filled in, then the customer\'s note; empty values leave no gap', () => {
    expect(fillTemplate('Gift from {sender}: on or after {date}. {note}', { sender: 'Rafiq', date: '2026-11-02', note: null })).toBe('Gift from Rafiq: on or after 2026-11-02.'); // hardcode-ok: a fixed test day
    const line = 'Gift from {sender}: deliver on or after {date}. {note}';
    expect(bookingNoteOf({ customerNote: 'Call before coming', gift: null, giftLine: line })).toBe('Call before coming');
    expect(bookingNoteOf({ customerNote: '  ', gift: null, giftLine: line })).toBeNull();
    // CN-018 (4): a Fixed set's line comes first, before the customer's own note
    expect(bookingNoteOf({ customerNote: 'Call before coming', gift: null, giftLine: line, setLines: ['Set Eid pair: deliver whole', ' '] })).toBe('Set Eid pair: deliver whole | Call before coming');
    expect(bookingNoteOf({ customerNote: 'Gate 2', gift: { senderName: 'Rafiq', note: 'Happy Eid!', deliverAfter: '2026-11-02' }, giftLine: line })).toBe('Gift from Rafiq: deliver on or after 2026-11-02. Happy Eid! | Gate 2'); // hardcode-ok: a fixed test day
    expect(bookingNoteOf({ customerNote: null, gift: { senderName: 'R', note: 'x'.repeat(600), deliverAfter: null }, giftLine: line })!.length).toBe(500);
  });

  it('SIM-F-029: the parcel weighs its pieces; one piece without a weight leaves the weight unknown, never guessed', () => {
    const l = (weightGrams: number | null, quantity = 1, over: Partial<ParcelLine> = {}): ParcelLine => ({ productName: 'Oxford shirt', colourName: 'Sky', sizeLabel: 'M', quantity, weightGrams, ...over });
    expect(parcelWeight([l(700, 3)])).toBe(2100);
    expect(parcelWeight([l(700), l(null)])).toBeNull();
    expect(parcelWeight([])).toBeNull();
    expect(parcelDescription([l(700, 2), l(null, 1, { productName: 'Pocket tee', colourName: null, sizeLabel: 'L' })], true)).toBe('Oxford shirt (Sky, M) x2; Pocket tee (L) x1');
    expect(parcelDescription([l(700)], false)).toBeNull();
    expect(parcelDescription(Array.from({ length: 40 }, () => l(700)), true)!.length).toBe(250);
  });
});

describe('PR 184 · the order follows its parcel', () => {
  const p = (status: Parameters<typeof orderMovesFor>[0]['status'], picked = true) => ({ status, pickedAt: picked ? at(0) : null });
  it('picked up moves a packed or confirmed order on; a finished parcel closes it; nothing goes backwards', () => {
    expect(orderMovesFor(p('PENDING_PICKUP', false), 'CONFIRMED')).toEqual([]);
    expect(orderMovesFor(p('PICKED_UP'), 'CONFIRMED')).toEqual(['courierPickedUp']);
    expect(orderMovesFor(p('IN_TRANSIT'), 'HANDED_OVER')).toEqual(['courierPickedUp']);
    expect(orderMovesFor(p('IN_TRANSIT'), 'IN_TRANSIT')).toEqual([]);
    expect(orderMovesFor(p('DELIVERED'), 'PACKED')).toEqual(['courierPickedUp', 'delivered']);
    expect(orderMovesFor(p('DELIVERED'), 'IN_TRANSIT')).toEqual(['delivered']);
    expect(orderMovesFor(p('RETURNED'), 'IN_TRANSIT')).toEqual(['returned']);
    expect(orderMovesFor(p('DELIVERED'), 'DELIVERED')).toEqual([]);
    expect(orderMovesFor(p('DELIVERED'), 'ON_HOLD')).toEqual([]);
    expect(orderMovesFor(p('DELIVERED'), 'CANCELLED')).toEqual([]);
  });

  it('exceptions never move the order; a partial needs its kept pieces; a held "delivered" waits for a person', () => {
    for (const s of ['ATTEMPT_FAILED', 'ADDRESS_PROBLEM', 'LOST', 'DAMAGED', 'RETURNING', 'OUT_FOR_DELIVERY'] as const) expect(orderMovesFor(p(s), 'IN_TRANSIT'), s).toEqual([]);
    expect(orderMovesFor(p('PARTIALLY_DELIVERED'), 'IN_TRANSIT')).toEqual([]);
    expect(orderMovesFor(p('PARTIALLY_DELIVERED'), 'IN_TRANSIT', { keptItemIds: ['k'] })).toEqual(['partiallyDelivered']);
    expect(orderMovesFor(p('DELIVERED'), 'IN_TRANSIT', { holdDelivered: true })).toEqual([]);
  });

  it('SIM-F-018: late past the band\'s most hours plus the grace, only while the courier holds it', () => {
    const o = { placedAt: at(0), hoursMax: 48, status: 'IN_TRANSIT' as const };
    expect(lateOf(o, 0, at(47 * 60))).toEqual({ late: false, dueBy: at(48 * 60) });
    expect(lateOf(o, 0, at(49 * 60)).late).toBe(true);
    expect(lateOf(o, 2, at(49 * 60)).late).toBe(false);
    expect(lateOf({ ...o, status: 'DELIVERED' }, 0, at(99 * 60)).late).toBe(false);
    expect(lateOf({ ...o, hoursMax: null }, 0, at(99 * 60))).toEqual({ late: false, dueBy: null });
    expect(lateOf({ ...o, addressUnclear: true }, 0, at(99 * 60)).late).toBe(false);
  });
});

describe('PR 525 · the true-delivery check', () => {
  const f = { cod: true, codAmountMinor: 176_000, codCollectedMinor: 176_000, deliveryChargeMinor: 6_000, toleranceMinor: 0, doorReturned: false, statementReturn: false, returnReceived: false }; // hardcode-ok: made-up test amounts
  it('a COD parcel collected at no more than the delivery charge (plus tolerance) contradicts "Delivered"', () => {
    expect(truthSignals(f)).toEqual([]);
    expect(truthSignals({ ...f, codCollectedMinor: 6_000 })).toEqual(['CHARGE_ONLY']);
    expect(truthSignals({ ...f, codCollectedMinor: 0 })).toEqual(['CHARGE_ONLY']);
    expect(truthSignals({ ...f, codCollectedMinor: 6_500, toleranceMinor: 500 })).toEqual(['CHARGE_ONLY']);
    expect(truthSignals({ ...f, codCollectedMinor: 6_501, toleranceMinor: 500 })).toEqual([]);
    // the courier said no amount, a prepaid parcel, or nothing due beyond the charge: no sign
    expect(truthSignals({ ...f, codCollectedMinor: null })).toEqual([]);
    expect(truthSignals({ ...f, cod: false, codCollectedMinor: 0 })).toEqual([]);
    expect(truthSignals({ ...f, codAmountMinor: 6_000, codCollectedMinor: 6_000 })).toEqual([]);
  });

  it('the shop\'s own records each add their sign', () => {
    expect(truthSignals({ ...f, doorReturned: true, statementReturn: true, returnReceived: true })).toEqual(['DOOR_RETURNED', 'STATEMENT', 'RETURN_RECEIVED']);
  });

  it('a person\'s answer runs the order\'s own step from where the order is', () => {
    expect(correctionStep('DELIVERED', 'IN_TRANSIT')).toBe('delivered');
    expect(correctionStep('DELIVERED', 'DELIVERED')).toBeNull();
    expect(correctionStep('CHARGE_PAID_RETURN', 'IN_TRANSIT')).toBe('returned');
    expect(correctionStep('RETURNED', 'HANDED_OVER')).toBe('returned');
    expect(correctionStep('RETURNED', 'DELIVERED')).toBe('deliveryCorrected');
    expect(correctionStep('RETURNED', 'RETURNED')).toBeNull();
  });
});

describe('PR 526 · a parcel that came back', () => {
  it('came back: the courier says returning, returned or partly delivered, or the order was corrected to returned', () => {
    for (const s of ['RETURNING', 'RETURNED', 'PARTIALLY_DELIVERED']) expect(cameBack(s, 'IN_TRANSIT'), s).toBe(true);
    expect(cameBack('DELIVERED', 'RETURNED')).toBe(true);
    for (const s of ['DELIVERED', 'ATTEMPT_FAILED', 'IN_TRANSIT', 'LOST']) expect(cameBack(s, 'IN_TRANSIT'), s).toBe(false);
  });

  it("the rider's note is kept on door outcomes only; the return's kind follows the money the courier reports", () => {
    expect([...RIDER_NOTE_STATES].sort()).toEqual(['ATTEMPT_FAILED', 'PARTIALLY_DELIVERED', 'RETURNED', 'RETURNING']);
    expect(returnKindOf('RETURNED', null)).toBe('REFUSED_AT_DOOR');
    expect(returnKindOf('RETURNED', 0)).toBe('REFUSED_AT_DOOR');
    expect(returnKindOf('RETURNED', 6_000)).toBe('CHARGE_PAID_RETURN'); // hardcode-ok: a made-up test amount
    expect(returnKindOf('PARTIALLY_DELIVERED', 90_000)).toBe('REFUSED_AT_DOOR'); // hardcode-ok: a made-up test amount
  });
});
