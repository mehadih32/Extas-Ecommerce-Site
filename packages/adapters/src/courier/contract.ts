// PR 175 — the courier contract (BACKEND-ARCHITECTURE §7.4): one internal interface every courier answers (Steadfast,
// Pathao, RedX …); the provider's own words, ids and endpoints stay inside its adapter. The shop's shipping service
// (`@extas/shipping`) books, tracks and records through this interface only, so a second courier is one more adapter.
//
// - Statuses are the shop's own (the Prisma `ShipmentStatus` values a courier can report), with the courier's exception
//   states of SIM-F-017: a delivery try that failed, an address problem, a lost parcel, a damaged parcel. The raw word
//   the courier used is always kept beside it; a word the mapping does not know stays raw and is flagged (`status`
//   null), never guessed.
// - A courier never invents money: a charge or a collected amount is only what the courier itself reported (null when
//   it did not). The mocks report none (SIM-F-027: sample courier terms must never look like the shop's real costs).
// - Booking is idempotent by the shop's reference (`merchantRef`): after a timeout the service asks `findByRef` before
//   trying again, so one parcel is never booked twice (§7.7).

/** The shop's parcel states a courier can report (a subset of Prisma's `ShipmentStatus`). */
export const COURIER_STATES = [
  'IN_REVIEW',
  'PENDING_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'ATTEMPT_FAILED',
  'ADDRESS_PROBLEM',
  'LOST',
  'DAMAGED',
  'RETURNING',
  'RETURNED',
  'CANCELLED',
] as const;
export type CourierState = (typeof COURIER_STATES)[number];

/** SIM-F-017: the exception states (each with a reason); they are shown and counted, never acted on with money. */
export const EXCEPTION_STATES = ['ATTEMPT_FAILED', 'ADDRESS_PROBLEM', 'LOST', 'DAMAGED'] as const satisfies readonly CourierState[];
export type ExceptionState = (typeof EXCEPTION_STATES)[number];

/**
 * The reasons an exception carries (labels: apps/web/messages/admin.<lang>.json → `courier.reasons.<key>`). The courier's
 * own words map onto these in its adapter; staff pick one when they record an exception by hand.
 */
export const EXCEPTION_REASONS = {
  ATTEMPT_FAILED: ['receiverUnreachable', 'receiverNotAvailable', 'receiverAskedLater', 'paymentNotReady', 'other'],
  ADDRESS_PROBLEM: ['addressNotFound', 'addressIncomplete', 'wrongArea', 'other'],
  LOST: ['lostInTransit', 'other'],
  DAMAGED: ['damagedInTransit', 'wetOrTorn', 'other'],
} as const satisfies Record<ExceptionState, readonly string[]>;
export type ExceptionReason = (typeof EXCEPTION_REASONS)[ExceptionState][number];

export const isExceptionState = (s: string | null | undefined): s is ExceptionState => !!s && (EXCEPTION_STATES as readonly string[]).includes(s);
export const isCourierState = (s: string | null | undefined): s is CourierState => !!s && (COURIER_STATES as readonly string[]).includes(s);

/** What a courier offers; drives the screens' options and whether the service polls (§7.4 `capabilities()`). */
export interface CourierCapabilities {
  /** Parcels can be booked through the API. */
  booking: boolean;
  /** How status changes arrive: the shop asks (`poll`), the courier calls (`webhook`), or both. */
  tracking: 'poll' | 'webhook' | 'both';
  /** The courier can report a partial delivery. */
  partialDelivery: boolean;
  /** The booking accepts the courier's own city / zone / area ids (PR 554 maps the gazetteer onto them). */
  zoneIds: boolean;
  /** The booking takes the parcel's weight (SIM-F-029: the courier charges by weight). */
  weight: boolean;
  /** PR 177: the courier refuses a parcel without a weight (it charges by weight); the shop then never books one. */
  weightRequired?: boolean;
  /** The booking takes a declared value (SIM-F-017: a claim for a lost or damaged parcel needs it). */
  declaredValue: boolean;
  /** A booking can be cancelled through the API (otherwise staff phone the courier: D5). */
  cancel: boolean;
}

/** The parcel as the shop books it. Amounts in minor units (paisa); the adapter converts to the courier's own. */
export interface CourierParcel {
  /** The shop's reference the courier knows the parcel by (order number and try): unique per booking try. */
  merchantRef: string;
  receiver: {
    name: string;
    /** 01XXXXXXXXX (the courier calls this number; a gift: the receiver's, never the sender's). */
    phone: string;
    address: string;
  };
  /** The courier's own ids for the destination, when the shop has them (PR 554). */
  zone: { cityId: string | null; zoneId: string | null; areaId: string | null };
  /** Cash to collect at the door = the order's live amount due (0 for a prepaid parcel; SIM-F-004). */
  codMinor: number;
  /** What the goods are worth (for a claim), or null when the shop does not declare it. */
  declaredValueMinor: number | null;
  /** Grams, or null when a piece's weight is not known (never guessed). */
  weightGrams: number | null;
  /** Pieces in the parcel. */
  itemCount: number;
  /** What is in it, short (shown to the courier). */
  description: string | null;
  /** The note for the rider: a gift's "deliver on or after" and note, the customer's delivery note (SIM-F-007). */
  note: string | null;
}

/** The courier's answer to a booking. */
export type BookResult =
  | {
      ok: true;
      consignmentId: string;
      trackingCode: string | null;
      /** The state the courier put it in (usually IN_REVIEW or PENDING_PICKUP). */
      status: CourierState | null;
      rawStatus: string | null;
      /** The courier's own charge for this parcel, when it said one; never estimated here. */
      chargeMinor: number | null;
    }
  | {
      ok: false;
      error: string;
      /** True when the courier may have booked it anyway (timeout, 5xx): ask `findByRef` before trying again. */
      unknown: boolean;
    };

/** One status event from the courier (a poll or a webhook), normalised. */
export interface CourierEvent {
  /** The courier's id of the event, or a stable id the adapter derives from it (the parcel, the raw status, the time). */
  providerEventId: string;
  /** The shop's state; null when the courier's word is not in the mapping (kept raw and flagged). */
  status: CourierState | null;
  rawStatus: string;
  occurredAt: Date;
  /** The courier's or the rider's words. */
  note: string | null;
  /** An exception's reason (EXCEPTION_REASONS), when the courier said one. */
  reasonKey: string | null;
  /** The amount the courier says it collected, when it says one (recorded, never acted on: COD money waits, S07). */
  codCollectedMinor: number | null;
  /** The courier's charge for the parcel, when it says one. */
  chargeMinor: number | null;
}

/** Where a parcel is, as the courier knows it. */
export interface CourierParcelRef {
  /** Null when the courier answered a lost booking by reference only (track by `merchantRef`). */
  consignmentId: string | null;
  trackingCode: string | null;
  merchantRef: string | null;
  /** PR 176: the courier's last word the shop holds; a courier that reports only the current word reports a change. */
  lastRawStatus?: string | null;
}

export interface CourierApi {
  /** The adapter's provider key (`steadfast`, `pathao`, `mockCourier`). */
  readonly provider: string;
  readonly capabilities: CourierCapabilities;
  book(parcel: CourierParcel): Promise<BookResult>;
  /**
   * The parcel booked under this reference, if the courier has one (recovery after a timeout; never books). A courier
   * that answers by reference with the status only gives no consignment id: the parcel is then tracked by reference.
   */
  findByRef(merchantRef: string): Promise<{ consignmentId: string | null; trackingCode: string | null; status: CourierState | null; rawStatus: string | null } | null>;
  /** The parcel's events as the courier reports them now (oldest first). */
  track(ref: CourierParcelRef): Promise<CourierEvent[]>;
  /** One cheap call that proves the keys work (the Test button). */
  health(): Promise<{ ok: boolean; message: string }>;
}

/** A courier's raw status word → the shop's state and, for an exception, its reason. */
export type StatusTable = Readonly<Record<string, { status: CourierState; reasonKey?: string }>>;

/** Maps a courier's raw word through its table; unknown words come back with `status: null` (kept raw, flagged). */
export function mapStatus(table: StatusTable, raw: string | null | undefined): { status: CourierState | null; reasonKey: string | null } {
  const key = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const hit = table[key];
  return hit ? { status: hit.status, reasonKey: hit.reasonKey ?? null } : { status: null, reasonKey: null };
}

/** Taka (a courier's API amount, possibly a string or a decimal) → minor units; null when it is not a number. */
export function takaToMinor(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
