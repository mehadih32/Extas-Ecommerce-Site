// S08 · PR 192 (CN-018 (7); BACKEND-ARCHITECTURE §5 SUP-02, F-054) — rider issues: the customer says the rider took
// more than the parcel asked. Off until the owner switches it on (`support.riderIssues`).
//
// - `logRiderIssue` (`support.riderIssues.write`): staff log the complaint on a delivered (or charge-paid returned)
//   parcel: what the customer paid, his words and the proof (photos already in the media library; at least one while
//   `proofRequired`). What was due is never typed: it is what the door record expected, else the parcel's own COD amount
//   (the sticker's). The extra is charged − due; nothing extra, nothing to log. One open complaint per parcel.
// - `decideRiderIssue` (`support.riderIssues.decide`, with [confirm] to approve): approve or reject with a note. Approval
//   opens the courier claim for the exact extra (claims.ts: recovered from the courier).
// - `askRiderRefund` (`payments.refunds.request`, only while `refundAsk` is on): asks the refund of the exact extra — a
//   refund REQUEST through PR 172's `requestRefund` (the owner's refund rules, never more than the extra), which still
//   waits for the owner's approval on the refunds list and is paid by a person. Nothing is paid here (CLAUDE.md rule 6).
// - `listRiderIssues` (`support.read`): the complaints by state, newest first.
import { Prisma } from '@extas/db/client';
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { checkStoreId, KEY, nowOf, parse, setting, TX, UUID, type PaymentsDeps, type Who } from './context';
import { PaymentsError } from './errors';
import { CASH_OUTCOMES } from './cod-match';
import { openOverchargeClaim, orderLine } from './claims';
import { REFUND_METHODS } from './refund-pure';
import { requestRefund } from './refunds';
import { auditMoney } from './wallet';

export const RIDER_ISSUE_STATES = ['LOGGED', 'APPROVED', 'REJECTED'] as const;
export type RiderIssueState = (typeof RIDER_ISSUE_STATES)[number];

/** The order timeline's event types of a rider issue. */
export const RIDER_ISSUE_EVENTS = { logged: 'riderIssue.logged', approved: 'riderIssue.approved', rejected: 'riderIssue.rejected', refundAsked: 'riderIssue.refundAsked' } as const;

/** A complaint can be logged on a parcel that reached the door. */
const AT_THE_DOOR = ['DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED'] as const;

export interface RiderIssueRow {
  id: string;
  status: RiderIssueState;
  orderId: string;
  orderNumber: string | null;
  shipmentId: string;
  consignmentId: string | null;
  courierAccountId: string;
  courier: string;
  chargedMinor: number;
  dueMinor: number;
  extraMinor: number;
  proofMediaIds: string[];
  words: string;
  decisionNote: string | null;
  claimId: string | null;
  refundId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

const ROW = {
  id: true,
  status: true,
  orderId: true,
  shipmentId: true,
  courierAccountId: true,
  chargedMinor: true,
  dueMinor: true,
  extraMinor: true,
  proofMediaIds: true,
  words: true,
  decisionNote: true,
  claimId: true,
  refundId: true,
  decidedAt: true,
  createdAt: true,
} satisfies Prisma.RiderIssueSelect;
type Row = Prisma.RiderIssueGetPayload<{ select: typeof ROW }>;

async function withNames(db: Pick<PaymentsDeps['db'], 'courierAccount' | 'order' | 'shipment'>, rows: Row[]): Promise<RiderIssueRow[]> {
  if (!rows.length) return [];
  const [couriers, orders, parcels] = await Promise.all([
    db.courierAccount.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.courierAccountId))] } }, select: { id: true, name: true } }),
    db.order.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.orderId))] } }, select: { id: true, number: true } }),
    db.shipment.findMany({ where: { id: { in: rows.map((r) => r.shipmentId) } }, select: { id: true, consignmentId: true } }),
  ]);
  const c = new Map(couriers.map((x) => [x.id, x.name]));
  const o = new Map(orders.map((x) => [x.id, x.number]));
  const s = new Map(parcels.map((x) => [x.id, x.consignmentId]));
  return rows.map((r) => ({ ...r, status: r.status as RiderIssueState, courier: c.get(r.courierAccountId) ?? '', orderNumber: o.get(r.orderId) ?? null, consignmentId: s.get(r.shipmentId) ?? null }));
}

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

async function riderRules(deps: PaymentsDeps, storeId: number) {
  const rules = await setting(deps, storeId, 'support.riderIssues');
  if (!rules.enabled) throw new PaymentsError('FEATURE_OFF', 'rider issues are switched off', [], { setting: 'support.riderIssues' });
  return rules;
}

// ---------------------------------------------------------------------------------------------------------------------
// Logging

export const riderIssueInput = z
  .object({
    orderId: z.uuid(),
    /** The parcel; left out: the order's latest parcel that reached the door. */
    shipmentId: z.uuid().optional(),
    /** What the customer says he paid the rider. */
    chargedMinor: z.int().min(1).max(1_000_000_000),
    words: z.string().trim().min(3).max(2_000),
    proofMediaIds: z.array(z.uuid()).max(10).default([]),
  })
  .strict();

/** What the door asked for this parcel: the door record's expected amount (latest, not rejected), else its COD amount. */
async function dueAtDoor(db: PaymentsDeps['db'], storeId: number, s: { id: string; orderId: string; codAmountMinor: number }): Promise<number> {
  const door = await db.codCollection.findFirst({
    where: { storeId, orderId: s.orderId, OR: [{ shipmentId: s.id }, { shipmentId: null }], outcome: { in: [...CASH_OUTCOMES] }, state: { notIn: ['REJECTED'] } },
    select: { expectedMinor: true },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
  });
  return door ? door.expectedMinor : s.codAmountMinor;
}

/** Logs a customer's overcharge complaint (see the file header). One Idempotency-Key = one complaint. */
export async function logRiderIssue(deps: PaymentsDeps, who: Who, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<{ issue: RiderIssueRow; replay: boolean }> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'support.riderIssues.write', { storeId: who.storeId });
  const key = opts.idempotencyKey;
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'a rider issue needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(riderIssueInput, input, 'rider issue');
  const storeId = who.storeId;
  const rules = await riderRules(deps, storeId);
  const idempotencyKey = `rider:${key}`;
  const replay = async () => {
    const r = await deps.db.riderIssue.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, select: ROW });
    if (!r) return null;
    if (r.orderId !== d.orderId || r.chargedMinor !== d.chargedMinor) throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another rider issue', ['idempotencyKey']);
    return { issue: (await withNames(deps.db, [r]))[0]!, replay: true };
  };
  const again = await replay();
  if (again) return again;
  const proof = [...new Set(d.proofMediaIds)];
  if (rules.proofRequired && !proof.length) throw new PaymentsError('PROOF_REQUIRED', 'add a photo of the proof', ['proofMediaIds']);
  if (proof.length > rules.maxPhotos) throw new PaymentsError('INVALID_INPUT', `at most ${rules.maxPhotos} photos`, ['proofMediaIds'], { max: rules.maxPhotos });
  if (proof.length && (await deps.db.mediaAsset.count({ where: { storeId, id: { in: proof } } })) !== proof.length) throw new PaymentsError('NOT_FOUND', 'a proof photo is not in the media library', ['proofMediaIds']);
  const s = await deps.db.shipment.findFirst({
    where: { storeId, orderId: d.orderId, ...(d.shipmentId ? { id: d.shipmentId } : {}), status: { in: [...AT_THE_DOOR] } },
    select: { id: true, orderId: true, courierAccountId: true, codAmountMinor: true, consignmentId: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!s) throw new PaymentsError('NOT_FOUND', 'this order has no parcel that reached the door', [d.shipmentId ? 'shipmentId' : 'orderId']);
  const dueMinor = await dueAtDoor(deps.db, storeId, s);
  const extraMinor = d.chargedMinor - dueMinor;
  if (extraMinor <= 0) throw new PaymentsError('NO_EXTRA', 'the customer paid no more than the parcel asked', ['chargedMinor'], { dueMinor });
  try {
    return await deps.db.$transaction(async (tx) => {
      const r = await tx.riderIssue.create({
        data: { storeId, orderId: s.orderId, shipmentId: s.id, courierAccountId: s.courierAccountId, chargedMinor: d.chargedMinor, dueMinor, extraMinor, proofMediaIds: proof, words: d.words, idempotencyKey, loggedById: who.actor.staffUserId },
        select: ROW,
      });
      await orderLine(tx, who, s.orderId, RIDER_ISSUE_EVENTS.logged, { riderIssueId: r.id, chargedMinor: d.chargedMinor, dueMinor, extraMinor, photos: proof.length });
      await auditMoney(tx, who, 'riderIssue.log', 'RiderIssue', r.id, undefined, { orderId: s.orderId, shipmentId: s.id, chargedMinor: d.chargedMinor, dueMinor, extraMinor, photos: proof.length });
      return { issue: (await withNames(tx as unknown as PaymentsDeps['db'], [r]))[0]!, replay: false };
    }, TX);
  } catch (e) {
    if (!isUniqueClash(e)) throw e;
    const r = await replay();
    if (r) return r;
    const open = await deps.db.riderIssue.findFirst({ where: { storeId, shipmentId: s.id, status: { in: ['LOGGED', 'APPROVED'] } }, select: { id: true } });
    throw new PaymentsError('ALREADY_OPEN', 'this parcel already has an open rider issue', ['orderId'], { id: open?.id ?? null });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Deciding

export const riderDecisionInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().min(3).max(1_000),
    /** [confirm]: approving opens a claim for money (F-040). */
    confirm: z.literal(true).optional(),
  })
  .strict();

/** Approves (with [confirm]: opens the courier claim for the extra) or rejects a logged complaint. */
export async function decideRiderIssue(deps: PaymentsDeps, who: Who, issueId: string, input: unknown): Promise<RiderIssueRow> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'support.riderIssues.decide', { storeId: who.storeId });
  if (!UUID.test(issueId)) throw new PaymentsError('NOT_FOUND', 'no such rider issue', ['issueId']);
  const d = parse(riderDecisionInput, input, 'rider issue decision');
  if (d.decision === 'approve' && d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the extra amount first', ['confirm']);
  const storeId = who.storeId;
  await riderRules(deps, storeId);
  return deps.db.$transaction(async (tx) => {
    const r = await tx.riderIssue.findFirst({ where: { id: issueId, storeId }, select: ROW });
    if (!r) throw new PaymentsError('NOT_FOUND', 'no such rider issue', ['issueId']);
    if (r.status !== 'LOGGED') throw new PaymentsError('NOT_PENDING', 'this rider issue was decided already', [], { status: r.status });
    const status = d.decision === 'approve' ? 'APPROVED' : 'REJECTED';
    const moved = await tx.riderIssue.updateMany({ where: { id: r.id, status: 'LOGGED' }, data: { status, decisionNote: d.note, decidedById: who.actor.staffUserId, decidedAt: nowOf(deps) } });
    if (moved.count !== 1) throw new PaymentsError('NOT_PENDING', 'someone decided this rider issue first');
    let claimId: string | null = null;
    if (status === 'APPROVED') {
      claimId = await openOverchargeClaim(tx, who, { riderIssueId: r.id, orderId: r.orderId, shipmentId: r.shipmentId, courierAccountId: r.courierAccountId, extraMinor: r.extraMinor, note: d.note });
      await tx.riderIssue.update({ where: { id: r.id }, data: { claimId } });
    }
    await orderLine(tx, who, r.orderId, status === 'APPROVED' ? RIDER_ISSUE_EVENTS.approved : RIDER_ISSUE_EVENTS.rejected, { riderIssueId: r.id, extraMinor: r.extraMinor, note: d.note, claimId });
    await auditMoney(tx, who, `riderIssue.${d.decision}`, 'RiderIssue', r.id, { status: 'LOGGED' }, { status, note: d.note, claimId, extraMinor: r.extraMinor });
    const after = await tx.riderIssue.findUniqueOrThrow({ where: { id: r.id }, select: ROW });
    return (await withNames(tx as unknown as PaymentsDeps['db'], [after]))[0]!;
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// Asking the refund of the extra (a request only)

export const riderRefundInput = z.object({ method: z.enum(REFUND_METHODS).default('original') }).strict();

/**
 * Asks the refund of an approved complaint's exact extra (see the file header): a REQUESTED refund that waits for the
 * owner's approval. Only while the owner's `refundAsk` is on; once per complaint (a second ask returns the first).
 */
export async function askRiderRefund(deps: PaymentsDeps, who: Who, issueId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<{ issue: RiderIssueRow; refundId: string; replay: boolean }> {
  checkStoreId(who.storeId);
  if (!UUID.test(issueId)) throw new PaymentsError('NOT_FOUND', 'no such rider issue', ['issueId']);
  const d = parse(riderRefundInput, input, 'rider refund');
  const storeId = who.storeId;
  const rules = await riderRules(deps, storeId);
  if (!rules.refundAsk) throw new PaymentsError('FEATURE_OFF', 'asking a refund from a rider issue is switched off', [], { setting: 'support.riderIssues.refundAsk' });
  const r = await deps.db.riderIssue.findFirst({ where: { id: issueId, storeId }, select: ROW });
  if (!r) throw new PaymentsError('NOT_FOUND', 'no such rider issue', ['issueId']);
  if (r.refundId) return { issue: (await withNames(deps.db, [r]))[0]!, refundId: r.refundId, replay: true };
  if (r.status !== 'APPROVED') throw new PaymentsError('NOT_PENDING', 'only an approved rider issue can ask a refund', [], { status: r.status });
  const key = opts.idempotencyKey ?? `rider-refund:${r.id}`;
  const asked = await requestRefund(deps, who, r.orderId, { source: 'RIDER_OVERCHARGE', amountMinor: r.extraMinor, method: d.method, note: `rider issue ${r.id}: ${r.words}`.slice(0, 2_000) }, { idempotencyKey: key });
  const refundId = asked.refund.id;
  await deps.db.$transaction(async (tx) => {
    const set = await tx.riderIssue.updateMany({ where: { id: r.id, refundId: null }, data: { refundId } });
    if (set.count === 1) {
      await orderLine(tx, who, r.orderId, RIDER_ISSUE_EVENTS.refundAsked, { riderIssueId: r.id, refundId, amountMinor: r.extraMinor, method: d.method });
      await auditMoney(tx, who, 'riderIssue.refundAsk', 'RiderIssue', r.id, { refundId: null }, { refundId, amountMinor: r.extraMinor, method: d.method });
    }
  }, TX);
  const after = await deps.db.riderIssue.findUniqueOrThrow({ where: { id: r.id }, select: ROW });
  return { issue: (await withNames(deps.db, [after]))[0]!, refundId: after.refundId ?? refundId, replay: asked.replay };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading

export const riderIssueListQuery = z.object({ status: z.enum(RIDER_ISSUE_STATES).optional(), limit: z.number().int().min(1).max(200).default(50) }).strict();

/** The complaints (newest first) with how many wait in each state. Seeing them needs `support.read`. */
export async function listRiderIssues(deps: PaymentsDeps, who: Who, query: unknown = {}): Promise<{ rows: RiderIssueRow[]; counts: Record<RiderIssueState, number> }> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'support.read', { storeId: who.storeId });
  const q = parse(riderIssueListQuery, query, 'rider issue list query');
  const storeId = who.storeId;
  const [rows, groups] = await Promise.all([
    deps.db.riderIssue.findMany({ where: { storeId, ...(q.status ? { status: q.status } : {}) }, select: ROW, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit }),
    deps.db.riderIssue.groupBy({ by: ['status'], where: { storeId }, _count: true }),
  ]);
  const counts = Object.fromEntries(RIDER_ISSUE_STATES.map((s) => [s, 0])) as Record<RiderIssueState, number>;
  for (const g of groups) counts[g.status as RiderIssueState] = g._count;
  return { rows: await withNames(deps.db, rows), counts };
}
