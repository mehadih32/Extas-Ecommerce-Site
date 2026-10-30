// CN-028 · PR 615 — what Money → Books → ERP account shows (`erp.account.read`, the store's own ledger only): the
// balance Retail owes from the shop's own ledger (and the ERP's, as last read), the hold, the pipeline today, the
// ledger entries a page at a time (`books.ledger.pageSize`), the "paid to ERP" records with their match, and the pieces
// in the pipeline. Plain numbers in minor units and day strings; the page writes every word from its own messages.
import { ERP_ACCOUNT_ENTRY_KINDS, ERP_PIECE_STATES, minorOf, type ErpAccountEntryKind, type ErpPieceState } from '@extas/erp-types';
import { z } from 'zod';
import { nowOf, parse, setting, type InventoryDeps, type Who } from './context';
import { allowBooks, dateOfDay, dayText, daySchema, ledgerBalance, paymentMatch, storeBooks, storeErpLink, verifyAccountChain, type BooksLink, type PaymentMatch } from './erp-account';
import { pipelineOn } from './erp-pipeline';
import { storeDate } from './erp-events-pull';
import { isV6 } from './erp-model';

/** The entry kinds and piece states, for the page's filters (the admin app reads them from here). */
export { ERP_ACCOUNT_ENTRY_KINDS, ERP_PIECE_STATES };

export interface AccountOverview {
  model: 'v5' | 'v6';
  link: { id: string; epoch: number; switchDate: string | null; openingBalanceMinor: number | null; openingBalanceDate: string | null } | null;
  today: string | null;
  /** The shop's ledger: the opening balance + every entry (what Retail owes the ERP). */
  balanceMinor: number | null;
  chain: { ok: boolean; entries: number; brokenAt: number | null };
  /** The ERP's own answer as last read by the account check (ErpAccountState), or null before the first check. */
  erp: { balanceMinor: number | null; waitingCheckMinor: number | null; exchangesAtRiskMinor: number | null; onHold: boolean; reason: string | null; holdsOn: string | null; lastPaymentAt: string | null; daysSinceLastPayment: number | null; heldAt: string | null; releasedAt: string | null; checkedAt: string | null } | null;
  /** The pipeline at the end of today, at buying price. */
  pipeline: { totalMinor: number; waitingCheckMinor: number; pieces: number } | null;
  byKind: Partial<Record<ErpAccountEntryKind, { count: number; sumMinor: number }>>;
  payments: { matched: number; shopOnly: number; erpOnly: number } | null;
}

const big = (v: bigint | null | undefined): number | null => (v == null ? null : minorOf(v));
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const day = (d: Date | null | undefined): string | null => (d ? dayText(d) : null);

async function linkOrNull(deps: InventoryDeps, storeId: number): Promise<{ model: 'v5' | 'v6'; link: BooksLink | null }> {
  if (!(await isV6(deps, storeId))) return { model: 'v5', link: null };
  return { model: 'v6', link: await storeErpLink(deps.db, storeId) };
}

/** The account at a glance (`erp.account.read`). In v5, or before the store's link opens, the numbers are empty. */
export async function accountOverview(deps: InventoryDeps, who: Who): Promise<AccountOverview> {
  await allowBooks(deps, who, 'erp.account.read');
  const { model, link } = await linkOrNull(deps, who.storeId);
  const empty: AccountOverview = { model, link: null, today: null, balanceMinor: null, chain: { ok: true, entries: 0, brokenAt: null }, erp: null, pipeline: null, byKind: {}, payments: null };
  if (!link) return empty;
  const { timeZone } = await storeBooks(deps.db, who.storeId);
  const today = storeDate(nowOf(deps), timeZone);
  const [balanceMinor, chain, state, pipeline, kinds, match] = await Promise.all([
    ledgerBalance(deps.db, link),
    verifyAccountChain(deps.db, link.id),
    deps.db.erpAccountState.findUnique({ where: { linkId: link.id } }),
    pipelineOn(deps.db, link.id, today),
    deps.db.erpAccountEntry.groupBy({ by: ['kind'], where: { linkId: link.id }, _count: { _all: true }, _sum: { amountMinor: true } }),
    paymentMatch(deps, link),
  ]);
  const byKind: AccountOverview['byKind'] = {};
  for (const k of kinds) byKind[k.kind] = { count: k._count._all, sumMinor: minorOf(k._sum.amountMinor ?? 0n) };
  return {
    model,
    link: { id: link.id, epoch: link.epoch, switchDate: link.switchDate, openingBalanceMinor: link.openingBalanceMinor, openingBalanceDate: link.openingBalanceDate },
    today,
    balanceMinor,
    chain: chain.ok ? { ok: true, entries: chain.entries, brokenAt: null } : { ok: false, entries: chain.entries, brokenAt: chain.seq },
    erp: state
      ? {
          balanceMinor: big(state.balanceMinor),
          waitingCheckMinor: big(state.waitingCheckMinor),
          exchangesAtRiskMinor: big(state.exchangesAtRiskMinor),
          onHold: state.onHold,
          reason: state.reason,
          holdsOn: day(state.holdsOn),
          lastPaymentAt: day(state.lastPaymentAt),
          daysSinceLastPayment: state.daysSinceLastPayment,
          heldAt: iso(state.heldAt),
          releasedAt: iso(state.releasedAt),
          checkedAt: iso(state.checkedAt),
        }
      : null,
    pipeline,
    byKind,
    payments: { matched: match.matched.length, shopOnly: match.shopOnly.length, erpOnly: match.erpOnly.length },
  };
}

export const accountEntriesQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    kind: z.enum(ERP_ACCOUNT_ENTRY_KINDS).optional(),
    from: daySchema.optional(),
    to: daySchema.optional(),
    q: z.string().trim().max(80).optional(),
  })
  .strict();

export interface AccountEntryView {
  id: string;
  storeId: number;
  seq: number;
  kind: ErpAccountEntryKind;
  eventId: string;
  businessDate: string;
  amountMinor: number;
  externalOrderId: string | null;
  lineId: string | null;
  returnListId: string | null;
  consignmentId: string | null;
  exchangeId: string | null;
  paymentRef: string | null;
  source: string;
  reverses: string | null;
  reversedBy: string | null;
  adjustmentId: string | null;
  createdAt: string;
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** The ledger, newest first, a page at a time (`erp.account.read`): only the acting store's own link. */
export async function accountEntries(deps: InventoryDeps, who: Who, query: z.input<typeof accountEntriesQuery>): Promise<Paged<AccountEntryView>> {
  await allowBooks(deps, who, 'erp.account.read');
  const q = parse(accountEntriesQuery, query, 'ledger query');
  const pageSize = await setting(deps, null, 'books.ledger.pageSize');
  const page = q.page ?? 1;
  const { link } = await linkOrNull(deps, who.storeId);
  if (!link) return { rows: [], page, pageSize, total: 0 };
  const where = {
    linkId: link.id,
    storeId: who.storeId,
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.from || q.to ? { businessDate: { ...(q.from ? { gte: dateOfDay(q.from) } : {}), ...(q.to ? { lte: dateOfDay(q.to) } : {}) } } : {}),
    ...(q.q ? { OR: [{ externalOrderId: { contains: q.q } }, { eventId: { contains: q.q } }, { paymentRef: { contains: q.q } }, { exchangeId: { contains: q.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([deps.db.erpAccountEntry.findMany({ where, orderBy: { seq: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }), deps.db.erpAccountEntry.count({ where })]);
  const undone = new Map(
    (await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, reverses: { in: rows.map((r) => r.eventId) } }, select: { reverses: true, eventId: true } })).map((r) => [r.reverses!, r.eventId]),
  );
  return {
    rows: rows.map((r) => ({
      id: r.id,
      storeId: r.storeId,
      seq: r.seq,
      kind: r.kind,
      eventId: r.eventId,
      businessDate: dayText(r.businessDate),
      amountMinor: minorOf(r.amountMinor),
      externalOrderId: r.externalOrderId,
      lineId: r.lineId,
      returnListId: r.returnListId,
      consignmentId: r.consignmentId,
      exchangeId: r.exchangeId,
      paymentRef: r.paymentRef,
      source: r.source,
      reverses: r.reverses,
      reversedBy: undone.get(r.eventId) ?? null,
      adjustmentId: r.adjustmentId,
      createdAt: r.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
  };
}

export interface PaymentRecordView {
  id: string;
  paidOn: string;
  amountMinor: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  reversesId: string | null;
  reversedBy: string | null;
  recordedById: string;
  createdAt: string;
}

/** The "paid to ERP" records (newest first) and how they match the ERP's payments (`erp.account.read`). */
export async function accountPayments(deps: InventoryDeps, who: Who): Promise<{ records: PaymentRecordView[]; match: PaymentMatch | null }> {
  await allowBooks(deps, who, 'erp.account.read');
  const { link } = await linkOrNull(deps, who.storeId);
  if (!link) return { records: [], match: null };
  const pageSize = await setting(deps, null, 'books.ledger.pageSize');
  const recs = await deps.db.erpPaymentRecord.findMany({ where: { linkId: link.id, storeId: who.storeId }, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }], take: pageSize });
  const reversedBy = new Map((await deps.db.erpPaymentRecord.findMany({ where: { linkId: link.id, reversesId: { in: recs.map((r) => r.id) } }, select: { id: true, reversesId: true } })).map((r) => [r.reversesId!, r.id]));
  return {
    records: recs.map((r) => ({
      id: r.id,
      paidOn: dayText(r.paidOn),
      amountMinor: minorOf(r.amountMinor),
      method: r.method,
      reference: r.reference,
      note: r.note,
      reversesId: r.reversesId,
      reversedBy: reversedBy.get(r.id) ?? null,
      recordedById: r.recordedById,
      createdAt: r.createdAt.toISOString(),
    })),
    match: await paymentMatch(deps, link),
  };
}

export const pipelinePiecesQuery = z
  .object({ page: z.coerce.number().int().min(1).max(100_000).optional(), state: z.enum(ERP_PIECE_STATES).optional(), q: z.string().trim().max(80).optional() })
  .strict();

export interface PipelinePieceRowView {
  id: string;
  externalOrderId: string;
  lineId: string;
  sku: string;
  buyingPriceMinor: number;
  state: ErpPieceState;
  billedOn: string;
  stateDate: string;
}

/** The pieces of the pipeline (or of one state), oldest state first (`erp.account.read`). */
export async function pipelinePieces(deps: InventoryDeps, who: Who, query: z.input<typeof pipelinePiecesQuery>): Promise<Paged<PipelinePieceRowView>> {
  await allowBooks(deps, who, 'erp.account.read');
  const q = parse(pipelinePiecesQuery, query, 'pipeline query');
  const pageSize = await setting(deps, null, 'books.ledger.pageSize');
  const page = q.page ?? 1;
  const { link } = await linkOrNull(deps, who.storeId);
  if (!link) return { rows: [], page, pageSize, total: 0 };
  const where = {
    linkId: link.id,
    storeId: who.storeId,
    state: q.state ? q.state : { in: ['BILLED', 'RETURNING', 'WAITING_CHECK'] as ErpPieceState[] },
    ...(q.q ? { OR: [{ externalOrderId: { contains: q.q } }, { sku: { contains: q.q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    deps.db.erpPipelinePiece.findMany({ where, orderBy: [{ stateDate: 'asc' }, { externalOrderId: 'asc' }, { lineId: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    deps.db.erpPipelinePiece.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({ id: r.id, externalOrderId: r.externalOrderId, lineId: r.lineId, sku: r.sku, buyingPriceMinor: r.buyingPriceMinor, state: r.state, billedOn: dayText(r.billedOn), stateDate: dayText(r.stateDate) })),
    page,
    pageSize,
    total,
  };
}
