// PR 165, 170 — the one writer of a payment's outcome (BACKEND-ARCHITECTURE §6.5.0: the payments service writes the
// payment dimension). The mock payment page, a verified gateway callback, a server-side query, the abandoned-payment
// sweep and a staff member's record of money received outside the checkout all end here, inside the caller's
// transaction:
//
//   1. the order's row lock first, then the payment's (the checkout and the order service lock in the same order), so a
//      callback and a cancel on one order run one after the other;
//   2. the payment model's move (pure.ts `paymentMove`): a repeat changes nothing; a failure report for a payment that
//      already has its money is ignored (a late failure never undoes money); money the gateway confirms for a payment we
//      had closed is recorded and flagged PAID_AFTER_CLOSE;
//   3. money in (PAID): the payment PAID with what really came in and its money status PROVISIONAL; the order's paid
//      amount grows by it and its Cash on Delivery amount becomes the live amount due (SIM-F-001: a prepaid or part-paid
//      customer is never asked for the whole total at the door); any mismatch is stored with its reason code and the
//      order flagged (SIM-F-028); an open "payment failed" call is closed;
//   4. no money (FAILED, CANCELLED, ABANDONED): the payment closed with its failure code; the order flagged "payment
//      failed" and, unless the caller says not to, one call task for the team (SIM-F-026) — never a second one;
//   5. a timeline event on the order in the same transaction.
//
// It never moves the order's status: when an order waiting for its advance now has it in full, the result says so
// (`advanceMet`) and the caller asks the order service (@extas/orders `recordAdvance`).
import type { RequestContext } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import type { Tx } from './context';
import { PaymentsError } from './errors';
import { codToCollect, dueOf, FAILURE_CODES, PAYMENT_CALL_REASON, PAYMENT_EVENTS, PAYMENT_FLAGS, paymentMismatch, paymentMove, type MoveSource, type PaymentMismatch, type PaymentState } from './pure';

export type OutcomeKind = 'PAID' | 'FAILED' | 'CANCELLED' | 'ABANDONED';

/** Who reports the outcome, for the timeline. */
export interface OutcomeBy {
  actorType: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
  actorId: string | null;
  /** checkout, gateway:<provider>, admin, sweep … */
  source: string;
  ctx?: RequestContext;
}

export interface OutcomeInput {
  paymentId: string;
  outcome: OutcomeKind;
  /** Who stands behind the outcome (only the gateway may turn a closed payment into PAID). */
  from: MoveSource;
  providerRef?: string | null;
  providerTrxId?: string | null;
  /** What really came in (minor units); null: the amount asked. */
  receivedMinor?: number | null;
  currency?: string | null;
  /** The gateway's own failure code; the shop's are CUSTOMER_CANCELLED and ABANDONED. */
  failureCode?: string | null;
  /** A failed payment asks the team to call (default true); the abandoned sweep passes the owner's setting. */
  callTask?: boolean;
  by: OutcomeBy;
  /** The timeline event's type (default payment.paid / payment.failed / payment.abandoned). */
  eventType?: string;
  /** More data on the timeline event (the gateway's event id, the staff's reference …). */
  eventData?: Record<string, unknown>;
}

export interface OutcomeResult {
  paymentId: string;
  orderId: string | null;
  number: string | null;
  status: PaymentState;
  /** False: a repeat, or a failure report for a payment that already has its money. */
  changed: boolean;
  mismatchReason: PaymentMismatch | null;
  /** The order waits for an advance (AWAITING_ADVANCE) and now has it in full. */
  advanceMet: boolean;
}

const ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  flags: true,
  paymentMethod: true,
  totalMinor: true,
  walletAppliedMinor: true,
  paidMinor: true,
  advanceRequiredMinor: true,
} satisfies Prisma.OrderSelect;

const json = (v: Record<string, unknown>) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/** Applies one outcome to its payment and order. Runs inside the caller's transaction. */
export async function applyOutcome(tx: Tx, storeId: number, i: OutcomeInput, now: Date): Promise<OutcomeResult> {
  const head = await tx.payment.findFirst({ where: { id: i.paymentId, storeId }, select: { orderId: true } });
  if (!head) throw new PaymentsError('NOT_FOUND', 'no such payment', ['paymentId']);
  if (head.orderId) await tx.$queryRaw`SELECT 1 FROM "Order" WHERE "id" = ${head.orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  await tx.$queryRaw`SELECT 1 FROM "Payment" WHERE "id" = ${i.paymentId}::uuid FOR UPDATE`;
  const p = await tx.payment.findUniqueOrThrow({ where: { id: i.paymentId } });
  const o = p.orderId ? await tx.order.findUniqueOrThrow({ where: { id: p.orderId }, select: ORDER_SELECT }) : null;
  const target: PaymentState = i.outcome === 'PAID' ? 'PAID' : i.outcome === 'FAILED' ? 'FAILED' : 'CANCELLED';
  const from = p.status as PaymentState;
  const move = paymentMove(from, target, i.from);
  const result = (changed: boolean, status: PaymentState, mismatchReason: PaymentMismatch | null = null, advanceMet = false): OutcomeResult => ({
    paymentId: p.id,
    orderId: o?.id ?? null,
    number: o?.number ?? null,
    status,
    changed,
    mismatchReason,
    advanceMet,
  });
  if (!move.ok) {
    if (move.code === 'DERIVED_STATE') throw new PaymentsError('DERIVED_STATE', `${target} is never set on a payment`, ['status']);
    // A failure (or a second, different failure) reported for a payment that is already final changes nothing: money
    // that came in is never undone by a later "failed", and a closed payment stays closed.
    if (target !== 'PAID') return result(false, from, (p.mismatchReason as PaymentMismatch | null) ?? null);
    throw new PaymentsError('ILLEGAL_PAYMENT_MOVE', `a payment ${from} cannot become PAID this way`, ['status'], { status: from });
  }
  if (move.same) return result(false, from, (p.mismatchReason as PaymentMismatch | null) ?? null);

  const event = (type: string, data: Record<string, unknown>) =>
    o
      ? tx.orderEvent.create({
          data: { storeId, orderId: o.id, type, actorType: i.by.actorType, actorId: i.by.actorId, source: i.by.source, data: json({ paymentId: p.id, provider: p.provider, purpose: p.purpose, ...data, ...i.eventData }) },
        })
      : Promise.resolve(null);
  const flagsWithout = (...f: string[]) => (o ? o.flags.filter((x) => !f.includes(x)) : []);

  if (target === 'PAID') {
    const received = i.receivedMinor ?? p.amountMinor;
    const dueBefore = o ? dueOf(o) : null;
    const mismatch = paymentMismatch({
      late: move.late,
      orderStatus: o?.status ?? null,
      dueBeforeMinor: dueBefore,
      askedMinor: p.amountMinor,
      receivedMinor: i.receivedMinor ?? null,
      askedCurrency: p.currency,
      receivedCurrency: i.currency ?? null,
    });
    await tx.payment.update({
      where: { id: p.id },
      data: {
        status: 'PAID',
        paidAt: now,
        statusAt: now,
        receivedMinor: received,
        moneyStatus: 'PROVISIONAL',
        mismatchReason: mismatch,
        ...(i.providerTrxId ? { providerTrxId: i.providerTrxId } : {}),
        ...(i.providerRef && !p.providerRef ? { providerRef: i.providerRef } : {}),
      },
    });
    let advanceMet = false;
    if (o) {
      const paidMinor = o.paidMinor + received;
      const flags = flagsWithout(PAYMENT_FLAGS.pending, PAYMENT_FLAGS.failed, PAYMENT_FLAGS.mismatch);
      if (mismatch) flags.push(PAYMENT_FLAGS.mismatch);
      await tx.order.update({
        where: { id: o.id },
        data: { paidMinor, codAmountMinor: codToCollect({ ...o, paidMinor }), flags, version: { increment: 1 } },
      });
      await tx.callTask.updateMany({ where: { storeId, orderId: o.id, reason: PAYMENT_CALL_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DONE', outcome: 'PAID', closedAt: now } });
      await event(i.eventType ?? PAYMENT_EVENTS.paid, { amountMinor: received, ...(mismatch ? { mismatch } : {}) });
      advanceMet = o.status === 'AWAITING_ADVANCE' && o.advanceRequiredMinor !== null && paidMinor >= o.advanceRequiredMinor;
    }
    return result(true, 'PAID', mismatch, advanceMet);
  }

  const failureCode = i.outcome === 'ABANDONED' ? FAILURE_CODES.abandoned : (i.failureCode?.slice(0, 100) ?? (i.outcome === 'CANCELLED' ? FAILURE_CODES.cancelled : null));
  await tx.payment.update({ where: { id: p.id }, data: { status: target, statusAt: now, failureCode, ...(i.providerRef && !p.providerRef ? { providerRef: i.providerRef } : {}) } });
  if (o) {
    const stillDue = o.status !== 'CANCELLED' && dueOf(o) > 0;
    const flags = flagsWithout(PAYMENT_FLAGS.pending, PAYMENT_FLAGS.failed);
    if (stillDue) flags.push(PAYMENT_FLAGS.failed);
    await tx.order.update({ where: { id: o.id }, data: { flags, version: { increment: 1 } } });
    await event(i.eventType ?? (i.outcome === 'ABANDONED' ? PAYMENT_EVENTS.abandoned : PAYMENT_EVENTS.failed), { amountMinor: p.amountMinor, failureCode });
    if (stillDue && i.callTask !== false) {
      const task = await tx.callTask.findFirst({ where: { storeId, orderId: o.id, reason: PAYMENT_CALL_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
      if (!task) await tx.callTask.create({ data: { storeId, orderId: o.id, reason: PAYMENT_CALL_REASON } });
    }
  }
  return result(true, target);
}
