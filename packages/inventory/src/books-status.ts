// CN-028 · PR 617 (CN-029 Phase 1) — the Books status card (docs/RETAIL-ERP-MODEL.md §3.4, §4): what the books know
// about the store's ERP link, read from the tables of the run (migration 0049) and turned into the card by `booksCard`
// (books-rules.ts). The match runs, day closes and differences are PR 616's (BooksMatchRun, BooksDayClose,
// BooksDifference); the pipeline is PR 615's (ErpPipelinePiece); the summaries and fixed costs are PR 617 and 618's.
// Called `booksSummaryStatus` (PR 616 owns `booksStatus`, the books at a glance in books-view.ts, which the Daily summary
// page shows as its status card): this one gives that page its "Needs you now" rows and the summaries' state.
// Until the match has run the card says so ("not run yet") and shows every check A–F without a result, never a
// result it does not have. Per store and per link (§16): only the store's own open link is read. Reads only.
import { requirePermission } from '@extas/auth';
import { BOOKS_CHECKS, BOOKS_RESULTS, minorOf, type BooksCheck, type BooksDifferenceClass, type BooksResult } from '@extas/erp-types';
import { nowOf, setting, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { isV6 } from './erp-model';
import { addDays, booksCard, daysFrom, type BooksCard, type BooksCardInput } from './books-rules';
import { latestVersions, localNow, openLinkOf, summaryLog } from './books-summary';

const dayText = (d: Date) => d.toISOString().slice(0, 10);
const isResult = (v: unknown): v is BooksResult => typeof v === 'string' && (BOOKS_RESULTS as readonly string[]).includes(v);

/**
 * A match run's checks as PR 616 keeps them (BooksMatchRun.checks): `{ ACCOUNT: 'MATCHED' }`, `{ ACCOUNT: { result } }`
 * or a list of BooksCheckResult. Anything else is read as "no result" for that check, never guessed.
 */
export function checksOfRun(raw: unknown): Partial<Record<BooksCheck, BooksResult>> {
  const out: Partial<Record<BooksCheck, BooksResult>> = {};
  const put = (check: unknown, result: unknown) => {
    if (typeof check === 'string' && (BOOKS_CHECKS as readonly string[]).includes(check) && isResult(result)) out[check as BooksCheck] = result;
  };
  if (Array.isArray(raw)) for (const c of raw) put((c as { check?: unknown })?.check, (c as { result?: unknown })?.result);
  else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) put(k, v && typeof v === 'object' ? (v as { result?: unknown }).result : v);
  return out;
}

export interface BooksSummaryStatus {
  card: BooksCard;
  /** The open link's first day and the shop's today, for the screen. */
  startDay: string | null;
  today: string;
  /** When the last match run finished (PR 616), or null. */
  lastRunAt: Date | null;
  summaries: BooksCardInput['summaries'];
  fixedCosts: BooksCardInput['fixedCosts'];
}

/** The Books status card of the store (`books.read`). */
export async function booksSummaryStatus(deps: InventoryDeps, who: Who): Promise<BooksSummaryStatus> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new InventoryError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, 'books.read', { storeId: who.storeId });
  const storeId = who.storeId;
  const [timeZone, warnDays, resendDays, gapDays, v6] = await Promise.all([
    setting(deps, storeId, 'store.timeZone'),
    setting(deps, storeId, 'books.status.waitingCheckWarnDays'),
    setting(deps, storeId, 'books.resend.days'),
    setting(deps, storeId, 'erp.summary.gapDays'),
    isV6(deps, storeId),
  ]);
  const local = localNow(nowOf(deps), timeZone);
  const month = local.day.slice(0, 7);
  const link = v6 ? await openLinkOf(deps.db, storeId) : null;
  const empty: BooksCardInput = {
    linked: false,
    lastRun: null,
    lastClose: null,
    openDifferences: {},
    tieBroken: [],
    waitingCheck: { valueMinor: 0, pieces: 0, oldestSince: null },
    exchangesAtRiskMinor: null,
    summaries: { lastAccepted: null, waitingSend: 0, refused: [], incompleteDays: [], missingDays: [] },
    fixedCosts: { month, inMonths: [], waitingSend: 0 },
    today: local.day,
    waitingCheckWarnDays: warnDays,
  };
  if (!link) return { card: booksCard(empty), startDay: null, today: local.day, lastRunAt: null, summaries: empty.summaries, fixedCosts: empty.fixedCosts };

  const linkRow = await deps.db.erpStoreLink.findUniqueOrThrow({ where: { id: link.id }, select: { createdAt: true } });
  const startDay = link.startDay ?? localNow(linkRow.createdAt, timeZone).day;
  const open = { linkId: link.id, storeId, status: { in: ['PENDING' as const, 'MISMATCH' as const] } };
  const [run, close, diffs, ties, waiting, account, log, fixed, fixedSends] = await Promise.all([
    deps.db.booksMatchRun.findFirst({ where: { linkId: link.id, storeId, status: { not: 'RUNNING' } }, orderBy: { startedAt: 'desc' }, select: { finishedAt: true, status: true, checks: true } }),
    deps.db.booksDayClose.findFirst({ where: { linkId: link.id, storeId }, orderBy: [{ date: 'desc' }, { version: 'desc' }], select: { date: true, result: true, tieRemainderMinor: true } }),
    deps.db.booksDifference.groupBy({ by: ['kind'], where: open, _count: { _all: true } }),
    deps.db.booksDifference.findMany({ where: { ...open, kind: 'TIE_BROKEN' }, orderBy: { date: 'desc' }, take: 5, select: { date: true, amountMinor: true, externalOrderId: true, detail: true } }),
    deps.db.erpPipelinePiece.aggregate({ where: { linkId: link.id, storeId, state: 'WAITING_CHECK' }, _sum: { buyingPriceMinor: true }, _count: { _all: true }, _min: { stateDate: true } }),
    deps.db.erpAccountState.findUnique({ where: { linkId: link.id }, select: { exchangesAtRiskMinor: true } }),
    summaryLog(deps, who, { days: Math.max(gapDays, resendDays) + 1 }),
    deps.db.erpFixedCostMonth.findMany({ where: { linkId: link.id, storeId }, orderBy: [{ month: 'asc' }, { version: 'desc' }], select: { id: true, month: true } }),
    deps.db.erpBooksSend.findMany({ where: { linkId: link.id, storeId, kind: 'FIXED_COSTS', accepted: true }, select: { refId: true } }),
  ]);

  // Days since the link started (within the look-back) that have no summary yet: the day before yesterday and older
  // (yesterday's is built from the send time).
  const versions = await latestVersions(deps.db, link.id, { from: [startDay, addDays(local.day, -gapDays)].sort().at(-1)! });
  const have = new Set(versions.map((v) => v.date));
  const missingDays = daysFrom([startDay, addDays(local.day, -gapDays)].sort().at(-1)!, addDays(local.day, -2)).filter((d) => !have.has(d));
  const openFrom = addDays(local.day, -resendDays);
  const latestFixed = new Map<string, string>();
  for (const f of fixed) if (!latestFixed.has(dayText(f.month).slice(0, 7))) latestFixed.set(dayText(f.month).slice(0, 7), f.id);
  const acceptedFixed = new Set(fixedSends.map((s) => s.refId));

  const input: BooksCardInput = {
    ...empty,
    linked: true,
    lastRun: run ? { finishedAt: run.finishedAt, status: run.status, checks: checksOfRun(run.checks) } : null,
    lastClose: close ? { date: dayText(close.date), result: close.result, tieRemainderMinor: minorOf(close.tieRemainderMinor) } : null,
    openDifferences: Object.fromEntries(diffs.map((d) => [d.kind, d._count._all])) as Partial<Record<BooksDifferenceClass, number>>,
    tieBroken: ties.map((t) => ({ date: dayText(t.date), amountMinor: t.amountMinor == null ? null : minorOf(t.amountMinor), externalOrderId: t.externalOrderId, detail: (t.detail ?? {}) as Record<string, unknown> })),
    waitingCheck: { valueMinor: waiting._sum.buyingPriceMinor ?? 0, pieces: waiting._count._all, oldestSince: waiting._min.stateDate ? dayText(waiting._min.stateDate) : null },
    exchangesAtRiskMinor: account?.exchangesAtRiskMinor == null ? null : minorOf(account.exchangesAtRiskMinor),
    summaries: {
      lastAccepted: log.find((r) => r.state === 'ACCEPTED')?.date ?? null,
      waitingSend: log.filter((r) => r.state === 'WAITING' || r.state === 'RETRYING').length,
      refused: log.filter((r) => r.state === 'REFUSED').map((r) => ({ date: r.date, error: r.lastError })),
      incompleteDays: log.filter((r) => r.incomplete.length && r.date >= openFrom).map((r) => ({ date: r.date, incomplete: r.incomplete })),
      missingDays,
    },
    fixedCosts: { month, inMonths: [...latestFixed.keys()], waitingSend: [...latestFixed.values()].filter((id) => !acceptedFixed.has(id)).length },
  };
  return { card: booksCard(input), startDay, today: local.day, lastRunAt: run?.finishedAt ?? null, summaries: input.summaries, fixedCosts: input.fixedCosts };
}
