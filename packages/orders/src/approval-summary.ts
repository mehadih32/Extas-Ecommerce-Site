// S14 · PR 533 — the customer history summary at approval, without a database: the earlier orders of the number (as the
// phone history reads them, PR 157) in, one line per outcome out — orders, true deliveries (a delivery still being
// checked, PR 525, is counted apart, never as delivered), refusals at the door and charge-paid returns (PR 191) with
// why they came back, returns after delivery, exchanges and cancels. What the person confirming reads before saying yes.
//
// SIM-F-044: a refusal the shop caused (the owner's `risk.history.ourFaultRefusals`) or a refused parcel re-shipped in
// another size (PR 190, SIM-F-021) is shown as "our fault" and never counted as his refusal. Nothing here decides.
import type { PastOrder } from './phone-summary';

/** What became of one earlier order, as the approver reads it. */
export const APPROVAL_OUTCOMES = ['delivered', 'checking', 'refused', 'chargePaid', 'ourFault', 'cancelled', 'open'] as const;
export type ApprovalOutcome = (typeof APPROVAL_OUTCOMES)[number];

export interface ApprovalCounts {
  orders: number;
  /** Delivered and not being checked (the true deliveries). */
  delivered: number;
  /** The courier said delivered and a true-delivery check is still open: not counted as delivered. */
  checking: number;
  /** Refused at the door, nothing paid (his refusal). */
  refused: number;
  /** Refused at the door after paying the delivery charge (his refusal too). */
  chargePaid: number;
  /** Came back for a reason the shop caused, or re-shipped in another size: shown, never counted. */
  ourFault: number;
  /** Pieces sent back after a delivery (not for one of the shop's reasons). */
  returned: number;
  /** Orders with an exchange that went ahead. */
  exchanges: number;
  cancelled: number;
  /** Still open or with the courier. */
  open: number;
  /** Calls on earlier orders that ended "no answer" (the owner's outcomes). */
  noAnswer: number;
}

export interface ApprovalReason {
  /** A key of the owner's `orders.refusal.reasons`. */
  key: string;
  count: number;
}

export interface ApprovalRow {
  id: string;
  number: string;
  placedAt: Date;
  outcome: ApprovalOutcome;
  /** Why it came back, for a refused, charge-paid or our-fault one. */
  reasonKey: string | null;
  exchange: boolean;
  returned: boolean;
}

export interface ApprovalSummary {
  counts: ApprovalCounts;
  /** Why his parcels came back at the door (his refusals and charge-paid returns), most first, at most `reasonsShown`. */
  reasons: ApprovalReason[];
  /** Refusals with no reason recorded. */
  noReason: number;
  /** The newest earlier orders, at most `recent`. */
  recent: ApprovalRow[];
  firstAt: Date | null;
}

export interface ApprovalOptions {
  ourFault: ReadonlySet<string>;
  noAnswerOutcomes: ReadonlySet<string>;
  recent: number;
  reasonsShown: number;
}

/** The facts found beside the orders: which had an exchange go ahead, which delivery is still being checked. */
export interface ApprovalFacts {
  exchanged: ReadonlySet<string>;
  checking: ReadonlySet<string>;
}

const AFTER_DELIVERY = new Set(['RETURNED', 'DEFECT_RETURN']);

/** What became of one earlier order. */
export function approvalOutcome(o: PastOrder, facts: ApprovalFacts, ourFault: ReadonlySet<string>): ApprovalOutcome {
  if (o.status === 'DELIVERED' || o.status === 'PARTIALLY_DELIVERED') return facts.checking.has(o.id) ? 'checking' : 'delivered';
  if (o.status === 'RETURNED') {
    if ((o.refusalKey && ourFault.has(o.refusalKey)) || o.reshipped) return 'ourFault';
    return o.returns.some((r) => r.kind === 'CHARGE_PAID_RETURN') ? 'chargePaid' : 'refused';
  }
  return o.status === 'CANCELLED' ? 'cancelled' : 'open';
}

/** The summary of a number's earlier orders (newest first, as the phone history gives them). */
export function approvalSummary(past: readonly PastOrder[], facts: ApprovalFacts, opts: ApprovalOptions): ApprovalSummary {
  const counts: ApprovalCounts = { orders: 0, delivered: 0, checking: 0, refused: 0, chargePaid: 0, ourFault: 0, returned: 0, exchanges: 0, cancelled: 0, open: 0, noAnswer: 0 }; // hardcode-ok: counters start at zero
  const reasons = new Map<string, number>();
  let noReason = 0;
  let firstAt: Date | null = null;
  const rows: ApprovalRow[] = [];
  for (const o of past) {
    if (o.status === 'DRAFT') continue;
    counts.orders++;
    if (!firstAt || o.placedAt < firstAt) firstAt = o.placedAt;
    const outcome = approvalOutcome(o, facts, opts.ourFault);
    counts[outcome]++;
    if (outcome === 'refused' || outcome === 'chargePaid') {
      if (o.refusalKey) reasons.set(o.refusalKey, (reasons.get(o.refusalKey) ?? 0) + 1);
      else noReason++;
    }
    const returned = o.returns.some((r) => AFTER_DELIVERY.has(r.kind) && !(r.reasonCode && opts.ourFault.has(r.reasonCode)));
    if (returned) counts.returned++;
    const exchange = facts.exchanged.has(o.id);
    if (exchange) counts.exchanges++;
    counts.noAnswer += o.callOutcomes.filter((c) => opts.noAnswerOutcomes.has(c)).length;
    rows.push({ id: o.id, number: o.number, placedAt: o.placedAt, outcome, reasonKey: o.status === 'RETURNED' ? o.refusalKey : null, exchange, returned });
  }
  return {
    counts,
    reasons: [...reasons]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, Math.max(0, opts.reasonsShown)),
    noReason,
    recent: rows.slice(0, Math.max(0, opts.recent)),
    firstAt,
  };
}
