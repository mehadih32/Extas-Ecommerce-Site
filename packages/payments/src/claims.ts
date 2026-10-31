// S08 · PR 192 (SIM-F-017; BACKEND-ARCHITECTURE §5 DLV-03/05a, §8 failure 12) — courier claims: money the shop asks a
// courier for. A lost or damaged parcel (its records must show it: the parcel is, or was, LOST / DAMAGED) for its
// declared value at booking, else the amount a person types; the exact extra a rider took (opened by an approved rider
// issue, rider-issues.ts); or other. A claim is OPEN, then SENT to the courier, then SETTLED with what the courier paid
// (its statement; may be less than claimed) or REJECTED. One open claim per parcel and kind (a partial unique index,
// migration 0071). Every step is a person's action behind `delivery.claims`, audited and on the order's timeline;
// raising one is off until the owner switches it on (`delivery.courier.claims`).
//
// A claim is a record only: nothing here pays anyone, takes money or changes COD (CLAUDE.md rule 6). The money a courier
// pays comes in on its statement (COD reconciliation).
import { Prisma } from '@extas/db/client';
import { requirePermission } from '@extas/auth';
import { z } from 'zod';
import { checkStoreId, KEY, nowOf, parse, setting, TX, UUID, type PaymentsDeps, type Tx, type Who } from './context';
import { PaymentsError } from './errors';
import { auditMoney } from './wallet';

export const CLAIM_KINDS = ['LOST', 'DAMAGED', 'RIDER_OVERCHARGE', 'OTHER'] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];
export const CLAIM_STATES = ['OPEN', 'SENT', 'SETTLED', 'REJECTED'] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];
/** Still waiting for the courier. */
export const OPEN_CLAIM_STATES = ['OPEN', 'SENT'] as const satisfies readonly ClaimState[];

/** The order timeline's event types of a claim. */
export const CLAIM_EVENTS = { raised: 'claim.raised', moved: 'claim.moved' } as const;

/** Where a claim may go from where it is: sent once, then settled or rejected; a closed claim stays closed. */
export const CLAIM_MOVES: Readonly<Record<ClaimState, readonly ClaimState[]>> = { OPEN: ['SENT', 'SETTLED', 'REJECTED'], SENT: ['SETTLED', 'REJECTED'], SETTLED: [], REJECTED: [] };

export interface ClaimRow {
  id: string;
  kind: ClaimKind;
  status: ClaimState;
  courierAccountId: string;
  courier: string;
  orderId: string;
  orderNumber: string | null;
  shipmentId: string | null;
  consignmentId: string | null;
  claimedMinor: number;
  settledMinor: number | null;
  courierRef: string | null;
  note: string | null;
  riderIssueId: string | null;
  sentAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
}

const ROW = {
  id: true,
  kind: true,
  status: true,
  courierAccountId: true,
  orderId: true,
  shipmentId: true,
  claimedMinor: true,
  settledMinor: true,
  courierRef: true,
  note: true,
  riderIssueId: true,
  sentAt: true,
  closedAt: true,
  createdAt: true,
} satisfies Prisma.CourierClaimSelect;
type Row = Prisma.CourierClaimGetPayload<{ select: typeof ROW }>;

const actorOf = (who: Who) => ({ actorType: who.actor.staffUserId ? ('STAFF' as const) : ('SYSTEM' as const), actorId: who.actor.staffUserId });

/** An order timeline line (the same transaction as the change). */
export const orderLine = (tx: Tx, who: Who, orderId: string, type: string, data: Record<string, unknown>) =>
  tx.orderEvent.create({ data: { storeId: who.storeId, orderId, type, ...actorOf(who), source: who.ctx?.source ?? 'admin', data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue } });

async function withNames(db: Pick<PaymentsDeps['db'], 'courierAccount' | 'order' | 'shipment'>, rows: Row[]): Promise<ClaimRow[]> {
  if (!rows.length) return [];
  const [couriers, orders, parcels] = await Promise.all([
    db.courierAccount.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.courierAccountId))] } }, select: { id: true, name: true } }),
    db.order.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.orderId))] } }, select: { id: true, number: true } }),
    db.shipment.findMany({ where: { id: { in: rows.map((r) => r.shipmentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, consignmentId: true } }),
  ]);
  const c = new Map(couriers.map((x) => [x.id, x.name]));
  const o = new Map(orders.map((x) => [x.id, x.number]));
  const s = new Map(parcels.map((x) => [x.id, x.consignmentId]));
  return rows.map((r) => ({ ...r, kind: r.kind as ClaimKind, status: r.status as ClaimState, courier: c.get(r.courierAccountId) ?? '', orderNumber: o.get(r.orderId) ?? null, consignmentId: r.shipmentId ? (s.get(r.shipmentId) ?? null) : null }));
}

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

async function allowClaims(deps: PaymentsDeps, who: Who): Promise<void> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'delivery.claims', { storeId: who.storeId });
}

// ---------------------------------------------------------------------------------------------------------------------
// Raising

export const claimInput = z
  .object({
    shipmentId: z.uuid(),
    kind: z.enum(['LOST', 'DAMAGED', 'OTHER']),
    /** Left out for a lost or damaged parcel: its declared value at booking. */
    amountMinor: z.int().min(1).max(1_000_000_000).optional(),
    note: z.string().trim().min(3).max(1_000),
  })
  .strict();

/**
 * Raises a claim for a parcel (see the file header). One Idempotency-Key = one claim; a second open claim of the same
 * kind on the parcel is refused with the first one's id.
 */
export async function raiseClaim(deps: PaymentsDeps, who: Who, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<{ claim: ClaimRow; replay: boolean }> {
  await allowClaims(deps, who);
  const key = opts.idempotencyKey;
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'a claim needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(claimInput, input, 'claim');
  const storeId = who.storeId;
  if (!(await setting(deps, storeId, 'delivery.courier.claims')).enabled) throw new PaymentsError('FEATURE_OFF', 'courier claims are switched off', [], { setting: 'delivery.courier.claims' });
  const idempotencyKey = `claim:${key}`;
  const replay = async () => {
    const r = await deps.db.courierClaim.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, select: ROW });
    if (!r) return null;
    if (r.shipmentId !== d.shipmentId || r.kind !== d.kind) throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another claim', ['idempotencyKey']);
    return { claim: (await withNames(deps.db, [r]))[0]!, replay: true };
  };
  const again = await replay();
  if (again) return again;
  const s = await deps.db.shipment.findFirst({ where: { id: d.shipmentId, storeId }, select: { id: true, orderId: true, courierAccountId: true, status: true, declaredValueMinor: true, consignmentId: true } });
  if (!s) throw new PaymentsError('NOT_FOUND', 'no such parcel', ['shipmentId']);
  if (d.kind !== 'OTHER') {
    const seen = s.status === d.kind || (await deps.db.shipmentEvent.count({ where: { storeId, shipmentId: s.id, status: d.kind } })) > 0;
    if (!seen) throw new PaymentsError('NOT_CLAIMABLE', `the parcel's records do not show it ${d.kind.toLowerCase()}`, ['kind'], { status: s.status });
  }
  const amountMinor = d.amountMinor ?? (d.kind === 'OTHER' ? null : s.declaredValueMinor);
  if (!amountMinor || amountMinor <= 0) throw new PaymentsError('INVALID_INPUT', 'give the amount (the parcel has no declared value)', ['amountMinor']);
  try {
    return await deps.db.$transaction(async (tx) => {
      const c = await tx.courierClaim.create({
        data: { storeId, courierAccountId: s.courierAccountId, orderId: s.orderId, shipmentId: s.id, kind: d.kind, claimedMinor: amountMinor, note: d.note, idempotencyKey, raisedById: who.actor.staffUserId },
        select: ROW,
      });
      await orderLine(tx, who, s.orderId, CLAIM_EVENTS.raised, { claimId: c.id, kind: d.kind, claimedMinor: amountMinor, consignmentId: s.consignmentId });
      await auditMoney(tx, who, 'claim.raise', 'CourierClaim', c.id, undefined, { shipmentId: s.id, orderId: s.orderId, kind: d.kind, claimedMinor: amountMinor, note: d.note });
      return { claim: (await withNames(tx as unknown as PaymentsDeps['db'], [c]))[0]!, replay: false };
    }, TX);
  } catch (e) {
    if (!isUniqueClash(e)) throw e;
    const r = await replay();
    if (r) return r;
    const open = await deps.db.courierClaim.findFirst({ where: { storeId, shipmentId: s.id, kind: d.kind, status: { in: [...OPEN_CLAIM_STATES] } }, select: { id: true } });
    throw new PaymentsError('ALREADY_OPEN', 'this parcel already has an open claim of this kind', ['shipmentId'], { id: open?.id ?? null });
  }
}

/**
 * The rider's-extra claim an approved rider issue opens (rider-issues.ts), in the caller's transaction. Not behind the
 * claims switch: approving the complaint is the person's decision.
 */
export async function openOverchargeClaim(tx: Tx, who: Who, i: { riderIssueId: string; orderId: string; shipmentId: string; courierAccountId: string; extraMinor: number; note: string }): Promise<string> {
  const c = await tx.courierClaim.create({
    data: {
      storeId: who.storeId,
      courierAccountId: i.courierAccountId,
      orderId: i.orderId,
      shipmentId: i.shipmentId,
      kind: 'RIDER_OVERCHARGE',
      claimedMinor: i.extraMinor,
      note: i.note,
      riderIssueId: i.riderIssueId,
      idempotencyKey: `rider-issue:${i.riderIssueId}`,
      raisedById: who.actor.staffUserId,
    },
    select: { id: true },
  });
  await orderLine(tx, who, i.orderId, CLAIM_EVENTS.raised, { claimId: c.id, kind: 'RIDER_OVERCHARGE', claimedMinor: i.extraMinor, riderIssueId: i.riderIssueId });
  await auditMoney(tx, who, 'claim.raise', 'CourierClaim', c.id, undefined, { shipmentId: i.shipmentId, orderId: i.orderId, kind: 'RIDER_OVERCHARGE', claimedMinor: i.extraMinor, riderIssueId: i.riderIssueId });
  return c.id;
}

// ---------------------------------------------------------------------------------------------------------------------
// Following it

export const claimMoveInput = z
  .object({
    to: z.enum(['SENT', 'SETTLED', 'REJECTED']),
    /** SETTLED: what the courier paid (its statement), none to all of the claim. */
    settledMinor: z.int().min(0).max(1_000_000_000).optional(),
    /** The courier's own reference of the claim. */
    courierRef: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().min(3).max(1_000).optional(),
  })
  .strict()
  .refine((v) => v.to !== 'SETTLED' || v.settledMinor !== undefined, { message: 'give what the courier paid', path: ['settledMinor'] })
  .refine((v) => v.to !== 'REJECTED' || v.note !== undefined, { message: 'say why the courier refused', path: ['note'] });

/** Moves a claim one step (sent, settled, rejected); a stale move (someone moved it first) is refused. */
export async function moveClaim(deps: PaymentsDeps, who: Who, claimId: string, input: unknown): Promise<ClaimRow> {
  await allowClaims(deps, who);
  if (!UUID.test(claimId)) throw new PaymentsError('NOT_FOUND', 'no such claim', ['claimId']);
  const d = parse(claimMoveInput, input, 'claim step');
  const storeId = who.storeId;
  return deps.db.$transaction(async (tx) => {
    const c = await tx.courierClaim.findFirst({ where: { id: claimId, storeId }, select: ROW });
    if (!c) throw new PaymentsError('NOT_FOUND', 'no such claim', ['claimId']);
    const from = c.status as ClaimState;
    if (!CLAIM_MOVES[from].includes(d.to)) throw new PaymentsError('NOT_OPEN', 'this claim cannot move there', ['to'], { status: from });
    if (d.to === 'SETTLED' && d.settledMinor! > c.claimedMinor) throw new PaymentsError('INVALID_INPUT', 'more than was claimed', ['settledMinor'], { claimedMinor: c.claimedMinor });
    const now = nowOf(deps);
    const closing = d.to !== 'SENT';
    const moved = await tx.courierClaim.updateMany({
      where: { id: c.id, status: from },
      data: {
        status: d.to,
        decidedById: who.actor.staffUserId,
        ...(d.to === 'SENT' ? { sentAt: now } : {}),
        ...(closing ? { closedAt: now } : {}),
        ...(d.to === 'SETTLED' ? { settledMinor: d.settledMinor! } : {}),
        ...(d.courierRef ? { courierRef: d.courierRef } : {}),
        ...(d.note ? { note: c.note ? `${c.note}\n${d.note}` : d.note } : {}),
      },
    });
    if (moved.count !== 1) throw new PaymentsError('NOT_OPEN', 'someone moved this claim first', [], { status: from });
    await orderLine(tx, who, c.orderId, CLAIM_EVENTS.moved, { claimId: c.id, from, to: d.to, settledMinor: d.settledMinor ?? null, courierRef: d.courierRef ?? null });
    await auditMoney(tx, who, 'claim.move', 'CourierClaim', c.id, { status: from }, { status: d.to, settledMinor: d.settledMinor ?? null, courierRef: d.courierRef ?? null, note: d.note ?? null });
    const after = await tx.courierClaim.findUniqueOrThrow({ where: { id: c.id }, select: ROW });
    return (await withNames(tx as unknown as PaymentsDeps['db'], [after]))[0]!;
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading

export const claimListQuery = z
  .object({
    courierAccountId: z.uuid().optional(),
    open: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

export interface ClaimList {
  rows: ClaimRow[];
  /** Open claims (OPEN + SENT): how many and how much is asked. */
  open: { count: number; claimedMinor: number };
  /** Settled claims: claimed against what the couriers paid. */
  settled: { count: number; claimedMinor: number; settledMinor: number };
  /** Lost or damaged parcels with no claim of that kind yet (newest first, at most 20). */
  claimable: { shipmentId: string; orderNumber: string; kind: 'LOST' | 'DAMAGED'; declaredValueMinor: number | null; consignmentId: string | null }[];
}

/** The claims (newest first), their totals and the parcels still to claim. Seeing them needs `delivery.read`. */
export async function listClaims(deps: PaymentsDeps, who: Who, query: unknown = {}): Promise<ClaimList> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, 'delivery.read', { storeId: who.storeId });
  const q = parse(claimListQuery, query, 'claim list query');
  const storeId = who.storeId;
  const scope = { storeId, ...(q.courierAccountId ? { courierAccountId: q.courierAccountId } : {}) };
  const [rows, open, settled, lostOrDamaged] = await Promise.all([
    deps.db.courierClaim.findMany({ where: { ...scope, ...(q.open === undefined ? {} : { status: q.open ? { in: [...OPEN_CLAIM_STATES] } : { in: ['SETTLED', 'REJECTED'] } }) }, select: ROW, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.limit }),
    deps.db.courierClaim.aggregate({ where: { ...scope, status: { in: [...OPEN_CLAIM_STATES] } }, _count: true, _sum: { claimedMinor: true } }),
    deps.db.courierClaim.aggregate({ where: { ...scope, status: 'SETTLED' }, _count: true, _sum: { claimedMinor: true, settledMinor: true } }),
    deps.db.shipment.findMany({
      where: { ...scope, OR: [{ status: { in: ['LOST', 'DAMAGED'] } }, { events: { some: { status: { in: ['LOST', 'DAMAGED'] } } } }] },
      select: { id: true, status: true, declaredValueMinor: true, consignmentId: true, order: { select: { number: true } }, events: { where: { status: { in: ['LOST', 'DAMAGED'] } }, select: { status: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    }),
  ]);
  const claimed = lostOrDamaged.length ? await deps.db.courierClaim.findMany({ where: { storeId, shipmentId: { in: lostOrDamaged.map((s) => s.id) }, kind: { in: ['LOST', 'DAMAGED'] } }, select: { shipmentId: true, kind: true } }) : [];
  const has = new Set(claimed.map((c) => `${c.shipmentId}:${c.kind}`));
  const claimable: ClaimList['claimable'] = [];
  for (const s of lostOrDamaged) {
    const kinds = new Set<'LOST' | 'DAMAGED'>([...(s.status === 'LOST' || s.status === 'DAMAGED' ? [s.status] : []), ...s.events.map((e) => e.status as 'LOST' | 'DAMAGED')]);
    for (const kind of kinds) if (!has.has(`${s.id}:${kind}`) && claimable.length < 20) claimable.push({ shipmentId: s.id, orderNumber: s.order.number, kind, declaredValueMinor: s.declaredValueMinor, consignmentId: s.consignmentId });
  }
  return {
    rows: await withNames(deps.db, rows),
    open: { count: open._count, claimedMinor: open._sum.claimedMinor ?? 0 },
    settled: { count: settled._count, claimedMinor: settled._sum.claimedMinor ?? 0, settledMinor: settled._sum.settledMinor ?? 0 },
    claimable,
  };
}
