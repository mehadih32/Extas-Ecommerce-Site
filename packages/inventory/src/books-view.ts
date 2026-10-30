// CN-028 · PR 616 — what Money → Books shows of the match, and what other parts read (PR 617/618 Hisabi, the Needs-you-now
// queue). Plain numbers in minor units and day strings; the pages write every word from their own messages file.
//
// The exported shapes are stable (Hisabi's daily summary and the profit pages read them; add fields, never rename):
// - `booksStatus` → BooksStatus: model, link, balanceMinor (shop ledger), erpBalanceMinor / waitingCheckMinor /
//   exchangesAtRiskMinor (the ERP's, as last read), open {total, byClass, byCheck} (open differences), matchedDays /
//   totalDays (each day's latest close), partialChecks (checks v6 can only partly make on the latest closed day),
//   monthsClosed, lastRun, closesChain {ok, days, periods}.
// - `explainDay` → DayExplain: a day's latest close opened to its row groups (shop entries and ERP rows), the tie's
//   parts, the checks, the pipeline, its differences and every version of the day.
// - `booksDifferences` → a page of BooksDifferenceRow (one store, one link; `adjustable` says if a correction applies).
// - `booksDaysForSummary` → the latest close of each day in a range (Hisabi's summary reads its result and figures).
import { BOOKS_CHECKS, BOOKS_DIFFERENCE_CLASSES, minorOf, type BooksCheck, type BooksDifferenceClass, type BooksDifferenceStatus, type BooksResult } from '@extas/erp-types';
import { z } from 'zod';
import { logChange, parse, setting, type InventoryDeps, type Who } from './context';
import { BooksError } from './books-errors';
import { isAdjustable } from './books-adjust';
import { booksPinSet } from './books-close';
import { runBooksMatch, verifyCloseChain, type BooksRunResult } from './books-match';
import { allowBooks, booksLinkFor, dateOfDay, dayText, daySchema, ledgerBalance, storeErpLink, type BooksLink } from './erp-account';
import { isV6 } from './erp-model';

const big = (v: bigint | null | undefined): number | null => (v == null ? null : minorOf(v));
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

async function linkOrNull(deps: InventoryDeps, storeId: number): Promise<{ model: 'v5' | 'v6'; link: BooksLink | null }> {
  if (!(await isV6(deps, storeId))) return { model: 'v5', link: null };
  return { model: 'v6', link: await storeErpLink(deps.db, storeId) };
}

// ---- the status card ----------------------------------------------------------------------------------------------------

export interface BooksStatus {
  model: 'v5' | 'v6';
  link: { id: string; epoch: number; switchDate: string | null } | null;
  balanceMinor: number | null;
  erpBalanceMinor: number | null;
  waitingCheckMinor: number | null;
  exchangesAtRiskMinor: number | null;
  open: { total: number; byClass: Partial<Record<BooksDifferenceClass, number>>; byCheck: Partial<Record<BooksCheck, number>> };
  matchedDays: number;
  totalDays: number;
  partialChecks: BooksCheck[];
  monthsClosed: number;
  lastRun: { id: string; trigger: string; status: string; from: string; through: string; differences: number; startedAt: string; finishedAt: string | null; error: string | null } | null;
  closesChain: { ok: boolean; days: number; periods: number };
}

/** The books at a glance (`books.read`). In v5, or before the link opens, the numbers are empty. */
export async function booksStatus(deps: InventoryDeps, who: Who): Promise<BooksStatus> {
  await allowBooks(deps, who, 'books.read');
  const { model, link } = await linkOrNull(deps, who.storeId);
  const blank: BooksStatus = { model, link: null, balanceMinor: null, erpBalanceMinor: null, waitingCheckMinor: null, exchangesAtRiskMinor: null, open: { total: 0, byClass: {}, byCheck: {} }, matchedDays: 0, totalDays: 0, partialChecks: [], monthsClosed: 0, lastRun: null, closesChain: { ok: true, days: 0, periods: 0 } };
  if (!link) return blank;
  const [balance, state, open, latest, monthRows, run, dayChain, periodChain] = await Promise.all([
    ledgerBalance(deps.db, link),
    deps.db.erpAccountState.findUnique({ where: { linkId: link.id } }),
    deps.db.booksDifference.groupBy({ by: ['kind', 'check'], where: { linkId: link.id, status: { in: ['PENDING', 'MISMATCH'] } }, _count: { _all: true } }),
    deps.db.$queryRaw<{ date: Date; result: BooksResult; figures: unknown }[]>`
      SELECT DISTINCT ON ("date") "date", "result"::text AS "result", "figures" FROM "BooksDayClose" WHERE "linkId" = ${link.id}::uuid ORDER BY "date", "version" DESC`,
    deps.db.$queryRaw<{ reopens: number | null }[]>`
      SELECT DISTINCT ON ("periodStart") "reopens" FROM "BooksPeriodClose" WHERE "linkId" = ${link.id}::uuid AND "level" = 'MONTH' ORDER BY "periodStart", "version" DESC`,
    deps.db.booksMatchRun.findFirst({ where: { linkId: link.id }, orderBy: { startedAt: 'desc' } }),
    verifyCloseChain(deps.db, link.id, 'BooksDayClose'),
    verifyCloseChain(deps.db, link.id, 'BooksPeriodClose'),
  ]);
  const openDays = new Set((await deps.db.booksDifference.findMany({ where: { linkId: link.id, status: { in: ['PENDING', 'MISMATCH'] } }, select: { date: true }, distinct: ['date'] })).map((x) => dayText(x.date)));
  const byClass: BooksStatus['open']['byClass'] = {};
  const byCheck: BooksStatus['open']['byCheck'] = {};
  let total = 0;
  for (const o of open) {
    byClass[o.kind] = (byClass[o.kind] ?? 0) + o._count._all;
    byCheck[o.check] = (byCheck[o.check] ?? 0) + o._count._all;
    total += o._count._all;
  }
  const last = latest.at(-1);
  const checks = ((last?.figures as { checks?: { check: BooksCheck; result: BooksResult }[] } | null)?.checks ?? []).filter((c) => c.result === 'PARTIAL').map((c) => c.check);
  return {
    model,
    link: { id: link.id, epoch: link.epoch, switchDate: link.switchDate },
    balanceMinor: balance,
    erpBalanceMinor: big(state?.balanceMinor),
    waitingCheckMinor: big(state?.waitingCheckMinor),
    exchangesAtRiskMinor: big(state?.exchangesAtRiskMinor),
    open: { total, byClass, byCheck },
    matchedDays: latest.filter((d) => (d.result === 'MATCHED' || d.result === 'PARTIAL') && !openDays.has(dayText(d.date))).length,
    totalDays: latest.length,
    partialChecks: checks,
    monthsClosed: monthRows.filter((m) => m.reopens == null).length,
    lastRun: run ? { id: run.id, trigger: run.trigger, status: run.status, from: dayText(run.fromDate), through: dayText(run.toDate), differences: run.differences, startedAt: run.startedAt.toISOString(), finishedAt: iso(run.finishedAt), error: run.error } : null,
    closesChain: { ok: dayChain.ok && periodChain.ok, days: dayChain.rows, periods: periodChain.rows },
  };
}

// ---- differences ------------------------------------------------------------------------------------------------------------

export const BOOKS_DIFFERENCE_FILTERS = ['open', 'all', 'FIXED', 'OVERRIDDEN'] as const;
export { BOOKS_CHECKS, BOOKS_DIFFERENCE_CLASSES };

const diffQuery = z
  .object({
    status: z.enum(BOOKS_DIFFERENCE_FILTERS).optional(),
    check: z.enum(BOOKS_CHECKS).optional(),
    date: daySchema.optional(),
    page: z.coerce.number().int().min(1).max(100_000).optional(),
  })
  .strict();

export interface BooksDifferenceRow {
  id: string;
  storeId: number;
  date: string;
  check: BooksCheck;
  kind: BooksDifferenceClass;
  key: string;
  status: BooksDifferenceStatus;
  amountMinor: number | null;
  eventId: string | null;
  externalOrderId: string | null;
  detail: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  fixedAt: string | null;
  adjustmentId: string | null;
  adjustable: boolean;
  notes: { id: string; text: string; createdAt: string; createdById: string }[];
}

/** A page of the store's differences (`books.read`), the open ones by default, newest day first. */
export async function booksDifferences(deps: InventoryDeps, who: Who, q: z.input<typeof diffQuery> = {}): Promise<{ rows: BooksDifferenceRow[]; total: number; page: number; pageSize: number; status: (typeof BOOKS_DIFFERENCE_FILTERS)[number] }> {
  await allowBooks(deps, who, 'books.read');
  const d = parse(diffQuery, q, 'filter');
  const status = d.status ?? 'open';
  const page = d.page ?? 1;
  const pageSize = await setting(deps, who.storeId, 'books.ledger.pageSize');
  const { link } = await linkOrNull(deps, who.storeId);
  if (!link) return { rows: [], total: 0, page, pageSize, status };
  const where = {
    linkId: link.id,
    storeId: who.storeId,
    ...(status === 'open' ? { status: { in: ['PENDING', 'MISMATCH'] as BooksDifferenceStatus[] } } : status === 'all' ? {} : { status }),
    ...(d.check ? { check: d.check } : {}),
    ...(d.date ? { date: dateOfDay(d.date) } : {}),
  };
  const [rows, total] = await Promise.all([
    deps.db.booksDifference.findMany({ where, orderBy: [{ date: 'desc' }, { check: 'asc' }, { key: 'asc' }], skip: (page - 1) * pageSize, take: pageSize, include: { notes: { orderBy: { createdAt: 'asc' } } } }),
    deps.db.booksDifference.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      storeId: r.storeId,
      date: dayText(r.date),
      check: r.check,
      kind: r.kind,
      key: r.key,
      status: r.status,
      amountMinor: big(r.amountMinor),
      eventId: r.eventId,
      externalOrderId: r.externalOrderId,
      detail: (r.detail ?? {}) as Record<string, unknown>,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      fixedAt: iso(r.fixedAt),
      adjustmentId: r.adjustmentId,
      adjustable: isAdjustable(r),
      notes: r.notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString(), createdById: n.createdById })),
    })),
    total,
    page,
    pageSize,
    status,
  };
}

const noteInput = z.object({ text: z.string().trim().min(1).max(1000) }).strict();

/** A note on a difference (`books.reconcile`), never edited. */
export async function noteDifference(deps: InventoryDeps, who: Who, differenceId: string, input: z.input<typeof noteInput>): Promise<{ id: string }> {
  await allowBooks(deps, who, 'books.reconcile');
  const d = parse(noteInput, input, 'note');
  if (!who.actor.staffUserId) throw new BooksError('INVALID_INPUT', 'a note is written by a person', ['actor']);
  const link = await booksLinkFor(deps, who.storeId);
  if (!z.uuid().safeParse(differenceId).success) throw new BooksError('NOT_FOUND', 'no such difference', ['differenceId']);
  const diff = await deps.db.booksDifference.findFirst({ where: { id: differenceId, linkId: link.id, storeId: who.storeId }, select: { id: true } });
  if (!diff) throw new BooksError('NOT_FOUND', 'no such difference', ['differenceId']);
  return deps.db.$transaction(async (tx) => {
    const n = await tx.booksDifferenceNote.create({ data: { storeId: who.storeId, differenceId: diff.id, text: d.text, createdById: who.actor.staffUserId! }, select: { id: true } });
    await logChange(tx, who, { action: 'books.difference.note', entityType: 'BooksDifference', entityId: diff.id, before: null, after: { noteId: n.id }, storeId: who.storeId });
    return n;
  });
}

/** Runs the match now for the store (`books.reconcile`): yesterday, every day not closed yet and every day whose books moved since its close — or from a first day of the caller's own. */
export async function runBooksNow(deps: InventoryDeps, who: Who, input: { from?: string | null } = {}): Promise<BooksRunResult> {
  await allowBooks(deps, who, 'books.reconcile');
  await booksLinkFor(deps, who.storeId);
  // Without a first day the run goes back as far as it must (books-match.ts): a corrected day is closed again.
  const from = input.from == null || input.from === '' ? undefined : String(input.from);
  const r = await runBooksMatch(deps, { storeId: who.storeId, trigger: 'MANUAL', startedById: who.actor.staffUserId ?? null, ...(from ? { from } : {}) });
  // One run at a time (qa-gate): the person is told, not shown a run that did nothing.
  if (r.status === 'skipped' && r.reason === 'BUSY') throw new BooksError('BUSY', 'a run of the books is going on; try again in a few minutes');
  return r;
}

// ---- explain this number ----------------------------------------------------------------------------------------------------

export interface DayExplainGroup {
  group: string;
  check: BooksCheck;
  shopMinor: number;
  erpMinor: number;
  entries: { seq: number; kind: string; eventId: string; amountMinor: number; source: string; adjustmentId: string | null }[];
  erpRows: { id: string | null; kind: string; amountMinor: number; eventId: string | null; reference: string | null }[];
}

export interface DayExplain {
  date: string;
  version: number;
  result: BooksResult;
  matched: boolean;
  openingMinor: number;
  closingMinor: number;
  erpClosingMinor: number | null;
  tie: Record<string, number | boolean> & { remainderMinor: number };
  groups: DayExplainGroup[];
  checks: { check: BooksCheck; result: BooksResult; counts: Record<string, number> }[];
  pipeline: { startMinor: number; endMinor: number; waitingCheckMinor: number; pieces: number } | null;
  differences: BooksDifferenceRow[];
  versions: { version: number; result: BooksResult; closingMinor: number; createdAt: string }[];
  pinSet: boolean;
}

/** One closed day opened to its parts (`books.read`): every figure down to the entries and the ERP rows. Null if not closed. */
export async function explainDay(deps: InventoryDeps, who: Who, date: string): Promise<DayExplain | null> {
  await allowBooks(deps, who, 'books.read');
  const day = parse(z.object({ date: daySchema }).strict(), { date }, 'day').date;
  const { link } = await linkOrNull(deps, who.storeId);
  if (!link) return null;
  const closes = await deps.db.booksDayClose.findMany({ where: { linkId: link.id, date: dateOfDay(day) }, orderBy: { version: 'asc' } });
  const c = closes.at(-1);
  if (!c) return null;
  const f = c.figures as { tie?: DayExplain['tie']; groups?: DayExplainGroup[]; checks?: DayExplain['checks']; pipeline?: DayExplain['pipeline'] };
  const diffs = await booksDifferences(deps, who, { status: 'all', date: day });
  const open = diffs.rows.filter((r) => r.status === 'PENDING' || r.status === 'MISMATCH').length;
  return {
    date: day,
    version: c.version,
    result: c.result,
    matched: (c.result === 'MATCHED' || c.result === 'PARTIAL') && open === 0,
    openingMinor: minorOf(c.openingBalanceMinor),
    closingMinor: minorOf(c.closingBalanceMinor),
    erpClosingMinor: big(c.erpClosingBalanceMinor),
    tie: f.tie ?? { remainderMinor: minorOf(c.tieRemainderMinor) },
    groups: f.groups ?? [],
    checks: f.checks ?? [],
    pipeline: f.pipeline ?? null,
    differences: diffs.rows,
    versions: closes.map((x) => ({ version: x.version, result: x.result, closingMinor: minorOf(x.closingBalanceMinor), createdAt: x.createdAt.toISOString() })),
    pinSet: await booksPinSet(deps),
  };
}

/** The latest close of each day in a range, as Hisabi's summary reads it (result, balances, tie parts, figures). */
export async function booksDaysForSummary(deps: InventoryDeps, storeId: number, from: string, to: string): Promise<{ date: string; version: number; result: BooksResult; openingMinor: number; closingMinor: number; goodsMinor: number; returnLossesMinor: number; tieRemainderMinor: number; figures: unknown }[]> {
  const link = await storeErpLink(deps.db, storeId);
  if (!link) return [];
  const rows = await deps.db.$queryRaw<{ date: Date; version: number; result: BooksResult; openingBalanceMinor: bigint; closingBalanceMinor: bigint; goodsMinor: bigint; returnLossesMinor: bigint; tieRemainderMinor: bigint; figures: unknown }[]>`
    SELECT DISTINCT ON ("date") "date", "version", "result"::text AS "result", "openingBalanceMinor", "closingBalanceMinor", "goodsMinor", "returnLossesMinor", "tieRemainderMinor", "figures"
    FROM "BooksDayClose" WHERE "linkId" = ${link.id}::uuid AND "date" BETWEEN ${dateOfDay(from)}::date AND ${dateOfDay(to)}::date ORDER BY "date", "version" DESC`;
  return rows.map((r) => ({ date: dayText(r.date), version: r.version, result: r.result, openingMinor: minorOf(r.openingBalanceMinor), closingMinor: minorOf(r.closingBalanceMinor), goodsMinor: minorOf(r.goodsMinor), returnLossesMinor: minorOf(r.returnLossesMinor), tieRemainderMinor: minorOf(r.tieRemainderMinor), figures: r.figures }));
}

/** How many differences wait for a person (the Needs-you-now queue): open and past their timing window. */
export async function booksNeedsYou(deps: InventoryDeps, storeId: number): Promise<number> {
  const link = await storeErpLink(deps.db, storeId);
  if (!link || !(await isV6(deps, storeId))) return 0;
  return deps.db.booksDifference.count({ where: { linkId: link.id, status: 'MISMATCH' } });
}
