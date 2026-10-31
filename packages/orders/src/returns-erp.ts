// CN-028 · PR 613 (CN-029 Phase 1; docs/RETAIL-ERP-MODEL.md §6, §15; docs/erp/site-changes-v6.md §2.5, §2.9) — the
// Returns section on ERP contract v6. Read-only: the owner checks every returned piece in the ERP; the shop only shows
// what the ERP decided, from its own records (the hand-back desk's return lists, PR 612) and the ERP's events in the
// ledger (PR 608: `delivery.identified`, `return.parcel.resolved`, `return.piece.decided`, `exchange.*`).
//
// - Seven tabs: Partial deliveries · Handed back · On hold in the ERP · In ERP Return stock · Exchanges · Approved ·
//   Declined (our loss). A piece waiting for the owner shows a countdown: the courier's hand-back date plus
//   `returns.erpCheck.days`.
// - One parcel's timeline: the delivery result and its colour, the return list and consignment, the owner's tick of a
//   Hold parcel, each piece's decision with its reason and date (a reversed decision stays, struck through), the claims.
// - The losses report (`returns.losses.months`): declined pieces at the price paid to the ERP, by reason and month (a
//   piece the customer kept is no loss; an exchange's old piece is its exchange's money), billed exchanges less
//   credited ones, the courier's charge of returned parcels, and underpayments (a discount promised by phone and COD
//   not collected).
// - The courier claims: the ERP's (ErpClaim, from `GET /returns/claims` and the decisions) and the counts that differed
//   at the desk.
// - The compare with `GET /returns/summary?date=`: every night after `returns.compare.runAt` for yesterday, and when a
//   person pulls. Each run is a new row (append-only). A difference is fixed by pulling `GET /returns?updatedSince=`
//   again and comparing again — never by editing a number.
// Never here: money, a refund, a price or COD (CLAUDE.md rule 6). CN-029 §16: every read is of the store's own open ERP
// link only.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import {
  applyErpEvents,
  applyReturnDecisions,
  currencyDigits,
  erpMinor,
  InventoryError,
  isV6,
  openLinkIdOf,
  pullErpEvents,
  readErpReturnsSummary,
  storeDate,
} from '@extas/inventory';
import { allow, nowOf, parse, setting, type Db, type OrdersDeps, type Who } from './context';
import { OrdersError } from './errors';
import { requireV6 } from './legacy';
import { inventoryOf } from './service';

export const ERP_RETURN_TABS = ['partial', 'handedBack', 'hold', 'returnStock', 'exchanges', 'approved', 'declined'] as const;
export type ErpReturnTab = (typeof ERP_RETURN_TABS)[number];

/** Why a piece was declined that is the courier's to answer for (the claims list, §2.5.4). */
const CLAIM_REASONS = new Set(['PARCEL_MISSING', 'PIECE_MISSING', 'STAIN_OR_DAMAGE']);
const DAY = 86_400_000;

// ---- small helpers ---------------------------------------------------------------------------------------------------

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const dayDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number): string => ymd(new Date(dayDate(s).getTime() + n * DAY));
const daysBetween = (from: string, to: string): number => Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / DAY);
const textOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const recordOf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: bigint | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
/** An ERP amount (whole taka as a number or decimal text) in the store's minor units. */
const minorOf = (v: unknown, digits: number): number | null => (typeof v === 'number' || typeof v === 'string' ? erpMinor(String(v), digits) : null);

/** The time of day in the store's zone, `HH:MM`. */
function clockOf(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

// ---- the store's returns as the shop knows them ---------------------------------------------------------------------

interface Ctx {
  db: Db;
  storeId: number;
  linkId: string;
  digits: number;
  timeZone: string;
  today: string;
  checkDays: number;
}

type EventRow = { id: string; eventId: string; type: string; status: string; occurredAt: Date | null; businessDate: Date | null; receivedAt: Date; reverses: string | null; reversedBy: string | null; externalOrderId: string | null; data: Prisma.JsonValue };

interface ParcelRow {
  id: string;
  listId: string;
  returnListId: string;
  listStatus: string;
  courier: string;
  handedBackAt: string;
  sentAt: Date | null;
  orderId: string | null;
  externalOrderId: string;
  consignmentId: string | null;
  expectedCount: number | null;
  receivedCount: number;
  note: string | null;
  result: string | null;
  reason: string | null;
  answerPieces: { lineId: string; sku: string }[];
  countDiffers: boolean;
  claimStartedAt: Date | null;
  unexpected: boolean;
  exchange: boolean;
  scannedAt: Date;
}

/** One returned piece: in Return stock (waiting for the owner), or checked (approved or declined). */
export interface PieceState {
  lineId: string;
  externalOrderId: string;
  sku: string | null;
  state: 'IN_RETURN_STOCK' | 'APPROVED' | 'DECLINED';
  parcelId: string | null;
  consignmentId: string | null;
  courier: string | null;
  returnListId: string | null;
  handedBackAt: string | null;
  exchange: boolean;
  decision: string | null;
  reason: string | null;
  decidedAt: string | null;
  creditMinor: number;
  eventId: string | null;
}

interface HoldState {
  parcel: ParcelRow;
  pieces: number;
  resolved: EventRow | null;
}

interface State {
  parcels: ParcelRow[];
  pieces: Map<string, PieceState>;
  /** Pieces declined without their own decision: a Hold parcel the owner marked missing (one row per piece). */
  missing: PieceState[];
  holds: HoldState[];
  events: EventRow[];
}

const RETURN_EVENT_TYPES = ['delivery.identified', 'return.parcel.resolved', 'return.piece.decided', 'exchange.billed', 'exchange.settled', 'exchange.credited', 'exchange.cancelled'];

async function contextOf(deps: OrdersDeps, storeId: number): Promise<Ctx | null> {
  const linkId = await openLinkIdOf(inventoryOf(deps), storeId);
  if (!linkId) return null;
  const [store, checkDays] = await Promise.all([deps.db.store.findUniqueOrThrow({ where: { id: storeId }, select: { currency: true, timezone: true } }), setting(deps, storeId, 'returns.erpCheck.days')]);
  return { db: deps.db, storeId, linkId, digits: currencyDigits(store.currency), timeZone: store.timezone, today: storeDate(nowOf(deps), store.timezone), checkDays };
}

async function loadState(c: Ctx): Promise<State> {
  const [lists, events] = await Promise.all([
    c.db.erpReturnList.findMany({ where: { storeId: c.storeId, linkId: c.linkId }, include: { parcels: true }, orderBy: { createdAt: 'asc' } }),
    c.db.erpEvent.findMany({
      where: { storeId: c.storeId, linkId: c.linkId, type: { in: RETURN_EVENT_TYPES }, status: { in: ['APPLIED', 'STORED'] } },
      orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, eventId: true, type: true, status: true, occurredAt: true, businessDate: true, receivedAt: true, reverses: true, reversedBy: true, externalOrderId: true, data: true },
    }),
  ]);
  const parcels: ParcelRow[] = [];
  for (const l of lists)
    for (const p of l.parcels)
      parcels.push({
        id: p.id,
        listId: l.id,
        returnListId: l.returnListId,
        listStatus: l.status,
        courier: l.courier,
        handedBackAt: ymd(l.handedBackAt),
        sentAt: l.sentAt,
        orderId: p.orderId,
        externalOrderId: p.externalOrderId,
        consignmentId: p.consignmentId,
        expectedCount: p.expectedCount,
        receivedCount: p.receivedCount,
        note: p.note,
        result: p.result,
        reason: p.reason,
        answerPieces: listOf(p.answerPieces)
          .map((x) => ({ lineId: textOf(recordOf(x).lineId) ?? '', sku: textOf(recordOf(x).sku) ?? '' }))
          .filter((x) => x.lineId),
        countDiffers: p.countDiffers,
        claimStartedAt: p.claimStartedAt,
        unexpected: p.unexpected,
        exchange: !!p.exchangeLinkId,
        scannedAt: p.scannedAt,
      });

  const pieces = new Map<string, PieceState>();
  const fromParcel = (p: ParcelRow, lineId: string, sku: string | null): PieceState => ({
    lineId,
    externalOrderId: p.externalOrderId,
    sku,
    state: 'IN_RETURN_STOCK',
    parcelId: p.id,
    consignmentId: p.consignmentId,
    courier: p.courier,
    returnListId: p.returnListId,
    handedBackAt: p.handedBackAt,
    exchange: p.exchange,
    decision: null,
    reason: null,
    decidedAt: null,
    creditMinor: 0,
    eventId: null,
  });
  for (const p of parcels) if (p.result === 'IN_RETURN_STOCK') for (const x of p.answerPieces) pieces.set(x.lineId, fromParcel(p, x.lineId, x.sku || null));

  const resolvedBy = new Map<string, EventRow>();
  for (const e of events) if (e.type === 'return.parcel.resolved' && e.externalOrderId) resolvedBy.set(e.externalOrderId, e);
  const holds: HoldState[] = [];
  const missing: PieceState[] = [];
  for (const p of parcels) {
    if (p.result !== 'HOLD') continue;
    const count = p.expectedCount ?? p.receivedCount;
    const resolved = resolvedBy.get(p.externalOrderId) ?? null;
    holds.push({ parcel: p, pieces: count, resolved });
    if (!resolved) continue;
    const d = recordOf(resolved.data);
    const date = resolved.businessDate ? ymd(resolved.businessDate) : ymd(resolved.receivedAt);
    if (d.result === 'PARCEL_MISSING') {
      for (let i = 0; i < count; i++) missing.push({ ...fromParcel(p, `${p.externalOrderId}#${i + 1}`, null), state: 'DECLINED', decision: 'DECLINED', reason: 'PARCEL_MISSING', decidedAt: date, eventId: resolved.eventId });
      continue;
    }
    // the pieces that came back wait for the owner's check; the rest the customer kept (delivered after all: no loss)
    for (const x of listOf(d.pieces)) {
      const lineId = textOf(recordOf(x).lineId);
      if (lineId) pieces.set(lineId, fromParcel(p, lineId, textOf(recordOf(x).sku)));
    }
  }

  // the owner's decisions: the last one of each piece that was not undone
  for (const e of events) {
    if (e.type !== 'return.piece.decided' || e.reversedBy) continue;
    const d = recordOf(e.data);
    const lineId = textOf(d.lineId);
    if (!lineId) continue;
    const decision = textOf(d.decision);
    const had = pieces.get(lineId);
    const base: PieceState = had ?? {
      lineId,
      externalOrderId: textOf(d.externalOrderId) ?? e.externalOrderId ?? '',
      sku: textOf(d.sku),
      state: 'IN_RETURN_STOCK',
      parcelId: null,
      consignmentId: textOf(d.consignmentId),
      courier: textOf(d.courier),
      returnListId: textOf(d.returnListId),
      handedBackAt: textOf(d.handedBackAt)?.slice(0, 10) ?? null,
      exchange: false,
      decision: null,
      reason: null,
      decidedAt: null,
      creditMinor: 0,
      eventId: null,
    };
    const next: PieceState = { ...base, externalOrderId: textOf(d.externalOrderId) ?? base.externalOrderId, exchange: base.exchange || !!textOf(d.exchangeId) };
    if (decision === 'DIFFERENT_PIECE') {
      // the ERP names the piece that really came back: the record follows it, the check is still to come
      next.sku = textOf(d.sku) ?? next.sku;
    } else if (decision === 'APPROVED' || decision === 'APPROVED_AT_PACKING' || decision === 'DECLINED') {
      next.state = decision === 'DECLINED' ? 'DECLINED' : 'APPROVED';
      next.decision = decision;
      next.reason = decision === 'DECLINED' ? (textOf(d.reason) ?? 'OTHER') : null;
      next.decidedAt = textOf(d.decidedAt)?.slice(0, 10) ?? (e.businessDate ? ymd(e.businessDate) : ymd(e.receivedAt));
      next.creditMinor = decision === 'DECLINED' ? 0 : (minorOf(d.credit, c.digits) ?? 0);
      next.eventId = e.eventId;
    }
    pieces.set(lineId, next);
  }
  return { parcels, pieces, missing, holds, events };
}

const piecesOf = (p: ParcelRow): number => (p.result === 'IN_RETURN_STOCK' ? p.answerPieces.length : (p.expectedCount ?? p.receivedCount));

// ---- the counts compared with the ERP ---------------------------------------------------------------------------------

/** The shop's side of `GET /returns/summary?date=` (minor units). `waitingCheckMinor` is null until the books' pipeline runs. */
export interface ReturnsCounts {
  handedBack: number;
  onHold: number;
  inReturnStock: number;
  approved: number;
  approvedCreditMinor: number;
  declined: number;
  waitingCheckMinor: number | null;
}

async function countsOf(c: Ctx, s: State, date: string): Promise<ReturnsCounts> {
  const decided = (state: PieceState['state']) => [...s.pieces.values(), ...s.missing].filter((p) => p.state === state && p.decidedAt === date);
  const approved = decided('APPROVED');
  const openHolds = s.holds.filter((h) => !h.resolved);
  // The value waiting for the owner's check (the ERP's `waitingCheck`): the books' pipeline pieces handed back, and
  // the pieces of a Hold parcel still on their way in the pipeline. Compared only once the pipeline has pieces.
  let waitingCheckMinor: number | null = null;
  if (await c.db.erpPipelinePiece.findFirst({ where: { storeId: c.storeId, linkId: c.linkId }, select: { id: true } })) {
    const [waiting, holding] = await Promise.all([
      c.db.erpPipelinePiece.aggregate({ where: { storeId: c.storeId, linkId: c.linkId, state: 'WAITING_CHECK', exchangeId: null }, _sum: { buyingPriceMinor: true } }),
      openHolds.length
        ? c.db.erpPipelinePiece.aggregate({ where: { storeId: c.storeId, linkId: c.linkId, state: 'RETURNING', exchangeId: null, externalOrderId: { in: openHolds.map((h) => h.parcel.externalOrderId) } }, _sum: { buyingPriceMinor: true } })
        : Promise.resolve({ _sum: { buyingPriceMinor: null } }),
    ]);
    waitingCheckMinor = num(waiting._sum.buyingPriceMinor) + num(holding._sum.buyingPriceMinor);
  }
  return {
    handedBack: s.parcels.filter((p) => (p.result === 'IN_RETURN_STOCK' || p.result === 'HOLD') && p.handedBackAt === date).reduce((n, p) => n + piecesOf(p), 0),
    onHold: openHolds.reduce((n, h) => n + h.pieces, 0),
    inReturnStock: [...s.pieces.values()].filter((p) => p.state === 'IN_RETURN_STOCK').length,
    approved: approved.length,
    approvedCreditMinor: approved.reduce((n, p) => n + p.creditMinor, 0),
    declined: decided('DECLINED').length,
    waitingCheckMinor,
  };
}

export interface ReturnsCompareView {
  id: string;
  date: string;
  trigger: string;
  matched: boolean;
  shop: ReturnsCounts;
  erp: (Omit<ReturnsCounts, 'waitingCheckMinor'> & { waitingCheckMinor: number }) | null;
  differences: { field: keyof ReturnsCounts; shop: number; erp: number }[];
  error: string | null;
  ranAt: string;
}

const COMPARED: (keyof ReturnsCounts)[] = ['handedBack', 'onHold', 'inReturnStock', 'approved', 'approvedCreditMinor', 'declined', 'waitingCheckMinor'];

function compareView(r: { id: string; date: Date; trigger: string; matched: boolean; shop: Prisma.JsonValue; erp: Prisma.JsonValue; differences: Prisma.JsonValue; error: string | null; ranAt: Date }): ReturnsCompareView {
  return {
    id: r.id,
    date: ymd(r.date),
    trigger: r.trigger,
    matched: r.matched,
    shop: r.shop as unknown as ReturnsCounts,
    erp: (r.erp as unknown as ReturnsCompareView['erp']) ?? null,
    differences: (r.differences as unknown as ReturnsCompareView['differences']) ?? [],
    error: r.error,
    ranAt: r.ranAt.toISOString(),
  };
}

export type ReturnsCompareTrigger = 'night' | 'manual' | 'pull';

/**
 * Compares the shop's Returns section for one business date with the ERP's `GET /returns/summary?date=` and keeps the
 * result as a new row (append-only). The ERP cannot be asked → kept as not matched with the reason. The job's and the
 * pull's way; a person's way is `pullAndCompareReturns`.
 */
export async function compareReturns(deps: OrdersDeps, storeId: number, date: string, trigger: ReturnsCompareTrigger): Promise<ReturnsCompareView> {
  await requireV6(deps, storeId, 'the compare with the ERP');
  const day = parse(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), date, 'date');
  const c = await contextOf(deps, storeId);
  if (!c) throw new OrdersError('ERP_UNAVAILABLE', 'the store has no ERP link yet', ['erp'], { reason: 'NO_LINK' });
  const shop = await countsOf(c, await loadState(c), day);
  let erp: ReturnsCompareView['erp'] = null;
  let error: string | null = null;
  try {
    const r = await readErpReturnsSummary(inventoryOf(deps), storeId, day);
    erp = { handedBack: r.summary.handedBack, onHold: r.summary.onHold, inReturnStock: r.summary.inReturnStock, approved: r.summary.approved, approvedCreditMinor: r.approvedCreditMinor, declined: r.summary.declined, waitingCheckMinor: r.waitingCheckMinor };
  } catch (e) {
    if (!(e instanceof InventoryError) && !(e instanceof OrdersError)) throw e;
    error = `${e.code}: ${e.message}`;
  }
  const differences: ReturnsCompareView['differences'] = [];
  if (erp)
    for (const field of COMPARED) {
      const a = shop[field];
      if (a === null) continue;
      if (a !== erp[field]) differences.push({ field, shop: a, erp: erp[field] });
    }
  const row = await deps.db.erpReturnsCompare.create({
    data: {
      storeId,
      linkId: c.linkId,
      date: dayDate(day),
      trigger,
      matched: !!erp && !differences.length,
      shop: shop as unknown as Prisma.InputJsonValue,
      ...(erp ? { erp: erp as unknown as Prisma.InputJsonValue } : {}),
      differences: differences as unknown as Prisma.InputJsonValue,
      error,
      ranAt: nowOf(deps),
    },
  });
  return compareView(row);
}

export const pullCompareInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();

/**
 * Pulls the ERP's returns again (`GET /returns?updatedSince=`, the exchanges and the claims), applies the events and
 * the owner's decisions, and compares the day again (today by default). The only way to fix a difference. Needs
 * `returns.view`.
 */
export async function pullAndCompareReturns(deps: OrdersDeps, who: Who, input: unknown = {}): Promise<ReturnsCompareView> {
  await allow(deps, who, 'returns.view');
  await requireV6(deps, who.storeId, 'the compare with the ERP');
  const d = parse(pullCompareInput, input, 'compare');
  await pullAgain(deps, who.storeId);
  const c = await contextOf(deps, who.storeId);
  return compareReturns(deps, who.storeId, d.date ?? c?.today ?? ymd(nowOf(deps)), 'pull');
}

async function pullAgain(deps: OrdersDeps, storeId: number): Promise<void> {
  const inv = inventoryOf(deps);
  const pulled = await pullErpEvents(inv, { storeId });
  if (pulled.status === 'failed') throw new OrdersError('ERP_UNAVAILABLE', pulled.error?.text ?? 'the ERP could not be reached', ['erp'], { reason: pulled.error?.code ?? 'PULL_FAILED' });
  await applyErpEvents(inv);
  await applyReturnDecisions(inv, storeId);
}

/** The last compare of the store's open link (null: none yet). Needs `returns.view`. */
export async function latestReturnsCompare(deps: OrdersDeps, who: Who): Promise<ReturnsCompareView | null> {
  await allow(deps, who, 'returns.view');
  const linkId = await openLinkIdOf(inventoryOf(deps), who.storeId);
  if (!linkId) return null;
  const r = await deps.db.erpReturnsCompare.findFirst({ where: { storeId: who.storeId, linkId }, orderBy: [{ ranAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] });
  return r ? compareView(r) : null;
}

/**
 * The job's nightly compare: once the store's clock passed `returns.compare.runAt`, yesterday is compared once; a
 * difference is pulled again and compared again. Null: not the time yet, already done, or no ERP link.
 */
export async function nightlyReturnsCompare(deps: OrdersDeps, storeId: number): Promise<ReturnsCompareView | null> {
  const c = await contextOf(deps, storeId);
  if (!c) return null;
  const runAt = await setting(deps, storeId, 'returns.compare.runAt');
  if (clockOf(nowOf(deps), c.timeZone) < runAt) return null;
  const yesterday = addDays(c.today, -1);
  if (await deps.db.erpReturnsCompare.findFirst({ where: { storeId, linkId: c.linkId, date: dayDate(yesterday), trigger: 'night' }, select: { id: true } })) return null;
  const night = await compareReturns(deps, storeId, yesterday, 'night');
  if (night.matched || night.error) return night;
  try {
    await pullAgain(deps, storeId);
  } catch (e) {
    if (e instanceof OrdersError) return night;
    throw e;
  }
  return compareReturns(deps, storeId, yesterday, 'pull');
}

// ---- the tabs --------------------------------------------------------------------------------------------------------

/** One row of a tab: a parcel (partial, handed back, hold), a piece (Return stock, approved, declined) or an exchange. */
export interface ErpReturnRow {
  key: string;
  orderId: string | null;
  orderNumber: string | null;
  externalOrderId: string;
  consignmentId: string | null;
  courier: string | null;
  /** The hand-back desk's list (ErpReturnList.id) and its id as the ERP has it. */
  listId: string | null;
  returnListId: string | null;
  lineId: string | null;
  sku: string | null;
  pieces: number;
  /** PARTIAL; IN_RETURN_STOCK, HOLD, REFUSED, WAITING (not answered yet); APPROVED, DECLINED; the exchange's ERP status. */
  state: string;
  reason: string | null;
  /** The ERP's identification of a delivery result: GREEN, YELLOW, ORANGE. */
  colour: string | null;
  keptPieces: number | null;
  handedBackAt: string | null;
  decidedAt: string | null;
  /** The owner's check is due by (hand-back + `returns.erpCheck.days`), or the exchange's return watch. */
  dueOn: string | null;
  daysLeft: number | null;
  /** The piece at the price paid to the ERP, or an exchange's value at risk (minor units). */
  valueMinor: number | null;
  creditMinor: number | null;
  claim: boolean;
  countDiffers: boolean;
  exchange: boolean;
  /** CN-033: an exchange whose parcel the customer refused: the ERP waits for the NEW piece (a deadline, no delivery day). */
  newPiece: boolean;
  note: string | null;
  at: string | null;
}

export interface ReturnsErpOverview {
  model: 'v5' | 'v6';
  linked: boolean;
  today: string;
  checkDays: number;
  tab: ErpReturnTab;
  counts: Record<ErpReturnTab, number>;
  /** Pieces past the owner's check date. */
  overdue: number;
  rows: ErpReturnRow[];
  compare: ReturnsCompareView | null;
}

export const overviewInput = z.object({ tab: z.enum(ERP_RETURN_TABS).default('handedBack'), take: z.int().min(1).max(500).default(200) }).strict();

const blankRow = (key: string, externalOrderId: string): ErpReturnRow => ({
  key,
  orderId: null,
  orderNumber: null,
  externalOrderId,
  consignmentId: null,
  courier: null,
  listId: null,
  returnListId: null,
  lineId: null,
  sku: null,
  pieces: 0,
  state: '',
  reason: null,
  colour: null,
  keptPieces: null,
  handedBackAt: null,
  decidedAt: null,
  dueOn: null,
  daysLeft: null,
  valueMinor: null,
  creditMinor: null,
  claim: false,
  countDiffers: false,
  exchange: false,
  newPiece: false,
  note: null,
  at: null,
});

interface Lookups {
  orderOf: Map<string, { orderId: string; number: string | null }>;
  lineOf: Map<string, { shopPriceMinor: number | null; externalOrderId: string }>;
  pipeOf: Map<string, number>;
  claimOf: Map<string, { status: string; valueMinor: number | null }>;
}

async function lookups(c: Ctx, exts: string[], lineIds: string[]): Promise<Lookups> {
  const [orders, lines, pipe, claims] = await Promise.all([
    exts.length ? c.db.erpOrder.findMany({ where: { storeId: c.storeId, linkId: c.linkId, externalOrderId: { in: exts } }, select: { orderId: true, externalOrderId: true } }) : [],
    lineIds.length ? c.db.erpOrderLine.findMany({ where: { storeId: c.storeId, lineId: { in: lineIds }, erpOrder: { linkId: c.linkId } }, select: { lineId: true, shopPriceMinor: true, erpOrder: { select: { externalOrderId: true } } } }) : [],
    lineIds.length ? c.db.erpPipelinePiece.findMany({ where: { storeId: c.storeId, linkId: c.linkId, lineId: { in: lineIds } }, select: { lineId: true, buyingPriceMinor: true } }) : [],
    exts.length ? c.db.erpClaim.findMany({ where: { storeId: c.storeId, linkId: c.linkId, externalOrderId: { in: exts } }, select: { externalOrderId: true, lineId: true, status: true, valueMinor: true } }) : [],
  ]);
  const ids = [...new Set(orders.map((o) => o.orderId))];
  const numbers = ids.length ? await c.db.order.findMany({ where: { storeId: c.storeId, id: { in: ids } }, select: { id: true, number: true } }) : [];
  const numberOf = new Map(numbers.map((o) => [o.id, o.number]));
  return {
    orderOf: new Map(orders.map((o) => [o.externalOrderId, { orderId: o.orderId, number: numberOf.get(o.orderId) ?? null }])),
    lineOf: new Map(lines.map((l) => [l.lineId, { shopPriceMinor: l.shopPriceMinor, externalOrderId: l.erpOrder.externalOrderId }])),
    pipeOf: new Map(pipe.map((p) => [p.lineId, p.buyingPriceMinor])),
    claimOf: new Map(claims.map((x) => [`${x.externalOrderId}|${x.lineId}`, { status: x.status, valueMinor: x.valueMinor === null ? null : Number(x.valueMinor) }])),
  };
}

/** What Retail paid the ERP for the piece: the shop price on the order, else the pipeline's, else the claim's. */
function pricePaid(l: Lookups, p: PieceState): number | null {
  return l.lineOf.get(p.lineId)?.shopPriceMinor ?? l.pipeOf.get(p.lineId) ?? l.claimOf.get(`${p.externalOrderId}|${p.lineId}`)?.valueMinor ?? null;
}

function withOrder(l: Lookups, r: ErpReturnRow): ErpReturnRow {
  const o = l.orderOf.get(r.externalOrderId);
  return o ? { ...r, orderId: r.orderId ?? o.orderId, orderNumber: o.number } : r;
}

function countdown(c: Ctx, handedBackAt: string | null): { dueOn: string | null; daysLeft: number | null } {
  if (!handedBackAt) return { dueOn: null, daysLeft: null };
  const dueOn = addDays(handedBackAt, c.checkDays);
  return { dueOn, daysLeft: daysBetween(c.today, dueOn) };
}

interface PartialRow {
  externalOrderId: string;
  consignmentId: string | null;
  colour: string | null;
  kept: number | null;
  back: number;
  at: string | null;
  orderId: string | null;
}

/** The partial deliveries: the ERP's latest delivery result of each order (and the shop's own sent results, PR 611). */
async function partials(c: Ctx, s: State): Promise<PartialRow[]> {
  const latest = new Map<string, EventRow>();
  for (const e of s.events) if (e.type === 'delivery.identified' && e.externalOrderId && !e.reversedBy) latest.set(e.externalOrderId, e);
  const out = new Map<string, PartialRow>();
  for (const [ext, e] of latest) {
    const d = recordOf(e.data);
    if (d.status !== 'PARTIAL') continue;
    out.set(ext, { externalOrderId: ext, consignmentId: null, colour: textOf(d.identification), kept: listOf(d.keptLines).length, back: listOf(d.returnedLines).length, at: (e.occurredAt ?? e.receivedAt).toISOString(), orderId: null });
  }
  const results = await c.db.erpDeliveryResult.findMany({
    where: { storeId: c.storeId, erpOrder: { linkId: c.linkId } },
    orderBy: { at: 'asc' },
    select: { outcome: true, consignmentId: true, keptLineIds: true, at: true, erpOrder: { select: { externalOrderId: true, orderId: true, identification: true, _count: { select: { lines: true } } } } },
  });
  const last = new Map<string, (typeof results)[number]>();
  for (const r of results) last.set(r.erpOrder.externalOrderId, r);
  for (const [ext, r] of last) {
    if (r.outcome !== 'PARTIAL') {
      if (latest.get(ext) && (latest.get(ext)!.occurredAt ?? latest.get(ext)!.receivedAt) < r.at) out.delete(ext);
      continue;
    }
    const had = out.get(ext);
    out.set(ext, {
      externalOrderId: ext,
      consignmentId: r.consignmentId,
      colour: had?.colour ?? r.erpOrder.identification,
      kept: had?.kept ?? r.keptLineIds.length,
      back: had?.back ?? Math.max(0, r.erpOrder._count.lines - r.keptLineIds.length),
      at: had?.at ?? r.at.toISOString(),
      orderId: r.erpOrder.orderId,
    });
  }
  return [...out.values()].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

function pieceRow(c: Ctx, l: Lookups, p: PieceState): ErpReturnRow {
  const due = p.state === 'IN_RETURN_STOCK' ? countdown(c, p.handedBackAt) : { dueOn: null, daysLeft: null };
  const claimed = l.claimOf.get(`${p.externalOrderId}|${p.lineId}`) ?? l.claimOf.get(`${p.externalOrderId}|`);
  return withOrder(l, {
    ...blankRow(`piece:${p.lineId}`, p.externalOrderId),
    consignmentId: p.consignmentId,
    courier: p.courier,
    returnListId: p.returnListId,
    lineId: p.lineId.includes('#') ? null : p.lineId,
    sku: p.sku,
    pieces: 1,
    state: p.state,
    reason: p.reason,
    handedBackAt: p.handedBackAt,
    decidedAt: p.decidedAt,
    ...due,
    valueMinor: p.exchange ? null : pricePaid(l, p),
    creditMinor: p.state === 'APPROVED' ? p.creditMinor : null,
    claim: p.state === 'DECLINED' && !!p.reason && CLAIM_REASONS.has(p.reason) && (!claimed || claimed.status === 'OPEN'),
    exchange: p.exchange,
  });
}

/** The seven tabs of the Returns section (counts of each, rows of one) and the last compare. Needs `returns.view`. */
export async function returnsErpOverview(deps: OrdersDeps, who: Who, input: unknown = {}): Promise<ReturnsErpOverview> {
  const q = parse(overviewInput, input, 'tab');
  await allow(deps, who, 'returns.view');
  const v6 = await isV6(deps, who.storeId);
  const checkDays = await setting(deps, who.storeId, 'returns.erpCheck.days');
  const zero = Object.fromEntries(ERP_RETURN_TABS.map((t) => [t, 0])) as Record<ErpReturnTab, number>;
  const c = v6 ? await contextOf(deps, who.storeId) : null;
  if (!c) return { model: v6 ? 'v6' : 'v5', linked: false, today: ymd(nowOf(deps)), checkDays, tab: q.tab, counts: zero, overdue: 0, rows: [], compare: null };

  const s = await loadState(c);
  const all = [...s.pieces.values(), ...s.missing];
  const [parts, exchanges, compare] = await Promise.all([
    partials(c, s),
    c.db.erpExchangeLink.findMany({ where: { storeId: c.storeId, linkId: c.linkId }, orderBy: { createdAt: 'desc' } }),
    latestReturnsCompare(deps, who),
  ]);
  const handed = s.parcels.slice().reverse();
  const openHolds = s.holds.filter((h) => !h.resolved);
  const inStock = all.filter((p) => p.state === 'IN_RETURN_STOCK');
  const approved = all.filter((p) => p.state === 'APPROVED');
  const declined = all.filter((p) => p.state === 'DECLINED');
  const counts: Record<ErpReturnTab, number> = {
    partial: parts.length,
    handedBack: handed.length,
    hold: openHolds.length,
    returnStock: inStock.length,
    exchanges: exchanges.filter((x) => !x.finishedAt).length,
    approved: approved.length,
    declined: declined.length,
  };
  const overdue = [...inStock.map((p) => p.handedBackAt), ...openHolds.map((h) => h.parcel.handedBackAt)].filter((d) => d && (countdown(c, d).daysLeft ?? 0) < 0).length;

  const byDecided = (a: PieceState, b: PieceState) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '') || a.lineId.localeCompare(b.lineId);
  let rows: ErpReturnRow[] = [];
  const pick = <T>(xs: T[]) => xs.slice(0, q.take);
  if (q.tab === 'partial') {
    const chosen = pick(parts);
    const l = await lookups(c, chosen.map((p) => p.externalOrderId), []);
    rows = chosen.map((p) => withOrder(l, { ...blankRow(`partial:${p.externalOrderId}`, p.externalOrderId), orderId: p.orderId, consignmentId: p.consignmentId, state: 'PARTIAL', colour: p.colour, keptPieces: p.kept, pieces: p.back, at: p.at }));
  } else if (q.tab === 'handedBack') {
    const chosen = pick(handed);
    const l = await lookups(c, chosen.map((p) => p.externalOrderId), []);
    rows = chosen.map((p) =>
      withOrder(l, {
        ...blankRow(`parcel:${p.id}`, p.externalOrderId),
        orderId: p.orderId,
        consignmentId: p.consignmentId,
        courier: p.courier,
        listId: p.listId,
        returnListId: p.returnListId,
        pieces: p.result ? piecesOf(p) : p.receivedCount,
        state: p.result ?? 'WAITING',
        reason: p.reason,
        handedBackAt: p.handedBackAt,
        countDiffers: p.countDiffers,
        claim: !!p.claimStartedAt,
        exchange: p.exchange,
        note: p.note,
        at: p.scannedAt.toISOString(),
      }),
    );
  } else if (q.tab === 'hold') {
    const chosen = pick(openHolds.slice().sort((a, b) => a.parcel.handedBackAt.localeCompare(b.parcel.handedBackAt)));
    const l = await lookups(c, chosen.map((h) => h.parcel.externalOrderId), []);
    rows = chosen.map((h) =>
      withOrder(l, {
        ...blankRow(`hold:${h.parcel.id}`, h.parcel.externalOrderId),
        orderId: h.parcel.orderId,
        consignmentId: h.parcel.consignmentId,
        courier: h.parcel.courier,
        listId: h.parcel.listId,
        returnListId: h.parcel.returnListId,
        pieces: h.pieces,
        state: 'HOLD',
        handedBackAt: h.parcel.handedBackAt,
        ...countdown(c, h.parcel.handedBackAt),
        note: h.parcel.note,
        at: h.parcel.scannedAt.toISOString(),
      }),
    );
  } else if (q.tab === 'exchanges') {
    const chosen = pick(exchanges);
    const l = await lookups(c, chosen.map((x) => x.ofExternalOrderId), []);
    rows = chosen.map((x) => {
      const due = x.returnWatchUntil ? ymd(x.returnWatchUntil) : x.deadline ? ymd(x.deadline) : null;
      return withOrder(l, {
        ...blankRow(`exchange:${x.id}`, x.ofExternalOrderId),
        state: x.erpStatus ?? (x.lastRefusal ? `REFUSED:${x.lastRefusal}` : 'NOT_SENT'),
        reason: x.lastRefusal,
        dueOn: due,
        daysLeft: due ? daysBetween(c.today, due) : null,
        valueMinor: x.valueAtRiskMinor === null ? null : Number(x.valueAtRiskMinor),
        exchange: true,
        newPiece: !!x.deadline && !x.newDeliveredAt,
        note: x.newExternalOrderId,
        claim: !!x.lateReturnMarkedAt,
        at: x.createdAt.toISOString(),
      });
    });
  } else {
    const chosen = pick(q.tab === 'returnStock' ? inStock.slice().sort((a, b) => (a.handedBackAt ?? '').localeCompare(b.handedBackAt ?? '') || a.lineId.localeCompare(b.lineId)) : (q.tab === 'approved' ? approved : declined).slice().sort(byDecided));
    const l = await lookups(c, [...new Set(chosen.map((p) => p.externalOrderId))], chosen.map((p) => p.lineId));
    rows = chosen.map((p) => pieceRow(c, l, p));
  }
  return { model: 'v6', linked: true, today: c.today, checkDays: c.checkDays, tab: q.tab, counts, overdue, rows, compare };
}

// ---- one parcel's timeline -----------------------------------------------------------------------------------------

export interface TimelineItem {
  at: string;
  kind: 'delivery' | 'deliveryResult' | 'handedBack' | 'erpAnswer' | 'deskClaim' | 'ownerTick' | 'decided' | 'courierClaim' | 'exchange';
  result?: string | null;
  colour?: string | null;
  reason?: string | null;
  returnListId?: string | null;
  consignmentId?: string | null;
  courier?: string | null;
  lineId?: string | null;
  sku?: string | null;
  decision?: string | null;
  creditMinor?: number | null;
  valueMinor?: number | null;
  reversed?: boolean;
  eventId?: string | null;
  pieces?: number | null;
  expected?: number | null;
  counted?: number | null;
  note?: string | null;
}

export interface ParcelTimeline {
  externalOrderId: string;
  orderId: string | null;
  orderNumber: string | null;
  consignmentId: string | null;
  items: TimelineItem[];
  /** Each returned piece as it stands now, with the countdown while it waits. */
  pieces: ErpReturnRow[];
}

/**
 * One parcel from the delivery result to the owner's last decision (by consignment, order number or the ERP's order
 * id). Read-only: nothing here can be changed; a wrong decision is put right in the ERP. Null: not this store's.
 * Needs `returns.view`.
 */
export async function parcelTimeline(deps: OrdersDeps, who: Who, ref: string): Promise<ParcelTimeline | null> {
  await allow(deps, who, 'returns.view');
  const code = parse(z.string().trim().min(1).max(100), ref, 'parcel');
  if (!(await isV6(deps, who.storeId))) return null;
  const c = await contextOf(deps, who.storeId);
  if (!c) return null;
  const s = await loadState(c);
  const lower = code.toLowerCase();
  let ext: string | null = s.parcels.find((p) => p.consignmentId?.toLowerCase() === lower || p.externalOrderId.toLowerCase() === lower)?.externalOrderId ?? null;
  if (!ext) {
    const o = await c.db.erpOrder.findFirst({ where: { storeId: c.storeId, linkId: c.linkId, OR: [{ externalOrderId: code }, { consignmentId: code }] }, select: { externalOrderId: true } });
    ext = o?.externalOrderId ?? null;
  }
  if (!ext) {
    const o = await c.db.order.findFirst({ where: { storeId: c.storeId, number: { equals: code, mode: 'insensitive' } }, select: { id: true } });
    if (o) ext = (await c.db.erpOrder.findFirst({ where: { storeId: c.storeId, linkId: c.linkId, orderId: o.id }, select: { externalOrderId: true } }))?.externalOrderId ?? null;
  }
  if (!ext) return null;

  const parcels = s.parcels.filter((p) => p.externalOrderId === ext);
  const own = await c.db.erpOrderLine.findMany({ where: { storeId: c.storeId, erpOrder: { linkId: c.linkId, externalOrderId: ext } }, select: { lineId: true } });
  const lineIds = new Set([...own.map((x) => x.lineId), ...parcels.flatMap((p) => p.answerPieces.map((x) => x.lineId))]);
  const l = await lookups(c, [ext], [...lineIds]);
  const items: TimelineItem[] = [];
  const when = (e: EventRow) => (e.occurredAt ?? e.receivedAt).toISOString();

  for (const e of s.events) {
    const d = recordOf(e.data);
    if (e.type === 'delivery.identified' && e.externalOrderId === ext) items.push({ at: when(e), kind: 'delivery', result: textOf(d.status), colour: textOf(d.identification), pieces: listOf(d.keptLines).length, eventId: e.eventId, reversed: !!e.reversedBy });
    else if (e.type === 'return.parcel.resolved' && e.externalOrderId === ext) items.push({ at: when(e), kind: 'ownerTick', result: textOf(d.result), pieces: listOf(d.pieces).length, eventId: e.eventId, consignmentId: textOf(d.consignmentId) });
    else if (e.type === 'return.piece.decided' && (e.externalOrderId === ext || lineIds.has(textOf(d.lineId) ?? ''))) {
      const decision = textOf(d.decision);
      items.push({ at: when(e), kind: 'decided', lineId: textOf(d.lineId), sku: textOf(d.sku), decision, reason: textOf(d.reason), creditMinor: decision === 'DECLINED' ? 0 : minorOf(d.credit, c.digits), reversed: !!e.reversedBy, eventId: e.eventId });
    } else if (e.type.startsWith('exchange.') && e.externalOrderId === ext) items.push({ at: when(e), kind: 'exchange', result: e.type.slice('exchange.'.length), reason: textOf(d.reason) ?? textOf(d.kind), valueMinor: minorOf(d.amount, c.digits), eventId: e.eventId, reversed: !!e.reversedBy });
  }
  const results = await c.db.erpDeliveryResult.findMany({ where: { storeId: c.storeId, erpOrder: { linkId: c.linkId, externalOrderId: ext } }, orderBy: { at: 'asc' }, select: { outcome: true, courier: true, consignmentId: true, collectedMinor: true, discountGivenMinor: true, keptLineIds: true, note: true, at: true } });
  for (const r of results) items.push({ at: r.at.toISOString(), kind: 'deliveryResult', result: r.outcome, courier: r.courier, consignmentId: r.consignmentId, valueMinor: num(r.collectedMinor), pieces: r.keptLineIds.length, note: r.note });
  for (const p of parcels) {
    items.push({ at: p.scannedAt.toISOString(), kind: 'handedBack', returnListId: p.returnListId, consignmentId: p.consignmentId, courier: p.courier, expected: p.expectedCount, counted: p.receivedCount, note: p.note });
    if (p.claimStartedAt) items.push({ at: p.claimStartedAt.toISOString(), kind: 'deskClaim', returnListId: p.returnListId, consignmentId: p.consignmentId, expected: p.expectedCount, counted: p.receivedCount, note: p.note });
    if (p.result) items.push({ at: (p.sentAt ?? p.scannedAt).toISOString(), kind: 'erpAnswer', result: p.result, reason: p.reason, returnListId: p.returnListId, consignmentId: p.consignmentId, pieces: piecesOf(p) });
  }
  const claims = await c.db.erpClaim.findMany({ where: { storeId: c.storeId, linkId: c.linkId, externalOrderId: ext }, orderBy: { firstSeenAt: 'asc' } });
  for (const x of claims) items.push({ at: x.firstSeenAt.toISOString(), kind: 'courierClaim', lineId: x.lineId || null, sku: x.sku, reason: x.reason, result: x.status, valueMinor: x.valueMinor === null ? null : Number(x.valueMinor), courier: x.courier, consignmentId: x.consignmentId });
  items.sort((a, b) => a.at.localeCompare(b.at));

  const now = [...s.pieces.values(), ...s.missing].filter((p) => p.externalOrderId === ext || lineIds.has(p.lineId));
  const order = l.orderOf.get(ext);
  return { externalOrderId: ext, orderId: order?.orderId ?? null, orderNumber: order?.number ?? null, consignmentId: parcels.at(-1)?.consignmentId ?? null, items, pieces: now.map((p) => pieceRow(c, l, p)) };
}

// ---- the losses report -----------------------------------------------------------------------------------------------

export interface LossPart {
  count: number;
  valueMinor: number;
  /** Rows whose value the shop does not know (no price on record). */
  unknownValue: number;
}

export interface LossMonth {
  /** `YYYY-MM`, the store's own calendar. */
  month: string;
  declined: LossPart & { byReason: Record<string, { count: number; valueMinor: number }> };
  /** Billed exchanges less the ones credited back (the old piece declined or not back in time). */
  exchangeBilledMinor: number;
  exchangeCreditedMinor: number;
  deliveryCharges: LossPart;
  underpaid: { count: number; valueMinor: number };
  totalMinor: number;
}

export interface ReturnsLosses {
  model: 'v5' | 'v6';
  months: LossMonth[];
  totals: { declinedMinor: number; exchangeNetMinor: number; deliveryChargesMinor: number; underpaidMinor: number; totalMinor: number };
}

const LOSS_TOTALS = ['declinedMinor', 'exchangeNetMinor', 'deliveryChargesMinor', 'underpaidMinor', 'totalMinor'] as const;
const monthOf = (d: string): string => d.slice(0, 7);
function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * What returns cost the store, month by month (`returns.losses.months`): declined pieces at the price paid to the ERP
 * (by reason; a piece the customer kept is no loss and an exchange's old piece is its exchange's money), billed
 * exchanges less credited ones, the courier's charge of returned parcels, and underpayments. Needs `returns.view`.
 */
export async function returnsLosses(deps: OrdersDeps, who: Who): Promise<ReturnsLosses> {
  await allow(deps, who, 'returns.view');
  const n = await setting(deps, who.storeId, 'returns.losses.months');
  const v6 = await isV6(deps, who.storeId);
  const c = v6 ? await contextOf(deps, who.storeId) : null;
  const months = lastMonths(c?.today ?? ymd(nowOf(deps)), n);
  const blank = (month: string): LossMonth => ({ month, declined: { count: 0, valueMinor: 0, unknownValue: 0, byReason: {} }, exchangeBilledMinor: 0, exchangeCreditedMinor: 0, deliveryCharges: { count: 0, valueMinor: 0, unknownValue: 0 }, underpaid: { count: 0, valueMinor: 0 }, totalMinor: 0 });
  const by = new Map(months.map((m) => [m, blank(m)]));
  const totals = Object.fromEntries(LOSS_TOTALS.map((k) => [k, 0])) as ReturnsLosses['totals'];
  if (!c) return { model: v6 ? 'v6' : 'v5', months: [...by.values()], totals };
  const from = `${months[0]}-01`;

  const s = await loadState(c);
  const declined = [...s.pieces.values(), ...s.missing].filter((p) => p.state === 'DECLINED' && !p.exchange && p.decidedAt && p.decidedAt >= from);
  const l = await lookups(c, [...new Set(declined.map((p) => p.externalOrderId))], declined.map((p) => p.lineId));
  for (const p of declined) {
    const m = by.get(monthOf(p.decidedAt!));
    if (!m) continue;
    const reason = p.reason ?? 'OTHER';
    // a Hold parcel marked missing has no lines of its own: its claim rows carry the value
    const value = p.lineId.includes('#') ? null : pricePaid(l, p);
    m.declined.count++;
    if (value === null) m.declined.unknownValue++;
    else m.declined.valueMinor += value;
    const r = (m.declined.byReason[reason] ??= { count: 0, valueMinor: 0 });
    r.count++;
    r.valueMinor += value ?? 0;
  }
  for (const e of s.events) {
    if ((e.type !== 'exchange.billed' && e.type !== 'exchange.credited') || e.reversedBy) continue;
    const date = e.businessDate ? ymd(e.businessDate) : ymd(e.receivedAt);
    const m = by.get(monthOf(date));
    if (!m) continue;
    const amount = minorOf(recordOf(e.data).amount, c.digits) ?? 0;
    if (e.type === 'exchange.billed') m.exchangeBilledMinor += amount;
    else m.exchangeCreditedMinor += amount;
  }

  // the courier's charge of a parcel that came back, and what a delivered parcel paid short
  const orderIds = (await c.db.erpOrder.findMany({ where: { storeId: c.storeId, linkId: c.linkId }, select: { orderId: true } })).map((o) => o.orderId);
  if (orderIds.length) {
    const returned = await c.db.shipment.findMany({ where: { storeId: c.storeId, orderId: { in: orderIds }, status: 'RETURNED', returnedAt: { gte: dayDate(from) } }, select: { chargeMinor: true, returnedAt: true } });
    for (const r of returned) {
      const m = by.get(monthOf(storeDate(r.returnedAt!, c.timeZone)));
      if (!m) continue;
      m.deliveryCharges.count++;
      if (r.chargeMinor === null) m.deliveryCharges.unknownValue++;
      else m.deliveryCharges.valueMinor += r.chargeMinor;
    }
  }
  const results = await c.db.erpDeliveryResult.findMany({ where: { storeId: c.storeId, erpOrder: { linkId: c.linkId }, at: { gte: dayDate(from) } }, orderBy: { at: 'asc' }, select: { erpOrderId: true, outcome: true, collectedMinor: true, discountGivenMinor: true, at: true, erpOrder: { select: { orderId: true } } } });
  const lastResult = new Map<string, (typeof results)[number]>();
  for (const r of results) lastResult.set(r.erpOrderId, r);
  const delivered = [...lastResult.values()].filter((r) => r.outcome === 'DELIVERED' || r.outcome === 'PARTIAL');
  const cods = delivered.length ? await c.db.shipment.findMany({ where: { storeId: c.storeId, orderId: { in: delivered.map((r) => r.erpOrder.orderId) } }, orderBy: { createdAt: 'asc' }, select: { orderId: true, codAmountMinor: true } }) : [];
  const codOf = new Map(cods.map((x) => [x.orderId, x.codAmountMinor]));
  for (const r of delivered) {
    const discount = num(r.discountGivenMinor);
    const short = r.outcome === 'DELIVERED' ? Math.max(0, (codOf.get(r.erpOrder.orderId) ?? 0) - discount - num(r.collectedMinor)) : 0;
    const lost = discount + short;
    if (!lost) continue;
    const m = by.get(monthOf(storeDate(r.at, c.timeZone)));
    if (!m) continue;
    m.underpaid.count++;
    m.underpaid.valueMinor += lost;
  }

  for (const m of by.values()) {
    const net = m.exchangeBilledMinor - m.exchangeCreditedMinor;
    m.totalMinor = m.declined.valueMinor + net + m.deliveryCharges.valueMinor + m.underpaid.valueMinor;
    totals.declinedMinor += m.declined.valueMinor;
    totals.exchangeNetMinor += net;
    totals.deliveryChargesMinor += m.deliveryCharges.valueMinor;
    totals.underpaidMinor += m.underpaid.valueMinor;
    totals.totalMinor += m.totalMinor;
  }
  return { model: 'v6', months: [...by.values()], totals };
}

// ---- the courier claims --------------------------------------------------------------------------------------------

export interface ReturnsClaimRow {
  id: string;
  orderId: string | null;
  orderNumber: string | null;
  externalOrderId: string;
  lineId: string | null;
  sku: string | null;
  reason: string;
  courier: string | null;
  consignmentId: string | null;
  returnListId: string | null;
  handedBackAt: string | null;
  decidedAt: string | null;
  valueMinor: number | null;
  status: string;
  source: string;
}

export interface DeskClaimRow {
  parcelId: string;
  listId: string;
  returnListId: string;
  orderId: string | null;
  orderNumber: string | null;
  externalOrderId: string;
  consignmentId: string | null;
  courier: string;
  expectedCount: number | null;
  receivedCount: number;
  note: string | null;
  claimStartedAt: string;
}

/**
 * The courier claims to work with the courier: the ERP's (a missing parcel or piece, stain or damage — from
 * `GET /returns/claims` and the owner's decisions; a reversed one is kept, marked) and the counts that differed at the
 * hand-back desk. Needs `returns.view`.
 */
export async function returnsClaims(deps: OrdersDeps, who: Who): Promise<{ model: 'v5' | 'v6'; claims: ReturnsClaimRow[]; countDiffers: DeskClaimRow[] }> {
  await allow(deps, who, 'returns.view');
  const v6 = await isV6(deps, who.storeId);
  const c = v6 ? await contextOf(deps, who.storeId) : null;
  if (!c) return { model: v6 ? 'v6' : 'v5', claims: [], countDiffers: [] };
  const [claims, desk] = await Promise.all([
    c.db.erpClaim.findMany({ where: { storeId: c.storeId, linkId: c.linkId }, orderBy: [{ status: 'asc' }, { handedBackAt: 'desc' }, { firstSeenAt: 'desc' }] }),
    c.db.erpReturnListParcel.findMany({ where: { storeId: c.storeId, claimStartedAt: { not: null }, returnList: { linkId: c.linkId } }, orderBy: { claimStartedAt: 'desc' }, include: { returnList: { select: { id: true, returnListId: true, courier: true } } } }),
  ]);
  const l = await lookups(c, [...new Set([...claims.map((x) => x.externalOrderId), ...desk.map((p) => p.externalOrderId)])], []);
  return {
    model: 'v6',
    claims: claims.map((x) => {
      const o = l.orderOf.get(x.externalOrderId);
      return {
        id: x.id,
        orderId: o?.orderId ?? null,
        orderNumber: o?.number ?? null,
        externalOrderId: x.externalOrderId,
        lineId: x.lineId || null,
        sku: x.sku,
        reason: x.reason,
        courier: x.courier,
        consignmentId: x.consignmentId,
        returnListId: x.returnListId,
        handedBackAt: x.handedBackAt ? ymd(x.handedBackAt) : null,
        decidedAt: x.decidedAt ? ymd(x.decidedAt) : null,
        valueMinor: x.valueMinor === null ? null : Number(x.valueMinor),
        status: x.status,
        source: x.source,
      };
    }),
    countDiffers: desk.map((p) => {
      const o = l.orderOf.get(p.externalOrderId);
      return {
        parcelId: p.id,
        listId: p.returnList.id,
        returnListId: p.returnList.returnListId,
        orderId: p.orderId ?? o?.orderId ?? null,
        orderNumber: o?.number ?? null,
        externalOrderId: p.externalOrderId,
        consignmentId: p.consignmentId,
        courier: p.returnList.courier,
        expectedCount: p.expectedCount,
        receivedCount: p.receivedCount,
        note: p.note,
        claimStartedAt: p.claimStartedAt!.toISOString(),
      };
    }),
  };
}
