// The order state machine itself (PR 138; BACKEND-ARCHITECTURE §6.5.0, §6.5.1, §6.5.7), without a database: the
// states, every command with the states it may start from and the state it leads to, the guards that refuse it, and the
// small sums the order screens show (amount due, the payment pill). The service (service.ts) asks `plan()` before it
// writes anything, so the rule is written exactly once and the tests can walk every legal and every illegal pair.
//
// Four separate facts (§6.5.0): the ORDER status lives here; the courier (Shipment.status), the payment (Payment rows)
// and the return/refund (ReturnRecord, Refund) have their own records and writers (S07, S08). They move the order only
// through the commands below (the hooks those stages call), never by writing Order.status.
//
// Rules: the order never moves backwards (except hold → release, which goes back to where it was held from); a booked
// order is never cancelled in one step (cancel after booking, D5); every refusal says which commands are open now.
// PR 127: a line is added to (or an added line taken out of) an order only before a courier is booked — new or
// confirmed, no cancel asked (SIM-F-004: an edit after booking would never reach the parcel, so it is refused).
// PR 142: the team's edit (contact, address, a size at the same price, a piece taken out) — the same rule: never once a
// courier is booked, never while a cancel is asked (SIM-F-004).
// PR 605: who and where a parcel goes to — a gift's receiver — for the sticker and the booking (delivery-target.ts).
export * from './delivery-target';
// PR 157: one phone number's history in counts, our-fault refusals apart (phone-summary.ts).
export * from './phone-summary';
// PR 158: address and zone checks against the gazetteer (address-checks.ts).
export * from './address-checks';
// PR 156: the risk score model, a pure function of the order's facts and the owner's settings (risk-score.ts).
export * from './risk-score';
// PR 541: the section an order is placed in the moment it lands (risk-section.ts).
export * from './risk-section';
// PR 519: how two orders of one identity are tied (identity-ties.ts).
export * from './identity-ties';
// PR 161: the steps an order's risk level asks for (risk-level-plan.ts).
export * from './risk-level-plan';
// PR 542: how much an advance request asks (advance-plan.ts).
export * from './advance-plan';
// S08 · PR 185: the exchange tiers, window and money box (exchange-pure.ts).
export * from './exchange-pure';

/** Every order status (Prisma's OrderStatus, in the order an order normally moves). */
export const ORDER_STATES = [
  'DRAFT',
  'PLACED',
  'AWAITING_ADVANCE',
  'CONFIRMED',
  'ON_HOLD',
  'PROCESSING',
  'PACKED',
  'HANDED_OVER',
  'IN_TRANSIT',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'RETURNED',
  'CANCELLED',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

/** States an order never leaves. */
export const FINAL_STATES: ReadonlySet<OrderState> = new Set(['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED']);

/** Still open: placed, not yet finished (the order list's "open orders" and the duplicate check's look-back). */
export const OPEN_STATES: readonly OrderState[] = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT'];

/** Every command of the one order service. */
export const ORDER_COMMANDS = [
  // staff (admin API), PR 138, 144, 153
  'confirm',
  'hold',
  'release',
  'cancel',
  'cancelAfterBooking',
  'courierCancelConfirmed',
  'courierCancelRefused',
  // the customer's cancel after the one-tap cut-off (CN-020 (5)), and the staff's answer to it
  'requestCancel',
  'refuseCancelRequest',
  // PR 147: the staff's internal flags (any state; the status stays)
  'setFlags',
  // PR 127: "Add to this parcel" — a line added after placing, and an added line taken out again (the status stays)
  'addLine',
  'removeLine',
  // PR 142: the team's edit of an order not yet with the courier (the status stays)
  'edit',
  // PR 146: the two-size follow-up — the system's check after placing (a note, the question asked), and the answer
  'twoSizeCheck',
  'twoSizeAnswer',
  // PR 156: the risk score stored on the order (the status stays; never blocks, holds or asks for anything)
  'riskAssess',
  // PR 541: the order placed in its risk section with a note (the status stays; a review section only waits for a person)
  'riskSection',
  // PR 161: the steps of the order's risk level written on it (a watch mark, a call task; the status stays — the level's
  // hold is its own `hold` command)
  'riskLevel',
  // hooks for S06 / S07 / PR 605 (risk level, gift, payments): no admin route yet
  'awaitAdvance',
  'recordAdvance',
  // PR 542: the advance request's pay link sent again (its SMS/WhatsApp, a call task) while the order waits for it
  'advanceResend',
  // hooks for S08 (fulfilment and the courier): no admin route yet; S08 adds its own guards (SKU scan, photo, shortage)
  // PR 541 (SIM-F-014): booking a courier, from any screen, comes through here — never while a review is open
  'book',
  'startPicking',
  'pack',
  'handover',
  'courierPickedUp',
  'delivered',
  'partiallyDelivered',
  'returned',
  // PR 525: a person's correction of a "Delivered" the shop's own records contradict (an open true-delivery check)
  'deliveryCorrected',
  // S08 · PR 185: an exchange opened on a delivered order (the status stays; the new parcel is its own linked order)
  'exchange',
  // S08 · PR 189: a return after receipt opened on a delivered order, when the policy allows it (the status stays)
  'returnCase',
] as const;
export type OrderCommand = (typeof ORDER_COMMANDS)[number];

/** Commands that change the status (the others set or clear a flag and keep the status). */
const MOVES: Readonly<Partial<Record<OrderCommand, { from: readonly OrderState[]; to: OrderState | 'heldFrom' }>>> = {
  confirm: { from: ['PLACED'], to: 'CONFIRMED' },
  // PR 183: also from picking (a defective or missing piece at the packing table); release goes back to it
  hold: { from: ['PLACED', 'CONFIRMED', 'PROCESSING'], to: 'ON_HOLD' },
  release: { from: ['ON_HOLD'], to: 'heldFrom' },
  // PROCESSING and PACKED: picking or packing started but no courier is booked yet — put the pieces back and cancel.
  cancel: { from: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED'], to: 'CANCELLED' },
  courierCancelConfirmed: { from: ['CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER'], to: 'CANCELLED' },
  awaitAdvance: { from: ['PLACED', 'CONFIRMED', 'ON_HOLD'], to: 'AWAITING_ADVANCE' },
  recordAdvance: { from: ['AWAITING_ADVANCE'], to: 'PLACED' },
  startPicking: { from: ['CONFIRMED'], to: 'PROCESSING' },
  pack: { from: ['CONFIRMED', 'PROCESSING'], to: 'PACKED' },
  handover: { from: ['PACKED'], to: 'HANDED_OVER' },
  // PR 184: the courier's pick-up proves the hand-over, so a booked parcel the courier picked up moves its order on even
  // when nobody pressed "Handed over" (the hand-over time is then the courier's pick-up time)
  courierPickedUp: { from: ['CONFIRMED', 'PROCESSING', 'PACKED', 'HANDED_OVER'], to: 'IN_TRANSIT' },
  // a courier may report the delivery without a pick-up event in between (one poll sees both)
  delivered: { from: ['HANDED_OVER', 'IN_TRANSIT'], to: 'DELIVERED' },
  partiallyDelivered: { from: ['IN_TRANSIT'], to: 'PARTIALLY_DELIVERED' },
  returned: { from: ['HANDED_OVER', 'IN_TRANSIT'], to: 'RETURNED' },
  // PR 525: the only way out of DELIVERED — a person found the parcel came back (an open true-delivery check, audited)
  deliveryCorrected: { from: ['DELIVERED'], to: 'RETURNED' },
};

/** Flag commands: the states they may run in (the status stays). */
const FLAGS: Readonly<Partial<Record<OrderCommand, readonly OrderState[]>>> = {
  cancelAfterBooking: ['CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT'],
  courierCancelRefused: ['CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT'],
  requestCancel: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED'],
  refuseCancelRequest: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED'],
  setFlags: ORDER_STATES.filter((s) => s !== 'DRAFT'),
  addLine: ['PLACED', 'CONFIRMED'],
  removeLine: ['PLACED', 'CONFIRMED'],
  // the demo's "Edit items & address": new, waiting for its advance, confirmed or on hold — until picking starts
  edit: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD'],
  // PR 146: asked once, right after placing; answered until picking starts (an answer takes the other sizes out)
  twoSizeCheck: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD'],
  twoSizeAnswer: ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD'],
  // PR 156: scored when it lands, again after an edit or by hand while it is open
  riskAssess: OPEN_STATES,
  // PR 541: placed in its section when it lands, again when it is scored again, while it is open
  riskSection: OPEN_STATES,
  // PR 161: written after a score that put the order in a level with steps, while it is open
  riskLevel: OPEN_STATES,
  // PR 542: "Send again" on an order waiting for its advance
  advanceResend: ['AWAITING_ADVANCE'],
  // PR 541 (SIM-F-014, F-002): a courier is booked for a confirmed order not yet handed over (the status stays; S08's
  // booking writes the shipment in the same transaction)
  book: ['CONFIRMED', 'PROCESSING', 'PACKED'],
  // S08 · PR 185 (B1.8): an exchange is opened once the parcel is with the customer (or came back refused for a size,
  // PR 190, SIM-F-021); the order keeps its final state, the exchange and its new parcel are records of their own
  exchange: ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'],
  // S08 · PR 189: a return after receipt, only once the customer has the parcel (the policy is checked by the service)
  returnCase: ['DELIVERED', 'PARTIALLY_DELIVERED'],
};

/** What the machine needs to know about an order (read under its row lock). */
export interface MachineOrder {
  status: OrderState;
  /** A courier is booked: the order has a shipment that is not failed or cancelled (D5). */
  booked: boolean;
  /** Cancel after booking asked, waiting for the courier's answer. */
  cancelPending: boolean;
  /** The customer asked to cancel (after the one-tap cut-off). */
  cancelRequested: boolean;
  /** An open duplicate (or risk) review: decided first, then confirmed (PR 145). */
  inReview: boolean;
  /** Where a held order goes back to. */
  holdFromStatus: OrderState | null;
  paidMinor: number;
  advanceRequiredMinor: number | null;
  /** PR 525: an open true-delivery check (the courier said delivered; the shop's records say it came back). */
  deliveryCheckOpen?: boolean;
}

/** Why a command is refused. Stable codes; the admin and the shop turn them into words. */
export type RefusalCode =
  /** Not from this state (409 ILLEGAL_TRANSITION). */
  | 'ILLEGAL_TRANSITION'
  /** A courier is booked: use cancel after booking (D5). */
  | 'BOOKED'
  /** Not booked: an ordinary cancel is the way. */
  | 'NOT_BOOKED'
  /** Cancel after booking is waiting for the courier's answer. */
  | 'CANCEL_PENDING'
  /** No cancel after booking was asked. */
  | 'NO_CANCEL_PENDING'
  /** The customer asked to cancel: decide that first. */
  | 'CANCEL_REQUESTED'
  /** No cancel request to answer. */
  | 'NO_CANCEL_REQUEST'
  /** An open duplicate / risk review: decide it first. */
  | 'IN_REVIEW'
  /** The advance is not paid in full yet. */
  | 'ADVANCE_SHORT'
  /** PR 525: no open true-delivery check: a delivered order stays delivered. */
  | 'NO_DELIVERY_CHECK';

export type Plan = { ok: true; from: OrderState; to: OrderState; moves: boolean } | { ok: false; code: RefusalCode; from: OrderState; allowed: OrderCommand[] };

/** Does the command change the status? */
export const isMove = (c: OrderCommand): boolean => c in MOVES;

/** The state a command leads to from `from` (null when it cannot run from there); flag commands keep the state. */
export function targetOf(c: OrderCommand, from: OrderState, heldFrom: OrderState | null = null): OrderState | null {
  const m = MOVES[c];
  if (m) {
    if (!m.from.includes(from)) return null;
    return m.to === 'heldFrom' ? (heldFrom === 'PLACED' || heldFrom === 'PROCESSING' ? heldFrom : 'CONFIRMED') : m.to;
  }
  const f = FLAGS[c];
  return f && f.includes(from) ? from : null;
}

/** The guard of a command that may run from this state: the refusal, or null. */
function guard(c: OrderCommand, o: MachineOrder): RefusalCode | null {
  switch (c) {
    case 'confirm':
      if (o.cancelRequested) return 'CANCEL_REQUESTED';
      if (o.inReview) return 'IN_REVIEW';
      return null;
    case 'cancel':
      if (o.cancelPending) return 'CANCEL_PENDING';
      if (o.booked) return 'BOOKED';
      return null;
    case 'cancelAfterBooking':
      if (o.cancelPending) return 'CANCEL_PENDING';
      if (!o.booked) return 'NOT_BOOKED';
      return null;
    case 'courierCancelConfirmed':
    case 'courierCancelRefused':
      return o.cancelPending ? null : 'NO_CANCEL_PENDING';
    case 'requestCancel':
      if (o.cancelRequested) return 'CANCEL_REQUESTED';
      if (o.cancelPending) return 'CANCEL_PENDING';
      if (o.booked) return 'BOOKED';
      return null;
    case 'refuseCancelRequest':
      return o.cancelRequested ? null : 'NO_CANCEL_REQUEST';
    case 'addLine':
    case 'removeLine':
    case 'edit':
    case 'twoSizeAnswer':
      // SIM-F-004: the parcel the courier has is the parcel; nothing is added once it is booked
      if (o.booked) return 'BOOKED';
      if (o.cancelPending) return 'CANCEL_PENDING';
      if (o.cancelRequested) return 'CANCEL_REQUESTED';
      return null;
    case 'recordAdvance':
      return o.advanceRequiredMinor !== null && o.paidMinor < o.advanceRequiredMinor ? 'ADVANCE_SHORT' : null;
    case 'book':
      // SIM-F-014: an order in review (duplicate or risk) waits for a person's decision, on every screen
      if (o.cancelPending) return 'CANCEL_PENDING';
      if (o.booked) return 'BOOKED';
      if (o.cancelRequested) return 'CANCEL_REQUESTED';
      if (o.inReview) return 'IN_REVIEW';
      return null;
    case 'deliveryCorrected':
      return o.deliveryCheckOpen ? null : 'NO_DELIVERY_CHECK';
    case 'courierPickedUp':
      // PR 184: only a parcel a courier holds, and never one whose cancel is waiting for the courier's answer (D5)
      if (o.cancelPending) return 'CANCEL_PENDING';
      return o.booked ? null : 'NOT_BOOKED';
    case 'pack':
    case 'handover':
      // the old parcel is never packed or handed over again once its cancel is asked (§6.5.7 (a))
      if (o.cancelPending) return 'CANCEL_PENDING';
      return c === 'handover' && !o.booked ? 'NOT_BOOKED' : null;
    default:
      return null;
  }
}

/** The commands open for this order now (the admin's "next legal step" and every refusal's hint). */
export function allowedCommands(o: MachineOrder): OrderCommand[] {
  return ORDER_COMMANDS.filter((c) => targetOf(c, o.status, o.holdFromStatus) !== null && guard(c, o) === null);
}

/** May the command run on this order, and where does it lead? Nothing is written; the service acts on the plan. */
export function plan(c: OrderCommand, o: MachineOrder): Plan {
  const to = targetOf(c, o.status, o.holdFromStatus);
  if (to === null) return { ok: false, code: 'ILLEGAL_TRANSITION', from: o.status, allowed: allowedCommands(o) };
  const refused = guard(c, o);
  if (refused) return { ok: false, code: refused, from: o.status, allowed: allowedCommands(o) };
  return { ok: true, from: o.status, to, moves: isMove(c) };
}

/** Every (command, from) pair the machine allows — for the transition-table tests and the docs. */
export function legalPairs(): { command: OrderCommand; from: OrderState; to: OrderState }[] {
  const out: { command: OrderCommand; from: OrderState; to: OrderState }[] = [];
  for (const command of ORDER_COMMANDS)
    for (const from of ORDER_STATES) {
      const to = targetOf(command, from, 'CONFIRMED');
      if (to !== null) out.push({ command, from, to });
    }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// CN-020 (5) — the customer's own cancel: one tap until the owner's cut-off, then a request until the courier is booked.
// ---------------------------------------------------------------------------------------------------------------------

export type CustomerCutoff = 'off' | 'placed' | 'confirmed' | 'packed';

/** What the customer's order page offers: cancel with one tap, ask to cancel, "you asked" (waiting), or nothing. */
export type CustomerCancelMode = 'tap' | 'request' | 'requested' | 'none';

/** The states a one-tap cancel is open in, for each cut-off ("confirmed": until the team confirms). */
function tapOpen(cutoff: CustomerCutoff, o: MachineOrder): boolean {
  switch (cutoff) {
    case 'confirmed':
      // PR 183: an order held from picking is past "confirmed" too
      return o.status === 'PLACED' || o.status === 'AWAITING_ADVANCE' || (o.status === 'ON_HOLD' && o.holdFromStatus !== 'CONFIRMED' && o.holdFromStatus !== 'PROCESSING');
    case 'packed':
      return ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD', 'PROCESSING'].includes(o.status);
    default:
      return false;
  }
}

/** The customer's cancel for this order under the owner's setting `orders.cancel.customer`. */
export function customerCancelMode(cfg: { cutoff: CustomerCutoff; requests: boolean }, o: MachineOrder): CustomerCancelMode {
  if (cfg.cutoff === 'off' || o.booked || o.cancelPending || FINAL_STATES.has(o.status)) return 'none';
  if (o.cancelRequested) return 'requested';
  if (tapOpen(cfg.cutoff, o) && plan('cancel', o).ok) return 'tap';
  if (cfg.requests && plan('requestCancel', o).ok) return 'request';
  return 'none';
}

// ---------------------------------------------------------------------------------------------------------------------
// Reason codes (§6.5.0). The codes are fixed; their words are the owner's settings (`orders.cancel.reasons`).
// ---------------------------------------------------------------------------------------------------------------------

/** PR 144 — the cancel reason codes (§6.5.0, plus CUSTOMER_AFTER_CONFIRM for an approved customer request, F-038). */
export const CANCEL_CODES = [
  'CUSTOMER_BEFORE_CONFIRM',
  'CUSTOMER_AFTER_CONFIRM',
  'CUSTOMER_CHANGE_AFTER_BOOKING',
  'ADVANCE_NOT_PAID',
  'RISK_DECLINED',
  'OUT_OF_STOCK',
  'DUPLICATE_ORDER',
  'ADDRESS_UNREACHABLE',
  // PR 142 (SIM-F-038): the phone's owner never ordered — someone else used his number
  'NOT_ORDERED',
  'OTHER',
] as const;
export type CancelCode = (typeof CANCEL_CODES)[number];

/** A cancel reason that needs a note. */
export const NOTE_REQUIRED: ReadonlySet<CancelCode> = new Set(['OTHER']);

/**
 * A cancel for a change after booking is never a refusal and never feeds the risk history (§6.5.7 (e)); nor is an
 * order the phone's owner never placed (PR 142, SIM-F-038: the number was someone else's to give, not his fault).
 */
export const NOT_A_RISK_SIGNAL: ReadonlySet<CancelCode> = new Set(['CUSTOMER_CHANGE_AFTER_BOOKING', 'NOT_ORDERED']);

// ---------------------------------------------------------------------------------------------------------------------
// Money as the screens show it (F-001, F-040): amount due = total − wallet − paid; the order-level payment pill is
// computed, never stored (§6.5.3). PR 165: the payments service owns them now (@extas/payments/pure); the order core
// re-exports them, so every screen, message and sticker reads the same figure. `codToCollect` is what the rider collects
// at the door (SIM-F-001: nothing for a prepaid order).
// ---------------------------------------------------------------------------------------------------------------------

export { codToCollect, dueOf, paymentPill, type CodStage, type MoneyFacts, type PaymentPill } from '@extas/payments/pure';

// ---------------------------------------------------------------------------------------------------------------------
// PR 145 — how alike two orders are (Blueprint B1.12): the same SKU (style, colour and size) or the same product in the
// same colour = high; the same product in another colour = medium; the same category = low.
// ---------------------------------------------------------------------------------------------------------------------

export type Severity = 'low' | 'medium' | 'high';
export const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high'];
export const severityRank = (s: Severity): number => SEVERITIES.indexOf(s);

export interface LineFacts {
  variantId: string | null;
  productId: string | null;
  colourId: string | null;
  categoryIds: readonly string[];
}

/** How alike two orders' lines are, or null when they share nothing (a different order, not a duplicate). */
export function overlapOf(a: readonly LineFacts[], b: readonly LineFacts[]): { severity: Severity; productIds: string[] } | null {
  let best: Severity | null = null;
  const products = new Set<string>();
  for (const x of a)
    for (const y of b) {
      let s: Severity | null = null;
      if ((x.variantId && x.variantId === y.variantId) || (x.productId && x.productId === y.productId && x.colourId === y.colourId)) s = 'high';
      else if (x.productId && x.productId === y.productId) s = 'medium';
      else if (x.categoryIds.some((c) => y.categoryIds.includes(c))) s = 'low';
      if (s === null) continue;
      if (s !== 'low' && x.productId) products.add(x.productId);
      if (best === null || severityRank(s) > severityRank(best)) best = s;
    }
  return best === null ? null : { severity: best, productIds: [...products] };
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 127 — the customer's "Add to this parcel" window under the owner's switch (`orders.addOn`).
// ---------------------------------------------------------------------------------------------------------------------

/** Why the customer may not add a piece now: switched off, not Cash on Delivery, past the owner's step or time, or the machine says no. */
export type AddOnClosed = 'OFF' | 'NOT_COD' | 'STEP' | 'TIME' | 'BOOKED' | 'CANCEL';

export interface AddOnConfig {
  enabled: boolean;
  /** "placed": while the order is new; "confirmed": also after the team confirms it, until picking starts. */
  until: 'placed' | 'confirmed';
  /** Minutes after placing (0: no time limit besides the step). */
  windowMinutes: number;
}

/** The customer's add-on window for this order now (null: open). The machine's guards come first. */
export function addOnClosedWhy(cfg: AddOnConfig, o: MachineOrder & { paymentMethod: string | null; placedAt: Date }, now: Date): AddOnClosed | null {
  if (!cfg.enabled) return 'OFF';
  if (o.paymentMethod !== 'COD') return 'NOT_COD';
  const p = plan('addLine', o);
  if (!p.ok) return p.code === 'BOOKED' ? 'BOOKED' : p.code === 'CANCEL_PENDING' || p.code === 'CANCEL_REQUESTED' ? 'CANCEL' : 'STEP';
  if (cfg.until === 'placed' && o.status !== 'PLACED') return 'STEP';
  if (cfg.windowMinutes > 0 && now.getTime() - o.placedAt.getTime() > cfg.windowMinutes * 60_000) return 'TIME';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// PR 143 — the customer's own edit (phone, address, a size) under the owner's switch (`orders.edit.customer`).
// ---------------------------------------------------------------------------------------------------------------------

/** Why the customer may not edit now: switched off, past the owner's step or time, no edits left, or the machine says no. */
export type CustomerEditClosed = 'OFF' | 'STEP' | 'TIME' | 'CAP' | 'BOOKED' | 'CANCEL';

export interface CustomerEditConfig {
  enabled: boolean;
  /** "placed": while the order is new (or waiting for its advance); "confirmed": until picking starts. */
  until: 'placed' | 'confirmed';
  /** Minutes after placing (0: only the step counts). */
  windowMinutes: number;
  maxEdits: number;
}

/** The customer's edit window for this order now (null: open). The machine's guards come first (SIM-F-004: never once booked). */
export function customerEditClosedWhy(cfg: CustomerEditConfig, o: MachineOrder & { placedAt: Date; edits: number }, now: Date): CustomerEditClosed | null {
  if (!cfg.enabled) return 'OFF';
  const p = plan('edit', o);
  if (!p.ok) return p.code === 'BOOKED' ? 'BOOKED' : p.code === 'CANCEL_PENDING' || p.code === 'CANCEL_REQUESTED' ? 'CANCEL' : 'STEP';
  if (cfg.until === 'placed' && o.status !== 'PLACED' && o.status !== 'AWAITING_ADVANCE' && !(o.status === 'ON_HOLD' && o.holdFromStatus === 'PLACED')) return 'STEP';
  if (cfg.windowMinutes > 0 && now.getTime() - o.placedAt.getTime() > cfg.windowMinutes * 60_000) return 'TIME';
  return o.edits >= cfg.maxEdits ? 'CAP' : null;
}
