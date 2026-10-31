// PR 172 — refunds without a database (Blueprint B3.6; BACKEND-ARCHITECTURE §6.5.4 facts 4a/4b, §8.4; SIM-F-041,
// SIM-F-054; CN-018 #7). A refund is a record that moves through REQUESTED → APPROVED (the owner's OK, CLAUDE.md rule 6)
// → COMPLETED, or REJECTED, or FAILED (a payout that did not go through, tried again later). Nothing here pays anything:
// a refund to the wallet is a ledger credit, and money back by bKash or the bank is sent by a person, who then records
// the reference. These rules are asked by the service (refunds.ts) before it writes, and by the screens.
import type { Value } from '@extas/settings';

export const REFUND_STATES = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED'] as const;
export type RefundState = (typeof REFUND_STATES)[number];

/** The moves a refund may make; every other is refused. */
const NEXT: Readonly<Record<RefundState, readonly RefundState[]>> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED', 'FAILED', 'REJECTED'],
  FAILED: ['COMPLETED', 'REJECTED'],
  REJECTED: [],
  COMPLETED: [],
};

export const refundMove = (from: RefundState, to: RefundState): boolean => NEXT[from].includes(to);

/** Refunds still owed to the customer (asked, approved, or a payout to try again): the "money owed to customers". */
export const OWED_REFUND_STATES: readonly RefundState[] = ['REQUESTED', 'APPROVED', 'FAILED'];
/** Refunds that hold part of an order's money (owed or paid); a rejected one gives its room back. */
export const HELD_REFUND_STATES: readonly RefundState[] = ['REQUESTED', 'APPROVED', 'FAILED', 'COMPLETED'];

/**
 * What made the refund. CANCEL and EDIT are written by the order service (PR 144, 142); the others by a person: RTO (a
 * prepaid parcel came back), RIDER_OVERCHARGE (the exact extra the rider took, CN-018 #7), OUR_MISTAKE, OTHER.
 */
export const REFUND_SOURCES = ['CANCEL', 'EDIT', 'RTO', 'RIDER_OVERCHARGE', 'OUR_MISTAKE', 'OTHER'] as const;
export type RefundSource = (typeof REFUND_SOURCES)[number];
/** The sources a person may ask a refund for by hand. */
export const MANUAL_REFUND_SOURCES = ['RTO', 'RIDER_OVERCHARGE', 'OUR_MISTAKE', 'OTHER'] as const;

/** How the money goes back: the way it came (a person sends it), or the customer's wallet (a ledger credit). */
export const REFUND_METHODS = ['original', 'wallet'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

/** The order states that mean the customer received the goods (B3.6: no refunds after receipt, unless the rule allows). */
export const RECEIVED_STATES: ReadonlySet<string> = new Set(['DELIVERED', 'PARTIALLY_DELIVERED']);

export type RefundRules = Value<'payments.refunds'>;

/**
 * May a person ask this refund on an order in this state (see `payments.refunds`)? After the customer received the
 * goods only the sources the owner listed (the rider's overcharge by default), unless he allows refunds after delivery.
 */
export function refundAllowed(rules: RefundRules, orderStatus: string, source: RefundSource): { ok: true } | { ok: false; rule: 'AFTER_DELIVERY' | 'ORDER_STATE' | 'RTO_NOT_RETURNED' } {
  if (orderStatus === 'DRAFT') return { ok: false, rule: 'ORDER_STATE' };
  if (source === 'RTO' && orderStatus !== 'RETURNED') return { ok: false, rule: 'RTO_NOT_RETURNED' };
  if (RECEIVED_STATES.has(orderStatus) && !rules.afterDelivery && !(rules.afterDeliverySources as readonly string[]).includes(source)) return { ok: false, rule: 'AFTER_DELIVERY' };
  return { ok: true };
}

/** The money of an order that a refund may give back: what came in, less every refund that holds part of it. */
export function refundRoom(m: { paidMinor: number; walletAppliedMinor: number; collectedMinor: number; heldMinor: number }): number {
  return Math.max(0, m.paidMinor + m.walletAppliedMinor + m.collectedMinor - m.heldMinor);
}

/**
 * SIM-F-041 — what an RTO of a prepaid parcel gives back: everything paid, or (when the owner keeps it) less the
 * delivery charge the order carried. Never below 0.
 */
export function rtoRefundAmount(rules: RefundRules, o: { paidMinor: number; deliveryChargeMinor: number }): number {
  return rtoRefundSplit(rules, { ...o, walletAppliedMinor: 0, advanceMinor: 0, ourFault: false }).originalMinor;
}

/**
 * Review R3 (M3, minor 2) — what a refused parcel gives back, the way it came and to the wallet:
 * - a delivery-charge advance (a repeat refuser's "charge first", PR 163 / 542) is kept unless the owner says to ask it
 *   back (`rtoAdvance` ASK; KEEP by default, the money that advance was taken to keep);
 * - with `rtoDeliveryCharge` KEEP the delivery charge is kept too (no more than once: an advance kept counts towards it),
 *   from the online money first, then from the wallet part;
 * - a refusal for one of the owner's "our fault" reasons (PR 191) keeps nothing: everything paid goes back.
 * Each part is only ever a REQUEST that waits for a person's approval.
 */
export function rtoRefundSplit(
  rules: RefundRules,
  o: { paidMinor: number; walletAppliedMinor: number; deliveryChargeMinor: number; advanceMinor: number; ourFault: boolean },
): { originalMinor: number; walletMinor: number } {
  const paid = Math.max(0, o.paidMinor);
  const wallet = Math.max(0, o.walletAppliedMinor);
  if (o.ourFault) return { originalMinor: paid, walletMinor: wallet };
  const advanceKept = rules.rtoAdvance === 'ASK' ? 0 : Math.min(paid, Math.max(0, o.advanceMinor));
  const keep = rules.rtoDeliveryCharge === 'KEEP' ? Math.max(advanceKept, Math.max(0, o.deliveryChargeMinor)) : advanceKept;
  return { originalMinor: Math.max(0, paid - keep), walletMinor: Math.max(0, wallet - Math.max(0, keep - paid)) };
}

/** A payment's state from the refunds paid out of it (derived, never set by hand: §6.5.3). */
export function refundedPaymentState(receivedMinor: number, refundedMinor: number): 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' {
  if (refundedMinor <= 0) return 'PAID';
  return refundedMinor >= receivedMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}
