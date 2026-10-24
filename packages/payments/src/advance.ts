// S07 · PR 173 — partial payment and the pre-order advance, capped (Blueprint §59 answer 29; BACKEND-ARCHITECTURE
// §6.5.3; CN-018 answer 6). Off until the owner switches `payments.partial` on.
//
// - `advanceQuote` (`payments.view`): what an advance on this order may be — the owner's cap, the default ask, what the
//   rider collects after it — for the order screen and the checkout's pre-order path (the same figure, advance-pure.ts).
// - `requestAdvance` (`payments.advance`): a team member asks a Cash on Delivery order's advance with [confirm]: a
//   PREORDER_ADVANCE payment row (INITIATED) for the customer to pay online, never above the cap (or the whole due when
//   the owner allows it), one open at a time, one Idempotency-Key = one request. It asks money and moves none: the
//   customer pays through the gateway (`startPayment`, PR 170), the one outcome writer (outcome.ts) adds the money to
//   the order and the rider then collects only the rest (`codToCollect`) — a full advance leaves 0 at the door.
// No order status moves here, and no price, charge or discount changes (CLAUDE.md rule 6).
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { advancePlan, ADVANCE_OPEN_STATES, type AdvancePlan } from './advance-pure';
import { allow, KEY, nowOf, parse, setting, TX, UUID, type PaymentsDeps, type Who } from './context';
import { PaymentsError } from './errors';
import { dueOf } from './pure';
import { auditMoney } from './wallet';

/** The timeline event of an advance asked. */
export const ADVANCE_EVENT = 'payment.advance.requested';
/** The online methods an advance is paid by. */
export const ADVANCE_METHODS = ['BKASH', 'NAGAD', 'CARD'] as const;
const PROVIDER = /^[a-z][a-zA-Z0-9]{1,30}$/;

const ORDER = { id: true, number: true, status: true, paymentMethod: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, codAmountMinor: true, currency: true } satisfies Prisma.OrderSelect;
type OrderFacts = Prisma.OrderGetPayload<{ select: typeof ORDER }>;

export interface AdvanceQuote {
  enabled: boolean;
  orderId: string;
  number: string;
  totalMinor: number;
  dueMinor: number;
  /** What the rider collects now. */
  codNowMinor: number;
  /** The owner's cap on this order (0 when off or not set). */
  capMinor: number;
  /** The default ask (the cap, or less when less is due); null when nothing may be asked. */
  advanceMinor: number | null;
  /** What the rider collects once the default ask is paid. */
  codAfterMinor: number | null;
  /** The customer may pay it all now (the owner's switch). */
  allowFull: boolean;
  /** An advance already waiting for the customer (its payment id). */
  openPaymentId: string | null;
  /** Why no advance may be asked (null: one may). */
  blocked: 'PARTIAL_OFF' | 'ADVANCE_NOT_ALLOWED' | 'NOTHING_DUE' | 'NOT_CONFIGURED' | 'OVER_CAP' | 'BELOW_MIN' | 'ALREADY_RECORDED' | null;
}

const advanceAllowed = (o: OrderFacts) => o.paymentMethod === 'COD' && ADVANCE_OPEN_STATES.has(o.status);

/** What an advance on this order may be (see the file header). */
export async function advanceQuote(deps: PaymentsDeps, who: Who, orderId: string): Promise<AdvanceQuote | null> {
  await allow(deps, who, 'payments.view');
  if (!UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: ORDER });
  if (!o) return null;
  const rules = await setting(deps, who.storeId, 'payments.partial');
  const open = await deps.db.payment.findFirst({ where: { storeId: who.storeId, orderId, purpose: 'PREORDER_ADVANCE', status: { in: ['INITIATED', 'PENDING', 'AUTHORIZED'] } }, select: { id: true } });
  const dueMinor = dueOf(o);
  const plan = advancePlan(rules, { totalMinor: o.totalMinor, dueMinor });
  const blocked: AdvanceQuote['blocked'] = !rules.enabled ? 'PARTIAL_OFF' : !advanceAllowed(o) ? 'ADVANCE_NOT_ALLOWED' : open ? 'ALREADY_RECORDED' : plan.ok ? null : plan.code;
  return {
    enabled: rules.enabled,
    orderId: o.id,
    number: o.number,
    totalMinor: o.totalMinor,
    dueMinor,
    codNowMinor: o.codAmountMinor,
    capMinor: rules.enabled ? plan.capMinor : 0,
    advanceMinor: blocked === null && plan.ok ? plan.advanceMinor : null,
    codAfterMinor: blocked === null && plan.ok ? plan.codAfterMinor : null,
    allowFull: rules.enabled && rules.allowFull,
    openPaymentId: open?.id ?? null,
    blocked,
  };
}

export const advanceInputSchema = z
  .object({
    method: z.enum(ADVANCE_METHODS),
    /** The gateway (bkash, nagad, …); left out: the method's own. */
    provider: z.string().regex(PROVIDER).optional(),
    /** Left out: the owner's cap (or less when less is due). */
    amountMinor: z.int().min(1).max(1_000_000_000).optional(),
    /** The whole due now (only while the owner allows it). */
    full: z.boolean().optional(),
    note: z.string().trim().max(2_000).optional(),
    confirm: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !(v.full && v.amountMinor !== undefined), { message: 'give an amount or ask for all of it, not both', path: ['amountMinor'] });

export interface AdvanceResult {
  paymentId: string;
  orderId: string;
  number: string;
  advanceMinor: number;
  capMinor: number;
  /** What the rider collects once this advance is paid. */
  codAfterMinor: number;
  replay: boolean;
}

const refusal = (p: Extract<AdvancePlan, { ok: false }>): PaymentsError =>
  p.code === 'OVER_CAP'
    ? new PaymentsError('OVER_CAP', "more than the owner's cap on an advance", ['amountMinor'], { capMinor: p.capMinor })
    : p.code === 'BELOW_MIN'
      ? new PaymentsError('BELOW_MIN', 'less than the smallest advance', ['amountMinor'], { minMinor: p.minMinor })
      : p.code === 'NOTHING_DUE'
        ? new PaymentsError('NOTHING_DUE', 'nothing is due on this order')
        : new PaymentsError('NOT_CONFIGURED', 'the owner has not set the cap on an advance yet');

/** A team member asks a Cash on Delivery order's advance (see the file header). */
export async function requestAdvance(deps: PaymentsDeps, who: Who, orderId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<AdvanceResult> {
  await allow(deps, who, 'payments.advance');
  if (!UUID.test(orderId)) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  const key = opts.idempotencyKey;
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'an advance needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(advanceInputSchema, input, 'advance');
  const storeId = who.storeId;
  const rules = await setting(deps, storeId, 'payments.partial');
  const idempotencyKey = `advance:${key}`;
  const replayOf = async (): Promise<AdvanceResult | null> => {
    const p = await deps.db.payment.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, select: { id: true, orderId: true, amountMinor: true, method: true } });
    if (!p) return null;
    if (p.orderId !== orderId || p.method !== d.method || (d.amountMinor !== undefined && p.amountMinor !== d.amountMinor)) throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another advance', ['idempotencyKey']);
    const o = await deps.db.order.findUniqueOrThrow({ where: { id: orderId }, select: ORDER });
    return { paymentId: p.id, orderId, number: o.number, advanceMinor: p.amountMinor, capMinor: advancePlan(rules, { totalMinor: o.totalMinor, dueMinor: dueOf(o) }).capMinor, codAfterMinor: Math.max(0, o.codAmountMinor - p.amountMinor), replay: true };
  };
  const again = await replayOf();
  if (again) return again;
  if (!rules.enabled) throw new PaymentsError('PARTIAL_OFF', 'partial payment is switched off (payments.partial)');
  try {
    return await deps.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
      if (!rows.length) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: ORDER });
      if (o.status === 'CANCELLED') throw new PaymentsError('ORDER_CLOSED', 'the order is cancelled');
      if (!advanceAllowed(o)) throw new PaymentsError('ADVANCE_NOT_ALLOWED', 'an advance is asked only on a Cash on Delivery order before it leaves the shop', [], { status: o.status, paymentMethod: o.paymentMethod });
      const open = await tx.payment.findFirst({ where: { storeId, orderId, purpose: 'PREORDER_ADVANCE', status: { in: ['INITIATED', 'PENDING', 'AUTHORIZED'] } }, select: { id: true } });
      if (open) throw new PaymentsError('ALREADY_RECORDED', 'an advance is already waiting for the customer', [], { paymentId: open.id });
      const plan = advancePlan(rules, { totalMinor: o.totalMinor, dueMinor: dueOf(o) }, { amountMinor: d.amountMinor, full: d.full });
      if (!plan.ok) throw refusal(plan);
      if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the advance first', ['confirm'], { advanceMinor: plan.advanceMinor, codAfterMinor: plan.codAfterMinor });
      const now = nowOf(deps);
      const tries = await tx.payment.count({ where: { storeId, orderId, purpose: 'PREORDER_ADVANCE' } });
      const p = await tx.payment.create({
        data: { storeId, orderId, method: d.method, provider: d.provider ?? d.method.toLowerCase(), purpose: 'PREORDER_ADVANCE', status: 'INITIATED', amountMinor: plan.advanceMinor, currency: o.currency, idempotencyKey, attempt: tries + 1, statusAt: now },
        select: { id: true },
      });
      await tx.orderEvent.create({
        data: { storeId, orderId, type: ADVANCE_EVENT, actorType: who.actor.staffUserId ? 'STAFF' : 'SYSTEM', actorId: who.actor.staffUserId, source: who.ctx?.source ?? 'admin', data: { paymentId: p.id, advanceMinor: plan.advanceMinor, capMinor: plan.capMinor, codAfterMinor: plan.codAfterMinor, method: d.method } },
      });
      await auditMoney(tx, who, 'payment.advance', 'Payment', p.id, undefined, { orderId, number: o.number, advanceMinor: plan.advanceMinor, capMinor: plan.capMinor, codAfterMinor: plan.codAfterMinor, method: d.method, note: d.note ?? null });
      return { paymentId: p.id, orderId, number: o.number, advanceMinor: plan.advanceMinor, capMinor: plan.capMinor, codAfterMinor: plan.codAfterMinor, replay: false };
    }, TX);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const r = await replayOf();
      if (r) return r;
    }
    throw e;
  }
}
