// S07 · PR 166 — Cash on Delivery after the door (BACKEND-ARCHITECTURE §6.5.5; SIM-F-001, SIM-F-005, SIM-F-028):
//
// - `recordDoorOutcome` (`payments.door`): what the rider did at the door and the money with it — delivered, partly
//   delivered (the kept lines named), returned with the delivery charge paid, returned, attempt failed. What he should
//   have collected is computed from the order's live amount due (a paid customer is never asked again, SIM-F-001), and
//   every difference gets its reason. A partial waits for our approval while the owner's `payments.cod` asks for it
//   (`decidePartial`, `payments.partials`). One Idempotency-Key = one record; one closing outcome per parcel. The money
//   stays PROVISIONAL until a courier statement line matches it. The order's status and its stock are not moved here:
//   the courier steps of S08 call the order service (follow-up 331).
// - `importSettlement` (`payments.settle`): a courier's COD statement (its CSV file read with the owner's column names,
//   or the lines as JSON), line by line against our records with a reason code on every mismatch (the five traps of the
//   simulation plan §6.3: a charge-paid return marked delivered, a partial, a parcel we do not know, a double
//   deduction, a late settlement), the days each payment took, and the payout's `receivedAs`. The same file twice is
//   one settlement. A matched line makes its money RECONCILED; nothing is paid, claimed or messaged here (PR 564: flag,
//   change nothing). `resolveLine` marks a checked mismatch resolved with a note.
// - `codPosition` (`payments.view`): cash in transit — collected by the riders and not yet paid to us, and still out on
//   the road — per courier, the days to settle per courier, the delivered parcels missing from every statement, and the
//   open mismatches by reason.
import { createHash } from 'node:crypto';
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, KEY, nowOf, parse, setting, TX, UUID, type Db, type PaymentsDeps, type Who } from './context';
import { CASH_OUTCOMES, COD_OUTCOMES, courierStatus, doorExpectation, doorVariance, FINAL_OUTCOMES, matchLine, parseStatement, type CodOutcome, type LineContext, type StatementLine } from './cod-match';
import { PaymentsError } from './errors';
import { codToCollect, type DoorVariance, type LineMismatch } from './pure';

/** The timeline's event types of the door. */
export const COD_EVENTS = { recorded: 'cod.recorded', decided: 'cod.decided' } as const;

const by = (who: Who) => ({ actorType: who.actor.staffUserId ? ('STAFF' as const) : ('SYSTEM' as const), actorId: who.actor.staffUserId });
const audit = (tx: Db, who: Who, action: string, entityType: string, entityId: string, before: Prisma.InputJsonValue | undefined, after: Prisma.InputJsonValue) =>
  tx.auditLog.create({
    data: {
      storeId: who.storeId,
      ...by(who),
      action,
      entityType,
      entityId,
      ...(before === undefined ? {} : { before }),
      after,
      ip: who.ctx?.ip ? who.ctx.ip.slice(0, 64) : null,
      userAgent: who.ctx?.userAgent ? who.ctx.userAgent.slice(0, 512) : null,
      source: who.ctx?.source ?? 'admin',
    },
  });

// ---------------------------------------------------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------------------------------------------------

export const doorInputSchema = z
  .object({
    outcome: z.enum(COD_OUTCOMES),
    shipmentId: z.uuid().optional(),
    collectedMinor: z.int().min(0).max(1_000_000_000),
    chargeCollectedMinor: z.int().min(0).max(1_000_000_000).default(0),
    keptItemIds: z.array(z.uuid()).max(500).optional(),
    note: z.string().trim().max(2_000).optional(),
    occurredAt: z.coerce.date().optional(),
    /** Who reported it: the team (typed from the rider's report) or the courier (its event, S08). */
    source: z.enum(['staff', 'courier']).default('staff'),
  })
  .strict();

export interface DoorRecord {
  id: string;
  orderId: string;
  number: string;
  outcome: CodOutcome;
  state: 'RECORDED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  expectedMinor: number;
  collectedMinor: number;
  chargeCollectedMinor: number;
  varianceReason: DoorVariance | null;
  keptItemIds: string[];
  returnedItemIds: string[];
  moneyStatus: string;
  replay: boolean;
}

const DOOR_SELECT = {
  id: true,
  orderId: true,
  outcome: true,
  state: true,
  expectedMinor: true,
  collectedMinor: true,
  chargeCollectedMinor: true,
  varianceReason: true,
  keptItemIds: true,
  returnedItemIds: true,
  moneyStatus: true,
  shipmentId: true,
} satisfies Prisma.CodCollectionSelect;

type DoorRow = Prisma.CodCollectionGetPayload<{ select: typeof DOOR_SELECT }>;
const doorOut = (r: DoorRow, number: string, replay: boolean): DoorRecord => ({
  id: r.id,
  orderId: r.orderId,
  number,
  outcome: r.outcome,
  state: r.state,
  expectedMinor: r.expectedMinor,
  collectedMinor: r.collectedMinor,
  chargeCollectedMinor: r.chargeCollectedMinor,
  varianceReason: r.varianceReason as DoorVariance | null,
  keptItemIds: r.keptItemIds,
  returnedItemIds: r.returnedItemIds,
  moneyStatus: r.moneyStatus,
  replay,
});

/** Records one door outcome with its money (see the file header). */
export async function recordDoorOutcome(deps: PaymentsDeps, who: Who, orderId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<DoorRecord> {
  await allow(deps, who, 'payments.door');
  if (!UUID.test(orderId)) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  const key = opts.idempotencyKey;
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'a door record needs a valid Idempotency-Key', ['idempotencyKey']);
  const d = parse(doorInputSchema, input, 'door outcome');
  if (d.outcome === 'PARTIAL' && !d.keptItemIds?.length) throw new PaymentsError('INVALID_INPUT', 'a partial delivery names the kept lines', ['keptItemIds']);
  if (d.outcome !== 'PARTIAL' && d.keptItemIds?.length) throw new PaymentsError('INVALID_INPUT', 'only a partial delivery keeps some lines', ['keptItemIds']);
  const storeId = who.storeId;
  const idempotencyKey = `door:${key}`;
  const replay = async (): Promise<DoorRecord | null> => {
    const r = await deps.db.codCollection.findUnique({ where: { storeId_idempotencyKey: { storeId, idempotencyKey } }, select: DOOR_SELECT });
    if (!r) return null;
    if (r.orderId !== orderId || r.outcome !== d.outcome || r.collectedMinor !== d.collectedMinor || r.chargeCollectedMinor !== d.chargeCollectedMinor) {
      throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another door record', ['idempotencyKey']);
    }
    const o = await deps.db.order.findUniqueOrThrow({ where: { id: orderId }, select: { number: true } });
    return doorOut(r, o.number, true);
  };
  const first = await replay();
  if (first) return first;
  const cod = await setting(deps, storeId, 'payments.cod');
  const now = nowOf(deps);
  try {
    return await deps.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "Order" WHERE "id" = ${orderId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
      if (!rows.length) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
      const o = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { id: true, number: true, status: true, paymentMethod: true, totalMinor: true, walletAppliedMinor: true, paidMinor: true, deliveryChargeMinor: true, items: { where: { status: 'ACTIVE' }, select: { id: true, lineTotalMinor: true } } }, // review R1 (m1): a line an edit took out is not in the parcel
      });
      if (o.status === 'CANCELLED') throw new PaymentsError('ORDER_CLOSED', 'the order is cancelled');
      if (d.shipmentId) {
        const s = await tx.shipment.findFirst({ where: { id: d.shipmentId, storeId, orderId }, select: { id: true } });
        if (!s) throw new PaymentsError('NOT_FOUND', 'no such parcel on this order', ['shipmentId']);
      }
      const itemIds = o.items.map((i) => i.id);
      const kept = d.keptItemIds ?? [];
      if (kept.some((id) => !itemIds.includes(id))) throw new PaymentsError('INVALID_INPUT', 'a kept line is not on this order', ['keptItemIds']);
      if (d.outcome === 'PARTIAL' && new Set(kept).size >= itemIds.length) throw new PaymentsError('INVALID_INPUT', 'a partial delivery returns at least one line', ['keptItemIds']);
      // one closing outcome per parcel (or per order without a parcel): a rejected partial does not count
      const closed = await tx.codCollection.findFirst({
        where: { storeId, orderId, ...(d.shipmentId ? { shipmentId: d.shipmentId } : {}), outcome: { in: [...FINAL_OUTCOMES] }, state: { not: 'REJECTED' } },
        select: { id: true, outcome: true },
      });
      if (closed) throw new PaymentsError('ALREADY_RECORDED', 'this parcel already has its closing door outcome', [], { collectionId: closed.id, outcome: closed.outcome });

      const exp = doorExpectation(d.outcome, { ...o, lines: o.items }, kept);
      const due = codToCollect(o);
      const variance = doorVariance(d.outcome, exp, d, due, cod.toleranceMinor);
      const state = d.outcome === 'PARTIAL' && cod.partialNeedsApproval ? 'PENDING_APPROVAL' : 'RECORDED';
      const row = await tx.codCollection.create({
        data: {
          storeId,
          orderId,
          shipmentId: d.shipmentId ?? null,
          outcome: d.outcome,
          state,
          expectedMinor: exp.expectedMinor,
          collectedMinor: d.collectedMinor,
          chargeCollectedMinor: d.chargeCollectedMinor,
          varianceReason: variance,
          keptItemIds: kept,
          returnedItemIds: d.outcome === 'PARTIAL' ? itemIds.filter((id) => !kept.includes(id)) : d.outcome === 'DELIVERED' || d.outcome === 'ATTEMPT_FAILED' ? [] : itemIds,
          note: d.note ?? null,
          source: d.source,
          recordedById: who.actor.staffUserId,
          moneyStatus: 'PROVISIONAL',
          idempotencyKey,
          occurredAt: d.occurredAt ?? now,
        },
        select: DOOR_SELECT,
      });
      if (d.shipmentId && CASH_OUTCOMES.includes(d.outcome)) {
        await tx.shipment.update({ where: { id: d.shipmentId }, data: { codCollectedMinor: d.collectedMinor + d.chargeCollectedMinor } });
      }
      await tx.orderEvent.create({
        data: {
          storeId,
          orderId,
          type: COD_EVENTS.recorded,
          ...by(who),
          source: d.source === 'courier' ? 'courier' : 'admin',
          reasonCode: variance,
          message: d.note ?? null,
          data: { collectionId: row.id, outcome: d.outcome, state, expectedMinor: exp.expectedMinor, expectedChargeMinor: exp.expectedChargeMinor, collectedMinor: d.collectedMinor, chargeCollectedMinor: d.chargeCollectedMinor },
        },
      });
      await audit(tx, who, 'cod.record', 'CodCollection', row.id, { orderId, number: o.number, dueMinor: due }, { outcome: d.outcome, state, expectedMinor: exp.expectedMinor, collectedMinor: d.collectedMinor, chargeCollectedMinor: d.chargeCollectedMinor, varianceReason: variance, keptItemIds: kept });
      return doorOut(row, o.number, false);
    }, TX);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await replay();
      if (again) return again;
    }
    throw e;
  }
}

export const decideInputSchema = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(2_000).optional() }).strict();

/** Approves or rejects the money of a partial delivery waiting for us (a rejected one may be recorded again). */
export async function decidePartial(deps: PaymentsDeps, who: Who, collectionId: string, input: unknown): Promise<DoorRecord> {
  await allow(deps, who, 'payments.partials');
  if (!UUID.test(collectionId)) throw new PaymentsError('NOT_FOUND', 'no such door record', ['collectionId']);
  const d = parse(decideInputSchema, input, 'decision');
  const storeId = who.storeId;
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const r = await tx.codCollection.findFirst({ where: { id: collectionId, storeId }, select: DOOR_SELECT });
    if (!r) throw new PaymentsError('NOT_FOUND', 'no such door record', ['collectionId']);
    const o = await tx.order.findUniqueOrThrow({ where: { id: r.orderId }, select: { number: true } });
    const to = d.decision === 'approve' ? 'APPROVED' : 'REJECTED';
    if (r.state === to) return doorOut(r, o.number, true);
    if (r.state !== 'PENDING_APPROVAL') throw new PaymentsError('NOT_PENDING', 'this door record is not waiting for a decision', [], { state: r.state });
    const n = await tx.codCollection.updateMany({ where: { id: r.id, state: 'PENDING_APPROVAL' }, data: { state: to, decidedById: who.actor.staffUserId, decidedAt: now, decisionNote: d.note ?? null } });
    if (n.count !== 1) throw new PaymentsError('NOT_PENDING', 'this door record was decided meanwhile');
    const after = await tx.codCollection.findUniqueOrThrow({ where: { id: r.id }, select: DOOR_SELECT });
    if (to === 'REJECTED' && r.shipmentId) await tx.shipment.update({ where: { id: r.shipmentId }, data: { codCollectedMinor: null } });
    await tx.orderEvent.create({ data: { storeId, orderId: r.orderId, type: COD_EVENTS.decided, ...by(who), source: 'admin', message: d.note ?? null, data: { collectionId: r.id, decision: d.decision, collectedMinor: r.collectedMinor, expectedMinor: r.expectedMinor } } });
    await audit(tx, who, 'cod.partial.decide', 'CodCollection', r.id, { state: r.state }, { state: to, note: d.note ?? null, collectedMinor: r.collectedMinor, expectedMinor: r.expectedMinor });
    return doorOut(after, o.number, false);
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// The courier's statement
// ---------------------------------------------------------------------------------------------------------------------

export const RECEIVED_AS = ['BANK', 'BKASH', 'CASH_AT_COURIER_OFFICE'] as const;

const lineInput = z
  .object({
    consignmentId: z.string().trim().min(1).max(100),
    codMinor: z.int().min(0).max(1_000_000_000),
    chargeMinor: z.int().min(0).max(1_000_000_000).default(0),
    status: z.string().trim().max(60).optional(),
  })
  .strict();

export const settlementInputSchema = z
  .object({
    courierAccountId: z.uuid(),
    reference: z.string().trim().min(1).max(120),
    periodFrom: z.coerce.date().optional(),
    periodTo: z.coerce.date().optional(),
    /** When the money reached us; default now. Days to settle are counted to here. */
    receivedAt: z.coerce.date().optional(),
    receivedAs: z.enum(RECEIVED_AS).optional(),
    receivedAccountRef: z.string().trim().max(120).optional(),
    /** The courier's CSV file as text, or the lines themselves. */
    csv: z.string().max(5_000_000).optional(),
    lines: z.array(lineInput).max(20_000).optional(),
  })
  .strict()
  .refine((v) => (v.csv === undefined) !== (v.lines === undefined), { message: 'send the file (csv) or the lines, one of them', path: ['csv'] });

export interface SettlementLineOut {
  id: string;
  lineNo: number;
  consignmentId: string | null;
  orderId: string | null;
  codMinor: number;
  chargeMinor: number;
  courierStatus: string | null;
  expectedMinor: number | null;
  expectedChargeMinor: number | null;
  matchState: 'MATCHED' | 'MISMATCH' | 'LATE' | null;
  reasonCode: LineMismatch | null;
  settleDays: number | null;
  moneyStatus: string | null;
  resolvedAt: Date | null;
}

export interface SettlementSummary {
  settlementId: string;
  reference: string;
  courierAccountId: string;
  receivedAs: string | null;
  totalCodMinor: number;
  chargesMinor: number;
  netMinor: number;
  lines: SettlementLineOut[];
  matched: number;
  late: number;
  mismatched: number;
  /** Mismatches by reason code. */
  reasons: Partial<Record<LineMismatch, number>>;
  replay: boolean;
}

const LINE_SELECT = {
  id: true,
  lineNo: true,
  consignmentId: true,
  orderId: true,
  codMinor: true,
  chargeMinor: true,
  courierStatus: true,
  expectedMinor: true,
  expectedChargeMinor: true,
  matchState: true,
  reasonCode: true,
  settleDays: true,
  moneyStatus: true,
  resolvedAt: true,
} satisfies Prisma.CourierSettlementLineSelect;

async function summary(db: Db, settlementId: string, replay: boolean): Promise<SettlementSummary> {
  const s = await db.courierSettlement.findUniqueOrThrow({
    where: { id: settlementId },
    select: { id: true, reference: true, courierAccountId: true, receivedAs: true, totalCodMinor: true, chargesMinor: true, netMinor: true, lines: { select: LINE_SELECT, orderBy: { lineNo: 'asc' } } },
  });
  const lines = s.lines.map((l) => ({ ...l, reasonCode: l.reasonCode as LineMismatch | null }));
  const reasons: Partial<Record<LineMismatch, number>> = {};
  for (const l of lines) if (l.matchState === 'MISMATCH' && l.reasonCode) reasons[l.reasonCode] = (reasons[l.reasonCode] ?? 0) + 1;
  return {
    settlementId: s.id,
    reference: s.reference,
    courierAccountId: s.courierAccountId,
    receivedAs: s.receivedAs,
    totalCodMinor: s.totalCodMinor,
    chargesMinor: s.chargesMinor,
    netMinor: s.netMinor,
    lines,
    matched: lines.filter((l) => l.matchState === 'MATCHED').length,
    late: lines.filter((l) => l.matchState === 'LATE').length,
    mismatched: lines.filter((l) => l.matchState === 'MISMATCH').length,
    reasons,
    replay,
  };
}

/** Imports one courier statement and matches every line (see the file header). */
export async function importSettlement(deps: PaymentsDeps, who: Who, input: unknown): Promise<SettlementSummary> {
  await allow(deps, who, 'payments.settle');
  const d = parse(settlementInputSchema, input, 'statement');
  const storeId = who.storeId;
  const account = await deps.db.courierAccount.findFirst({ where: { id: d.courierAccountId, storeId }, select: { id: true } });
  if (!account) throw new PaymentsError('NOT_FOUND', 'no such courier account', ['courierAccountId']);
  let lines: StatementLine[];
  if (d.csv !== undefined) {
    const p = parseStatement(d.csv, await setting(deps, storeId, 'payments.cod.statement'));
    if (!p.ok) throw new PaymentsError('INVALID_INPUT', 'the statement file cannot be read', p.problems);
    lines = p.lines;
  } else {
    const words = (await setting(deps, storeId, 'payments.cod.statement')).statusWords;
    lines = d.lines!.map((l, i) => ({ lineNo: i + 1, consignmentId: l.consignmentId, codMinor: l.codMinor, chargeMinor: l.chargeMinor, rawStatus: l.status ?? null, status: courierStatus(l.status ?? null, words) }));
  }
  if (!lines.length) throw new PaymentsError('INVALID_INPUT', 'the statement has no lines', ['lines']);
  const fileHash = createHash('sha256').update(d.csv ?? JSON.stringify(d.lines)).digest('hex');
  const same = await deps.db.courierSettlement.findFirst({ where: { courierAccountId: account.id, fileHash }, select: { id: true } });
  if (same) return summary(deps.db, same.id, true);
  const dupRef = await deps.db.courierSettlement.findFirst({ where: { courierAccountId: account.id, reference: d.reference }, select: { id: true } });
  if (dupRef) throw new PaymentsError('DUPLICATE_REFERENCE', 'a statement with this reference is already imported', ['reference'], { settlementId: dupRef.id });

  const cod = await setting(deps, storeId, 'payments.cod');
  const now = nowOf(deps);
  const receivedAt = d.receivedAt ?? now;
  const totalCod = lines.reduce((s, l) => s + l.codMinor, 0);
  const charges = lines.reduce((s, l) => s + l.chargeMinor, 0);
  try {
    const id = await deps.db.$transaction(async (tx) => {
      const s = await tx.courierSettlement.create({
        data: {
          storeId,
          courierAccountId: account.id,
          reference: d.reference,
          periodFrom: d.periodFrom ?? null,
          periodTo: d.periodTo ?? null,
          totalCodMinor: totalCod,
          chargesMinor: charges,
          netMinor: totalCod - charges,
          receivedAt,
          status: 'IMPORTED',
          receivedAs: d.receivedAs ?? null,
          receivedAccountRef: d.receivedAccountRef ?? null,
          fileHash,
          importedById: who.actor.staffUserId,
        },
        select: { id: true },
      });
      const consignments = [...new Set(lines.map((l) => l.consignmentId))];
      const shipments = await tx.shipment.findMany({
        where: { storeId, courierAccountId: account.id, consignmentId: { in: consignments } },
        select: { id: true, orderId: true, consignmentId: true, codAmountMinor: true, chargeMinor: true, deliveredAt: true, returnedAt: true },
      });
      const byCn = new Map(shipments.map((x) => [x.consignmentId!, x]));
      const settled = new Set((await tx.courierSettlementLine.findMany({ where: { storeId, kind: 'COD', shipmentId: { in: shipments.map((x) => x.id) } }, select: { shipmentId: true } })).map((x) => x.shipmentId!));
      const doors = await tx.codCollection.findMany({
        where: { storeId, OR: [{ shipmentId: { in: shipments.map((x) => x.id) } }, { orderId: { in: shipments.map((x) => x.orderId) }, shipmentId: null }], outcome: { in: [...FINAL_OUTCOMES] }, state: { not: 'REJECTED' } },
        orderBy: { occurredAt: 'desc' },
        select: { id: true, orderId: true, shipmentId: true, outcome: true, state: true, expectedMinor: true, collectedMinor: true, chargeCollectedMinor: true, occurredAt: true },
      });
      const doorOf = (sh: { id: string; orderId: string }) => doors.find((x) => x.shipmentId === sh.id) ?? doors.find((x) => x.shipmentId === null && x.orderId === sh.orderId) ?? null;
      for (const l of lines) {
        const sh = byCn.get(l.consignmentId) ?? null;
        const door = sh ? doorOf(sh) : null;
        const ctx: LineContext = {
          found: !!sh,
          alreadySettled: !!sh && settled.has(sh.id),
          door,
          shipmentCodMinor: sh?.codAmountMinor ?? 0,
          expectedChargeMinor: sh?.chargeMinor ?? null,
          deliveredAt: sh?.deliveredAt ?? sh?.returnedAt ?? door?.occurredAt ?? null,
          receivedAt,
          toleranceMinor: cod.toleranceMinor,
          lateAfterDays: cod.lateAfterDays,
        };
        const m = matchLine(l, ctx);
        const ok = m.matchState !== 'MISMATCH';
        const line = await tx.courierSettlementLine.create({
          data: {
            storeId,
            settlementId: s.id,
            lineNo: l.lineNo,
            kind: 'COD',
            orderId: sh?.orderId ?? null,
            // a second line for a parcel keeps its order but not the parcel (one settled line per parcel)
            shipmentId: sh && !ctx.alreadySettled ? sh.id : null,
            consignmentId: l.consignmentId,
            codMinor: l.codMinor,
            chargeMinor: l.chargeMinor,
            courierStatus: l.rawStatus,
            expectedMinor: m.expectedMinor,
            expectedChargeMinor: m.expectedChargeMinor,
            matchState: m.matchState,
            reasonCode: m.reasonCode,
            settleDays: m.settleDays,
            moneyStatus: ok ? 'RECONCILED' : 'PROVISIONAL',
          },
          select: { id: true },
        });
        if (sh && !ctx.alreadySettled) settled.add(sh.id);
        if (ok && door) await tx.codCollection.update({ where: { id: door.id }, data: { moneyStatus: 'RECONCILED', settlementLineId: line.id } });
      }
      await audit(tx, who, 'settlement.import', 'CourierSettlement', s.id, undefined, { courierAccountId: account.id, reference: d.reference, lines: lines.length, totalCodMinor: totalCod, chargesMinor: charges, receivedAs: d.receivedAs ?? null, fileHash });
      return s.id;
    }, TX);
    return summary(deps.db, id, false);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await deps.db.courierSettlement.findFirst({ where: { courierAccountId: account.id, fileHash }, select: { id: true } });
      if (again) return summary(deps.db, again.id, true);
      throw new PaymentsError('DUPLICATE_REFERENCE', 'a statement with this reference is already imported', ['reference']);
    }
    throw e;
  }
}

/** One imported statement with its lines (`payments.view`). */
export async function getSettlement(deps: PaymentsDeps, who: Who, settlementId: string): Promise<SettlementSummary | null> {
  await allow(deps, who, 'payments.view');
  if (!UUID.test(settlementId)) return null;
  const s = await deps.db.courierSettlement.findFirst({ where: { id: settlementId, storeId: who.storeId }, select: { id: true } });
  return s ? summary(deps.db, s.id, false) : null;
}

export const resolveInputSchema = z.object({ note: z.string().trim().min(3).max(2_000) }).strict();

/** Marks a checked mismatch (or a late line) resolved with the person's note; its money is then RECONCILED. */
export async function resolveLine(deps: PaymentsDeps, who: Who, lineId: string, input: unknown): Promise<SettlementLineOut> {
  await allow(deps, who, 'payments.settle');
  if (!UUID.test(lineId)) throw new PaymentsError('NOT_FOUND', 'no such statement line', ['lineId']);
  const d = parse(resolveInputSchema, input, 'resolution');
  const storeId = who.storeId;
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const l = await tx.courierSettlementLine.findFirst({ where: { id: lineId, storeId }, select: LINE_SELECT });
    if (!l) throw new PaymentsError('NOT_FOUND', 'no such statement line', ['lineId']);
    if (l.matchState === 'MATCHED') throw new PaymentsError('NOT_PENDING', 'this line matches; there is nothing to resolve');
    if (l.resolvedAt) throw new PaymentsError('ALREADY_RECORDED', 'this line is already resolved');
    const after = await tx.courierSettlementLine.update({ where: { id: l.id }, data: { resolvedAt: now, resolvedById: who.actor.staffUserId, resolutionNote: d.note, moneyStatus: 'RECONCILED' }, select: LINE_SELECT });
    await audit(tx, who, 'settlement.line.resolve', 'CourierSettlementLine', l.id, { matchState: l.matchState, reasonCode: l.reasonCode }, { note: d.note });
    return { ...after, reasonCode: after.reasonCode as LineMismatch | null };
  }, TX);
}

// ---------------------------------------------------------------------------------------------------------------------
// Cash in transit
// ---------------------------------------------------------------------------------------------------------------------

export interface CourierPosition {
  courierAccountId: string;
  /** Collected at the door (or delivered with COD) and not yet on a statement: the courier holds it. */
  withCourierMinor: number;
  withCourierParcels: number;
  /** Still out with the riders (picked up, in transit, out for delivery) with COD to collect. */
  onTheRoadMinor: number;
  onTheRoadParcels: number;
  /** Days from delivery to the courier's money, over every statement line with a delivery date. */
  settleDays: { lines: number; average: number | null; max: number | null };
}

export interface CodPosition {
  totalInTransitMinor: number;
  couriers: CourierPosition[];
  /** Delivered parcels with COD on no statement after `payments.cod.missingAfterDays` (empty while it is 0). */
  missing: { shipmentId: string; orderId: string; consignmentId: string | null; courierAccountId: string; codMinor: number; deliveredAt: Date; reason: 'MISSING' }[];
  /** Mismatches not resolved yet, by reason code. */
  openMismatches: Partial<Record<LineMismatch, number>>;
  partialsWaiting: number;
}

const ROAD = ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'] as const;
const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;

/** Where the Cash on Delivery money stands (see the file header). */
export async function codPosition(deps: PaymentsDeps, who: Who): Promise<CodPosition> {
  await allow(deps, who, 'payments.view');
  const storeId = who.storeId;
  const cod = await setting(deps, storeId, 'payments.cod');
  const now = nowOf(deps);
  const [road, delivered, lines, open, waiting] = await Promise.all([
    deps.db.shipment.findMany({ where: { storeId, status: { in: [...ROAD] }, codAmountMinor: { gt: 0 } }, select: { courierAccountId: true, codAmountMinor: true } }),
    deps.db.shipment.findMany({
      // delivered with COD, or returned with the delivery charge collected at the door
      where: { storeId, OR: [{ status: { in: [...DELIVERED] }, OR: [{ codAmountMinor: { gt: 0 } }, { codCollectedMinor: { gt: 0 } }] }, { status: 'RETURNED', codCollectedMinor: { gt: 0 } }] },
      select: { id: true, orderId: true, consignmentId: true, courierAccountId: true, codAmountMinor: true, codCollectedMinor: true, deliveredAt: true },
      take: 20_000,
    }),
    deps.db.courierSettlementLine.findMany({ where: { storeId, settleDays: { not: null } }, select: { settleDays: true, settlement: { select: { courierAccountId: true } } }, take: 20_000, orderBy: { createdAt: 'desc' } }),
    deps.db.courierSettlementLine.groupBy({ by: ['reasonCode'], where: { storeId, matchState: 'MISMATCH', resolvedAt: null }, _count: { _all: true } }),
    deps.db.codCollection.count({ where: { storeId, state: 'PENDING_APPROVAL' } }),
  ]);
  const onStatement = new Set(
    (await deps.db.courierSettlementLine.findMany({ where: { storeId, kind: 'COD', shipmentId: { in: delivered.map((x) => x.id) } }, select: { shipmentId: true } })).map((x) => x.shipmentId!),
  );
  const pos = new Map<string, CourierPosition>();
  const of = (id: string) => {
    let p = pos.get(id);
    if (!p) pos.set(id, (p = { courierAccountId: id, withCourierMinor: 0, withCourierParcels: 0, onTheRoadMinor: 0, onTheRoadParcels: 0, settleDays: { lines: 0, average: null, max: null } }));
    return p;
  };
  for (const r of road) {
    const p = of(r.courierAccountId);
    p.onTheRoadMinor += r.codAmountMinor;
    p.onTheRoadParcels += 1;
  }
  const missing: CodPosition['missing'] = [];
  const cutoff = cod.missingAfterDays > 0 ? now.getTime() - cod.missingAfterDays * 86_400_000 : null;
  for (const s of delivered) {
    if (onStatement.has(s.id)) continue;
    const amount = s.codCollectedMinor ?? s.codAmountMinor;
    if (amount <= 0) continue;
    const p = of(s.courierAccountId);
    p.withCourierMinor += amount;
    p.withCourierParcels += 1;
    if (cutoff !== null && s.deliveredAt && s.deliveredAt.getTime() < cutoff) missing.push({ shipmentId: s.id, orderId: s.orderId, consignmentId: s.consignmentId, courierAccountId: s.courierAccountId, codMinor: amount, deliveredAt: s.deliveredAt, reason: 'MISSING' });
  }
  const days = new Map<string, number[]>();
  for (const l of lines) days.set(l.settlement.courierAccountId, [...(days.get(l.settlement.courierAccountId) ?? []), l.settleDays!]);
  for (const [id, list] of days) of(id).settleDays = { lines: list.length, average: Math.round((list.reduce((s, x) => s + x, 0) / list.length) * 10) / 10, max: Math.max(...list) };
  const openMismatches: Partial<Record<LineMismatch, number>> = {};
  for (const g of open) if (g.reasonCode) openMismatches[g.reasonCode as LineMismatch] = g._count._all;
  const couriers = [...pos.values()].sort((a, b) => a.courierAccountId.localeCompare(b.courierAccountId));
  return { totalInTransitMinor: couriers.reduce((s, c) => s + c.withCourierMinor + c.onTheRoadMinor, 0), couriers, missing, openMismatches, partialsWaiting: waiting };
}
