// S07 · PR 172 — refunds: to the wallet, and the rules for when a refund is allowed (Blueprint B3.5, B3.6;
// BACKEND-ARCHITECTURE §6.5.4 facts 4a/4b, §8.4, MNY-03; SIM-F-041, SIM-F-054; CN-018 #7). Every step is a person's
// action behind its permission, audited and on the order's timeline; nothing pays out by itself (CLAUDE.md rule 6).
//
// - `requestRefund` (`payments.refunds.request`): a person asks for a refund on an order — an RTO of a prepaid parcel
//   (the amount from the owner's rule when none is typed), the exact extra the rider took (never more than the door
//   records show he over-collected), our mistake, other — within the owner's rules (`payments.refunds`: B3.6, no
//   refunds after the customer received the goods except the listed sources) and never more than the order's money not
//   yet held by another refund. To the wallet only while the owner allows it. One Idempotency-Key = one request. The
//   cancel and edit requests of the order service (PR 144, 142) are the same records.
// - `requestReturnRefund` (system): the refund an RTO of a paid order owes (SIM-F-041), once per order; S08 calls it
//   when a prepaid parcel comes back (follow-up 420).
// - `approveRefund` / `rejectRefund` (`payments.refunds.approve`, the owner): the OK before any money goes back, with
//   [confirm]; optionally to the wallet instead (when allowed); four eyes when the owner switches it on.
// - `completeRefund` (`payments.refunds.execute`): an approved refund paid out — to the wallet, a ledger credit in the
//   same transaction (wallet.ts), or the way it came: a person sent the money by hand (bKash send-money, a bank
//   transfer) and records its reference. The payment it came from becomes PARTIALLY_REFUNDED / REFUNDED (derived).
//   `failRefund`: the payout did not go through (tried again later with `completeRefund`).
// - `listRefunds` (`payments.view`): the refunds by state, newest first, with the money owed to customers always on top
//   (@extas/metrics `owedToCustomers`, F-041).
// No gateway refund call is made here: a gateway's own refund API joins behind the owner's approval when its keys and
// terms are known (follow-up 421).
import { owedToCustomers, type OwedFigure } from '@extas/metrics';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, KEY, nowOf, parse, setting, TX, UUID, type PaymentsDeps, type Tx, type Who } from './context';
import { PaymentsError } from './errors';
import { CASH_OUTCOMES } from './cod-match';
import { HELD_REFUND_STATES, MANUAL_REFUND_SOURCES, refundAllowed, refundedPaymentState, refundMove, refundRoom, REFUND_METHODS, REFUND_STATES, rtoRefundAmount, type RefundMethod, type RefundSource, type RefundState } from './refund-pure';
import { auditMoney, postWalletEntry } from './wallet';

/** The timeline's event types of a refund. */
export const REFUND_EVENTS = { requested: 'refund.requested', approved: 'refund.approved', rejected: 'refund.rejected', completed: 'refund.completed', failed: 'refund.failed' } as const;

const actorOf = (who: Who) => ({ actorType: who.actor.staffUserId ? ('STAFF' as const) : ('SYSTEM' as const), actorId: who.actor.staffUserId });

export interface RefundRow {
  id: string;
  orderId: string;
  number: string | null;
  paymentId: string | null;
  amountMinor: number;
  method: string;
  source: string | null;
  reason: string;
  status: RefundState;
  note: string | null;
  requestedById: string | null;
  approvedById: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  executedById: string | null;
  walletEntryId: string | null;
  payoutReference: string | null;
  failureNote: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

const ROW = {
  id: true,
  orderId: true,
  paymentId: true,
  amountMinor: true,
  method: true,
  source: true,
  reason: true,
  status: true,
  note: true,
  requestedById: true,
  approvedById: true,
  decidedAt: true,
  decisionNote: true,
  executedById: true,
  walletEntryId: true,
  payoutReference: true,
  failureNote: true,
  completedAt: true,
  createdAt: true,
} satisfies Prisma.RefundSelect;

type Row = Prisma.RefundGetPayload<{ select: typeof ROW }>;
const rowOf = (r: Row, number: string | null): RefundRow => ({ ...r, status: r.status as RefundState, number });

const ORDER = { id: true, number: true, status: true, customerId: true, paidMinor: true, walletAppliedMinor: true, deliveryChargeMinor: true } satisfies Prisma.OrderSelect;
type OrderFacts = Prisma.OrderGetPayload<{ select: typeof ORDER }>;

/** The order's money a refund may still give back, and what the rider over-collected (under the caller's order lock). */
async function roomOf(tx: Tx, storeId: number, o: OrderFacts): Promise<{ roomMinor: number; overMinor: number; inMinor: number }> {
  const [held, doors, overRefunds] = await Promise.all([
    tx.refund.aggregate({ where: { storeId, orderId: o.id, status: { in: [...HELD_REFUND_STATES] } }, _sum: { amountMinor: true } }),
    tx.codCollection.findMany({ where: { storeId, orderId: o.id, outcome: { in: [...CASH_OUTCOMES] }, state: { notIn: ['REJECTED', 'PENDING_APPROVAL'] } }, select: { expectedMinor: true, collectedMinor: true, chargeCollectedMinor: true } }),
    tx.refund.aggregate({ where: { storeId, orderId: o.id, source: 'RIDER_OVERCHARGE', status: { in: [...HELD_REFUND_STATES] } }, _sum: { amountMinor: true } }),
  ]);
  let collectedMinor = 0;
  let overMinor = 0;
  for (const d of doors) {
    collectedMinor += d.collectedMinor + d.chargeCollectedMinor;
    overMinor += Math.max(0, d.collectedMinor - d.expectedMinor);
  }
  return {
    roomMinor: refundRoom({ paidMinor: o.paidMinor, walletAppliedMinor: o.walletAppliedMinor, collectedMinor, heldMinor: held._sum.amountMinor ?? 0 }),
    overMinor: Math.max(0, overMinor - (overRefunds._sum.amountMinor ?? 0)),
    inMinor: o.paidMinor + o.walletAppliedMinor + collectedMinor,
  };
}

/**
 * Review R1 (M4) — what an order has left to refund now (paid, from the wallet and collected at the door, less every
 * refund asked, approved or paid), for the refunds the system asks by itself (cancel, edit, RTO): each one is capped by
 * it, so the requests of one order never add up to more than came in. Run under the caller's order lock.
 */
export async function refundRoomOf(tx: Tx, storeId: number, orderId: string): Promise<number> {
  const o = await tx.order.findFirst({ where: { id: orderId, storeId }, select: ORDER });
  if (!o) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  return (await roomOf(tx, storeId, o)).roomMinor;
}

const lockOrder = async (tx: Tx, storeId: number, orderId: string): Promise<OrderFacts> => {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
  if (!rows.length) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  return tx.order.findUniqueOrThrow({ where: { id: orderId }, select: ORDER });
};

const event = (tx: Tx, who: Who, orderId: string, type: string, data: Record<string, unknown>) =>
  tx.orderEvent.create({ data: { storeId: who.storeId, orderId, type, ...actorOf(who), source: who.ctx?.source ?? 'admin', data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue } });

// ---------------------------------------------------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------------------------------------------------

export const refundRequestSchema = z
  .object({
    source: z.enum(MANUAL_REFUND_SOURCES),
    /** Left out for an RTO: the owner's rule decides (everything paid, or less the delivery charge). */
    amountMinor: z.int().min(1).max(1_000_000_000).optional(),
    method: z.enum(REFUND_METHODS).default('original'),
    note: z.string().trim().min(3).max(2_000),
    paymentId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.amountMinor !== undefined || v.source === 'RTO', { message: 'give the amount', path: ['amountMinor'] });

export interface RefundResult {
  refund: RefundRow;
  replay: boolean;
}

/** A person asks for a refund on an order (see the file header). */
export async function requestRefund(deps: PaymentsDeps, who: Who, orderId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<RefundResult> {
  await allow(deps, who, 'payments.refunds.request');
  if (!UUID.test(orderId)) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  const key = opts.idempotencyKey;
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'a refund request needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(refundRequestSchema, input, 'refund request');
  const storeId = who.storeId;
  const rules = await setting(deps, storeId, 'payments.refunds');
  const idempotencyKey = `manual:${key}`;
  const replayOf = async (): Promise<RefundResult | null> => {
    const r = await deps.db.refund.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, select: ROW });
    if (!r) return null;
    if (r.orderId !== orderId || r.source !== d.source || (d.amountMinor !== undefined && r.amountMinor !== d.amountMinor)) throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another refund', ['idempotencyKey']);
    const o = await deps.db.order.findUnique({ where: { id: orderId }, select: { number: true } });
    return { refund: rowOf(r, o?.number ?? null), replay: true };
  };
  const again = await replayOf();
  if (again) return again;
  if (d.method === 'wallet' && !rules.toWallet) throw new PaymentsError('METHOD_NOT_ALLOWED', 'refunds to the wallet are switched off (payments.refunds)', ['method']);
  try {
    return await deps.db.$transaction(async (tx) => {
      const o = await lockOrder(tx, storeId, orderId);
      const ok = refundAllowed(rules, o.status, d.source);
      if (!ok.ok) throw new PaymentsError('REFUND_NOT_ALLOWED', 'the refund rules do not allow this refund', ['source'], { rule: ok.rule, status: o.status });
      if (d.method === 'wallet' && !o.customerId) throw new PaymentsError('NO_CUSTOMER', 'the order has no customer, so there is no wallet', ['method']);
      if (d.paymentId) {
        const p = await tx.payment.findFirst({ where: { id: d.paymentId, storeId, orderId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, select: { id: true } });
        if (!p) throw new PaymentsError('NOT_FOUND', 'no such paid payment on this order', ['paymentId']);
      }
      const { roomMinor, overMinor } = await roomOf(tx, storeId, o);
      const amountMinor = d.amountMinor ?? rtoRefundAmount(rules, o);
      if (amountMinor <= 0 || roomMinor <= 0) throw new PaymentsError('NOTHING_DUE', 'nothing on this order is left to refund', [], { roomMinor });
      if (amountMinor > roomMinor) throw new PaymentsError('OVER_REFUNDABLE', 'more than the order has left to refund', ['amountMinor'], { roomMinor });
      if (d.source === 'RIDER_OVERCHARGE' && amountMinor > overMinor) throw new PaymentsError('OVER_REFUNDABLE', 'more than the rider over-collected', ['amountMinor'], { roomMinor: overMinor });
      const r = await tx.refund.create({
        data: { storeId, orderId, paymentId: d.paymentId ?? null, amountMinor, method: d.method, reason: d.source, source: d.source, status: 'REQUESTED', idempotencyKey, requestedById: who.actor.staffUserId, note: d.note },
        select: ROW,
      });
      await event(tx, who, orderId, REFUND_EVENTS.requested, { refundId: r.id, amountMinor, method: d.method, source: d.source });
      await auditMoney(tx, who, 'refund.request', 'Refund', r.id, undefined, { orderId, number: o.number, amountMinor, method: d.method, source: d.source, note: d.note, roomMinor });
      return { refund: rowOf(r, o.number), replay: false };
    }, TX);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const r = await replayOf();
      if (r) return r;
    }
    throw e;
  }
}

/**
 * SIM-F-041 — the refund a returned paid parcel owes, asked by the system once per order (the paid part by the way it
 * came, the wallet part back to the wallet). Run in the caller's transaction (S08's return step); a second call finds
 * the first. Returns the refund ids (none when nothing was paid).
 */
export async function requestReturnRefund(tx: Tx, deps: Pick<PaymentsDeps, 'settings'>, storeId: number, orderId: string): Promise<string[]> {
  const o = await tx.order.findFirst({ where: { id: orderId, storeId }, select: ORDER });
  if (!o) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  const rules = await setting(deps, storeId, 'payments.refunds');
  const ids: string[] = [];
  const ask = async (amountMinor: number, method: RefundMethod, key: string) => {
    if (amountMinor <= 0) return;
    const existing = await tx.refund.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey: key } }, select: { id: true } });
    if (existing) return void ids.push(existing.id);
    // review R1 (M4): never more than the order has left to refund (an edit or a cancel may have asked part already)
    const capped = Math.min(amountMinor, (await roomOf(tx, storeId, o)).roomMinor);
    if (capped <= 0) return;
    const r = await tx.refund.create({ data: { storeId, orderId, amountMinor: capped, method, reason: 'RTO', source: 'RTO', status: 'REQUESTED', idempotencyKey: key }, select: { id: true } });
    ids.push(r.id);
  };
  const paid = await tx.payment.findMany({ where: { storeId, orderId, status: 'PAID' }, select: { id: true } });
  await ask(rtoRefundAmount(rules, o), 'original', `rto:${orderId}`);
  if (paid.length === 1 && ids[0]) await tx.refund.updateMany({ where: { id: ids[0], paymentId: null }, data: { paymentId: paid[0]!.id } });
  await ask(o.walletAppliedMinor, 'wallet', `rto:${orderId}:wallet`);
  return ids;
}

// ---------------------------------------------------------------------------------------------------------------------
// The owner's decision
// ---------------------------------------------------------------------------------------------------------------------

export const approveSchema = z
  .object({ method: z.enum(REFUND_METHODS).optional(), note: z.string().trim().max(2_000).optional(), confirm: z.boolean().optional() })
  .strict();
export const rejectSchema = z.object({ note: z.string().trim().min(3).max(2_000) }).strict();

async function decide(deps: PaymentsDeps, who: Who, refundId: string, to: 'APPROVED' | 'REJECTED', input: unknown): Promise<RefundResult> {
  await allow(deps, who, 'payments.refunds.approve');
  if (!UUID.test(refundId)) throw new PaymentsError('NOT_FOUND', 'no such refund', ['refundId']);
  const d = to === 'APPROVED' ? parse(approveSchema, input, 'approval') : { ...parse(rejectSchema, input, 'rejection'), method: undefined, confirm: true };
  const storeId = who.storeId;
  const rules = await setting(deps, storeId, 'payments.refunds');
  const head = await deps.db.refund.findFirst({ where: { id: refundId, storeId }, select: { orderId: true } });
  if (!head) throw new PaymentsError('NOT_FOUND', 'no such refund', ['refundId']);
  return deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, storeId, head.orderId);
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, select: ROW });
    if (r.status === to && (to === 'REJECTED' || d.method === undefined || d.method === r.method)) return { refund: rowOf(r, o.number), replay: true };
    if (!refundMove(r.status as RefundState, to)) throw new PaymentsError('NOT_PENDING', `a ${r.status} refund cannot be ${to.toLowerCase()}`, [], { status: r.status });
    if (to === 'APPROVED') {
      if (rules.fourEyes && r.requestedById && r.requestedById === who.actor.staffUserId) throw new PaymentsError('SAME_PERSON', 'the person who asked for this refund may not approve it (four eyes)');
      if (d.method === 'wallet' && r.method !== 'wallet') {
        if (!rules.toWallet) throw new PaymentsError('METHOD_NOT_ALLOWED', 'refunds to the wallet are switched off (payments.refunds)', ['method']);
        if (!o.customerId) throw new PaymentsError('NO_CUSTOMER', 'the order has no customer, so there is no wallet', ['method']);
      }
      if (d.method === 'original' && r.method === 'wallet' && o.paidMinor <= 0) throw new PaymentsError('METHOD_NOT_ALLOWED', 'nothing was paid on this order the way it came', ['method']);
      // review R1 (M4): the refunds of this order the owner stands behind (approved, paid or failing) plus this one never
      // pass what came in; a request asked twice for the same money is rejected instead
      const others = await tx.refund.aggregate({ where: { storeId, orderId: o.id, id: { not: r.id }, status: { in: ['APPROVED', 'FAILED', 'COMPLETED'] } }, _sum: { amountMinor: true } });
      const { inMinor } = await roomOf(tx, storeId, o);
      const leftMinor = Math.max(0, inMinor - (others._sum.amountMinor ?? 0));
      if (r.amountMinor > leftMinor) throw new PaymentsError('OVER_REFUNDABLE', 'with the refunds already approved this is more than came in on the order', ['amountMinor'], { roomMinor: leftMinor });
      if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the refund first', ['confirm'], { amountMinor: r.amountMinor, method: d.method ?? r.method });
    }
    const now = nowOf(deps);
    const method = to === 'APPROVED' ? (d.method ?? r.method) : r.method;
    const u = await tx.refund.update({
      where: { id: r.id },
      data: { status: to, decidedAt: now, decisionNote: d.note ?? null, method, ...(to === 'APPROVED' ? { approvedById: who.actor.staffUserId } : {}) },
      select: ROW,
    });
    await event(tx, who, r.orderId, to === 'APPROVED' ? REFUND_EVENTS.approved : REFUND_EVENTS.rejected, { refundId: r.id, amountMinor: r.amountMinor, method });
    await auditMoney(tx, who, to === 'APPROVED' ? 'refund.approve' : 'refund.reject', 'Refund', r.id, { status: r.status, method: r.method }, { status: to, method, amountMinor: r.amountMinor, note: d.note ?? null });
    return { refund: rowOf(u, o.number), replay: false };
  }, TX);
}

/** The owner approves a refund (see the file header). */
export const approveRefund = (deps: PaymentsDeps, who: Who, refundId: string, input: unknown) => decide(deps, who, refundId, 'APPROVED', input);
/** The owner rejects a refund (or withdraws an approved one not yet paid), with a note. */
export const rejectRefund = (deps: PaymentsDeps, who: Who, refundId: string, input: unknown) => decide(deps, who, refundId, 'REJECTED', input);

// ---------------------------------------------------------------------------------------------------------------------
// Paying out
// ---------------------------------------------------------------------------------------------------------------------

export const completeSchema = z
  .object({
    /** The way it came: the reference of the money the person sent back (bKash TrxID, the bank's reference). */
    reference: z.string().trim().min(3).max(100).optional(),
    note: z.string().trim().max(2_000).optional(),
    confirm: z.boolean().optional(),
  })
  .strict();
export const failSchema = z.object({ note: z.string().trim().min(3).max(2_000) }).strict();

/** An approved refund paid out — to the wallet, or the money a person sent back by hand (see the file header). */
export async function completeRefund(deps: PaymentsDeps, who: Who, refundId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<RefundResult> {
  await allow(deps, who, 'payments.refunds.execute');
  if (!UUID.test(refundId)) throw new PaymentsError('NOT_FOUND', 'no such refund', ['refundId']);
  if (!opts.idempotencyKey || !KEY.test(opts.idempotencyKey)) throw new PaymentsError('INVALID_INPUT', 'a payout needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(completeSchema, input, 'payout');
  const storeId = who.storeId;
  const head = await deps.db.refund.findFirst({ where: { id: refundId, storeId }, select: { orderId: true } });
  if (!head) throw new PaymentsError('NOT_FOUND', 'no such refund', ['refundId']);
  return deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, storeId, head.orderId);
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, select: ROW });
    if (r.status === 'COMPLETED') return { refund: rowOf(r, o.number), replay: true };
    if (!refundMove(r.status as RefundState, 'COMPLETED')) throw new PaymentsError('NOT_PENDING', `a ${r.status} refund cannot be paid out (it needs the owner's approval first)`, [], { status: r.status });
    const wallet = r.method === 'wallet';
    if (!wallet && !d.reference) throw new PaymentsError('INVALID_INPUT', 'give the reference of the money sent back', ['reference']);
    if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the payout first', ['confirm'], { amountMinor: r.amountMinor, method: r.method });
    let walletEntryId: string | null = null;
    if (wallet) {
      if (!o.customerId) throw new PaymentsError('NO_CUSTOMER', 'the order has no customer, so there is no wallet');
      walletEntryId = (await postWalletEntry(tx, { storeId, customerId: o.customerId, direction: 'CREDIT', amountMinor: r.amountMinor, reason: 'REFUND', idempotencyKey: `refund:${r.id}`, orderId: r.orderId, note: d.note ?? null, actorId: who.actor.staffUserId })).entryId;
    }
    const now = nowOf(deps);
    const u = await tx.refund.update({
      where: { id: r.id },
      data: { status: 'COMPLETED', completedAt: now, executedById: who.actor.staffUserId, walletEntryId, payoutReference: wallet ? null : d.reference!.replace(/\s+/g, '').toUpperCase(), failureNote: null },
      select: ROW,
    });
    // the payment it came from: PARTIALLY_REFUNDED or REFUNDED, worked out from every completed refund of it
    if (r.paymentId) {
      const p = await tx.payment.findUniqueOrThrow({ where: { id: r.paymentId }, select: { amountMinor: true, receivedMinor: true } });
      const done = await tx.refund.aggregate({ where: { paymentId: r.paymentId, status: 'COMPLETED' }, _sum: { amountMinor: true } });
      await tx.payment.update({ where: { id: r.paymentId }, data: { status: refundedPaymentState(p.receivedMinor ?? p.amountMinor, done._sum.amountMinor ?? 0), statusAt: now } });
    }
    await event(tx, who, r.orderId, REFUND_EVENTS.completed, { refundId: r.id, amountMinor: r.amountMinor, method: r.method, walletEntryId, reference: u.payoutReference });
    await auditMoney(tx, who, 'refund.complete', 'Refund', r.id, { status: r.status }, { status: 'COMPLETED', amountMinor: r.amountMinor, method: r.method, walletEntryId, reference: u.payoutReference, key: opts.idempotencyKey });
    return { refund: rowOf(u, o.number), replay: false };
  }, TX);
}

/** The payout of an approved refund did not go through (a wrong number, a bounced transfer); tried again later. */
export async function failRefund(deps: PaymentsDeps, who: Who, refundId: string, input: unknown): Promise<RefundResult> {
  await allow(deps, who, 'payments.refunds.execute');
  if (!UUID.test(refundId)) throw new PaymentsError('NOT_FOUND', 'no such refund', ['refundId']);
  const d = parse(failSchema, input, 'failed payout');
  const r = await deps.db.refund.findFirst({ where: { id: refundId, storeId: who.storeId }, select: ROW });
  if (!r) throw new PaymentsError('NOT_FOUND', 'no such refund', ['refundId']);
  if (r.method === 'wallet') throw new PaymentsError('METHOD_NOT_ALLOWED', 'a refund to the wallet cannot fail');
  if (r.status === 'FAILED') return { refund: rowOf(r, null), replay: true };
  if (!refundMove(r.status as RefundState, 'FAILED')) throw new PaymentsError('NOT_PENDING', `a ${r.status} refund has no payout to fail`, [], { status: r.status });
  return deps.db.$transaction(async (tx) => {
    const u = await tx.refund.update({ where: { id: r.id }, data: { status: 'FAILED', failureNote: d.note, executedById: who.actor.staffUserId }, select: ROW });
    await event(tx, who, r.orderId, REFUND_EVENTS.failed, { refundId: r.id, amountMinor: r.amountMinor, note: d.note });
    await auditMoney(tx, who, 'refund.fail', 'Refund', r.id, { status: r.status }, { status: 'FAILED', note: d.note });
    return { refund: rowOf(u, null), replay: false };
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------------------------------------------------

export interface RefundList {
  /** F-041: the money owed to customers, always shown. */
  owed: OwedFigure;
  rows: RefundRow[];
}

/** The refunds of a store by state, newest first, with the money owed to customers (`payments.view`). */
export async function listRefunds(deps: PaymentsDeps, who: Who, opts: { state?: string; orderId?: string; limit?: number } = {}): Promise<RefundList> {
  await allow(deps, who, 'payments.view');
  const state = opts.state === undefined || opts.state === '' ? null : opts.state.toUpperCase();
  if (state !== null && !(REFUND_STATES as readonly string[]).includes(state) && state !== 'OWED') throw new PaymentsError('INVALID_INPUT', 'no such refund state', ['state']);
  if (opts.orderId !== undefined && !UUID.test(opts.orderId)) throw new PaymentsError('INVALID_INPUT', 'no such order', ['orderId']);
  const take = Math.min(Math.max(1, Math.trunc(opts.limit ?? 50) || 50), 200);
  const status = state === 'OWED' ? { in: ['REQUESTED', 'APPROVED', 'FAILED'] as RefundState[] } : state ? (state as RefundState) : undefined;
  const [owed, rows] = await Promise.all([
    owedToCustomers(deps.db, who.storeId),
    deps.db.refund.findMany({ where: { storeId: who.storeId, ...(status ? { status } : {}), ...(opts.orderId ? { orderId: opts.orderId } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, select: ROW }),
  ]);
  const numbers = new Map((await deps.db.order.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.orderId))] } }, select: { id: true, number: true } })).map((o) => [o.id, o.number]));
  return { owed, rows: rows.map((r) => rowOf(r, numbers.get(r.orderId) ?? null)) };
}

export type { RefundSource };
