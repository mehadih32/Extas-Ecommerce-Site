// PR 165 — the payment model without a database (BACKEND-ARCHITECTURE §6.5.0, §6.5.3): the states a payment row moves
// through and the moves allowed between them, where its money stands (the money status, forward only), the order's
// amount due and payment pill (moved here from @extas/orders, which re-exports them), the amount a rider collects at
// the door, and the reason codes a mismatch always carries (SIM-F-028). The service (outcome.ts, record.ts) asks these
// functions before it writes anything, so each rule is written once and the tests walk every pair.
//
// Rules:
// - A payment row moves INITIATED → PENDING → AUTHORIZED → PAID / FAILED / CANCELLED and never back. REFUNDED and
//   PARTIALLY_REFUNDED are derived from completed refunds (PR 172) and never set here.
// - The gateway's word on money wins over our own closing: money the gateway confirms for a payment we had closed
//   (failed, or given up as abandoned) is recorded, never lost — flagged PAID_AFTER_CLOSE for a person to look at.
// - The amount due is total − wallet − paid, never below 0; Cash on Delivery collects exactly that and nothing for a
//   prepaid order (SIM-F-001: a paid customer is never asked to pay again).

/** Every Payment.status (Prisma's PaymentStatus). */
export const PAYMENT_STATES = ['INITIATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/** Still waiting for the money: a session started, nothing final yet. */
export const OPEN_PAYMENT_STATES: readonly PaymentState[] = ['INITIATED', 'PENDING', 'AUTHORIZED'];

/** States only completed refunds lead to (PR 172); never set by a gateway, a person or this service. */
export const DERIVED_PAYMENT_STATES: ReadonlySet<PaymentState> = new Set(['REFUNDED', 'PARTIALLY_REFUNDED']);

const NEXT: Readonly<Record<PaymentState, readonly PaymentState[]>> = {
  INITIATED: ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED'],
  PENDING: ['AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: [],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: [],
};

/** Who reports a move: the gateway (a verified callback or a server-side query), a person, or the system (a sweep). */
export type MoveSource = 'gateway' | 'staff' | 'system';

export type PaymentMove =
  | { ok: true; same: boolean; late: boolean }
  | { ok: false; code: 'ILLEGAL_PAYMENT_MOVE' | 'DERIVED_STATE' };

/**
 * May a payment move from `from` to `to`? The same state again is a repeat (ok, `same`). Only the gateway may turn a
 * closed payment (FAILED, CANCELLED) into PAID — the money is real — and that is marked `late`.
 */
export function paymentMove(from: PaymentState, to: PaymentState, source: MoveSource): PaymentMove {
  if (DERIVED_PAYMENT_STATES.has(to)) return { ok: false, code: 'DERIVED_STATE' };
  if (from === to) return { ok: true, same: true, late: false };
  if (NEXT[from].includes(to)) return { ok: true, same: false, late: false };
  if (to === 'PAID' && source === 'gateway' && (from === 'FAILED' || from === 'CANCELLED')) return { ok: true, same: false, late: true };
  return { ok: false, code: 'ILLEGAL_PAYMENT_MOVE' };
}

/** Every legal (from, to) pair for one source — for the transition-table tests and the docs. */
export function legalPaymentMoves(source: MoveSource): { from: PaymentState; to: PaymentState }[] {
  const out: { from: PaymentState; to: PaymentState }[] = [];
  for (const from of PAYMENT_STATES)
    for (const to of PAYMENT_STATES) {
      const m = paymentMove(from, to, source);
      if (m.ok && !m.same) out.push({ from, to });
    }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Money status (§6.5.3): ESTIMATED → PROVISIONAL → RECONCILED → FINAL, forward only
// ---------------------------------------------------------------------------------------------------------------------

export const MONEY_STATUSES = ['ESTIMATED', 'PROVISIONAL', 'RECONCILED', 'FINAL'] as const;
export type MoneyStatus = (typeof MONEY_STATUSES)[number];

/** The money status after `next` was seen: never backwards (a late event never un-reconciles money). */
export function moneyForward(current: MoneyStatus | null, next: MoneyStatus): MoneyStatus {
  if (current === null) return next;
  return MONEY_STATUSES.indexOf(next) > MONEY_STATUSES.indexOf(current) ? next : current;
}

// ---------------------------------------------------------------------------------------------------------------------
// The order's money as the screens, the messages, the sticker and the rider read it (F-001, F-040)
// ---------------------------------------------------------------------------------------------------------------------

/** Where the Cash on Delivery money of an order stands: the rider has it (collected), or the courier paid it (settled). */
export type CodStage = 'collected' | 'settled' | null;

export interface MoneyFacts {
  status: string;
  paymentMethod: string | null;
  totalMinor: number;
  walletAppliedMinor: number;
  paidMinor: number;
  /** Refunds for the order that were paid out (COMPLETED), in minor units. */
  refundedMinor: number;
  /** PR 166: the COD money after the door (null or left out: nothing recorded yet). */
  cod?: CodStage;
}

/** The order-level payment state (§6.5.0), computed and never stored. */
export type PaymentPill = 'UNPAID' | 'PARTLY_PAID' | 'PAID' | 'OWED_BACK' | 'COD_TO_COLLECT' | 'COD_COLLECTED' | 'COD_SETTLED';

/** What is still to pay (never below 0). */
export const dueOf = (m: Pick<MoneyFacts, 'totalMinor' | 'walletAppliedMinor' | 'paidMinor'>): number => Math.max(0, m.totalMinor - m.walletAppliedMinor - m.paidMinor);

/**
 * SIM-F-001 — what the rider collects at the door: the amount due of a Cash on Delivery order, and nothing for any
 * other order. The sticker, the courier booking, the messages and the tracking page all read this one figure.
 */
export const codToCollect = (m: Pick<MoneyFacts, 'paymentMethod' | 'totalMinor' | 'walletAppliedMinor' | 'paidMinor'>): number => (m.paymentMethod === 'COD' ? dueOf(m) : 0);

/** The order's payment pill (§6.5.3). A cancelled or returned order with money in and not all of it refunded is OWED_BACK. */
export function paymentPill(m: MoneyFacts): PaymentPill {
  const inMinor = m.paidMinor + m.walletAppliedMinor;
  if ((m.status === 'CANCELLED' || m.status === 'RETURNED') && inMinor > m.refundedMinor) return 'OWED_BACK';
  const due = dueOf(m);
  if (m.paymentMethod === 'COD' && due > 0) {
    if (m.cod === 'settled') return 'COD_SETTLED';
    if (m.cod === 'collected' || m.status === 'DELIVERED' || m.status === 'PARTIALLY_DELIVERED') return 'COD_COLLECTED';
    return 'COD_TO_COLLECT';
  }
  if (due === 0) return 'PAID';
  return inMinor > 0 ? 'PARTLY_PAID' : 'UNPAID';
}

// ---------------------------------------------------------------------------------------------------------------------
// SIM-F-028 — the reason codes. A mismatch is never recorded without one; their words are the owner's settings
// (`payments.mismatch.reasons`), the codes are fixed.
// ---------------------------------------------------------------------------------------------------------------------

/** On a payment row: what the gateway (or a person) sent does not fit the payment or the order. */
export const PAYMENT_MISMATCHES = [
  /** The gateway confirmed another amount than the payment asked for. */
  'AMOUNT_DIFFERS',
  /** The gateway confirmed another currency. */
  'CURRENCY_DIFFERS',
  /** Money arrived for a payment we had closed (failed, or given up as abandoned). */
  'PAID_AFTER_CLOSE',
  /** Money arrived for an order that was already paid in full (a second payment). */
  'DUPLICATE_PAYMENT',
  /** Money arrived for an order that is cancelled. */
  'ORDER_CLOSED',
] as const;

/** On a COD collection: what the rider collected is not what the order's amount due says (PR 166). */
export const DOOR_VARIANCES = [
  /** The rider collected more than was due. */
  'OVER_COLLECTED',
  /** The rider collected less than was due. */
  'SHORT_COLLECTED',
  /** Money was collected from a customer who had nothing to pay (SIM-F-001). */
  'PAID_ORDER_COLLECTED',
  /** Some pieces were kept and some came back (SIM-F-005); the amount follows the kept pieces. */
  'PARTIAL_DELIVERY',
  /** The parcel came back and the customer paid the delivery charge (SIM-F-005). */
  'CHARGE_PAID_RETURN',
] as const;

/** On a courier settlement line, against our own records (PR 166; the five §6.3 traps and more). */
export const LINE_MISMATCHES = [
  /** The courier pays for a parcel we cannot find. */
  'UNKNOWN_PARCEL',
  /** The same parcel is on the statement again (here or in an earlier settlement). */
  'DOUBLE_LINE',
  /** The courier's charge was taken twice. */
  'DOUBLE_CHARGE',
  /** The courier's charge is not the one we expected. */
  'CHARGE_DIFFERS',
  /** Less cash than we expected, with nothing recorded to explain it. */
  'SHORT_PAID',
  /** More cash than we expected. */
  'OVER_PAID',
  /** Less cash than the order's due, because some pieces came back (our record says partial). */
  'PARTIAL_DELIVERY',
  /** The courier marks it delivered, but our record says it came back with the charge paid (PR 525's trap). */
  'RETURN_AS_DELIVERED',
  /** The courier pays for a parcel our record says was returned or never delivered. */
  'NOT_COLLECTED',
  /** The money is right but came after the owner's limit. */
  'LATE_SETTLEMENT',
  /** Delivered, and no statement has paid for it after the owner's limit. */
  'MISSING',
] as const;

export type PaymentMismatch = (typeof PAYMENT_MISMATCHES)[number];
export type DoorVariance = (typeof DOOR_VARIANCES)[number];
export type LineMismatch = (typeof LINE_MISMATCHES)[number];
export type MismatchReason = PaymentMismatch | DoorVariance | LineMismatch;
/** Every reason code once (PARTIAL_DELIVERY is both a door variance and a line reason). */
export const MISMATCH_REASONS: readonly MismatchReason[] = [...new Set<MismatchReason>([...PAYMENT_MISMATCHES, ...DOOR_VARIANCES, ...LINE_MISMATCHES])];

/**
 * PR 165 — what is wrong with money that arrived for a payment, or null when it fits: a closed payment (late money),
 * an order already paid in full or cancelled, another amount or currency. The first that applies is the reason.
 */
export function paymentMismatch(p: {
  late: boolean;
  orderStatus: string | null;
  /** The order's amount due before this money (null: a payment without an order). */
  dueBeforeMinor: number | null;
  askedMinor: number;
  receivedMinor: number | null;
  askedCurrency: string;
  receivedCurrency: string | null;
}): PaymentMismatch | null {
  if (p.late) return 'PAID_AFTER_CLOSE';
  if (p.orderStatus === 'CANCELLED') return 'ORDER_CLOSED';
  if (p.dueBeforeMinor !== null && p.dueBeforeMinor <= 0) return 'DUPLICATE_PAYMENT';
  if (p.receivedCurrency !== null && p.receivedCurrency.toUpperCase() !== p.askedCurrency.toUpperCase()) return 'CURRENCY_DIFFERS';
  if (p.receivedMinor !== null && p.receivedMinor !== p.askedMinor) return 'AMOUNT_DIFFERS';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The words a payment leaves on its order (the checkout re-exports these in its own ORDER_FLAGS, CALL_REASONS, …)
// ---------------------------------------------------------------------------------------------------------------------

/** The order's flags the team's screens read: a payment waiting, failed, or with a mismatch to look at. */
export const PAYMENT_FLAGS = { pending: 'PAYMENT_PENDING', failed: 'PAYMENT_FAILED', mismatch: 'PAYMENT_MISMATCH' } as const;
/** Why the team calls (CallTask.reason): the payment did not go through. */
export const PAYMENT_CALL_REASON = 'PAYMENT_FAILED';
/** What a payment's timeline events are called. */
export const PAYMENT_EVENTS = { paid: 'payment.paid', failed: 'payment.failed', retry: 'payment.retry', abandoned: 'payment.abandoned', recorded: 'payment.recorded' } as const;
/** A payment's failure codes the shop itself sets (a gateway's own codes are kept as it sends them). */
export const FAILURE_CODES = { cancelled: 'CUSTOMER_CANCELLED', abandoned: 'ABANDONED' } as const;
