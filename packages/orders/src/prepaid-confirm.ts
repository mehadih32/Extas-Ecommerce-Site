// S05 · PR 541 follow-up 320 — a prepaid order that nothing flagged confirms by itself once its money is in full, behind
// the owner's switch `orders.prepaid.selfConfirm` (off as shipped). Today such an order waits in Orders › To confirm ›
// Prepaid for one tap; with the switch on, the moment the payment lands (the gateway's answer, the shop's payment page,
// a payment the team records, or a wallet that paid it all at the checkout) the one order service confirms it exactly as
// the tap would: PLACED → CONFIRMED with its timeline note and audit row, the ERP order queued (D6).
//
// It only confirms. It never takes, moves or gives back money and never touches a price, a charge, a discount or Cash
// on Delivery (CLAUDE.md rule 6). Every condition is read again under the order's lock; an order that fails one is left
// as it is, for a person:
// - PLACED, paid ahead (not Cash on Delivery), its risk section "prepaid" (nothing flagged it: no duplicate, re-order,
//   new identity, high or watch band — PR 541's `sectionOf`);
// - nothing left to pay, and no payment pending, failed or not matching what was asked;
// - no cancel request and no open review (the confirm's own guards, which refuse them anyway).
import { setting, type OrdersDeps } from './context';
import { OrdersError, isOrdersError } from './errors';
import { isPrepaidMethod } from './pure';
import { execute, queueErpOrder, systemBy, type By, type CommandResult } from './service';

/** The order flags that keep a prepaid order for a person (a payment not in, failed, or not what was asked). */
export const SELF_CONFIRM_BLOCKING_FLAGS = ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'PAYMENT_MISMATCH'] as const;

/** The source of a confirm made by the switch (the timeline and the audit row name it). */
export const SELF_CONFIRM_SOURCE = 'prepaid-self-confirm';

/** Why an order was not confirmed by itself (null: it was). */
export type SelfConfirmSkip = 'OFF' | 'NOT_FOUND' | 'NOT_PLACED' | 'NOT_PREPAID' | 'FLAGGED' | 'DUE' | 'PAYMENT' | 'CANCEL_REQUESTED' | 'IN_REVIEW';

/** The pure check: why this order may not confirm by itself, or null. */
export function selfConfirmSkip(o: {
  status: string;
  paymentMethod: string | null;
  riskSection: string | null;
  totalMinor: number;
  walletAppliedMinor: number;
  paidMinor: number;
  flags: readonly string[];
  cancelRequestedAt: Date | null;
}): SelfConfirmSkip | null {
  if (o.status !== 'PLACED') return 'NOT_PLACED';
  if (!isPrepaidMethod(o.paymentMethod)) return 'NOT_PREPAID';
  if (o.riskSection !== 'prepaid') return 'FLAGGED';
  if (o.flags.some((x) => (SELF_CONFIRM_BLOCKING_FLAGS as readonly string[]).includes(x))) return 'PAYMENT';
  if (o.totalMinor - o.walletAppliedMinor - o.paidMinor > 0) return 'DUE';
  if (o.cancelRequestedAt !== null) return 'CANCEL_REQUESTED';
  return null;
}

export interface SelfConfirmResult {
  confirmed: boolean;
  skip: SelfConfirmSkip | null;
  command: CommandResult | null;
}

/**
 * Confirms one paid prepaid order that nothing flagged, while the owner's switch is on. Safe to call after every payment
 * and more than once: an order already confirmed, or one that fails a condition, is left as it is.
 */
export async function selfConfirmPrepaid(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By = systemBy(SELF_CONFIRM_SOURCE)): Promise<SelfConfirmResult> {
  const skip = (s: SelfConfirmSkip): SelfConfirmResult => ({ confirmed: false, skip: s, command: null });
  const cfg = await setting(deps, ref.storeId, 'orders.prepaid.selfConfirm');
  if (!cfg.enabled) return skip('OFF');
  const sel = { status: true, paymentMethod: true, riskSection: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, flags: true, cancelRequestedAt: true } as const;
  const o = await deps.db.order.findFirst({ where: { id: ref.orderId, storeId: ref.storeId }, select: sel });
  if (!o) return skip('NOT_FOUND');
  const first = selfConfirmSkip(o);
  if (first) return skip(first);
  let late: SelfConfirmSkip | null = null;
  try {
    const command = await execute(
      deps,
      ref,
      by,
      {
        command: 'confirm',
        input: { self: SELF_CONFIRM_SOURCE },
        effect: async (tx, locked, _f, { now }) => {
          // read again under the lock: a payment or an order command may have changed it in between
          const again = await tx.order.findUniqueOrThrow({ where: { id: locked.id }, select: sel });
          late = selfConfirmSkip(again);
          if (late) throw new OrdersError('NOTHING_CHANGED', `not confirmed by itself: ${late}`, []);
          const pushId = await queueErpOrder(deps, tx, locked);
          return { data: { confirmedAt: now }, reasonCode: SELF_CONFIRM_SOURCE, eventData: { erpPushId: pushId, selfConfirm: true } };
        },
      },
      { idempotencyKey: `prepaid-confirm:${ref.orderId}` },
    );
    return { confirmed: true, skip: null, command };
  } catch (e) {
    if (!isOrdersError(e)) throw e;
    if (e.code === 'NOTHING_CHANGED') return skip(late ?? 'NOT_PLACED');
    // the confirm's own guards refuse with the machine's code (the order moved on, an open review, a cancel request, money due)
    const machine: Partial<Record<string, SelfConfirmSkip>> = { ILLEGAL_TRANSITION: 'NOT_PLACED', IN_REVIEW: 'IN_REVIEW', CANCEL_REQUESTED: 'CANCEL_REQUESTED', PAYMENT_DUE: 'DUE' };
    const m = machine[e.code];
    if (m) return skip(m);
    throw e;
  }
}
