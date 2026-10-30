// CN-028 · PR 615 — the pipeline stock (docs/RETAIL-ERP-MODEL.md §3.2): every piece Retail was billed for and that is
// not yet delivered, approved or declined, at its buying price (the shop price fixed on the order). The shop builds it
// from its OWN records, never from the ERP's numbers, so it is an independent check of the ERP account (the tie, PR 616):
//
//   bill (PR 611, `billedAt`)          → BILLED         cause `bill:<externalOrderId>`
//   courier result (PR 611)            → DELIVERED / RETURNING    cause `delivery:<ErpDeliveryResult.id>`
//     PARTIAL: the pieces kept are the ERP's identification (`answer.keptLines`, GREEN / YELLOW), else the admin's
//     `keptLineIds`; the courier's latest result counts (a correction moves the pieces again) until the piece is handed
//     back or checked.
//   hand-back (PR 612, a list sent)    → WAITING_CHECK  cause `handback:<ErpReturnListParcel.id>`
//   `return.piece.decided` (PR 608)    → APPROVED / DECLINED      cause the eventId (a correction moves it again; an
//                                         original already undone, `reversedBy`, is skipped)
//   `return.parcel.resolved` RESOLVED  → the pieces that did not come back were kept: DELIVERED     cause the eventId
//   `return.parcel.resolved` PARCEL_MISSING → DECLINED (Retail's loss)                              cause the eventId
//
// Every move is a row of ErpPipelineMove (append-only, one per piece and cause), dated on the business day it happened,
// so the pipeline on any past day is read back exactly (`pipelineOn`). Exchange orders and exchange pieces are never in
// the pipeline (§6: an exchange is not a sale). Nothing here calls the ERP.
import { canMove, minorOf, pipelineValue, type ErpPieceState } from '@extas/erp-types';
import { TX, type Db, type InventoryDeps, type Tx } from './context';
import { dateOfDay, dayText, isP2002, type BooksLink } from './erp-account';
import { storeDate } from './erp-events-pull';

/** The causes of the pipeline moves (PR 612–614 read them; the eventId of an ERP event is a cause as it is). */
export const PIPELINE_CAUSE = {
  bill: (externalOrderId: string) => `bill:${externalOrderId}`,
  delivery: (deliveryResultId: string) => `delivery:${deliveryResultId}`,
  handback: (parcelId: string) => `handback:${parcelId}`,
} as const;

/** The causes of moves made before a piece is handed back or checked: only those let a courier result move it again. */
const EARLY_CAUSE = /^(bill|delivery):/;

interface PieceRow {
  id: string;
  storeId: number;
  linkId: string;
  lineId: string;
  state: ErpPieceState;
  buyingPriceMinor: number;
}

/**
 * Moves one piece (inside the caller's transaction): only a move its state allows, only a real change, once per cause.
 * True when it moved.
 */
export async function movePiece(tx: Tx, piece: PieceRow, to: ErpPieceState, businessDate: string, cause: string): Promise<boolean> {
  if (piece.state === to || !canMove(piece.state, to)) return false;
  const known = await tx.erpPipelineMove.findUnique({ where: { pieceId_cause: { pieceId: piece.id, cause } }, select: { id: true } });
  if (known) return false;
  await tx.erpPipelineMove.create({
    data: { storeId: piece.storeId, linkId: piece.linkId, pieceId: piece.id, fromState: piece.state, toState: to, businessDate: dateOfDay(businessDate), buyingPriceMinor: piece.buyingPriceMinor, cause },
  });
  await tx.erpPipelinePiece.update({ where: { id: piece.id }, data: { state: to, stateDate: dateOfDay(businessDate) } });
  piece.state = to;
  return true;
}

const PIECE_SELECT = { id: true, storeId: true, linkId: true, lineId: true, state: true, buyingPriceMinor: true } as const;

/** Phase 1: the billed lines of billed sale orders become BILLED pieces at their shop prices (once per line). */
async function billPieces(deps: InventoryDeps, link: BooksLink, timeZone: string): Promise<number> {
  const db = deps.db;
  const due = await db.$queryRaw<{ id: string; orderId: string; externalOrderId: string; billedAt: Date }[]>`
    SELECT o."id", o."orderId", o."externalOrderId", o."billedAt" FROM "ErpOrder" o
    WHERE o."linkId" = ${link.id}::uuid AND o."billedAt" IS NOT NULL AND o."exchangeOfId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "ErpOrderLine" l WHERE l."erpOrderId" = o."id" AND l."state" = 'OPEN' AND l."shopPriceMinor" IS NOT NULL AND l."replacesLineId" IS NULL
          AND NOT EXISTS (SELECT 1 FROM "ErpPipelinePiece" p WHERE p."linkId" = o."linkId" AND p."externalOrderId" = o."externalOrderId" AND p."lineId" = l."lineId")
      )
    ORDER BY o."billedAt" ASC, o."externalOrderId" ASC`;
  let n = 0;
  for (const o of due) {
    n += await db.$transaction(async (tx) => {
      const lines = await tx.erpOrderLine.findMany({ where: { erpOrderId: o.id, storeId: link.storeId, state: 'OPEN', shopPriceMinor: { not: null }, replacesLineId: null }, orderBy: [{ lineId: 'asc' }] });
      const day = storeDate(o.billedAt, timeZone);
      let made = 0;
      for (const l of lines) {
        const exists = await tx.erpPipelinePiece.findUnique({ where: { linkId_externalOrderId_lineId: { linkId: link.id, externalOrderId: o.externalOrderId, lineId: l.lineId } }, select: { id: true } });
        if (exists) continue;
        try {
          const p = await tx.erpPipelinePiece.create({
            data: { storeId: link.storeId, linkId: link.id, orderId: o.orderId, externalOrderId: o.externalOrderId, lineId: l.lineId, sku: l.sku, buyingPriceMinor: l.shopPriceMinor!, state: 'BILLED', billedOn: dateOfDay(day), stateDate: dateOfDay(day) },
          });
          await tx.erpPipelineMove.create({ data: { storeId: link.storeId, linkId: link.id, pieceId: p.id, fromState: null, toState: 'BILLED', businessDate: dateOfDay(day), buyingPriceMinor: p.buyingPriceMinor, cause: PIPELINE_CAUSE.bill(o.externalOrderId) } });
          made++;
        } catch (e) {
          if (!isP2002(e)) throw e;
        }
      }
      return made;
    }, TX);
  }
  return n;
}

const keptOf = (r: { outcome: string; keptLineIds: string[]; answer: unknown }): Set<string> => {
  if (r.outcome !== 'PARTIAL') return new Set();
  const a = r.answer && typeof r.answer === 'object' ? (r.answer as { identification?: unknown; keptLines?: unknown }) : null;
  if (a && (a.identification === 'GREEN' || a.identification === 'YELLOW') && Array.isArray(a.keptLines)) return new Set(a.keptLines.filter((x): x is string => typeof x === 'string'));
  return new Set(r.keptLineIds);
};

/** Phase 2: the courier's latest result of each billed order moves its pieces not yet handed back or checked. */
async function deliveryMoves(deps: InventoryDeps, link: BooksLink, timeZone: string): Promise<number> {
  const latest = await deps.db.$queryRaw<{ id: string; externalOrderId: string; outcome: string; at: Date; keptLineIds: string[]; answer: unknown }[]>`
    SELECT DISTINCT ON (r."erpOrderId") r."id", o."externalOrderId", r."outcome"::text AS "outcome", r."at", r."keptLineIds", r."answer"
    FROM "ErpDeliveryResult" r JOIN "ErpOrder" o ON o."id" = r."erpOrderId"
    WHERE o."linkId" = ${link.id}::uuid AND r."storeId" = ${link.storeId} AND o."exchangeOfId" IS NULL
      AND EXISTS (
        SELECT 1 FROM "ErpPipelinePiece" p WHERE p."linkId" = o."linkId" AND p."externalOrderId" = o."externalOrderId"
          AND NOT EXISTS (SELECT 1 FROM "ErpPipelineMove" m WHERE m."pieceId" = p."id" AND m."cause" = 'delivery:' || r."id")
      )
    ORDER BY r."erpOrderId", r."at" DESC, r."createdAt" DESC, r."id" DESC`;
  let n = 0;
  for (const r of latest) {
    n += await deps.db.$transaction(async (tx) => {
      const pieces = await tx.erpPipelinePiece.findMany({ where: { linkId: link.id, externalOrderId: r.externalOrderId, exchangeId: null }, select: PIECE_SELECT });
      const kept = keptOf(r);
      const day = storeDate(r.at, timeZone);
      let moved = 0;
      for (const p of pieces) {
        const causes = await tx.erpPipelineMove.findMany({ where: { pieceId: p.id }, select: { cause: true } });
        if (!causes.every((c) => EARLY_CAUSE.test(c.cause))) continue;
        const to: ErpPieceState = r.outcome === 'DELIVERED' || kept.has(p.lineId) ? 'DELIVERED' : 'RETURNING';
        if (await movePiece(tx, p, to, day, PIPELINE_CAUSE.delivery(r.id))) moved++;
      }
      return moved;
    }, TX);
  }
  return n;
}

/** Phase 3: a parcel on a return list handed back to the ERP (sent or accepted) puts its returning pieces on WAITING_CHECK. */
async function handbackMoves(deps: InventoryDeps, link: BooksLink): Promise<number> {
  const parcels = await deps.db.$queryRaw<{ id: string; externalOrderId: string; handedBackAt: Date }[]>`
    SELECT pc."id", pc."externalOrderId", l."handedBackAt" FROM "ErpReturnListParcel" pc JOIN "ErpReturnList" l ON l."id" = pc."returnListId"
    WHERE l."linkId" = ${link.id}::uuid AND l."storeId" = ${link.storeId} AND l."status" IN ('SENT', 'ACCEPTED') AND COALESCE(pc."result", '') <> 'REFUSED'
      AND EXISTS (SELECT 1 FROM "ErpPipelinePiece" p WHERE p."linkId" = l."linkId" AND p."externalOrderId" = pc."externalOrderId" AND p."state" IN ('BILLED', 'RETURNING'))
    ORDER BY l."handedBackAt" ASC, pc."id" ASC`;
  let n = 0;
  for (const pc of parcels) {
    n += await deps.db.$transaction(async (tx) => {
      const pieces = await tx.erpPipelinePiece.findMany({ where: { linkId: link.id, externalOrderId: pc.externalOrderId, exchangeId: null, state: { in: ['BILLED', 'RETURNING'] } }, select: PIECE_SELECT });
      let moved = 0;
      for (const p of pieces) if (await movePiece(tx, p, 'WAITING_CHECK', dayText(pc.handedBackAt), PIPELINE_CAUSE.handback(pc.id))) moved++;
      return moved;
    }, TX);
  }
  return n;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Phase 4: the owner's checks and Hold resolutions in the ERP (the event ledger, in the order they happened). */
async function eventMoves(deps: InventoryDeps, link: BooksLink, timeZone: string): Promise<number> {
  const events = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT e."id" FROM "ErpEvent" e
    WHERE e."linkId" = ${link.id}::uuid AND e."storeId" = ${link.storeId} AND e."status" IN ('APPLIED', 'STORED')
      AND e."type" IN ('return.piece.decided', 'return.parcel.resolved') AND e."externalOrderId" IS NOT NULL
      AND (e."reversedBy" IS NULL OR EXISTS (SELECT 1 FROM "ErpPipelineMove" m WHERE m."linkId" = e."linkId" AND m."cause" = e."eventId"))
      AND EXISTS (
        SELECT 1 FROM "ErpPipelinePiece" p WHERE p."linkId" = e."linkId" AND p."externalOrderId" = e."externalOrderId"
          AND NOT EXISTS (SELECT 1 FROM "ErpPipelineMove" m WHERE m."pieceId" = p."id" AND m."cause" = e."eventId")
      )
    ORDER BY e."occurredAt" ASC NULLS LAST, e."receivedAt" ASC, e."id" ASC`;
  let n = 0;
  for (const { id } of events) {
    n += await deps.db.$transaction(async (tx) => {
      const ev = await tx.erpEvent.findUniqueOrThrow({ where: { id } });
      if (ev.linkId !== link.id || ev.storeId !== link.storeId || !ev.externalOrderId) return 0;
      // An original that a correction already undid before the shop moved anything is skipped: the correction says it.
      if (ev.reversedBy && !(await tx.erpPipelineMove.findFirst({ where: { linkId: link.id, cause: ev.eventId }, select: { id: true } }))) return 0;
      const data = ev.data && typeof ev.data === 'object' ? (ev.data as Record<string, unknown>) : {};
      const day = ev.businessDate ? dayText(ev.businessDate) : storeDate(ev.occurredAt ?? ev.receivedAt, timeZone);
      const pieces = await tx.erpPipelinePiece.findMany({ where: { linkId: link.id, externalOrderId: ev.externalOrderId, exchangeId: null }, select: PIECE_SELECT });
      let moved = 0;
      if (ev.type === 'return.piece.decided') {
        // An exchange piece is never in the pipeline; DIFFERENT_PIECE is the returns desk's (PR 612), not a check.
        if (str(data.exchangeId)) return 0;
        const p = pieces.find((x) => x.lineId === str(data.lineId));
        if (!p) return 0;
        const decision = str(data.decision);
        const to: ErpPieceState | null =
          decision === 'APPROVED' || decision === 'APPROVED_AT_PACKING' ? 'APPROVED' : decision === 'DECLINED' ? 'DECLINED' : ev.reverses && !decision ? 'WAITING_CHECK' : null;
        if (to && (await movePiece(tx, p, to, day, ev.eventId))) moved++;
        return moved;
      }
      // return.parcel.resolved
      const result = str(data.result);
      const back = new Set((Array.isArray(data.pieces) ? data.pieces : []).map((x) => str((x as { lineId?: unknown })?.lineId)).filter((x): x is string => !!x));
      for (const p of pieces) {
        if (result === 'PARCEL_MISSING') {
          if (p.state === 'RETURNING') await movePiece(tx, p, 'WAITING_CHECK', day, `${ev.eventId}:handback`);
          if (p.state === 'WAITING_CHECK' && (await movePiece(tx, p, 'DECLINED', day, ev.eventId))) moved++;
        } else if (result === 'RESOLVED' && !back.has(p.lineId) && (p.state === 'WAITING_CHECK' || p.state === 'RETURNING')) {
          if (await movePiece(tx, p, 'DELIVERED', day, ev.eventId)) moved++;
        }
      }
      return moved;
    }, TX);
  }
  return n;
}

/** Brings the link's pipeline up to date from the shop's records (safe to run again: every move is made once). */
export async function syncPipeline(deps: InventoryDeps, link: BooksLink, timeZone: string): Promise<{ pieces: number; moves: number }> {
  const pieces = await billPieces(deps, link, timeZone);
  let moves = pieces;
  moves += await deliveryMoves(deps, link, timeZone);
  moves += await handbackMoves(deps, link);
  moves += await eventMoves(deps, link, timeZone);
  return { pieces, moves };
}

/** The pipeline at the end of a business day: each piece in the state of its last move on or before that day. */
export async function pipelineOn(db: Db, linkId: string, day: string): Promise<{ totalMinor: number; waitingCheckMinor: number; pieces: number }> {
  const rows = await db.$queryRaw<{ state: ErpPieceState; buyingPriceMinor: number }[]>`
    SELECT DISTINCT ON (m."pieceId") m."toState"::text AS "state", m."buyingPriceMinor"
    FROM "ErpPipelineMove" m WHERE m."linkId" = ${linkId}::uuid AND m."businessDate" <= ${dateOfDay(day)}::date
    ORDER BY m."pieceId", m."businessDate" DESC, m."createdAt" DESC, m."id" DESC`;
  return pipelineValue(rows.map((r) => ({ state: r.state, buyingPriceMinor: Number(r.buyingPriceMinor) })));
}

/**
 * What left (or came back into) the pipeline on each day of a span, at buying price: delivered (goods, the P&L's cost
 * of goods), declined (return losses), approved (credited, no cost), and re-entries (a correction that put a piece back).
 * The books match (PR 616) reads it for the tie; minor units.
 */
export async function pipelineFlows(db: Db, linkId: string, from: string, to: string): Promise<Map<string, { goodsMinor: number; returnLossesMinor: number; approvedMinor: number; billedMinor: number }>> {
  const rows = await db.$queryRaw<{ day: Date; fromState: string | null; toState: string; minor: bigint }[]>`
    SELECT m."businessDate" AS "day", m."fromState"::text AS "fromState", m."toState"::text AS "toState", SUM(m."buyingPriceMinor")::bigint AS "minor"
    FROM "ErpPipelineMove" m WHERE m."linkId" = ${linkId}::uuid AND m."businessDate" BETWEEN ${dateOfDay(from)}::date AND ${dateOfDay(to)}::date
    GROUP BY 1, 2, 3`;
  const out = new Map<string, { goodsMinor: number; returnLossesMinor: number; approvedMinor: number; billedMinor: number }>();
  const exitSign = (s: string | null, line: string) => (s === line ? 1 : 0);
  for (const r of rows) {
    const d = dayText(r.day);
    const v = out.get(d) ?? { goodsMinor: 0, returnLossesMinor: 0, approvedMinor: 0, billedMinor: 0 };
    const minor = minorOf(r.minor);
    // A move into an exit counts +, a move out of one (a correction) counts −.
    v.goodsMinor += minor * (exitSign(r.toState, 'DELIVERED') - exitSign(r.fromState, 'DELIVERED'));
    v.returnLossesMinor += minor * (exitSign(r.toState, 'DECLINED') - exitSign(r.fromState, 'DECLINED'));
    v.approvedMinor += minor * (exitSign(r.toState, 'APPROVED') - exitSign(r.fromState, 'APPROVED'));
    if (r.fromState === null) v.billedMinor += minor;
    out.set(d, v);
  }
  return out;
}
