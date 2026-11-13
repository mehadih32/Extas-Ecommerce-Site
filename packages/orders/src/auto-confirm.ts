// S28 · PR 663 — the auto-confirm rules engine (Admin v5, Rules › Order flow › Auto-confirm; DECISIONS.md "Orders").
//
// While `orders.autoConfirm` is on (off as shipped), every new order that is still PLACED is put in one of nine cases and
// the owner's table answers it:
//   auto    — the same Confirm a person would press (PR 138's order service): PLACED → CONFIRMED, the ERP order queued,
//             `confirmedBy: 'RULE'` with the case, the courier score and the reason on the timeline event;
//   call    — a call task for the team and a note saying why (the order stays PLACED, in Processing);
//   person  — a red tag for the team and a note saying why (the order stays PLACED; a person decides).
// Cases, in this order: a suspicious order (a duplicate, a re-order, a new identity or a high risk level: B1.12 and the
// risk sections decide that, never this file) → the money paid ahead (in full, or only the delivery charge) → refused a
// parcel before → a big cash order → an old customer whose parcels were all taken → the number's courier score (PR 662):
// green confirms, in between calls, red is tagged; a number nobody knows is brand new.
//
// It never touches money, a price, a discount or Cash on Delivery, and nothing is blocked or cancelled (CLAUDE.md rule 6).
// An order a rule cannot decide (a prepaid order still waiting for its money) is left alone. Every read is again under the
// order's lock through the service's own guards: an open review, a cancel request or money still due refuse the confirm.
// Staff Confirm keeps working as ever and writes `confirmedBy: 'STAFF'`.
import { AUTO_CONFIRM_PRESETS, type AutoConfirmAction, type AutoConfirmCase, type OrdersAutoConfirm } from '@extas/settings';
import { setting, type OrdersDeps } from './context';
import { courierScoreOf, type CourierScoreResult } from './courier-score';
import { isOrdersError } from './errors';
import { hasNoHistory } from './new-customer';
import { historyOptions, phoneOrders } from './phone-history';
import { summarizeHistory } from './phone-summary';
import { isPrepaidMethod } from './risk-section';
import { execute, queueErpOrder, systemBy, type By, type CommandResult } from './service';

/** What the engine does is told on the timeline: who confirmed (the rule or a person), by which case and why. */
export const AUTO_CONFIRM_SOURCE = 'auto-confirm';
/** The timeline type of a "call" or "red tag" answer (a note; the status stays). */
export const AUTO_CONFIRM_EVENT = 'order.autoConfirm';
/** The order flag of a red tag (the team's screens show it, never the customer). */
export const AUTO_RED_FLAG = 'AUTO_RED_TAG';
/** The call queue reason of a "call list" answer. */
export const AUTO_CONFIRM_CALL_REASON = 'AUTO_CONFIRM';

/** Risk sections that make an order suspicious (the duplicate rules, B1.12, and the scored sections). */
export const SUSPICIOUS_SECTIONS: readonly string[] = ['duplicate', 'reorder', 'identity', 'high'];

/** Why the engine answered as it did (the screen words it from its dictionary). */
export type AutoConfirmWhy = 'suspicious' | 'paidFull' | 'paidCharge' | 'refused' | 'refusedPaid' | 'bigCod' | 'trusted' | 'scoreGreen' | 'scoreMiddle' | 'scoreRed' | 'noRecord' | 'watch';

export interface AutoConfirmFacts {
  paymentMethod: string | null;
  totalMinor: number;
  paidMinor: number;
  walletAppliedMinor: number;
  deliveryChargeMinor: number;
  riskSection: string | null;
  /** The number's earlier orders here, as the phone history counts them. */
  delivered: number;
  refused: number;
  /** No earlier order anywhere in the shop (PR 545's check). */
  noHistory: boolean;
  /** PR 662's score now; null while it is off or there is no record. */
  score: CourierScoreResult | null;
}

export interface AutoConfirmDecision {
  case: AutoConfirmCase;
  action: AutoConfirmAction;
  why: AutoConfirmWhy;
  score: number | null;
}

/** The pure decision: the same facts and settings always give the same answer; null: the rules cannot decide yet. */
export function classifyOrder(f: AutoConfirmFacts, cfg: Pick<OrdersAutoConfirm, 'cases' | 'trustedMinDelivered' | 'trustedMaxRefused' | 'bigCodMinor'>): AutoConfirmDecision | null {
  const due = f.totalMinor - f.walletAppliedMinor - f.paidMinor;
  const prepaidMethod = isPrepaidMethod(f.paymentMethod);
  // a prepaid order whose money has not come in waits for it (the payment's own hook runs this again)
  if (prepaidMethod && due > 0) return null;
  const score = f.score?.score ?? null;
  const pick = (c: AutoConfirmCase, why: AutoConfirmWhy): AutoConfirmDecision => {
    let action = cfg.cases[c];
    // a suspicious order is never confirmed by itself, whatever a table says
    if (c === 'suspicious' && action === 'auto') action = 'person';
    // a "watch" order is never confirmed by itself either: it goes to the call list
    if (f.riskSection === 'watch' && action === 'auto') return { case: c, action: 'call', why: 'watch', score };
    return { case: c, action, why, score };
  };
  if (f.riskSection && SUSPICIOUS_SECTIONS.includes(f.riskSection)) return pick('suspicious', 'suspicious');
  if (prepaidMethod) return pick('prepaid', 'paidFull');
  const advance = f.paidMinor + f.walletAppliedMinor;
  const chargePaid = f.deliveryChargeMinor > 0 && advance >= f.deliveryChargeMinor;
  if (f.refused > 0) return chargePaid ? pick('refusedPaid', 'refusedPaid') : pick('refused', 'refused');
  if (chargePaid) return pick('delivery', 'paidCharge');
  if (cfg.bigCodMinor !== null && f.totalMinor > cfg.bigCodMinor) return pick('bigCod', 'bigCod');
  if (f.delivered >= cfg.trustedMinDelivered && f.refused <= cfg.trustedMaxRefused) return pick('trusted', 'trusted');
  if (score === null || f.noHistory) return pick('brandNew', 'noRecord');
  const band = f.score!.band;
  if (f.score!.partial) return { case: 'goodScore', action: 'call', why: 'scoreMiddle', score };
  if (band === 'auto') return pick('goodScore', 'scoreGreen');
  if (band === 'call') return { case: 'goodScore', action: 'call', why: 'scoreMiddle', score };
  return { case: 'goodScore', action: 'person', why: 'scoreRed', score };
}

/** The preset a table equals, or 'custom'. */
export function presetOf(cases: OrdersAutoConfirm['cases']): OrdersAutoConfirm['preset'] {
  for (const k of ['low', 'normal', 'strict'] as const) if (JSON.stringify(AUTO_CONFIRM_PRESETS[k]) === JSON.stringify(cases)) return k;
  return 'custom';
}

export type AutoConfirmSkip = 'OFF' | 'NOT_FOUND' | 'NOT_PLACED' | 'WAITING' | 'BLOCKED';

export interface AutoConfirmResult {
  /** The order's decision; null when the rules could not decide (off, not placed, waiting for money). */
  decision: AutoConfirmDecision | null;
  skip: AutoConfirmSkip | null;
  /** 'confirmed' only for `auto` that the order service accepted; 'noted' for a call or a red tag. */
  done: 'confirmed' | 'noted' | 'left' | null;
  command: CommandResult | null;
}

const none = (skip: AutoConfirmSkip): AutoConfirmResult => ({ decision: null, skip, done: null, command: null });

/**
 * Runs the rules on one order the moment it lands (and again when its money comes in). Safe to call more than once: an
 * order already confirmed, or already answered the same way, is left as it is.
 */
export async function autoConfirmOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy(AUTO_CONFIRM_SOURCE)): Promise<AutoConfirmResult> {
  const cfg = await setting(deps, ref.storeId, 'orders.autoConfirm');
  if (!cfg.enabled) return none('OFF');
  const o = await deps.db.order.findFirst({
    where: { id: ref.orderId, storeId: ref.storeId },
    select: { status: true, phone: true, paymentMethod: true, totalMinor: true, paidMinor: true, walletAppliedMinor: true, deliveryChargeMinor: true, riskSection: true, placedAt: true },
  });
  if (!o) return none('NOT_FOUND');
  if (o.status !== 'PLACED') return none('NOT_PLACED');
  const h = await historyOptions(deps, ref.storeId);
  const past = await phoneOrders(deps, ref.storeId, o.phone, { excludeOrderId: ref.orderId, before: o.placedAt, take: h.take });
  const s = summarizeHistory(past, { ourFault: h.ourFault });
  const [score, noHistory] = await Promise.all([courierScoreOf(deps, ref.storeId, o.phone, { excludeOrderId: ref.orderId }), hasNoHistory(deps, ref)]);
  const decision = classifyOrder({ ...o, delivered: s.delivered, refused: s.refused, noHistory, score }, cfg);
  if (!decision) return none('WAITING');
  const eventData = { confirmedBy: 'RULE', rule: decision.case, action: decision.action, why: decision.why, score: decision.score };
  try {
    if (decision.action === 'auto') {
      const command = await execute(
        deps,
        ref,
        by,
        {
          command: 'confirm',
          input: { auto: AUTO_CONFIRM_SOURCE, rule: decision.case },
          effect: async (tx, locked, _f, { now }) => {
            const pushId = await queueErpOrder(deps, tx, locked);
            return { data: { confirmedAt: now }, reasonCode: AUTO_CONFIRM_SOURCE, eventData: { ...eventData, erpPushId: pushId } };
          },
        },
        { idempotencyKey: `auto-confirm:${ref.orderId}` },
      );
      return { decision, skip: null, done: 'confirmed', command };
    }
    const command = await execute(
      deps,
      ref,
      by,
      {
        command: 'autoConfirm',
        input: { rule: decision.case, action: decision.action },
        effect: async (tx, ord) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: ord.id }, select: { flags: true, customerId: true } });
          let flags = row.flags;
          let callTaskId: string | null = null;
          if (decision.action === 'person') flags = row.flags.includes(AUTO_RED_FLAG) ? row.flags : [...row.flags, AUTO_RED_FLAG];
          else {
            const open = await tx.callTask.findFirst({
              where: { storeId: ord.storeId, orderId: ord.id, reason: AUTO_CONFIRM_CALL_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } },
              select: { id: true },
            });
            callTaskId = (open ?? (await tx.callTask.create({ data: { storeId: ord.storeId, orderId: ord.id, customerId: row.customerId, reason: AUTO_CONFIRM_CALL_REASON }, select: { id: true } })))
              .id;
          }
          return { data: { flags }, reasonCode: decision.action, eventData: { ...eventData, callTaskId }, audit: { before: { flags: row.flags }, after: { flags, callTaskId } } };
        },
      },
      { idempotencyKey: `auto-confirm-note:${ref.orderId}:${decision.action}:${decision.case}` },
    );
    return { decision, skip: null, done: 'noted', command };
  } catch (e) {
    if (!isOrdersError(e)) throw e;
    // the order moved on, an open review, a cancel request, money still due: left for a person
    if (['ILLEGAL_TRANSITION', 'IN_REVIEW', 'CANCEL_REQUESTED', 'PAYMENT_DUE', 'ADVANCE_SHORT'].includes(e.code)) return { decision, skip: 'BLOCKED', done: 'left', command: null };
    throw e;
  }
}

/** For the places that must never fail because of the rules (a payment, the checkout): a problem is logged, nothing else. */
export async function autoConfirmQuietly(deps: OrdersDeps, ref: { storeId: number; orderId: string }): Promise<AutoConfirmResult | null> {
  try {
    return await autoConfirmOrder(deps, ref);
  } catch (e) {
    console.warn(`auto-confirm: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
    return null;
  }
}
