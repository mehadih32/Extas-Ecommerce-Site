// PR 165 — the staff's side of the payment model (BACKEND-ARCHITECTURE §6.5.3, F-040):
//
// - `recordPayment`: money a customer sent outside the checkout (bKash or Nagad to the shop's number, a bank transfer,
//   cash at the counter) recorded against his order by a staff member with `payments.record`, only while the owner has
//   `payments.manual` on (CN-018), with the transaction reference and the amount confirmed ([confirm]); never more than
//   the order's amount due, never twice for one reference, never on a cancelled order. One Idempotency-Key = one
//   payment. It is written by the same outcome writer as a gateway's payment (outcome.ts): the order's paid amount, its
//   Cash on Delivery amount (SIM-F-001), its timeline — and an AuditLog row (who, what, the amount due before and after)
//   in the same transaction. An advance paid in full is handed to the order service (`deps.orders.advancePaid`).
// - `orderMoney`: one order's money as the payments screen shows it (`payments.view`): the total, the wallet, the paid
//   amount, the amount due, what the rider collects, the pill, every payment row with its state, money status, attempt,
//   failure code and mismatch reason, and the list of mismatches with their reasons (SIM-F-028).
import { Prisma } from '@extas/db/client';
import { MANUAL_PAYMENT_METHODS } from '@extas/settings';
import { z } from 'zod';
import { allow, KEY, nowOf, parse, setting, TX, UUID, type PaymentsDeps, type Who } from './context';
import { PaymentsError } from './errors';
import { applyOutcome } from './outcome';
import { codToCollect, dueOf, PAYMENT_EVENTS, paymentPill, type MismatchReason, type PaymentPill } from './pure';

export const PAYMENT_PURPOSES = ['ORDER', 'ADVANCE_DELIVERY_CHARGE', 'FULL_ADVANCE', 'EXCHANGE_DIFFERENCE', 'PREORDER_ADVANCE'] as const;

export const recordInputSchema = z
  .object({
    method: z.enum(MANUAL_PAYMENT_METHODS),
    purpose: z.enum(PAYMENT_PURPOSES).default('ORDER'),
    amountMinor: z.int().min(1).max(1_000_000_000),
    /** The transaction number (bKash / Nagad TrxID, the bank's reference, a receipt number for cash). */
    reference: z.string().trim().min(3).max(100),
    receivedAt: z.coerce.date().optional(),
    note: z.string().trim().max(2_000).optional(),
    /** [confirm]: the person checked the amount against the message or the bank (F-040). */
    confirm: z.boolean().optional(),
  })
  .strict();

export interface RecordResult {
  paymentId: string;
  orderId: string;
  number: string;
  amountMinor: number;
  /** The order's amount due after this payment, and what the rider now collects. */
  dueMinor: number;
  codToCollectMinor: number;
  /** The order waited for an advance and has it in full now (the order service was asked to move it on). */
  advanceMet: boolean;
  /** The same Idempotency-Key was seen before: this is the first answer again. */
  replay: boolean;
}

const MONEY = { paymentMethod: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true } satisfies Prisma.OrderSelect;

const refOf = (method: string, reference: string) => ({ provider: `manual:${method.toLowerCase()}`, providerTrxId: reference.replace(/\s+/g, '').toUpperCase() });

/** Records money received outside the checkout against an order (see the file header). */
export async function recordPayment(deps: PaymentsDeps, who: Who, orderId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<RecordResult> {
  await allow(deps, who, 'payments.record');
  if (!UUID.test(orderId)) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  const key = opts.idempotencyKey;
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'a money record needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(recordInputSchema, input, 'payment');
  const storeId = who.storeId;
  const manual = await setting(deps, storeId, 'payments.manual');
  if (!manual.enabled) throw new PaymentsError('MANUAL_OFF', 'recording payments is switched off (payments.manual)');
  if (!manual.methods.includes(d.method)) throw new PaymentsError('METHOD_NOT_ALLOWED', 'this method is not on the list', ['method']);
  const { provider, providerTrxId } = refOf(d.method, d.reference);
  const idempotencyKey = `manual:${key}`;

  const replayOf = async (): Promise<RecordResult | null> => {
    const p = await deps.db.payment.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, select: { id: true, orderId: true, amountMinor: true, provider: true, providerTrxId: true, purpose: true } });
    if (!p) return null;
    if (p.orderId !== orderId || p.amountMinor !== d.amountMinor || p.provider !== provider || p.providerTrxId !== providerTrxId || p.purpose !== d.purpose) {
      throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another payment', ['idempotencyKey']);
    }
    const o = await deps.db.order.findUniqueOrThrow({ where: { id: orderId }, select: { number: true, ...MONEY } });
    return { paymentId: p.id, orderId, number: o.number, amountMinor: p.amountMinor, dueMinor: dueOf(o), codToCollectMinor: codToCollect(o), advanceMet: false, replay: true };
  };
  const again = await replayOf();
  if (again) return again;
  if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the amount first', ['confirm']);

  const now = nowOf(deps);
  let out: RecordResult;
  try {
    out = await deps.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
      if (!rows.length) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, number: true, status: true, currency: true, ...MONEY } });
      if (o.status === 'CANCELLED') throw new PaymentsError('ORDER_CLOSED', 'the order is cancelled');
      const dueBefore = dueOf(o);
      if (dueBefore <= 0) throw new PaymentsError('NOTHING_DUE', 'nothing is due on this order', [], { dueMinor: 0 });
      if (d.amountMinor > dueBefore) throw new PaymentsError('OVER_DUE', 'more than the amount due', ['amountMinor'], { dueMinor: dueBefore });
      const same = await tx.payment.findFirst({ where: { storeId, provider, providerTrxId, status: { in: ['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] } }, select: { id: true } });
      if (same) throw new PaymentsError('DUPLICATE_REFERENCE', 'this transaction is already recorded', ['reference'], { paymentId: same.id });
      const p = await tx.payment.create({
        data: {
          storeId,
          orderId,
          method: d.method,
          provider,
          purpose: d.purpose,
          status: 'INITIATED',
          amountMinor: d.amountMinor,
          currency: o.currency,
          idempotencyKey,
          recordedById: who.actor.staffUserId,
          note: d.note ?? null,
          statusAt: now,
        },
        select: { id: true },
      });
      const r = await applyOutcome(
        tx,
        storeId,
        {
          paymentId: p.id,
          outcome: 'PAID',
          from: 'staff',
          providerTrxId,
          receivedMinor: d.amountMinor,
          by: { actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: 'admin', ctx: who.ctx },
          eventType: PAYMENT_EVENTS.recorded,
          eventData: { method: d.method, reference: providerTrxId, ...(d.receivedAt ? { receivedAt: d.receivedAt.toISOString() } : {}) },
        },
        d.receivedAt ?? now,
      );
      const after = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: MONEY });
      await tx.auditLog.create({
        data: {
          storeId,
          actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM',
          actorId: who.actor.staffUserId,
          action: 'payment.record',
          entityType: 'Payment',
          entityId: p.id,
          before: { orderId, number: o.number, dueMinor: dueBefore, paidMinor: o.paidMinor },
          after: { orderId, method: d.method, purpose: d.purpose, amountMinor: d.amountMinor, reference: providerTrxId, dueMinor: dueOf(after), paidMinor: after.paidMinor, codAmountMinor: codToCollect(after) },
          ip: who.ctx?.ip ? who.ctx.ip.slice(0, 64) : null,
          userAgent: who.ctx?.userAgent ? who.ctx.userAgent.slice(0, 512) : null,
          source: who.ctx?.source ?? 'admin',
        },
      });
      return { paymentId: p.id, orderId, number: o.number, amountMinor: d.amountMinor, dueMinor: dueOf(after), codToCollectMinor: codToCollect(after), advanceMet: r.advanceMet, replay: false };
    }, TX);
  } catch (e) {
    // Two presses at the same moment: the second finds the first's payment.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const r = await replayOf();
      if (r) return r;
    }
    throw e;
  }
  if (out.advanceMet) await deps.orders?.advancePaid?.(storeId, orderId, { actorId: who.actor.staffUserId, source: 'admin' });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// One order's money (payments.view)
// ---------------------------------------------------------------------------------------------------------------------

export interface PaymentRow {
  id: string;
  method: string;
  provider: string | null;
  purpose: string;
  status: string;
  attempt: number;
  amountMinor: number;
  receivedMinor: number | null;
  currency: string;
  moneyStatus: string | null;
  failureCode: string | null;
  mismatchReason: string | null;
  providerTrxId: string | null;
  recordedById: string | null;
  note: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

export interface MismatchItem {
  /** What carries the mismatch: a payment (PR 165), a door collection or a settlement line (PR 166). */
  kind: 'payment' | 'collection' | 'line';
  id: string;
  reason: MismatchReason;
  /** The reason's words, from the owner's `payments.mismatch.reasons`. */
  en: string;
  bn: string;
}

export interface OrderMoney {
  orderId: string;
  number: string;
  status: string;
  paymentMethod: string | null;
  currency: string;
  totalMinor: number;
  walletAppliedMinor: number;
  paidMinor: number;
  refundedMinor: number;
  dueMinor: number;
  /** What the rider collects at the door (0 for a prepaid order; SIM-F-001). */
  codToCollectMinor: number;
  pill: PaymentPill;
  payments: PaymentRow[];
  mismatches: MismatchItem[];
}

/** The words of every reason code, from the owner's settings. */
export async function reasonWords(deps: Pick<PaymentsDeps, 'settings'>, storeId: number): Promise<Map<string, { en: string; bn: string }>> {
  const list = await setting(deps, storeId, 'payments.mismatch.reasons');
  return new Map(list.map((r) => [r.code, { en: r.en, bn: r.bn }]));
}

/** One order's money for the payments screen (see the file header). */
export async function orderMoney(deps: PaymentsDeps, who: Who, orderId: string): Promise<OrderMoney | null> {
  await allow(deps, who, 'payments.view');
  if (!UUID.test(orderId)) return null;
  const storeId = who.storeId;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { id: true, number: true, status: true, currency: true, ...MONEY } });
  if (!o) return null;
  const [payments, refunded, words] = await Promise.all([
    deps.db.payment.findMany({ where: { storeId, orderId }, orderBy: { createdAt: 'asc' } }),
    deps.db.refund.aggregate({ where: { storeId, orderId, status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    reasonWords(deps, storeId),
  ]);
  const refundedMinor = refunded._sum.amountMinor ?? 0;
  const word = (code: string) => words.get(code) ?? { en: code, bn: code };
  return {
    orderId: o.id,
    number: o.number,
    status: o.status,
    paymentMethod: o.paymentMethod,
    currency: o.currency,
    totalMinor: o.totalMinor,
    walletAppliedMinor: o.walletAppliedMinor,
    paidMinor: o.paidMinor,
    refundedMinor,
    dueMinor: dueOf(o),
    codToCollectMinor: codToCollect(o),
    pill: paymentPill({ ...o, refundedMinor }),
    payments: payments.map((p) => ({
      id: p.id,
      method: p.method,
      provider: p.provider,
      purpose: p.purpose,
      status: p.status,
      attempt: p.attempt,
      amountMinor: p.amountMinor,
      receivedMinor: p.receivedMinor,
      currency: p.currency,
      moneyStatus: p.moneyStatus,
      failureCode: p.failureCode,
      mismatchReason: p.mismatchReason,
      providerTrxId: p.providerTrxId,
      recordedById: p.recordedById,
      note: p.note,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
    })),
    mismatches: payments.filter((p) => p.mismatchReason).map((p) => ({ kind: 'payment' as const, id: p.id, reason: p.mismatchReason as MismatchReason, ...word(p.mismatchReason!) })),
  };
}
