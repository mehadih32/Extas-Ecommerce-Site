// CN-028 · PR 616 — the books match engine (docs/RETAIL-ERP-MODEL.md §3.4, §4): the shop's own books against the ERP's,
// day by day, with ZERO tolerance. Job `inventory.books.close` {storeId} looks every `books.close.checkMinutes`; once the
// store's `books.close.runAt` (01:30) has passed it closes yesterday (and every day not closed yet, and checks the last
// `books.recheck.days` closed days again). Before it compares, the account check (PR 615) brings the shop's side up to
// date and catches up lost payments.
//
// The six checks of §4.1, for each business day:
//   A ACCOUNT     every ERP statement row (credits, exchanges, payments, other charges) against the shop's ledger entries,
//                 row group by row group (`CREDIT|<order>|<line>`, `EXCHANGE|<exchange>`, `PAYMENT|<event>`, `OTHER|<ref>`),
//                 the opening balance on the books' first day, and each "paid to ERP" record against the ERP's payments.
//   B TIES        the one formula of §3.4 from the shop's own data: Balance(end) = Balance(start) + goods + returnLosses +
//                 (I end − I start) + switch transfer − payments (+ the shop's own corrections). goods and returnLosses
//                 are the daily summary's lines when the shop sent one (PR 617), else the same lines from the pipeline
//                 moves and the exchange entries. Any remainder is TIE_BROKEN.
//   C RETURNS     pieces handed back, approved and their credit against `GET /returns/summary?date`, and the pieces
//                 waiting for the ERP's check against the ERP's `waitingCheck` (today).
//   D SUMMARY     the last daily summary the shop sent against the version the ERP stored (`GET /daily-summaries`).
//   E FIXED_COSTS the month's fixed costs (PR 618) against `GET /fixed-costs`.
//   F ORDERS      every order billed (`BILL|<order>`) against the ERP's bill rows.
// A difference is kept once per (day, class, key) in BooksDifference: MISSING_EVENT (the ERP has a row the shop lacks)
// and a returns count the ERP is ahead on stay PENDING for `books.timing.maxMinutes` while the pull fetches the event,
// then become MISMATCH; everything else is MISMATCH at once. A difference not found again is FIXED. A check that v6 can
// not make yet (no summary sent, no fixed costs on either side) is PARTIAL. A day is "matched" when its result is MATCHED
// or PARTIAL and it has no open difference (decision, documented in the guide).
//
// Each day writes an immutable day close (BooksDayClose, append-only, hash-chained per link) — a new version only when
// its figures changed. HISTORY_CHANGED (qa-gate) is raised, in the same locked transaction as that close, only when a
// day that had matched sees its OWN money move: its ledger entries (the shop's own corrections left out) or the ERP's
// rows of that day. A money-neutral change (fixed costs or a summary entered later) and the balance a correction of an
// earlier day carries forward never raise it. A later run that finds the day matched clears it. A run goes back to the
// first day whose books moved since its close (an entry booked on it later, a correction, the month's fixed costs or
// the day's summary entered later), however far back that is; `books.recheck.days` only adds the last days.
// Check A also compares each day's closing balances: the shop's against the ERP's (its stated closing on the run's last
// day), less what open differences explain; anything left is A:closing (found again from the books, never adjusted).
// One run at a time per link (the run row is claimed under the link's lock; `books.run.staleMinutes`).
// The system rolls the day closes up into weeks and, on each month's last day, the lifetime check against the ERP's
// balance (BooksPeriodClose). Months and years are closed by the owner (books-close.ts). Everything is per store link:
// store A's run never reads or writes store B's rows.
import { createHash } from 'node:crypto';
import { minorOf, periodOf, tieRemainder, worstResult, type BooksCheck, type BooksDifferenceClass, type BooksResult, type BooksWeekday } from '@extas/erp-types';
import { Prisma } from '@extas/db/client';
import { nowOf, setting, TX, type Db, type InventoryDeps, type Tx } from './context';
import { InventoryError } from './errors';
import { BooksError } from './books-errors';
import { addDay, balanceOn, dateOfDay, dayText, isDay, lockLink, moneyMinor, paymentMatch, storeBooks, storeErpLink, type BooksLink } from './erp-account';
import { checkErpAccount } from './erp-account-check';
import { pipelineFlows, pipelineOn } from './erp-pipeline';
import { tieLinesOf } from './books-rules';
import { storeDate } from './erp-events-pull';
import { isV6 } from './erp-model';
import { behaviourOf, resolveErp } from './guard';
import { callErp, errorCode, errorText, retryPolicy } from './sync';

// ---- row groups ---------------------------------------------------------------------------------------------------------

/** The statement kinds of `GET /account` (v6). */
type StatementKind = 'BILL' | 'CREDIT' | 'EXCHANGE' | 'PAYMENT' | 'OTHER';

interface ErpRow {
  id: string | null;
  date: string;
  kind: string;
  amountMinor: number;
  externalOrderId: string | null;
  reference: string | null;
  eventId: string | null;
}

/** The group an ERP statement row is compared in. */
export function erpRowGroup(r: Pick<ErpRow, 'kind' | 'externalOrderId' | 'reference' | 'eventId' | 'id'>): string {
  switch (r.kind as StatementKind) {
    case 'BILL':
      return `BILL|${r.externalOrderId ?? r.reference ?? r.id}`;
    case 'CREDIT':
      return `CREDIT|${r.externalOrderId ?? ''}|${r.reference ?? ''}`;
    case 'EXCHANGE':
      return `EXCHANGE|${r.reference ?? r.externalOrderId ?? r.id}`;
    case 'PAYMENT':
      return `PAYMENT|${r.eventId ?? r.reference ?? r.id}`;
    default:
      return `OTHER|${r.reference ?? r.id}`;
  }
}

type EntryRow = Prisma.ErpAccountEntryGetPayload<true>;

/** The group a shop entry of its own kind belongs to (a reversal and a correction take their original's group). */
function ownGroup(e: Pick<EntryRow, 'kind' | 'externalOrderId' | 'lineId' | 'exchangeId' | 'eventId' | 'paymentRef'>): string | null {
  switch (e.kind) {
    case 'BILL':
      return `BILL|${e.externalOrderId}`;
    case 'RETURN_CREDIT':
      return `CREDIT|${e.externalOrderId ?? ''}|${e.lineId ?? ''}`;
    case 'EXCHANGE_EXTRA':
    case 'EXCHANGE_ADJUSTMENT':
    case 'EXCHANGE_BILL':
    case 'EXCHANGE_CREDIT':
      return `EXCHANGE|${e.exchangeId ?? e.externalOrderId}`;
    case 'PAYMENT':
      return `PAYMENT|${e.eventId}`;
    case 'SWITCH_TRANSFER':
      return `OTHER|${e.paymentRef ?? e.eventId}`;
    default:
      return null;
  }
}

/** A shop entry as the match reads it: its group, the kind it counts as, and whether it is the shop's own correction. */
interface ShopRow {
  entry: EntryRow;
  group: string;
  /** The kind whose rule it follows (a reversal counts as the kind it undoes); null for a correction of the books. */
  counts: EntryRow['kind'] | null;
}

/** The group of a correction of a closed month (`PRIOR|<adjustment>`): dated in the open period, compared with nothing. */
export const PRIOR_GROUP = 'PRIOR|';

/** Groups whose correction is its own term of the tie (not a bill, a credit or an exchange the pipeline explains). */
const isTermGroup = (g: string) => !/^(BILL|CREDIT|EXCHANGE)\|/.test(g);

// ---- the run ----------------------------------------------------------------------------------------------------------------

export interface BooksDayView {
  date: string;
  result: BooksResult;
  /** MATCHED or PARTIAL, and no open difference on the day (what a month close asks for). */
  matched: boolean;
  differences: number;
  version: number;
  changed: boolean;
  checks: { check: BooksCheck; result: BooksResult }[];
}

export interface BooksRunResult {
  status: 'ok' | 'skipped' | 'failed';
  reason: string | null;
  runId: string | null;
  from: string | null;
  through: string | null;
  days: BooksDayView[];
  /** Open differences on the days of the run. */
  differences: number;
  error?: { code: string; text: string };
}

const blank = (): BooksRunResult => ({ status: 'ok', reason: null, runId: null, from: null, through: null, days: [], differences: 0 });

/** The first business day of a link's books: its opening, switch, first entry or first ERP event — null with no books. */
export async function booksStart(db: Db, link: Pick<BooksLink, 'id'>): Promise<string | null> {
  const [r] = await db.$queryRaw<{ d: Date | null }[]>`
    SELECT LEAST(
      (SELECT MIN("businessDate") FROM "ErpAccountEntry" WHERE "linkId" = ${link.id}::uuid),
      (SELECT MIN("businessDate") FROM "ErpEvent" WHERE "linkId" = ${link.id}::uuid AND "moneyEvent"),
      (SELECT "openingBalanceDate" FROM "ErpStoreLink" WHERE "id" = ${link.id}::uuid),
      (SELECT "switchDate" FROM "ErpStoreLink" WHERE "id" = ${link.id}::uuid)
    ) AS "d"`;
  return r?.d ? dayText(r.d) : null;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** Canonical JSON (sorted keys) so the same figures always hash the same. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

/** The newest row of a link's chain of day closes (or period closes): the one no other row names as its previous. */
async function chainHead(tx: Tx, table: 'BooksDayClose' | 'BooksPeriodClose', linkId: string): Promise<string | null> {
  const rows =
    table === 'BooksDayClose'
      ? await tx.$queryRaw<{ hash: string }[]>`SELECT c."hash" FROM "BooksDayClose" c WHERE c."linkId" = ${linkId}::uuid AND NOT EXISTS (SELECT 1 FROM "BooksDayClose" n WHERE n."linkId" = c."linkId" AND n."prevHash" = c."hash") LIMIT 2`
      : await tx.$queryRaw<{ hash: string }[]>`SELECT c."hash" FROM "BooksPeriodClose" c WHERE c."linkId" = ${linkId}::uuid AND NOT EXISTS (SELECT 1 FROM "BooksPeriodClose" n WHERE n."linkId" = c."linkId" AND n."prevHash" = c."hash") LIMIT 2`;
  return rows[0]?.hash ?? null;
}

/** Locks the link's row for one writer of its closes at a time. */
/** Locks the link row (FOR UPDATE): every write of the books takes it first (erp-account.ts `lockLink`). */
export const lockBooksLink = (tx: Tx, link: Pick<BooksLink, 'id' | 'storeId'>): Promise<void> => lockLink(tx, link);

/** Walks a link's chain of day closes from its first row: every hash right, one unbroken list. */
export async function verifyCloseChain(db: Db, linkId: string, table: 'BooksDayClose' | 'BooksPeriodClose' = 'BooksDayClose'): Promise<{ ok: boolean; rows: number }> {
  const rows = (table === 'BooksDayClose' ? await db.booksDayClose.findMany({ where: { linkId } }) : await db.booksPeriodClose.findMany({ where: { linkId } })) as { prevHash: string | null; hash: string }[];
  const next = new Map<string | null, { prevHash: string | null; hash: string }[]>();
  for (const r of rows) next.set(r.prevHash, [...(next.get(r.prevHash) ?? []), r]);
  let cur: string | null = null;
  let seen = 0;
  for (;;) {
    const n: { prevHash: string | null; hash: string }[] = next.get(cur) ?? [];
    if (n.length > 1) return { ok: false, rows: rows.length };
    if (!n.length) break;
    const row: { prevHash: string | null; hash: string } = n[0]!;
    const body = closeCanonical(row as unknown as CloseHashable);
    if (sha(`${cur ?? ''}\n${body}`) !== row.hash) return { ok: false, rows: rows.length };
    cur = row.hash;
    seen++;
  }
  return { ok: seen === rows.length, rows: rows.length };
}

interface CloseHashable {
  linkId: string;
  date?: Date;
  level?: string;
  periodStart?: Date;
  periodEnd?: Date;
  version: number;
  result: string;
  openingBalanceMinor: bigint;
  closingBalanceMinor: bigint;
  figures: unknown;
  override?: boolean;
  reopens?: number | null;
}

/** What a close's hash covers: the link, the day or period, the version, the result, both balances and every figure. */
export function closeCanonical(r: CloseHashable): string {
  return canonical({
    linkId: r.linkId,
    date: r.date ? dayText(r.date) : null,
    level: r.level ?? null,
    periodStart: r.periodStart ? dayText(r.periodStart) : null,
    periodEnd: r.periodEnd ? dayText(r.periodEnd) : null,
    version: r.version,
    result: r.result,
    opening: String(r.openingBalanceMinor),
    closing: String(r.closingBalanceMinor),
    figures: r.figures,
    override: r.override ?? false,
    reopens: r.reopens ?? null,
  });
}

/** Writes one period close (WEEK, MONTH, YEAR, LIFETIME) on the link's chain, inside the caller's transaction. */
export async function writePeriodClose(
  tx: Tx,
  link: Pick<BooksLink, 'id' | 'storeId'>,
  p: { level: 'WEEK' | 'MONTH' | 'YEAR' | 'LIFETIME'; start: string; end: string; result: BooksResult; openingMinor: number; closingMinor: number; matchedDays: number; totalDays: number; figures: Record<string, unknown>; override?: boolean; overrideReason?: string | null; reopens?: number | null; pinVerified?: boolean; closedById?: string | null },
): Promise<Prisma.BooksPeriodCloseGetPayload<true>> {
  await lockBooksLink(tx, link);
  const last = await tx.booksPeriodClose.findFirst({ where: { linkId: link.id, level: p.level, periodStart: dateOfDay(p.start) }, orderBy: { version: 'desc' }, select: { version: true } });
  const version = (last?.version ?? 0) + 1;
  const prevHash = await chainHead(tx, 'BooksPeriodClose', link.id);
  const row = {
    linkId: link.id,
    level: p.level,
    periodStart: dateOfDay(p.start),
    periodEnd: dateOfDay(p.end),
    version,
    result: p.result,
    openingBalanceMinor: BigInt(p.openingMinor),
    closingBalanceMinor: BigInt(p.closingMinor),
    figures: p.figures,
    override: p.override ?? false,
    reopens: p.reopens ?? null,
  };
  const hash = sha(`${prevHash ?? ''}\n${closeCanonical(row)}`);
  return tx.booksPeriodClose.create({
    data: {
      ...row,
      storeId: link.storeId,
      figures: p.figures as Prisma.InputJsonValue,
      matchedDays: p.matchedDays,
      totalDays: p.totalDays,
      overrideReason: p.overrideReason ?? null,
      pinVerified: p.pinVerified ?? false,
      closedById: p.closedById ?? null,
      prevHash,
      hash,
    },
  });
}

interface FoundDiff {
  date: string;
  check: BooksCheck;
  kind: BooksDifferenceClass;
  key: string;
  amountMinor: number | null;
  eventId: string | null;
  externalOrderId: string | null;
  detail: Record<string, unknown>;
  /** Timing: PENDING while young (MISSING_EVENT, a returns count the ERP is ahead on); else MISMATCH. */
  timing: boolean;
  /** A status the finder decided itself (a payment still inside its matching window). */
  status?: 'PENDING' | 'MISMATCH';
}

/** Keeps the differences of one day (or one month for fixed costs): new ones added, seen ones refreshed, gone ones FIXED. */
async function keepDifferences(deps: InventoryDeps, link: BooksLink, runId: string, scope: { dates: string[]; checks?: BooksCheck[] }, found: FoundDiff[], maxMinutes: number): Promise<void> {
  const now = nowOf(deps);
  const seen = new Set<string>();
  for (const f of found) {
    const where = { linkId_date_kind_key: { linkId: link.id, date: dateOfDay(f.date), kind: f.kind, key: f.key } };
    const prior = await deps.db.booksDifference.findUnique({ where, select: { id: true, status: true, firstSeenAt: true, adjustmentId: true } });
    seen.add(`${f.date}|${f.kind}|${f.key}`);
    const first = prior?.firstSeenAt ?? now;
    const status = f.status ?? (f.timing && now.getTime() - first.getTime() < maxMinutes * 60_000 ? 'PENDING' : 'MISMATCH');
    const data = { check: f.check, amountMinor: f.amountMinor == null ? null : BigInt(f.amountMinor), eventId: f.eventId, externalOrderId: f.externalOrderId, detail: f.detail as Prisma.InputJsonValue, lastRunId: runId, lastSeenAt: now };
    if (!prior) {
      await deps.db.booksDifference.create({ data: { storeId: link.storeId, linkId: link.id, date: dateOfDay(f.date), kind: f.kind, key: f.key, status, firstRunId: runId, firstSeenAt: now, ...data } });
    } else if (prior.status === 'OVERRIDDEN' || (prior.status === 'FIXED' && prior.adjustmentId)) {
      // Left in a month the owner closed, or put right by a correction: it stays as it was.
      await deps.db.booksDifference.update({ where: { id: prior.id }, data: { lastRunId: runId, lastSeenAt: now } });
    } else {
      await deps.db.booksDifference.update({ where: { id: prior.id }, data: { ...data, status, ...(prior.status === 'FIXED' ? { fixedAt: null, adjustmentId: null } : {}) } });
    }
  }
  const open = await deps.db.booksDifference.findMany({
    where: { linkId: link.id, date: { in: scope.dates.map(dateOfDay) }, status: { in: ['PENDING', 'MISMATCH'] }, kind: { not: 'HISTORY_CHANGED' }, ...(scope.checks ? { check: { in: scope.checks } } : {}) },
    select: { id: true, date: true, kind: true, key: true },
  });
  for (const o of open) if (!seen.has(`${dayText(o.date)}|${o.kind}|${o.key}`)) await deps.db.booksDifference.update({ where: { id: o.id }, data: { status: 'FIXED', fixedAt: now, lastRunId: runId } });
}

const resultOf = (diffs: readonly FoundDiff[], statusOf: (f: FoundDiff) => 'PENDING' | 'MISMATCH'): BooksResult => worstResult(diffs.map((d) => statusOf(d)));

/** The day's open differences (any check, any class). */
const openOn = (db: Db, linkId: string, d: string) => db.booksDifference.count({ where: { linkId, date: dateOfDay(d), status: { in: ['PENDING', 'MISMATCH'] } } });

/**
 * The ERP events (of the statement's rows) that the shop's ledger has no entry for yet: an event's own effect is kept
 * under its eventId (`<eventId>:new` for a correction's new effect, whose reversal takes the eventId), see erp-account.ts.
 */
export async function eventsNotBooked(db: Db | Tx, linkId: string, eventIds: readonly string[]): Promise<string[]> {
  if (!eventIds.length) return [];
  const keys = eventIds.flatMap((id) => [id, `${id}:new`]);
  const have = new Set((await db.erpAccountEntry.findMany({ where: { linkId, eventId: { in: keys } }, select: { eventId: true } })).map((e) => e.eventId.replace(/:new$/, '')));
  return eventIds.filter((id) => !have.has(id));
}

/** A money difference of a row group (check A or F), whose amount is a gap between the two balances. */
const isGapKey = (key: string) => /^[AF]:/.test(key) && !/^A:(paid|erppaid):/.test(key) && key !== 'A:closing';

/**
 * What the open differences before day `d` explain of the gap between the two balances (shop − ERP): every money
 * difference still open or left in a closed month, and one put right by a prior-period correction dated after `d`.
 */
async function explainedBefore(db: Db, link: Pick<BooksLink, 'id'>, d: string): Promise<number> {
  const [r] = await db.$queryRaw<{ s: bigint | null }[]>`
    SELECT SUM(df."amountMinor")::bigint AS "s" FROM "BooksDifference" df
    WHERE df."linkId" = ${link.id}::uuid AND df."date" < ${dateOfDay(d)}::date AND df."amountMinor" IS NOT NULL
      AND df."key" ~ '^[AF]:' AND df."key" !~ '^A:(paid|erppaid):' AND df."key" <> 'A:closing'
      AND (
        df."status" IN ('PENDING', 'MISMATCH', 'OVERRIDDEN')
        OR (df."status" = 'FIXED' AND EXISTS (
          SELECT 1 FROM "BooksAdjustment" a WHERE a."id" = df."adjustmentId" AND a."kind" = 'PRIOR_PERIOD' AND a."date" > ${dateOfDay(d)}::date))
      )`;
  return minorOf(r?.s ?? 0n);
}

/**
 * The first closed day (up to `through`) whose books moved after its latest close: an entry booked on it later (a
 * correction, a late event), the month's fixed costs or the day's summary entered later. Null when none.
 */
async function movedSinceClose(db: Db, link: Pick<BooksLink, 'id'>, through: string): Promise<string | null> {
  const [r] = await db.$queryRaw<{ d: Date | null }[]>`
    WITH latest AS (
      SELECT "date", MAX("createdAt") AS "at" FROM "BooksDayClose"
      WHERE "linkId" = ${link.id}::uuid AND "date" <= ${dateOfDay(through)}::date GROUP BY "date"
    )
    SELECT LEAST(
      (SELECT MIN(l."date") FROM latest l WHERE EXISTS (
        SELECT 1 FROM "ErpAccountEntry" e WHERE e."linkId" = ${link.id}::uuid AND e."businessDate" = l."date" AND e."createdAt" > l."at")),
      (SELECT MIN(l."date") FROM latest l WHERE EXISTS (
        SELECT 1 FROM "ErpFixedCostMonth" m WHERE m."linkId" = ${link.id}::uuid AND m."month" = date_trunc('month', l."date")::date AND m."createdAt" > l."at")),
      (SELECT MIN(l."date") FROM latest l WHERE EXISTS (
        SELECT 1 FROM "ErpDailySummary" s WHERE s."linkId" = ${link.id}::uuid AND s."date" = l."date" AND s."createdAt" > l."at"))
    ) AS "d"`;
  return r?.d ? dayText(r.d) : null;
}

export interface BooksRunInput {
  storeId: number;
  /** The last day to close (default: yesterday in the store's time zone). */
  through?: string;
  /**
   * The first day (default: the first day not closed yet, `books.recheck.days` before `through`, or the first day whose
   * books moved since its close — whichever is earliest).
   */
  from?: string;
  trigger?: 'NIGHTLY' | 'MANUAL' | 'RECHECK';
  startedById?: string | null;
}

/** One run of the books match for a store (its own link): the account check first, then every day of the range. */
export async function runBooksMatch(deps: InventoryDeps, input: BooksRunInput): Promise<BooksRunResult> {
  const { storeId } = input;
  const out = blank();
  if (input.from !== undefined && !isDay(input.from)) throw new BooksError('INVALID_INPUT', 'the first day is a day, YYYY-MM-DD', ['from']);
  if (input.through !== undefined && !isDay(input.through)) throw new BooksError('INVALID_INPUT', 'the last day is a day, YYYY-MM-DD', ['through']);
  if (!(await isV6(deps, storeId))) return { ...out, status: 'skipped', reason: 'ERP_MODEL_V5' };
  const erp = await resolveErp(deps, storeId);
  if (behaviourOf('events.pull', erp) === 'skip') return { ...out, status: 'skipped', reason: erp.state === 'none' ? 'ERP_NONE' : 'ERP_ON_PRACTICE' };
  const fail = (e: unknown, runId: string | null = null): BooksRunResult => ({ ...out, runId, status: 'failed', error: { code: errorCode(e), text: errorText(e) } });
  if (erp.state === 'unavailable') return fail(new InventoryError('ERP_UNAVAILABLE', `${erp.code}: ${erp.reason}`));
  if (erp.state === 'none' || !erp.api.v6) return fail(new InventoryError('ERP_UNAVAILABLE', 'this ERP connection has no v6 reads'));
  const reads = erp.api.v6;
  const account = await checkErpAccount(deps, { storeId });
  if (account.status === 'failed') return { ...out, status: 'failed', error: account.error };
  if (account.status === 'skipped') return { ...out, status: 'skipped', reason: account.reason };
  const link = await storeErpLink(deps.db, storeId);
  if (!link) return { ...out, status: 'skipped', reason: 'NO_LINK' };

  const { timeZone, digits } = await storeBooks(deps.db, storeId);
  const now = nowOf(deps);
  const today = storeDate(now, timeZone);
  const through = input.through ?? storeDate(now, timeZone, -1);
  const start = await booksStart(deps.db, link);
  if (!start || start > through) return { ...out, from: null, through, reason: 'NO_BOOKS' };
  const [recheck, maxMinutes, matchDays, weekStart, fyStart, staleMin] = await Promise.all([
    setting(deps, storeId, 'books.recheck.days'),
    setting(deps, storeId, 'books.timing.maxMinutes'),
    setting(deps, storeId, 'books.payments.matchDays'),
    setting(deps, storeId, 'books.week.start'),
    setting(deps, storeId, 'books.fiscalYear.startMonth'),
    setting(deps, storeId, 'books.run.staleMinutes'),
  ]);
  let from = input.from;
  if (!from) {
    const last = await deps.db.booksDayClose.findFirst({ where: { linkId: link.id, date: { lte: dateOfDay(through) } }, orderBy: { date: 'desc' }, select: { date: true } });
    const nextOpen = last ? addDay(dayText(last.date), 1) : start;
    const back = addDay(through, -recheck);
    from = nextOpen < back ? nextOpen : back;
    // qa-gate: a day whose books moved since its close is closed again, however far back it lies.
    const moved = await movedSinceClose(deps.db, link, through);
    if (moved && moved < from) from = moved;
  }
  if (from < start) from = start;
  if (from > through) from = through;
  out.from = from;
  out.through = through;

  // One run at a time per link (qa-gate): the run row is claimed under the link's lock. A run left RUNNING longer than
  // `books.run.staleMinutes` (a stopped worker) is marked FAILED and no longer holds the next one back.
  const run = await deps.db.$transaction(async (tx) => {
    await lockLink(tx, link);
    await tx.booksMatchRun.updateMany({ where: { linkId: link.id, status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - staleMin * 60_000) } }, data: { status: 'FAILED', error: 'stopped without finishing (stale)', finishedAt: now } });
    if (await tx.booksMatchRun.findFirst({ where: { linkId: link.id, status: 'RUNNING' }, select: { id: true } })) return null;
    return tx.booksMatchRun.create({ data: { storeId, linkId: link.id, trigger: input.trigger ?? 'MANUAL', fromDate: dateOfDay(from), toDate: dateOfDay(through), status: 'RUNNING', startedById: input.startedById ?? null, startedAt: now } });
  }, TX);
  if (!run) return { ...out, status: 'skipped', reason: 'BUSY' };
  out.runId = run.id;
  try {
    const policy = await retryPolicy(deps);
    // An ERP amount is read exactly (qa-gate): one the books cannot read (a third decimal, words) fails the run loudly.
    const minor = (v: unknown): number => {
      if (v == null) return 0;
      const m = moneyMinor(String(v), digits);
      if (m == null) throw new InventoryError('ERP_ERROR', `the ERP sent an amount the books cannot read exactly: ${String(v).slice(0, 40)}`);
      return m;
    };
    const acct = (await callErp(deps, policy, (o) => reads.account({ from: from!, to: through }, o))).value;
    const erpRows: ErpRow[] = acct.statement.map((r) => ({ id: r.id ?? null, date: r.date, kind: r.kind, amountMinor: minor(r.amount), externalOrderId: r.externalOrderId ?? null, reference: r.reference ?? null, eventId: r.eventId ?? null }));
    const erpOpening = minor(acct.period?.openingBalance ?? 0);
    const erpStatedClosing = acct.period?.closingBalance == null ? null : minor(acct.period.closingBalance);
    const stored = new Map((await callErp(deps, policy, (o) => reads.dailySummaries({ from: from!, to: through }, o))).value.map((s) => [s.date, s]));
    const erpFixed = new Map((await callErp(deps, policy, (o) => reads.fixedCosts(o))).value.map((m) => [m.month, m]));

    // The shop's entries of the range, each with its group and the kind it counts as.
    const entries = await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, businessDate: { gte: dateOfDay(from), lte: dateOfDay(through) } }, orderBy: { seq: 'asc' } });
    const reversed = [...new Set(entries.map((e) => e.reverses).filter((x): x is string => !!x))];
    const originals = new Map((await deps.db.erpAccountEntry.findMany({ where: { linkId: link.id, eventId: { in: reversed } } })).map((e) => [e.eventId, e]));
    const adjIds = [...new Set(entries.map((e) => e.adjustmentId).filter((x): x is string => !!x))];
    // A correction counts in the group of the difference it fixed; a correction of a closed month (PRIOR_PERIOD) is dated
    // in the open period and is its own group, compared with nothing (the ERP's row lies in the closed day).
    const adjGroup = new Map<string, string>();
    if (adjIds.length) {
      const adjs = await deps.db.booksAdjustment.findMany({ where: { id: { in: adjIds }, linkId: link.id }, select: { id: true, kind: true, differenceId: true } });
      const diffs = new Map((await deps.db.booksDifference.findMany({ where: { linkId: link.id, id: { in: adjs.map((a) => a.differenceId).filter((x): x is string => !!x) } }, select: { id: true, detail: true } })).map((x) => [x.id, x]));
      for (const a of adjs) {
        const g = (diffs.get(a.differenceId ?? '')?.detail as { group?: unknown } | undefined)?.group;
        adjGroup.set(a.id, a.kind === 'PRIOR_PERIOD' ? `${PRIOR_GROUP}${a.id}` : typeof g === 'string' ? g : `${PRIOR_GROUP}${a.id}`);
      }
    }
    const shopRows: (ShopRow & { day: string })[] = [];
    for (const e of entries) {
      const original = e.reverses ? originals.get(e.reverses) : undefined;
      let group: string | null = null;
      let counts: EntryRow['kind'] | null = e.kind;
      if (e.kind === 'REVERSAL') {
        group = original ? (ownGroup(original) ?? (original.adjustmentId ? (adjGroup.get(original.adjustmentId) ?? null) : null)) : null;
        counts = original && !e.adjustmentId ? original.kind : null;
      } else if (e.kind === 'ADJUSTMENT') {
        group = e.adjustmentId ? (adjGroup.get(e.adjustmentId) ?? null) : null;
        counts = null;
      } else group = ownGroup(e);
      if (e.adjustmentId) {
        counts = null;
        const own = adjGroup.get(e.adjustmentId);
        if (own?.startsWith(PRIOR_GROUP)) group = own;
      }
      shopRows.push({ entry: e, group: group ?? `UNGROUPED|${e.eventId}`, counts, day: dayText(e.businessDate) });
    }

    const flows = await pipelineFlows(deps.db, link.id, from, through);
    const pay = await paymentMatch(deps, link);
    const summaries = await deps.db.$queryRaw<{ date: Date; version: number; body: Prisma.JsonValue; bodyHash: string; incomplete: string[]; netProfitMinor: bigint; minorLines: Prisma.JsonValue | null }[]>`
      SELECT DISTINCT ON ("date") "date", "version", "body", "bodyHash", "incomplete", "netProfitMinor", "minorLines" FROM "ErpDailySummary"
      WHERE "linkId" = ${link.id}::uuid AND "date" BETWEEN ${dateOfDay(from)}::date AND ${dateOfDay(through)}::date ORDER BY "date", "version" DESC`;
    const summaryOf = new Map(summaries.map((s) => [dayText(s.date), s]));
    const statusOfFound = (f: FoundDiff) => f.status ?? (f.timing ? 'PENDING' : 'MISMATCH');

    // ---- E: fixed costs, once per month of the range ----
    const months = new Map<string, { result: BooksResult; diffs: FoundDiff[]; counts: Record<string, number> }>();
    for (let d = from; d <= through; d = addDay(d, 1)) {
      const month = d.slice(0, 7);
      if (months.has(month)) continue;
      const shop = await deps.db.erpFixedCostMonth.findFirst({ where: { linkId: link.id, month: dateOfDay(`${month}-01`) }, orderBy: { version: 'desc' } });
      const theirs = erpFixed.get(month);
      const diffs: FoundDiff[] = [];
      let result: BooksResult = 'MATCHED';
      if (!shop && !theirs) result = 'PARTIAL';
      else {
        const mine = shop ? { salary: minorOf(shop.salaryMinor), rent: minorOf(shop.rentMinor), utilities: minorOf(shop.utilitiesMinor), other: minorOf(shop.otherMinor) } : null;
        const erpM = theirs ? { salary: minor(theirs.costs.salary), rent: minor(theirs.costs.rent), utilities: minor(theirs.costs.utilities), other: minor(theirs.costs.other) } : null;
        if (canonical(mine) !== canonical(erpM)) {
          diffs.push({ date: `${month}-01`, check: 'FIXED_COSTS', kind: 'STALE_SUMMARY', key: `E:${month}`, amountMinor: null, eventId: null, externalOrderId: null, detail: { month, shop: mine, erp: erpM, shopVersion: shop?.version ?? null }, timing: false });
          result = 'MISMATCH';
        }
      }
      months.set(month, { result, diffs, counts: { shopVersion: shop?.version ?? 0, erpHas: theirs ? 1 : 0 } });
      await keepDifferences(deps, link, run.id, { dates: [`${month}-01`], checks: ['FIXED_COSTS'] }, diffs, maxMinutes);
    }

    let pipelinePrev = await pipelineOn(deps.db, link.id, addDay(from, -1));
    let erpRunning = erpOpening;
    const days: BooksDayView[] = [];
    for (let d = from; d <= through; d = addDay(d, 1)) {
      const found: FoundDiff[] = [];
      const mine = shopRows.filter((r) => r.day === d);
      const theirs = erpRows.filter((r) => r.date === d);
      const erpStart = erpRunning;
      erpRunning += theirs.reduce((s, r) => s + r.amountMinor, 0);
      const bal = await balanceOn(deps.db, link, d);

      // ---- A and F: row groups ----
      const groups = new Map<string, { shop: (ShopRow & { day: string })[]; erp: ErpRow[] }>();
      for (const r of mine) groups.set(r.group, { shop: [...(groups.get(r.group)?.shop ?? []), r], erp: groups.get(r.group)?.erp ?? [] });
      for (const r of theirs) {
        const g = erpRowGroup(r);
        groups.set(g, { shop: groups.get(g)?.shop ?? [], erp: [...(groups.get(g)?.erp ?? []), r] });
      }
      const groupFigures: Record<string, unknown>[] = [];
      for (const [group, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
        if (group.startsWith(PRIOR_GROUP)) {
          groupFigures.push({ group, check: 'ACCOUNT', shopMinor: g.shop.reduce((s, r) => s + minorOf(r.entry.amountMinor), 0), erpMinor: 0, entries: g.shop.map((r) => ({ seq: r.entry.seq, kind: r.entry.kind, eventId: r.entry.eventId, amountMinor: minorOf(r.entry.amountMinor), source: r.entry.source, adjustmentId: r.entry.adjustmentId })), erpRows: [] });
          continue;
        }
        const shopNet = g.shop.reduce((s, r) => s + minorOf(r.entry.amountMinor), 0);
        const erpNet = g.erp.reduce((s, r) => s + r.amountMinor, 0);
        const check: BooksCheck = group.startsWith('BILL|') ? 'ORDERS' : 'ACCOUNT';
        const letter = check === 'ORDERS' ? 'F' : 'A';
        const erpRefs = g.erp.flatMap((r) => [r.eventId, r.id].filter((x): x is string => !!x));
        const shopRefs = g.shop.map((r) => r.entry.eventId);
        const ext = g.shop[0]?.entry.externalOrderId ?? g.erp[0]?.externalOrderId ?? null;
        groupFigures.push({
          group,
          check,
          shopMinor: shopNet,
          erpMinor: erpNet,
          entries: g.shop.map((r) => ({ seq: r.entry.seq, kind: r.entry.kind, eventId: r.entry.eventId, amountMinor: minorOf(r.entry.amountMinor), source: r.entry.source, adjustmentId: r.entry.adjustmentId })),
          erpRows: g.erp.map((r) => ({ id: r.id, kind: r.kind, amountMinor: r.amountMinor, eventId: r.eventId, reference: r.reference })),
        });
        if (shopNet === erpNet) continue;
        const kind: BooksDifferenceClass = !g.shop.length ? 'MISSING_EVENT' : !g.erp.length ? 'UNKNOWN_ROW' : 'AMOUNT_DIFF';
        // A bill the ERP has and the shop does not: when the shipment's answer carried no bill date (PR 611 keeps
        // `billedAt` empty, never a guessed day), say so — the order check fills it, or the bill is booked from this row.
        const billedAtMissing = kind === 'MISSING_EVENT' && group.startsWith('BILL|') && ext ? !!(await deps.db.erpOrder.findFirst({ where: { linkId: link.id, externalOrderId: ext, billedAt: null }, select: { id: true } })) : false;
        // qa-gate round 2: the ERP's events behind these rows, and those the shop's ledger has not got yet. Such an event
        // is fetched by the pull (spec §4.3), never typed by hand: a correction booked now would count twice once it
        // arrives, so the difference waits (books-adjust.ts). ~~A row without an event (a charge the ERP typed) does not.~~
        // An eventId is optional on a v6 statement row: a missing credit, payment or exchange row waits whatever it
        // carries (round 3, decided by its kind); this list is the extra guard where the ERP sends ids.
        const erpEvents = [...new Set(g.erp.map((r) => r.eventId).filter((x): x is string => !!x))];
        const waitingEvents = await eventsNotBooked(deps.db, link.id, erpEvents);
        found.push({ date: d, check, kind, key: `${letter}:${group}`, amountMinor: shopNet - erpNet, eventId: g.erp.find((r) => r.eventId)?.eventId ?? null, externalOrderId: ext, detail: { group, shopMinor: shopNet, erpMinor: erpNet, erpRefs, shopRefs, erpEvents, ...(waitingEvents.length ? { waitingEvents } : {}), ...(billedAtMissing ? { billedAtMissing: true, consignmentId: g.erp[0]?.reference ?? null } : {}) }, timing: kind === 'MISSING_EVENT' });
      }
      // The books' first day: the opening balance the shop imported against the ERP's.
      if (d === start && bal.startMinor !== erpStart) {
        found.push({ date: d, check: 'ACCOUNT', kind: 'AMOUNT_DIFF', key: 'A:opening', amountMinor: bal.startMinor - erpStart, eventId: null, externalOrderId: null, detail: { group: 'OPENING', shopMinor: bal.startMinor, erpMinor: erpStart, erpRefs: [], shopRefs: [] }, timing: false });
      }
      // "Paid to ERP" records and the ERP's payments with no partner, once their window has passed.
      const gap = (x: string) => Math.round((dateOfDay(today).getTime() - dateOfDay(x).getTime()) / 86_400_000);
      for (const s of pay.shopOnly.filter((x) => x.paidOn === d)) {
        found.push({ date: d, check: 'ACCOUNT', kind: 'UNMATCHED_PAYMENT', key: `A:paid:${s.recordId}`, amountMinor: s.amountMinor, eventId: null, externalOrderId: null, detail: { side: 'shop', recordId: s.recordId, reference: s.reference }, timing: false, status: gap(d) > matchDays ? 'MISMATCH' : 'PENDING' });
      }
      for (const e of pay.erpOnly.filter((x) => x.date === d)) {
        found.push({ date: d, check: 'ACCOUNT', kind: 'UNMATCHED_PAYMENT', key: `A:erppaid:${e.entryEventId}`, amountMinor: e.amountMinor, eventId: e.entryEventId, externalOrderId: null, detail: { side: 'erp', eventId: e.entryEventId, reference: e.reference }, timing: false, status: gap(d) > matchDays ? 'MISMATCH' : 'PENDING' });
      }

      // The day's closing balances: the shop's against the ERP's (its own stated closing on the run's last day, else its
      // opening plus the statement's rows). A gap the open differences do not explain is a closing difference.
      const erpEnd = d === through && erpStatedClosing != null ? erpStatedClosing : erpRunning;
      const closingGap = bal.endMinor - erpEnd;
      const explained = (await explainedBefore(deps.db, link, d)) + found.filter((x) => isGapKey(x.key)).reduce((s, x) => s + (x.amountMinor ?? 0), 0);
      if (closingGap !== explained) {
        found.push({ date: d, check: 'ACCOUNT', kind: 'AMOUNT_DIFF', key: 'A:closing', amountMinor: closingGap - explained, eventId: null, externalOrderId: null, detail: { group: 'CLOSING', shopClosingMinor: bal.endMinor, erpClosingMinor: erpEnd, gapMinor: closingGap, explainedMinor: explained }, timing: false });
      }

      // ---- B: the tie ----
      const sum = (kinds: readonly string[]) => mine.filter((r) => r.counts && kinds.includes(r.counts)).reduce((s, r) => s + minorOf(r.entry.amountMinor), 0);
      // A correction of a bill, a credit or an exchange puts the balance right against goods and the pipeline: no term of
      // its own. A correction of a payment, another charge, the opening or a closed month is its own term.
      const adjustmentsMinor = mine.filter((r) => r.entry.adjustmentId && isTermGroup(r.group)).reduce((s, r) => s + minorOf(r.entry.amountMinor), 0);
      const flow = flows.get(d) ?? { goodsMinor: 0, returnLossesMinor: 0, approvedMinor: 0, billedMinor: 0 };
      const derivedGoods = flow.goodsMinor + sum(['EXCHANGE_EXTRA', 'EXCHANGE_ADJUSTMENT']);
      const derivedLosses = flow.returnLossesMinor + sum(['EXCHANGE_BILL', 'EXCHANGE_CREDIT']);
      // PR 617 (qa-gate): the summary's exact minor lines (`minorLines`), never its whole-taka body; the books' own
      // figures when the version has none or lists them as not known yet.
      const summary = summaryOf.get(d);
      const tie = tieLinesOf(summary, { goodsMinor: derivedGoods, returnLossesMinor: derivedLosses });
      const useSummary = tie.summaryUsed;
      const goods = tie.goodsMinor;
      const losses = tie.returnLossesMinor;
      const pipelineEnd = await pipelineOn(deps.db, link.id, d);
      const parts = {
        balanceStartMinor: bal.startMinor,
        balanceEndMinor: bal.endMinor,
        goodsMinor: goods,
        returnLossesMinor: losses,
        pipelineStartMinor: pipelinePrev.totalMinor,
        pipelineEndMinor: pipelineEnd.totalMinor,
        switchTransferMinor: sum(['SWITCH_TRANSFER']),
        paymentsMinor: -sum(['PAYMENT']),
      };
      // The shop's own corrections move the balance and nothing else: they are their own term of the formula.
      const remainder = tieRemainder(parts) - adjustmentsMinor;
      if (remainder !== 0) {
        found.push({ date: d, check: 'TIES', kind: 'TIE_BROKEN', key: 'B:tie', amountMinor: remainder, eventId: null, externalOrderId: null, detail: { ...parts, adjustmentsMinor, remainderMinor: remainder, summaryUsed: useSummary, derivedGoodsMinor: derivedGoods, derivedReturnLossesMinor: derivedLosses }, timing: false });
      }
      pipelinePrev = pipelineEnd;

      // ---- C: returns ----
      const rs = (await callErp(deps, policy, (o) => reads.returnsSummary(d, o))).value;
      const [handed] = await deps.db.$queryRaw<{ n: bigint | null }[]>`
        SELECT SUM(pc."receivedCount")::bigint AS "n" FROM "ErpReturnListParcel" pc JOIN "ErpReturnList" l ON l."id" = pc."returnListId"
        WHERE l."linkId" = ${link.id}::uuid AND l."handedBackAt" = ${dateOfDay(d)}::date AND l."status" IN ('SENT', 'ACCEPTED') AND COALESCE(pc."result", '') <> 'REFUSED'`;
      const approved = await deps.db.erpPipelinePiece.aggregate({ where: { linkId: link.id, state: 'APPROVED', stateDate: dateOfDay(d), exchangeId: null }, _count: { _all: true }, _sum: { buyingPriceMinor: true } });
      const declined = await deps.db.erpPipelinePiece.count({ where: { linkId: link.id, state: 'DECLINED', stateDate: dateOfDay(d), exchangeId: null } });
      const returns = {
        handedBack: [Number(handed?.n ?? 0), rs.handedBack],
        approved: [approved._count._all, rs.approved],
        approvedCredit: [approved._sum.buyingPriceMinor ?? 0, minor(rs.approvedCredit)],
      } as const;
      for (const [k, [s, e]] of Object.entries(returns)) {
        if (s !== e) found.push({ date: d, check: 'RETURNS', kind: 'AMOUNT_DIFF', key: `C:${k}`, amountMinor: s - e, eventId: null, externalOrderId: null, detail: { what: k, shop: s, erp: e }, timing: e > s });
      }
      // What waits for the ERP's check is a number of today, compared on the run's last day only (not in the day's figures).
      if (d === through) {
        const waitingNow = (await pipelineOn(deps.db, link.id, today)).waitingCheckMinor;
        const erpWaiting = minor(rs.waitingCheck);
        if (waitingNow !== erpWaiting) found.push({ date: d, check: 'RETURNS', kind: 'AMOUNT_DIFF', key: 'C:waitingCheck', amountMinor: waitingNow - erpWaiting, eventId: null, externalOrderId: null, detail: { what: 'waitingCheck', shop: waitingNow, erp: erpWaiting, asOf: today }, timing: true });
      }

      // ---- D: the stored summary ----
      const theirsSummary = stored.get(d);
      let summaryResult: BooksResult = 'MATCHED';
      if (!summary) summaryResult = 'PARTIAL';
      else {
        const erpNet = theirsSummary?.netProfit == null ? null : minor(theirsSummary.netProfit);
        const hashDiffers = !!theirsSummary?.bodyHash && theirsSummary.bodyHash !== summary.bodyHash;
        if (!theirsSummary || erpNet !== minorOf(summary.netProfitMinor) || hashDiffers) {
          found.push({ date: d, check: 'SUMMARY', kind: 'STALE_SUMMARY', key: 'D:summary', amountMinor: erpNet == null ? null : minorOf(summary.netProfitMinor) - erpNet, eventId: null, externalOrderId: null, detail: { shopVersion: summary.version, erpVersions: theirsSummary?.versions ?? 0, shopNetProfitMinor: minorOf(summary.netProfitMinor), erpNetProfitMinor: erpNet }, timing: true });
        }
      }

      await keepDifferences(deps, link, run.id, { dates: [d], checks: ['ACCOUNT', 'TIES', 'RETURNS', 'SUMMARY', 'ORDERS'] }, found, maxMinutes);
      // The statuses as kept (a timing difference turns MISMATCH once it is old).
      const kept = await deps.db.booksDifference.findMany({ where: { linkId: link.id, date: dateOfDay(d), status: { in: ['PENDING', 'MISMATCH'] }, kind: { not: 'HISTORY_CHANGED' } }, select: { check: true, status: true } });
      const checkResult = (c: BooksCheck): BooksResult => worstResult(kept.filter((k) => k.check === c).map((k) => k.status as BooksResult));
      const month = months.get(d.slice(0, 7))!;
      const checks: { check: BooksCheck; result: BooksResult; counts: Record<string, number> }[] = [
        { check: 'ACCOUNT', result: checkResult('ACCOUNT'), counts: { shopRows: mine.filter((r) => !r.group.startsWith('BILL|')).length, erpRows: theirs.filter((r) => r.kind !== 'BILL').length } },
        { check: 'TIES', result: checkResult('TIES'), counts: { summaryUsed: useSummary ? 1 : 0 } },
        { check: 'RETURNS', result: checkResult('RETURNS'), counts: { handedBack: returns.handedBack[0], approved: returns.approved[0], approvedCreditMinor: returns.approvedCredit[0], declined } },
        { check: 'SUMMARY', result: summaryResult === 'PARTIAL' ? 'PARTIAL' : checkResult('SUMMARY'), counts: { shopVersion: summary?.version ?? 0, erpVersions: theirsSummary?.versions ?? 0 } },
        { check: 'FIXED_COSTS', result: month.result === 'PARTIAL' ? 'PARTIAL' : resultOf(month.diffs, statusOfFound), counts: month.counts },
        { check: 'ORDERS', result: checkResult('ORDERS'), counts: { shopBills: mine.filter((r) => r.group.startsWith('BILL|')).length, erpBills: theirs.filter((r) => r.kind === 'BILL').length } },
      ];
      const result = worstResult(checks.map((c) => c.result));
      const matched = (result === 'MATCHED' || result === 'PARTIAL') && kept.length === 0;
      // The day's own money: its ledger entries (the shop's own corrections left out) and the ERP's rows of the day.
      const moneyDigest = sha(
        canonical({
          shop: mine.filter((r) => !r.entry.adjustmentId).map((r) => JSON.stringify([r.entry.eventId, r.entry.kind, minorOf(r.entry.amountMinor)])).sort(),
          erp: theirs.map((r) => JSON.stringify([r.id, r.eventId, r.kind, r.amountMinor])).sort(),
        }),
      );
      const figures = {
        matched,
        moneyDigest,
        checks,
        groups: groupFigures,
        tie: { ...parts, adjustmentsMinor, remainderMinor: remainder, summaryUsed: useSummary },
        erp: { startMinor: erpStart, closingMinor: erpRunning },
        pipeline: { startMinor: parts.pipelineStartMinor, endMinor: pipelineEnd.totalMinor, waitingCheckMinor: pipelineEnd.waitingCheckMinor, pieces: pipelineEnd.pieces },
      };
      const digest = sha(canonical({ result, figures }));

      // ---- the day close (and HISTORY_CHANGED with it, under the link's lock) ----
      const w = await deps.db.$transaction(async (tx) => {
        await lockBooksLink(tx, link);
        const latest = await tx.booksDayClose.findFirst({ where: { linkId: link.id, date: dateOfDay(d) }, orderBy: { version: 'desc' } });
        // A later run that finds the day matched clears an earlier HISTORY_CHANGED of it.
        const clear = async () => {
          if (matched) await tx.booksDifference.updateMany({ where: { linkId: link.id, date: dateOfDay(d), kind: 'HISTORY_CHANGED', status: { in: ['PENDING', 'MISMATCH'] }, NOT: { firstRunId: run.id } }, data: { status: 'FIXED', fixedAt: now, lastRunId: run.id } });
        };
        if (latest && (latest.figures as { digest?: string }).digest === digest) {
          await clear();
          return { version: latest.version, changed: false };
        }
        const version = (latest?.version ?? 0) + 1;
        const prevHash = await chainHead(tx, 'BooksDayClose', link.id);
        const row = {
          linkId: link.id,
          date: dateOfDay(d),
          version,
          result,
          openingBalanceMinor: BigInt(bal.startMinor),
          closingBalanceMinor: BigInt(bal.endMinor),
          figures: { ...figures, digest },
        };
        const hash = sha(`${prevHash ?? ''}\n${closeCanonical(row)}`);
        await tx.booksDayClose.create({
          data: {
            ...row,
            figures: row.figures as unknown as Prisma.InputJsonValue,
            storeId: link.storeId,
            runId: run.id,
            erpClosingBalanceMinor: BigInt(erpRunning),
            goodsMinor: BigInt(goods),
            returnLossesMinor: BigInt(losses),
            pipelineStartMinor: BigInt(parts.pipelineStartMinor),
            pipelineEndMinor: BigInt(pipelineEnd.totalMinor),
            switchTransferMinor: BigInt(parts.switchTransferMinor),
            paymentsMinor: BigInt(parts.paymentsMinor),
            tieRemainderMinor: BigInt(remainder),
            waitingCheckMinor: BigInt(pipelineEnd.waitingCheckMinor),
            prevHash,
            hash,
            closedById: input.startedById ?? null,
          },
        });
        // A day that had matched and whose own money moved since: the history changed (it blocks the month close until
        // a later run finds the day matched, or the owner decides).
        const before = latest?.figures as { matched?: boolean; moneyDigest?: string } | undefined;
        if (latest && before?.matched === true && before.moneyDigest && before.moneyDigest !== moneyDigest) {
          await tx.booksDifference.create({
            data: {
              storeId: link.storeId,
              linkId: link.id,
              date: dateOfDay(d),
              check: 'ACCOUNT',
              kind: 'HISTORY_CHANGED',
              key: `H:v${version}`,
              status: 'MISMATCH',
              amountMinor: BigInt(bal.endMinor - minorOf(latest.closingBalanceMinor)),
              detail: { fromVersion: latest.version, toVersion: version, closingBefore: minorOf(latest.closingBalanceMinor), closingAfter: bal.endMinor, resultBefore: latest.result, resultAfter: result } as Prisma.InputJsonValue,
              firstRunId: run.id,
              lastRunId: run.id,
              firstSeenAt: now,
              lastSeenAt: now,
            },
          });
        } else await clear();
        return { version, changed: true };
      }, TX);
      const open = await openOn(deps.db, link.id, d);
      days.push({ date: d, result, matched: (result === 'MATCHED' || result === 'PARTIAL') && open === 0, differences: open, version: w.version, changed: w.changed, checks: checks.map((c) => ({ check: c.check, result: c.result })) });
    }

    await rollUps(deps, link, { from, through, start, weekStart, fyStart, erpClosing: (d) => erpOpening + erpRows.filter((r) => r.date <= d).reduce((s, r) => s + r.amountMinor, 0) });
    const openDiffs = await deps.db.booksDifference.count({ where: { linkId: link.id, date: { gte: dateOfDay(from), lte: dateOfDay(through) }, status: { in: ['PENDING', 'MISMATCH'] } } });
    const byCheck = Object.fromEntries((['ACCOUNT', 'TIES', 'RETURNS', 'SUMMARY', 'FIXED_COSTS', 'ORDERS'] as BooksCheck[]).map((c) => [c, worstResult(days.map((x) => x.checks.find((y) => y.check === c)!.result))]));
    await deps.db.booksMatchRun.update({ where: { id: run.id }, data: { status: 'DONE', checks: { byCheck, days: days.length, matched: days.filter((x) => x.matched).length } as Prisma.InputJsonValue, differences: openDiffs, finishedAt: nowOf(deps) } });
    return { ...out, days, differences: openDiffs };
  } catch (e) {
    await deps.db.booksMatchRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: errorText(e).slice(0, 2000), finishedAt: nowOf(deps) } });
    return fail(e, run.id);
  }
}

/** The weeks and the lifetime check built from the day closes (never from raw data), each a new version only when it changed. */
async function rollUps(deps: InventoryDeps, link: BooksLink, o: { from: string; through: string; start: string; weekStart: BooksWeekday; fyStart: number; erpClosing: (d: string) => number }): Promise<void> {
  const rules = { weekStart: o.weekStart, fiscalYearStartMonth: o.fyStart };
  const latestCloses = async (a: string, b: string) =>
    deps.db.$queryRaw<{ date: Date; version: number; result: BooksResult; openingBalanceMinor: bigint; closingBalanceMinor: bigint }[]>`
      SELECT DISTINCT ON ("date") "date", "version", "result"::text AS "result", "openingBalanceMinor", "closingBalanceMinor" FROM "BooksDayClose"
      WHERE "linkId" = ${link.id}::uuid AND "date" BETWEEN ${dateOfDay(a)}::date AND ${dateOfDay(b)}::date ORDER BY "date", "version" DESC`;
  const open = async (a: string, b: string) => new Set((await deps.db.booksDifference.findMany({ where: { linkId: link.id, date: { gte: dateOfDay(a), lte: dateOfDay(b) }, status: { in: ['PENDING', 'MISMATCH'] } }, select: { date: true } })).map((x) => dayText(x.date)));
  const summary = async (a: string, b: string) => {
    const rows = await latestCloses(a, b);
    const bad = await open(a, b);
    let chained = true;
    for (let i = 1; i < rows.length; i++) if (rows[i]!.openingBalanceMinor !== rows[i - 1]!.closingBalanceMinor) chained = false;
    const matched = rows.filter((r) => (r.result === 'MATCHED' || r.result === 'PARTIAL') && !bad.has(dayText(r.date))).length;
    return { rows, matched, chained, result: worstResult([...rows.map((r) => r.result), ...(chained ? [] : (['MISMATCH'] as BooksResult[]))]) };
  };
  const changedFrom = async (level: 'WEEK' | 'LIFETIME', start: string, figures: Record<string, unknown>) => {
    const last = await deps.db.booksPeriodClose.findFirst({ where: { linkId: link.id, level, periodStart: dateOfDay(start) }, orderBy: { version: 'desc' }, select: { figures: true } });
    return !last || (last.figures as { digest?: string }).digest !== figures.digest;
  };
  // Weeks that ended on or before `through` and touch the range.
  for (let d = o.from; d <= o.through; d = addDay(d, 7)) {
    const w = periodOf(d, 'WEEK', rules);
    if (w.end > o.through) break;
    const a = w.start < o.start ? o.start : w.start;
    const s = await summary(a, w.end);
    const total = Math.round((dateOfDay(w.end).getTime() - dateOfDay(a).getTime()) / 86_400_000) + 1;
    if (s.rows.length < total) continue;
    const base = { days: s.rows.map((r) => ({ date: dayText(r.date), version: r.version, result: r.result })), chained: s.chained };
    const figures = { ...base, digest: sha(canonical(base)) };
    if (!(await changedFrom('WEEK', w.start, figures))) continue;
    await deps.db.$transaction((tx) => writePeriodClose(tx, link, { level: 'WEEK', start: w.start, end: w.end, result: s.result, openingMinor: minorOf(s.rows[0]!.openingBalanceMinor), closingMinor: minorOf(s.rows.at(-1)!.closingBalanceMinor), matchedDays: s.matched, totalDays: total, figures }), TX);
  }
  // The lifetime check on each month's last day: the opening at the switch + every entry since, against the ERP's balance.
  for (let d = o.from; d <= o.through; d = addDay(d, 1)) {
    if (periodOf(d, 'MONTH', rules).end !== d) continue;
    const s = await summary(o.start, d);
    const shopEnd = (await balanceOn(deps.db, link, d)).endMinor;
    const erpEnd = o.erpClosing(d);
    const base = { shopClosingMinor: shopEnd, erpClosingMinor: erpEnd, days: s.rows.length, matchedDays: s.matched, chained: s.chained };
    const figures = { ...base, digest: sha(canonical(base)) };
    if (!(await changedFrom('LIFETIME', o.start, figures))) continue;
    const opening = await deps.db.erpStoreLink.findUnique({ where: { id: link.id }, select: { openingBalanceMinor: true } });
    await deps.db.$transaction(
      (tx) => writePeriodClose(tx, link, { level: 'LIFETIME', start: o.start, end: d, result: shopEnd === erpEnd ? s.result : 'MISMATCH', openingMinor: minorOf(opening?.openingBalanceMinor ?? 0n), closingMinor: shopEnd, matchedDays: s.matched, totalDays: s.rows.length, figures }),
      TX,
    );
  }
}

// ---- the nightly close --------------------------------------------------------------------------------------------------

const clockMinutes = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/**
 * Job `inventory.books.close` {storeId}: once the store's `books.close.runAt` has passed today, closes yesterday (and
 * every day not closed yet) once — NOT_YET before that time, DONE after the night's run.
 */
export async function nightlyBooksClose(deps: InventoryDeps, job: { storeId: number }): Promise<BooksRunResult> {
  const out = blank();
  if (!(await isV6(deps, job.storeId))) return { ...out, status: 'skipped', reason: 'ERP_MODEL_V5' };
  const link = await storeErpLink(deps.db, job.storeId);
  if (!link) return { ...out, status: 'skipped', reason: 'NO_LINK' };
  const { timeZone } = await storeBooks(deps.db, job.storeId);
  const now = nowOf(deps);
  const runAt = await setting(deps, job.storeId, 'books.close.runAt');
  if (localMinutes(now, timeZone) < clockMinutes(runAt)) return { ...out, status: 'skipped', reason: 'NOT_YET' };
  const yesterday = storeDate(now, timeZone, -1);
  const done = await deps.db.booksMatchRun.findFirst({ where: { linkId: link.id, trigger: 'NIGHTLY', status: 'DONE', toDate: dateOfDay(yesterday) }, select: { id: true } });
  if (done) return { ...out, status: 'skipped', reason: 'DONE', runId: done.id, through: yesterday };
  return runBooksMatch(deps, { storeId: job.storeId, through: yesterday, trigger: 'NIGHTLY' });
}
