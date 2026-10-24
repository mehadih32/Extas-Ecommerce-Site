// PR 175 — the parcel's rules without a database (BACKEND-ARCHITECTURE §6.5.2): which states the courier still holds a
// parcel in, how a parcel's current state follows from its events (out-of-order safe), the courier's cost for a parcel
// from the owner's rate card (by destination and weight, SIM-F-029), and the cost of a parcel that came back (RTO,
// SIM-F-027) — every part named, a part the owner has not entered shown as missing, never as zero.
import type { Prisma } from '@extas/db/client';

/** Prisma's ShipmentStatus (with the exception states of migration 0033). */
export type ShipmentStatus = Prisma.ShipmentGetPayload<{ select: { status: true } }>['status'];

/** The courier holds the parcel and still reports on it: tracked. */
export const ACTIVE_STATES = [
  'IN_REVIEW',
  'PENDING_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'ATTEMPT_FAILED',
  'ADDRESS_PROBLEM',
  'LOST',
  'DAMAGED',
  'RETURNING',
] as const satisfies readonly ShipmentStatus[];

/** Finished: no courier report changes these (a correction of a finished parcel is PR 525's reconciliation). */
export const FINAL_STATES: ReadonlySet<ShipmentStatus> = new Set(['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED']);

/** SIM-F-017: the exception states. */
export const EXCEPTION_STATUSES = ['ATTEMPT_FAILED', 'ADDRESS_PROBLEM', 'LOST', 'DAMAGED'] as const satisfies readonly ShipmentStatus[];
const EXCEPTIONS: ReadonlySet<string> = new Set(EXCEPTION_STATUSES);
export const isException = (s: string): boolean => EXCEPTIONS.has(s);

/** The parcel has left the shop (any state after the courier picked it up). */
const AFTER_PICKUP: ReadonlySet<ShipmentStatus> = new Set(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED', 'ATTEMPT_FAILED', 'ADDRESS_PROBLEM', 'LOST', 'DAMAGED', 'RETURNING', 'RETURNED']);

/** One stored event as the state rule reads it. */
export interface EventFact {
  status: ShipmentStatus;
  /** False when the courier's word was not in the adapter's table (kept raw, flagged; never moves the state). */
  mapped: boolean;
  rawStatus: string | null;
  reasonKey: string | null;
  occurredAt: Date;
  createdAt: Date;
  codCollectedMinor: number | null;
  chargeMinor: number | null;
}

export interface ParcelState {
  status: ShipmentStatus;
  providerStatus: string | null;
  exceptionKey: string | null;
  pickedAt: Date | null;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  codCollectedMinor: number | null;
  chargeMinor: number | null;
}

const byTime = (a: EventFact, b: EventFact) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime();

/**
 * The parcel's state from all its events: the newest event the courier's table understood wins, whatever order the
 * events arrived in (a late poll of an old step never moves a parcel back). A finished parcel stays finished, and a
 * parcel whose cancel is being asked stays with the order service (D5) — their events are kept, not applied.
 */
export function stateOf(current: { status: ShipmentStatus; chargeMinor: number | null; codCollectedMinor: number | null }, events: readonly EventFact[]): ParcelState {
  const sorted = [...events].sort(byTime);
  const mapped = sorted.filter((e) => e.mapped);
  const newest = mapped[mapped.length - 1] ?? null;
  const held = FINAL_STATES.has(current.status) || current.status === 'CANCEL_REQUESTED';
  const status = held || !newest ? current.status : newest.status;
  const lastOf = (s: ShipmentStatus) => [...mapped].reverse().find((e) => e.status === s) ?? null;
  const firstWhere = (f: (e: EventFact) => boolean) => mapped.find(f)?.occurredAt ?? null;
  const latest = <K extends 'codCollectedMinor' | 'chargeMinor'>(k: K) => [...sorted].reverse().find((e) => e[k] !== null)?.[k] ?? null;
  return {
    status,
    providerStatus: sorted[sorted.length - 1]?.rawStatus ?? null,
    exceptionKey: isException(status) ? (lastOf(status)?.reasonKey ?? null) : null,
    pickedAt: firstWhere((e) => AFTER_PICKUP.has(e.status)),
    deliveredAt: firstWhere((e) => e.status === 'DELIVERED' || e.status === 'PARTIALLY_DELIVERED'),
    returnedAt: firstWhere((e) => e.status === 'RETURNED'),
    codCollectedMinor: latest('codCollectedMinor') ?? current.codCollectedMinor,
    chargeMinor: current.chargeMinor ?? latest('chargeMinor'),
  };
}

/** One row of the owner's rate card (CourierRateCard; owner data, empty by default). */
export interface RateCardRow {
  zoneKey: string;
  weightFromGrams: number;
  weightToGrams: number;
  chargeMinor: number;
  returnChargeMinor: number | null;
  validFrom: Date;
  validTo: Date | null;
}

/**
 * The courier's charge for a parcel to `zoneKey` weighing `weightGrams`, from the owner's rate card (SIM-F-029: a 2.1 kg
 * parcel is priced by its own slab, not the 1 kg one). Null when the card has no row for it, or when the weight is not
 * known and the zone has more than one slab (never the lightest slab by default: that would understate the cost).
 */
export function rateFor(cards: readonly RateCardRow[], q: { zoneKey: string | null; weightGrams: number | null; at: Date }): RateCardRow | null {
  if (!q.zoneKey) return null;
  const t = q.at.getTime();
  const valid = cards.filter((c) => c.zoneKey === q.zoneKey && c.validFrom.getTime() <= t && (!c.validTo || c.validTo.getTime() > t));
  if (!valid.length) return null;
  if (q.weightGrams === null) return valid.length === 1 ? valid[0]! : null;
  const fits = valid.filter((c) => c.weightFromGrams <= q.weightGrams! && q.weightGrams! <= c.weightToGrams);
  // the newest card that fits (a new price list starts with a later validFrom)
  return fits.sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0] ?? null;
}

/** The parts of a returned parcel's cost (SIM-F-027), in the order the book shows them. */
export const RTO_PARTS = ['forward', 'return', 'packaging', 'handling', 'adShare'] as const;
export type RtoPart = (typeof RTO_PARTS)[number];

export interface RtoInputs {
  /** The courier's charge for taking it out (its own report, else the rate card); null when neither has it. */
  forwardMinor: number | null;
  /** The courier's charge for bringing it back (the rate card's return charge); null when not entered. */
  returnMinor: number | null;
  packagingMinor: number | null;
  handlingMinor: number | null;
  adShareMinor: number | null;
}

export interface RtoCost {
  parts: { key: RtoPart; minor: number | null }[];
  /** The sum of the parts that are known (a floor while anything is missing). */
  knownMinor: number;
  /** Parts the owner has not entered: the book says so, it never counts them as zero. */
  missing: RtoPart[];
  complete: boolean;
}

/**
 * What one returned parcel cost the shop: both legs of the courier (out and back, never only the return fee), the
 * packaging and the handling from the owner's settings, and the ad share when he counts it. Which parts are counted is
 * his setting; a counted part with no figure is listed as missing.
 */
export function rtoCostOf(i: RtoInputs, counted: Readonly<Record<RtoPart, boolean>>): RtoCost {
  const parts = RTO_PARTS.filter((k) => counted[k]).map((key) => ({ key, minor: i[`${key}Minor` as const] }));
  const missing = parts.filter((p) => p.minor === null).map((p) => p.key);
  return { parts, knownMinor: parts.reduce((s, p) => s + (p.minor ?? 0), 0), missing, complete: missing.length === 0 };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 176 — booking's rules without a database.

/** What happened to one order of a booking press (labels: admin messages `courier.booking.outcome.<key>`). */
export const BOOKING_OUTCOMES = ['booked', 'unknown', 'failed', 'skipped'] as const;
export type BookingOutcomeKind = (typeof BOOKING_OUTCOMES)[number];

/**
 * Why an order was not booked (labels: `courier.booking.code.<code>`): the order service's refusals, an open packing
 * card, and the shop's own (a gift before its day, no usable receiver, the courier refused or gave no answer). PR 554:
 * the order's area has no pair with a courier that needs its own ids (`AREA_UNMAPPED`), or the order has no resolved
 * area at all (`AREA_UNKNOWN`) — the parcel waits with that note, never a refusal from the courier.
 */
export const BOOKING_CODES = ['IN_REVIEW', 'BOOKED', 'CANCEL_REQUESTED', 'CANCEL_PENDING', 'ILLEGAL_TRANSITION', 'SHORTAGE_OPEN', 'NOT_FOUND', 'GIFT_DATE', 'NO_RECEIVER', 'COURIER_REFUSED', 'NO_ANSWER', 'NO_WEIGHT', 'AREA_UNMAPPED', 'AREA_UNKNOWN'] as const;

/** The receiver's phone as a courier takes it: a Bangladeshi mobile 01XXXXXXXXX (the order keeps +8801…), else null. */
export function courierPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  const local = digits.startsWith('880') && digits.length === 13 ? `0${digits.slice(3)}` : digits;
  return /^01[3-9]\d{8}$/.test(local) ? local : null;
}

/** The calendar day (YYYY-MM-DD) of `at` in the store's time zone (`store.timeZone`). */
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** A YYYY-MM-DD day moved by `n` days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * SIM-F-007: the first day a gift with "deliver on or after" may be booked (that day less the owner's lead days), and
 * whether it still waits today. A gift without a day, or an ordinary order, never waits.
 */
export function giftBooking(deliverAfter: string | null, leadDays: number, today: string): { bookFrom: string | null; waits: boolean } {
  if (!deliverAfter) return { bookFrom: null, waits: false };
  const bookFrom = addDays(deliverAfter, -leadDays);
  return { bookFrom, waits: bookFrom > today };
}

/** Fills a `{token}` text; an empty value leaves no gap behind. */
export function fillTemplate(text: string, values: Readonly<Record<string, string | null | undefined>>): string {
  return text
    .replace(/\{(\w+)\}/g, (_, k: string) => values[k]?.trim() ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The most a courier note holds (a technical bound of the couriers' APIs, not a setting). */
export const NOTE_MAX = 500;

/**
 * The note the rider reads (SIM-F-007): for a gift, the owner's gift line with the sender, the day and the gift note;
 * then the customer's own delivery note. Never the sender's contact.
 */
export function bookingNoteOf(o: { customerNote: string | null; gift: { senderName: string | null; note: string | null; deliverAfter: string | null } | null; giftLine: string }): string | null {
  const lines: string[] = [];
  if (o.gift) lines.push(fillTemplate(o.giftLine, { sender: o.gift.senderName, date: o.gift.deliverAfter, note: o.gift.note }));
  if (o.customerNote?.trim()) lines.push(o.customerNote.trim());
  const text = lines.filter(Boolean).join(' | ');
  return text ? text.slice(0, NOTE_MAX) : null;
}

/** One piece of the parcel as booking reads it. */
export interface ParcelLine {
  productName: string;
  colourName: string | null;
  sizeLabel: string | null;
  quantity: number;
  /** The variant's weight, or null when it is not entered. */
  weightGrams: number | null;
}

/** The most a parcel description holds (a technical bound of the couriers' APIs). */
export const DESCRIPTION_MAX = 250;

/** What is in the parcel, for the courier: the pieces by name (the owner's `itemNames`), else nothing. */
export function parcelDescription(lines: readonly ParcelLine[], itemNames: boolean): string | null {
  if (!itemNames || !lines.length) return null;
  return lines
    .map((l) => {
      const variant = [l.colourName, l.sizeLabel].filter(Boolean).join(', ');
      return `${l.productName}${variant ? ` (${variant})` : ''} x${l.quantity}`;
    })
    .join('; ')
    .slice(0, DESCRIPTION_MAX);
}

/** SIM-F-029: the parcel's weight from its pieces; null when any piece's weight is unknown (never guessed). */
export function parcelWeight(lines: readonly ParcelLine[]): number | null {
  if (!lines.length || lines.some((l) => l.weightGrams === null)) return null;
  return lines.reduce((sum, l) => sum + l.weightGrams! * l.quantity, 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 184 — the order follows its parcel (BACKEND-ARCHITECTURE §6.5.0 mapping rules), without a database.

/** The order steps the courier's word drives, in the order they run (each one a command of the order service). */
export type OrderMove = 'courierPickedUp' | 'delivered' | 'partiallyDelivered' | 'returned';

/** Order states before the courier has the parcel (the courier's pick-up moves these on). */
const BEFORE_PICKUP: ReadonlySet<string> = new Set(['CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER']);
/** Order states a final courier outcome may close. */
const ON_THE_WAY: ReadonlySet<string> = new Set([...BEFORE_PICKUP, 'IN_TRANSIT']);

/**
 * Where the order goes now that its parcel is where it is: picked up (or anything after it) → in transit; delivered →
 * delivered (unless a person must first check it: PR 525's true-delivery check, `holdDelivered`); returned → returned;
 * partly delivered → only once a person has named the kept pieces (`keptItemIds`, from the door record, PR 166), else the
 * order stays in transit and the order page asks for them. Lost, damaged, a failed try or an address problem never move
 * the order (§6.5.0): the parcel shows them. Nothing goes backwards; a step the order already passed is left out.
 */
export function orderMovesFor(
  parcel: { status: ShipmentStatus; pickedAt: Date | null },
  orderStatus: string,
  opts: { keptItemIds?: readonly string[] | null; holdDelivered?: boolean } = {},
): OrderMove[] {
  if (!ON_THE_WAY.has(orderStatus)) return [];
  const moves: OrderMove[] = [];
  const picked = parcel.pickedAt !== null || AFTER_PICKUP.has(parcel.status);
  if (picked && BEFORE_PICKUP.has(orderStatus)) moves.push('courierPickedUp');
  if (!picked) return moves;
  if (parcel.status === 'DELIVERED' && !opts.holdDelivered) moves.push('delivered');
  else if (parcel.status === 'RETURNED') moves.push('returned');
  else if (parcel.status === 'PARTIALLY_DELIVERED' && opts.keptItemIds?.length) moves.push('partiallyDelivered');
  return moves;
}

/** Hours, in milliseconds. */
const HOUR = 3_600_000;

/**
 * SIM-F-018 — is a parcel late? The promise is the order's delivery band's most hours, counted from when it was placed
 * (the same promise the customer's tracking page shows, PR 135), plus the owner's grace hours. A band without hours, an
 * address the shop could not settle, or a parcel no longer with the courier is never late.
 */
export function lateOf(o: { placedAt: Date; hoursMax: number | null; addressUnclear?: boolean | null; status: ShipmentStatus }, graceHours: number, now: Date): { late: boolean; dueBy: Date | null } {
  if (o.hoursMax === null || o.hoursMax <= 0 || o.addressUnclear) return { late: false, dueBy: null };
  const dueBy = new Date(o.placedAt.getTime() + o.hoursMax * HOUR);
  const active = (ACTIVE_STATES as readonly string[]).includes(o.status);
  return { late: active && now.getTime() > dueBy.getTime() + Math.max(0, graceHours) * HOUR, dueBy };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 525 — the true-delivery check (SIM-F-005, SIM-F-028), without a database.

/** The signs that a parcel the courier calls delivered came back. */
export const CHECK_SIGNALS = ['CHARGE_ONLY', 'DOOR_RETURNED', 'STATEMENT', 'RETURN_RECEIVED'] as const;
export type CheckSignal = (typeof CHECK_SIGNALS)[number];

/** What a person decides really happened. */
export const CHECK_OUTCOMES = ['DELIVERED', 'CHARGE_PAID_RETURN', 'RETURNED'] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/**
 * The signs against a courier's "Delivered": on a cash-on-delivery parcel with goods to pay for, the courier collected
 * no more than the delivery charge (plus the owner's COD tolerance) — `CHARGE_ONLY`; a person's door record says it came
 * back — `DOOR_RETURNED`; the courier's own statement line pays it as a return — `STATEMENT`; the parcel was received
 * back at the shop — `RETURN_RECEIVED`. An empty list: nothing contradicts the courier.
 */
export function truthSignals(f: {
  cod: boolean;
  codAmountMinor: number | null;
  codCollectedMinor: number | null;
  deliveryChargeMinor: number;
  toleranceMinor: number;
  doorReturned: boolean;
  statementReturn: boolean;
  returnReceived: boolean;
}): CheckSignal[] {
  const out: CheckSignal[] = [];
  const chargeLine = f.deliveryChargeMinor + Math.max(0, f.toleranceMinor);
  if (f.cod && f.codAmountMinor !== null && f.codAmountMinor > chargeLine && f.codCollectedMinor !== null && f.codCollectedMinor <= chargeLine) out.push('CHARGE_ONLY');
  if (f.doorReturned) out.push('DOOR_RETURNED');
  if (f.statementReturn) out.push('STATEMENT');
  if (f.returnReceived) out.push('RETURN_RECEIVED');
  return out;
}

/** The order step a person's decision runs, from the order's state now (null: nothing to move). */
export function correctionStep(outcome: CheckOutcome, orderStatus: string): 'delivered' | 'returned' | 'deliveryCorrected' | null {
  const onTheWay = orderStatus === 'HANDED_OVER' || orderStatus === 'IN_TRANSIT';
  if (outcome === 'DELIVERED') return onTheWay ? 'delivered' : null;
  if (onTheWay) return 'returned';
  return orderStatus === 'DELIVERED' ? 'deliveryCorrected' : null;
}

/** PR 526: the parcel states that mean it came back (whole or in part). */
export const RETURN_STATES = ['RETURNING', 'RETURNED', 'PARTIALLY_DELIVERED'] as const satisfies readonly ShipmentStatus[];
const RETURNS: ReadonlySet<string> = new Set(RETURN_STATES);

/** PR 526: the door outcomes whose courier note is the rider's own words (ShipmentEvent.riderNote). */
export const RIDER_NOTE_STATES: ReadonlySet<string> = new Set([...RETURN_STATES, 'ATTEMPT_FAILED']);

/** PR 526: a parcel came back when the courier says so, or when the order was corrected to returned (PR 525). */
export function cameBack(parcelStatus: string, orderStatus: string): boolean {
  return RETURNS.has(parcelStatus) || orderStatus === 'RETURNED' || orderStatus === 'PARTIALLY_DELIVERED';
}

/**
 * PR 526: the kind of return a parcel's own record starts as: pieces refused from a partly delivered parcel, or a
 * parcel refused at the door — with the delivery charge paid when the courier reports collecting money on it.
 */
export function returnKindOf(parcelStatus: string, codCollectedMinor: number | null): 'REFUSED_AT_DOOR' | 'CHARGE_PAID_RETURN' {
  if (parcelStatus === 'PARTIALLY_DELIVERED') return 'REFUSED_AT_DOOR';
  return (codCollectedMinor ?? 0) > 0 ? 'CHARGE_PAID_RETURN' : 'REFUSED_AT_DOOR';
}
