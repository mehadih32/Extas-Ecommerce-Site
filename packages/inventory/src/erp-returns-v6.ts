// CN-028 · PR 612–614 (CN-029 Phase 1, Pherot) — the ERP side of returns and exchanges in contract v6
// (docs/erp/site-changes-v6.md §2.5, §2.9, §2.10; docs/RETAIL-ERP-MODEL.md §6, §7). The shop's desk and screens are in
// @extas/orders (handback.ts, returns-erp.ts, exchange-v6.ts); this file only talks to the store's own ERP and keeps
// the ERP's answers.
//
// - `returnsV6Path` — may this store send returns and exchanges to its ERP now? Only in v6, only through the store's own
//   connection (§16: its own key), on its open ERP link. No ERP → refused; an unusable connection, or the practice ERP
//   with its data off → held (the list waits as SENT, nothing is lost); a real connection, or the practice ERP with its
//   data on (`erp.mock.stockEnabled`, tests and demos) → sent.
// - `sendReturnList` — `POST /return-lists` (key `returnList:<returnListId>`, the contract's idempotency key), one sender
//   at a time (qa-gate: the list's row lock is held across the call, so the desk and the job never both send): the answer
//   per parcel (IN_RETURN_STOCK with its pieces, HOLD, REFUSED with a reason) and the ERP's expected count are kept on the
//   parcel; a count that differs starts the courier claim at once. The pieces the ERP took into Return stock move in the
//   pipeline to WAITING_CHECK on the courier's hand-back date (cause `handback:<parcelId>`); a HOLD parcel's pieces stay
//   RETURNING (still in the pipeline) until the owner ticks them (`return.parcel.resolved`). An exchange's old piece is
//   left to the books (PR 615): it was costed when delivered and its money comes only through the exchange events.
// - `movePipelinePieces` — one transaction per piece under its row lock (qa-gate): the state is read again inside, and a
//   second writer of the same move (unique per piece and cause) finds it done.
// - `applyReturnDecisions` — the owner's decisions in the ERP (`return.piece.decided`, and `return.parcel.resolved` for
//   a Hold parcel) move the pieces out of the pipeline: approved (a credit) or declined (a return loss) on the decision's
//   own date, cause = the eventId, so a repeat or a second writer of the same move changes nothing (unique per piece and
//   cause). A correction (`reverses`) moves the piece again from where it is.
// - `sendExchangeOrderToErp`, `erpLiveAvailable`, `readErpExchanges`, `sendLateReturnToErp`, `readErpReturnsSummary` —
//   the exchange order (`POST /orders` with `exchange`), the live stock of a new piece, `GET /exchanges`, the late-return
//   mark and `GET /returns/summary?date=`.
// Nothing here moves money: the ERP's events do, and the books (PR 615) write them.
import type { Prisma } from '@extas/db/client';
import {
  canMove,
  erpOrderAnswerSchema,
  erpReturnListAnswerSchema,
  type ErpExchange,
  type ErpLateReturn,
  type ErpOrderAnswer,
  type ErpPieceState,
  type ErpReturnsSummary,
  type ErpSalesOrderV6,
} from '@extas/erp-types';
import { toErpError, type ErpApi } from '@extas/adapters';
import { nowOf, type Db, type InventoryDeps, type Tx, TX } from './context';
import { InventoryError } from './errors';
import { isV6 } from './erp-model';
import { openErpLink } from './erp-link';
import { resolveErp, type ErpLink } from './guard';
import { callErp, ErpCallFailed, errorText, retryPolicy, type RetryPolicy } from './sync';
import { digitsOf, orderLinkOf } from './erp-orders-v6';
import { decimalToMinor } from './webhook';

// ---- may the store send? -----------------------------------------------------------------------------------------------

export type ReturnsV6Behaviour = 'refuse' | 'hold' | 'send';

/**
 * What a returns or exchange call does for this link: no ERP refuses; an unusable connection holds; the practice ERP
 * holds unless its data is switched on (then it behaves like a real one, as the event pull does); a real one sends.
 */
export function returnsV6Behaviour(link: ErpLink): ReturnsV6Behaviour {
  if (link.state === 'none') return 'refuse';
  if (link.state === 'unavailable') return 'hold';
  if (link.state === 'mock') return link.stockEnabled ? 'send' : 'hold';
  return 'send';
}

export type ReturnsV6Path =
  | { go: true; api: ErpApi; linkId: string; integrationId: string; mock: boolean }
  | { go: false; behaviour: 'refuse' | 'hold'; reason: 'ERP_MODEL_V5' | 'ERP_NONE' | 'ERP_UNAVAILABLE' | 'ERP_ON_PRACTICE' | 'NO_CONNECTION'; text: string };

/** The store's way to its own ERP for returns and exchanges (v6 only, its own connection, its open link). */
export async function returnsV6Path(deps: InventoryDeps, storeId: number): Promise<ReturnsV6Path> {
  if (!(await isV6(deps, storeId))) return { go: false, behaviour: 'refuse', reason: 'ERP_MODEL_V5', text: 'the store speaks ERP contract v5' };
  const link = await resolveErp(deps, storeId);
  const b = returnsV6Behaviour(link);
  if (link.state === 'none') return { go: false, behaviour: 'refuse', reason: 'ERP_NONE', text: 'the store has no ERP' };
  if (link.state === 'unavailable') return { go: false, behaviour: 'hold', reason: 'ERP_UNAVAILABLE', text: `${link.code}: ${link.reason}` };
  if (b === 'hold') return { go: false, behaviour: 'hold', reason: 'ERP_ON_PRACTICE', text: 'the practice ERP is not switched on for this store' };
  if (!link.integrationId) return { go: false, behaviour: 'hold', reason: 'NO_CONNECTION', text: "the store's own ERP connection is not set up" };
  const open = await openErpLink(deps.db, storeId, link.integrationId);
  return { go: true, api: link.api, linkId: open.id, integrationId: link.integrationId, mock: link.state === 'mock' };
}

/** The store's open ERP link id (PR 610's `orderLinkOf`; null: the store has no ERP). For reads of the shop's own rows. */
export async function openLinkIdOf(deps: InventoryDeps, storeId: number): Promise<string | null> {
  return (await orderLinkOf(deps, storeId))?.id ?? null;
}

/** A refusal of an ERP write, with the ERP's own code and details (a 409 INSUFFICIENT_STOCK carries `shortSkus`). */
export interface ErpRefusal {
  /** The ERP's code (INSUFFICIENT_STOCK, LINE_NOT_DELIVERED, EXCHANGE_OPEN, ORDER_NOT_FOUND, …) or the call's own code. */
  code: string;
  status: number | null;
  details: unknown;
  /** Another try (the same key) may help: the ERP was down or slow, not a refusal. */
  retryable: boolean;
  text: string;
}

function refusalOf(e: unknown): ErpRefusal {
  const err = e instanceof ErpCallFailed ? e.erp : toErpError(e);
  return { code: err.erpCode ?? err.code, status: err.status, details: err.detailsBody ?? (err.details.length ? err.details : null), retryable: err.retryable, text: errorText(e) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUniqueViolation = (e: unknown): boolean => (e as { code?: string })?.code === 'P2002';
/** Room for one ERP call with all its tries while a row lock is held. */
const lockedCallTx = (p: RetryPolicy) => ({ maxWait: TX.maxWait, timeout: Math.max(TX.timeout, p.maxAttempts * (p.timeoutMs + p.maxMs) + 10_000) });

/** A whole-taka amount the ERP sent (decimal text) in the store's minor units. */
export const erpMinor = (text: string | null | undefined, digits: number): number | null => decimalToMinor(text ?? null, digits);

const dateOnly = (d: string | Date): Date => new Date(`${(typeof d === 'string' ? d : d.toISOString()).slice(0, 10)}T00:00:00Z`);
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

// ---- PR 612 · the return list ------------------------------------------------------------------------------------------

export interface ReturnListSendResult {
  listId: string;
  returnListId: string;
  /** SENT: held or not answered yet (it is sent again); ACCEPTED: the ERP answered every parcel; REFUSED: the whole list. */
  status: 'SENT' | 'ACCEPTED' | 'REFUSED';
  parcels: { id: string; externalOrderId: string; result: string | null; reason: string | null; expectedCount: number | null; countDiffers: boolean; claimStarted: boolean }[];
  error: string | null;
  moved: number;
}

/**
 * Runs `fn` holding the return list's row lock: one sender at a time (the desk's "send again" and the hourly job never
 * both send it). The ERP call happens inside, so the lock lasts as long as the call with all its tries.
 */
export async function withReturnListLock<T>(deps: InventoryDeps, storeId: number, listId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(listId)) throw new InventoryError('NOT_FOUND', 'no such return list', ['listId']);
  const policy = await retryPolicy(deps);
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ErpReturnList" WHERE "id" = ${listId}::uuid AND "storeId" = ${storeId} FOR UPDATE`;
    return fn(tx);
  }, lockedCallTx(policy));
}

/**
 * Sends one closed return list (status SENT) to the store's ERP. Safe to call again: the same list goes with the same
 * key, so the ERP answers from its record. An answered list is never sent again (a refused parcel goes on a new list).
 * Under the list's row lock (`opts.tx`: the caller holds it, see `withReturnListLock`): a second sender waits, then finds
 * the list answered and sends nothing.
 */
export async function sendReturnList(deps: InventoryDeps, storeId: number, listId: string, opts: { tx?: Tx } = {}): Promise<ReturnListSendResult> {
  if (opts.tx) return sendLocked(deps, opts.tx, storeId, listId);
  try {
    return await withReturnListLock(deps, storeId, listId, (tx) => sendLocked(deps, tx, storeId, listId));
  } catch (e) {
    // another writer moved one of its pieces at the same moment: nothing of this answer was kept; the list stays SENT
    // and goes again with the same key (the ERP answers from its record), and the move is found done then
    if (!isUniqueViolation(e)) throw e;
    const list = await deps.db.erpReturnList.findFirstOrThrow({ where: { id: listId, storeId }, select: { id: true, returnListId: true } });
    return { listId: list.id, returnListId: list.returnListId, status: 'SENT', error: 'CONFLICT: sent again on the next turn', moved: 0, parcels: [] };
  }
}

async function sendLocked(deps: InventoryDeps, db: Tx, storeId: number, listId: string): Promise<ReturnListSendResult> {
  const list = await db.erpReturnList.findFirst({ where: { id: listId, storeId }, include: { parcels: { orderBy: { scannedAt: 'asc' } } } });
  if (!list) throw new InventoryError('NOT_FOUND', 'no such return list', ['listId']);
  const view = (status: ReturnListSendResult['status'], error: string | null, moved = 0, rows = list.parcels): ReturnListSendResult => ({
    listId: list.id,
    returnListId: list.returnListId,
    status,
    error,
    moved,
    parcels: rows.map((p) => ({ id: p.id, externalOrderId: p.externalOrderId, result: p.result, reason: p.reason, expectedCount: p.expectedCount, countDiffers: p.countDiffers, claimStarted: !!p.claimStartedAt })),
  });
  if (list.status === 'ACCEPTED' || list.status === 'REFUSED') return view(list.status, list.error);
  if (list.status !== 'SENT') throw new InventoryError('CONFLICT', 'only a list closed for sending is sent', ['status']);
  const now = nowOf(deps);
  const path = await returnsV6Path(deps, storeId);
  if (!path.go) {
    if (path.behaviour === 'refuse') throw new InventoryError(path.reason === 'ERP_NONE' ? 'ERP_NOT_CONNECTED' : 'ERP_UNAVAILABLE', path.text, [path.reason]);
    await db.erpReturnList.update({ where: { id: list.id }, data: { error: path.text.slice(0, 500), lastTriedAt: now } });
    return view('SENT', path.text);
  }
  // CN-029 §16: a list belongs to the link it was made on; a link that ended (a handover) never sends it with new keys.
  if (path.linkId !== list.linkId) throw new InventoryError('CONFLICT', "this list belongs to an earlier ERP link of the store; it is never sent with another link's keys", ['linkId']);
  const parcels = list.parcels.filter((p) => !p.resentInListId);
  const body = {
    returnListId: list.returnListId,
    courier: list.courier,
    handedBackAt: ymd(list.handedBackAt),
    parcels: parcels.map((p) => ({ consignmentId: p.consignmentId, externalOrderId: p.externalOrderId, receivedCount: p.receivedCount, ...(p.note ? { note: p.note } : {}) })),
  };
  const policy = await retryPolicy(deps);
  let answerBody: unknown;
  try {
    answerBody = (await callErp(deps, policy, (o) => path.api.push({ type: 'returnList.create', body }, { ...o, idempotencyKey: `returnList:${list.returnListId}` }))).value.body;
  } catch (e) {
    const r = refusalOf(e);
    // A list the ERP refuses as a whole (a 4xx) stays REFUSED with the reason; a down or slow ERP is tried again.
    const refused = !r.retryable && r.status !== null && r.status >= 400 && r.status < 500;
    await db.erpReturnList.update({ where: { id: list.id }, data: { status: refused ? 'REFUSED' : 'SENT', error: r.text, lastTriedAt: now, sendAttempts: { increment: 1 } } });
    return view(refused ? 'REFUSED' : 'SENT', r.text);
  }
  const parsed = erpReturnListAnswerSchema.safeParse(answerBody);
  if (!parsed.success) {
    const text = 'BAD_RESPONSE: the answer to the return list breaks the contract';
    await db.erpReturnList.update({ where: { id: list.id }, data: { error: text, lastTriedAt: now, sendAttempts: { increment: 1 } } });
    return view('SENT', text);
  }
  const answer = parsed.data;
  let moved = 0;
  const tx = db;
  const rows = await (async () => {
    const out: typeof list.parcels = [];
    for (const p of list.parcels) {
      const a = answer.parcels.find((x) => x.externalOrderId === p.externalOrderId && (x.consignmentId ?? null) === (p.consignmentId ?? null)) ?? answer.parcels.find((x) => x.externalOrderId === p.externalOrderId);
      if (!a || p.resentInListId) {
        out.push(p);
        continue;
      }
      const expected = a.expectedCount ?? p.expectedCount;
      // a refused parcel never starts a claim: the ERP did not take it (it is fixed and sent again)
      const differs = a.result !== 'REFUSED' && expected !== null && expected !== undefined && expected !== p.receivedCount;
      const row = await tx.erpReturnListParcel.update({
        where: { id: p.id },
        data: {
          result: a.result,
          reason: a.reason,
          answerPieces: a.pieces as unknown as Prisma.InputJsonValue,
          expectedCount: expected ?? null,
          countDiffers: differs,
          // the count the ERP expects differs from the desk's: the courier claim starts now (§7)
          ...(differs && !p.claimStartedAt ? { claimStartedAt: now } : {}),
        },
      });
      out.push(row);
      if (a.result === 'IN_RETURN_STOCK' && !p.exchangeLinkId && a.pieces.length) {
        moved += await movePipelinePieces(tx, { storeId, linkId: list.linkId, lineIds: a.pieces.map((x) => x.lineId), to: 'WAITING_CHECK', businessDate: list.handedBackAt, cause: `handback:${p.id}` });
      }
    }
    const allRefused = out.filter((p) => !p.resentInListId).every((p) => p.result === 'REFUSED');
    await tx.erpReturnList.update({ where: { id: list.id }, data: { status: allRefused ? 'REFUSED' : 'ACCEPTED', sentAt: now, answer: answer as unknown as Prisma.InputJsonValue, error: null, lastTriedAt: now, sendAttempts: { increment: 1 } } });
    return out;
  })();
  return view(rows.filter((p) => !p.resentInListId).every((p) => p.result === 'REFUSED') ? 'REFUSED' : 'ACCEPTED', null, moved, rows);
}

/** Every list of the store waiting to be sent (closed, not answered), oldest first. */
export async function sendWaitingReturnLists(deps: InventoryDeps, storeId: number): Promise<{ sent: number; waiting: number; refused: number }> {
  const lists = await deps.db.erpReturnList.findMany({ where: { storeId, status: 'SENT' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  const out = { sent: 0, waiting: 0, refused: 0 };
  for (const l of lists) {
    try {
      const r = await sendReturnList(deps, storeId, l.id);
      if (r.status === 'ACCEPTED') out.sent++;
      else if (r.status === 'REFUSED') out.refused++;
      else out.waiting++;
    } catch {
      out.waiting++;
    }
  }
  return out;
}

// ---- the pipeline moves of returned pieces ----------------------------------------------------------------------------

type PieceMove = { storeId: number; linkId: string; lineIds: readonly string[]; to: ErpPieceState; businessDate: Date; cause: string; sku?: string | null };

/**
 * Moves the pipeline pieces with these line ids on the link to `to`, on `businessDate`, once per piece and cause. A piece
 * the books have not made yet (PR 615) is left alone, and so is one already out of the pipeline the move does not allow.
 * qa-gate: each piece in its own transaction under its row lock, its state read again inside; a second writer of the
 * same move (unique per piece and cause) finds it done. Given a transaction (`db` is one), the moves join it: the
 * caller's transaction is the one, and a clash there undoes it whole (see `sendReturnList`).
 */
export async function movePipelinePieces(db: Db, m: PieceMove): Promise<number> {
  if (!m.lineIds.length) return 0;
  const ids = (await db.erpPipelinePiece.findMany({ where: { storeId: m.storeId, linkId: m.linkId, lineId: { in: [...m.lineIds] } }, orderBy: { id: 'asc' }, select: { id: true } })).map((p) => p.id);
  let n = 0;
  for (const id of ids) if (await moveOne(db, id, m)) n++;
  return n;
}

async function moveOne(db: Db, pieceId: string, m: PieceMove): Promise<boolean> {
  const run = async (tx: Tx): Promise<boolean> => {
    const [p] = await tx.$queryRaw<{ state: ErpPieceState; buyingPriceMinor: number }[]>`SELECT "state"::text AS "state", "buyingPriceMinor" FROM "ErpPipelinePiece" WHERE "id" = ${pieceId}::uuid FOR UPDATE`;
    if (!p || p.state === m.to || !canMove(p.state, m.to)) return false;
    const done = await tx.erpPipelineMove.findUnique({ where: { pieceId_cause: { pieceId, cause: m.cause } }, select: { id: true } });
    if (done) return false;
    await tx.erpPipelineMove.create({ data: { storeId: m.storeId, linkId: m.linkId, pieceId, fromState: p.state, toState: m.to, businessDate: m.businessDate, buyingPriceMinor: p.buyingPriceMinor, cause: m.cause } });
    await tx.erpPipelinePiece.update({ where: { id: pieceId }, data: { state: m.to, stateDate: m.businessDate, ...(m.sku ? { sku: m.sku } : {}) } });
    return true;
  };
  if (!('$transaction' in db)) return run(db);
  try {
    return await db.$transaction(run, TX);
  } catch (e) {
    if (isUniqueViolation(e)) return false; // the same move, written by another writer at the same moment
    throw e;
  }
}

const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The owner's checks in the ERP, applied to the shop's pipeline: every stored `return.parcel.resolved` and
 * `return.piece.decided` of the store's open link not yet moved. Approved (and approved at packing) → APPROVED, declined
 * → DECLINED, on the event's own business date; a Hold parcel's pieces that came back → WAITING_CHECK and the ones the
 * customer kept → DELIVERED; a piece returned on an exchange is the books' (its money is the exchange's). Safe to run
 * again and alongside the books: each move is once per piece and event.
 */
export async function applyReturnDecisions(deps: InventoryDeps, storeId: number): Promise<{ events: number; moved: number }> {
  const db = deps.db;
  const linkId = await openLinkIdOf(deps, storeId);
  if (!linkId) return { events: 0, moved: 0 };
  const events = await db.erpEvent.findMany({
    where: { storeId, linkId, type: { in: ['return.parcel.resolved', 'return.piece.decided'] }, status: { in: ['APPLIED', 'STORED'] } },
    orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }],
  });
  let moved = 0;
  for (const ev of events) {
    const d = (ev.data ?? {}) as Record<string, unknown>;
    const date = ev.businessDate ?? dateOnly(ev.receivedAt);
    if (ev.type === 'return.parcel.resolved') {
      const ext = textOf(d.externalOrderId);
      if (!ext) continue;
      // the parcel's own lines (pieces still coming back) on this order
      const returning = await db.erpPipelinePiece.findMany({ where: { storeId, linkId, externalOrderId: ext, state: 'RETURNING', exchangeId: null }, select: { lineId: true } });
      const back = new Set((Array.isArray(d.pieces) ? d.pieces : []).map((x) => textOf((x as Record<string, unknown>)?.lineId)).filter((x): x is string => !!x));
      const missing = d.result === 'PARCEL_MISSING';
      const came = returning.map((r) => r.lineId).filter((l) => back.has(l) || missing);
      const kept = missing ? [] : returning.map((r) => r.lineId).filter((l) => !back.has(l));
      moved += await movePipelinePieces(db, { storeId, linkId, lineIds: came, to: 'WAITING_CHECK', businessDate: date, cause: ev.eventId });
      moved += await movePipelinePieces(db, { storeId, linkId, lineIds: kept, to: 'DELIVERED', businessDate: date, cause: ev.eventId });
      continue;
    }
    if (ev.reversedBy) continue;
    if (textOf(d.exchangeId)) continue;
    const lineId = textOf(d.lineId);
    if (!lineId) continue;
    const decision = d.decision;
    const to: ErpPieceState | null = decision === 'APPROVED' || decision === 'APPROVED_AT_PACKING' ? 'APPROVED' : decision === 'DECLINED' ? 'DECLINED' : null;
    if (decision === 'DIFFERENT_PIECE') {
      // the ERP names the piece that really came back: the record follows it, no money and no move (§2.5.4)
      const sku = textOf(d.sku);
      if (sku) await db.erpPipelinePiece.updateMany({ where: { storeId, linkId, lineId, exchangeId: null }, data: { sku } });
      continue;
    }
    if (!to) continue;
    // A piece in Return stock that was sent on a new order and passed at packing was never handed back on this link's
    // records as WAITING_CHECK when it was sold again; the move from wherever it is follows the allowed moves.
    moved += await movePipelinePieces(db, { storeId, linkId, lineIds: [lineId], to, businessDate: date, cause: ev.eventId });
  }
  return { events: events.length, moved };
}

// ---- PR 614 · exchanges ------------------------------------------------------------------------------------------------

export type ExchangeOrderSend = { ok: true; answer: ErpOrderAnswer; replayed: boolean } | ({ ok: false } & ErpRefusal);

/** `POST /orders` for an exchange (§2.10.2): `key` changes only after a refusal (a retry after stock is a new key). */
export async function sendExchangeOrderToErp(deps: InventoryDeps, storeId: number, body: ErpSalesOrderV6, key: string): Promise<ExchangeOrderSend> {
  if (!body.exchange) throw new InventoryError('INVALID_INPUT', 'an exchange order names the order it exchanges', ['exchange']);
  const path = await returnsV6Path(deps, storeId);
  if (!path.go) throw new InventoryError(path.reason === 'ERP_NONE' ? 'ERP_NOT_CONNECTED' : 'ERP_UNAVAILABLE', path.text, [path.reason]);
  try {
    const r = (await callErp(deps, await retryPolicy(deps), (o) => path.api.push({ type: 'order.create', body }, { ...o, idempotencyKey: key }))).value;
    const parsed = erpOrderAnswerSchema.safeParse(r.body);
    if (!parsed.success) return { ok: false, code: 'BAD_RESPONSE', status: r.status, details: null, retryable: true, text: 'BAD_RESPONSE: the answer to the exchange order breaks the contract' };
    return { ok: true, answer: parsed.data, replayed: r.replayed };
  } catch (e) {
    return { ok: false, ...refusalOf(e) };
  }
}

/** The ERP's live free pieces of one SKU, every warehouse (main stock and unchecked Return stock, as the ERP sells them). */
export async function erpLiveAvailable(deps: InventoryDeps, storeId: number, sku: string): Promise<number> {
  const path = await returnsV6Path(deps, storeId);
  if (!path.go) throw new InventoryError(path.reason === 'ERP_NONE' ? 'ERP_NOT_CONNECTED' : 'ERP_UNAVAILABLE', path.text, [path.reason]);
  const rows = (await callErp(deps, await retryPolicy(deps), (o) => path.api.stockForSku(sku, o))).value;
  return rows.filter((r) => r.sku.trim().toUpperCase() === sku.trim().toUpperCase()).reduce((s, r) => s + Math.max(0, r.available), 0);
}

/** `GET /exchanges?status=` (every page), with the total at risk in minor units. */
export async function readErpExchanges(deps: InventoryDeps, storeId: number, q: { status: 'pending' | 'all'; updatedSince?: Date | null }): Promise<{ items: ErpExchange[]; totalAtRiskMinor: number; digits: number }> {
  const path = await returnsV6Path(deps, storeId);
  if (!path.go) throw new InventoryError(path.reason === 'ERP_NONE' ? 'ERP_NOT_CONNECTED' : 'ERP_UNAVAILABLE', path.text, [path.reason]);
  const reads = path.api.v6;
  if (!reads) throw new InventoryError('ERP_UNAVAILABLE', 'this ERP connection has no v6 reads');
  const [policy, pageSize, maxPages, digits] = await Promise.all([retryPolicy(deps), deps.settings.value('erp.sync.pageSize'), deps.settings.value('erp.sync.maxPagesPerRun'), digitsOf(deps.db, storeId)]);
  const items: ErpExchange[] = [];
  let total = 0;
  let cursor: string | null = null;
  for (let pages = 0; pages < maxPages; pages++) {
    const page = (await callErp(deps, policy, (o) => reads.exchanges({ status: q.status, updatedSince: q.updatedSince ?? null, cursor, limit: pageSize }, o))).value;
    items.push(...page.items);
    if (pages === 0) total = erpMinor(page.totalAtRisk, digits) ?? 0;
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return { items, totalAtRiskMinor: total, digits };
}

/** `POST /exchanges/{exchangeId}/late-return` (§2.10.3): the old piece came back late with no matching consignment. */
export async function sendLateReturnToErp(deps: InventoryDeps, storeId: number, erpExchangeId: string, body: ErpLateReturn): Promise<{ ok: true; answer: unknown } | ({ ok: false } & ErpRefusal)> {
  const path = await returnsV6Path(deps, storeId);
  if (!path.go) throw new InventoryError(path.reason === 'ERP_NONE' ? 'ERP_NOT_CONNECTED' : 'ERP_UNAVAILABLE', path.text, [path.reason]);
  try {
    const r = (await callErp(deps, await retryPolicy(deps), (o) => path.api.push({ type: 'exchange.lateReturn', exchangeId: erpExchangeId, body }, { ...o, idempotencyKey: `lateReturn:${erpExchangeId}:${body.handedBackAt}` }))).value;
    return { ok: true, answer: r.body };
  } catch (e) {
    return { ok: false, ...refusalOf(e) };
  }
}

/** `GET /returns/summary?date=` (§2.9), money in minor units. */
export async function readErpReturnsSummary(deps: InventoryDeps, storeId: number, date: string): Promise<{ summary: ErpReturnsSummary; approvedCreditMinor: number; waitingCheckMinor: number }> {
  const path = await returnsV6Path(deps, storeId);
  if (!path.go) throw new InventoryError(path.reason === 'ERP_NONE' ? 'ERP_NOT_CONNECTED' : 'ERP_UNAVAILABLE', path.text, [path.reason]);
  const reads = path.api.v6;
  if (!reads) throw new InventoryError('ERP_UNAVAILABLE', 'this ERP connection has no v6 reads');
  const digits = await digitsOf(deps.db, storeId);
  const summary = (await callErp(deps, await retryPolicy(deps), (o) => reads.returnsSummary(date, o))).value;
  return { summary, approvedCreditMinor: erpMinor(summary.approvedCredit, digits) ?? 0, waitingCheckMinor: erpMinor(summary.waitingCheck, digits) ?? 0 };
}
