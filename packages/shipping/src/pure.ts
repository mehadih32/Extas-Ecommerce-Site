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
