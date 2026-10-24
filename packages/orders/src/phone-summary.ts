// S06 · PR 157 — one phone number's history in the shop, as counts, without a database: its earlier orders (each with
// its outcome) in, what they come to out — delivered, refused at the door, cancelled, still open, with the courier,
// returned after delivery, calls not answered. The order page shows it beside the order and the risk score (PR 156)
// reads its signals from it.
//
// SIM-F-044: a refusal the shop caused (one of the owner's `risk.history.ourFaultRefusals`, such as "late" or "wrong
// item") is counted apart — shown, never held against the number. A cancel only counts when its code is one the caller
// asks for, and never one of NOT_A_RISK_SIGNAL (a change after booking, "did not order").
import { NOT_A_RISK_SIGNAL, type OrderState } from './pure';

/** The order states a parcel is with the courier in. */
export const WITH_COURIER: readonly OrderState[] = ['HANDED_OVER', 'IN_TRANSIT'];

/** One earlier order of the same phone number, as the history read gives it. */
export interface PastOrder {
  id: string;
  number: string;
  placedAt: Date;
  status: OrderState;
  totalMinor: number;
  /** Why the parcel came back (a key of `orders.refusal.reasons`), for a refused one. */
  refusalKey: string | null;
  /** The cancel code, for a cancelled one. */
  cancelCode: string | null;
  areaId: string | null;
  /** The outcomes of the call tasks on that order (the call screen's codes). */
  callOutcomes: string[];
  /** Returns after delivery (ReturnRecord, S08), with their reason. */
  returns: { kind: string; reasonCode: string | null }[];
  /** PR 190 (SIM-F-021): a refused parcel re-shipped in another size after a try-on — shown, never counted. */
  reshipped?: boolean;
}

/** What the number's history comes to (the order page's line and the risk score's facts). */
export interface PhoneSummary {
  orders: number;
  delivered: number;
  /** Refused at the door, not our fault (counts against the number). */
  refused: number;
  /** Refused for a reason the shop caused: shown, never counted. */
  ourFault: number;
  cancelled: number;
  /** Cancels whose code counts (the caller's `cancelCodes`, never NOT_A_RISK_SIGNAL). */
  cancelsCounted: number;
  /** Returns after delivery (not our fault). */
  returns: number;
  open: number;
  inTransit: number;
  /** Calls on earlier orders that ended with one of the owner's "no answer" outcomes. */
  noAnswer: number;
  firstAt: Date | null;
  lastAt: Date | null;
}

export interface SummaryOptions {
  ourFault: ReadonlySet<string>;
  /** Cancel codes that count; empty: none. */
  cancelCodes?: ReadonlySet<string>;
  noAnswerOutcomes?: ReadonlySet<string>;
  /** Only orders placed at or after this moment. */
  since?: Date | null;
}

const isDelivered = (s: OrderState) => s === 'DELIVERED' || s === 'PARTIALLY_DELIVERED';

/** The history of a number in counts (only orders placed since `since`, when given). */
export function summarizeHistory(past: readonly PastOrder[], opts: SummaryOptions): PhoneSummary {
  const s: PhoneSummary = { orders: 0, delivered: 0, refused: 0, ourFault: 0, cancelled: 0, cancelsCounted: 0, returns: 0, open: 0, inTransit: 0, noAnswer: 0, firstAt: null, lastAt: null };
  for (const o of past) {
    if (opts.since && o.placedAt < opts.since) continue;
    s.orders++;
    if (!s.firstAt || o.placedAt < s.firstAt) s.firstAt = o.placedAt;
    if (!s.lastAt || o.placedAt > s.lastAt) s.lastAt = o.placedAt;
    if (isDelivered(o.status)) s.delivered++;
    else if (o.status === 'RETURNED') {
      if ((o.refusalKey && opts.ourFault.has(o.refusalKey)) || o.reshipped) s.ourFault++;
      else s.refused++;
    } else if (o.status === 'CANCELLED') {
      s.cancelled++;
      if (o.cancelCode && !(NOT_A_RISK_SIGNAL as ReadonlySet<string>).has(o.cancelCode) && opts.cancelCodes?.has(o.cancelCode)) s.cancelsCounted++;
    } else if (o.status !== 'DRAFT') {
      s.open++;
      if (WITH_COURIER.includes(o.status)) s.inTransit++;
    }
    s.returns += o.returns.filter((r) => !(r.reasonCode && opts.ourFault.has(r.reasonCode))).length;
    if (opts.noAnswerOutcomes?.size) s.noAnswer += o.callOutcomes.filter((c) => opts.noAnswerOutcomes!.has(c)).length;
  }
  return s;
}
