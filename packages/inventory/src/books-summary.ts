// CN-028 · PR 617 — the daily summary to the ERP (docs/erp/site-changes-v6.md §2.6, docs/RETAIL-ERP-MODEL.md §3.3, §5).
// In contract v6 the shop sends the ERP its own profit and loss: one summary per shop day, built from the shop's own
// records on the delivery-day basis, every line from its one source (SUMMARY_LINE_SOURCES in @extas/erp-types):
//
//   orders, sales, income.deliveryCharges, deliveries, customers   the orders and the courier results (@extas/metrics,
//                                                                    retailDayFigures: delivered pieces, delivered day)
//   costs.goods          ErpPipelineMove into (+) and out of (−) DELIVERED that day at the buying price, plus the
//                        account's EXCHANGE_EXTRA and EXCHANGE_ADJUSTMENT entries (and their reversals) of that day
//   costs.returnLosses   moves into (+) and out of (−) DECLINED that day, plus EXCHANGE_BILL and EXCHANGE_CREDIT entries
//                        (a shop correction of an exchange group counts as the kind it corrects, PR 616 money review)
//   returns              moves into WAITING_CHECK that day (pieces handed back), RETURN_CREDIT entries (approved
//                        credit), and the WAITING_CHECK value at the end of the day — information only, never a cost
//   costs.packaging …    CostEntry rows (`summaryLine`, `costDate` or the local day of `occurredAt`) and RetailExpense
//   costs.other          rows of a head with a `summaryLine`, in the store's currency; fixed costs are never here
//   (priorPeriod)        the shop's own figure, never sent: the corrections of a closed month booked that day (owner's
//                        decision; contract v6 has no summary line for it, a v7 request)
//
// A category with no figure yet goes in `incomplete` (never as 0, books-rules.ts). Each built day is a version
// (ErpDailySummary, append-only): the same figures again make no new version; a late fact (a cost entry, a courier
// correction) makes a new one while the day is open (`books.resend.days`, the month not closed) — a closed month is
// never re-sent (the books match books a PRIOR_PERIOD adjustment instead, PR 616). Every send and the ERP's reply are
// kept (ErpBooksSend, append-only).
//
// When (two jobs, books-jobs in jobs.ts):
// - the tick (`erp.summary.tickSeconds`): yesterday's summary from `erp.summary.sendAt` (00:30 local), even with
//   nothing in it (zeros, unknown categories listed); every day since the link started that has no version yet (the
//   shop was down); the days the ERP asked for (`summary.missing`, kept in the event ledger, PR 608) at once; and every
//   version not accepted yet, again after the waits of `erp.summary.retry.minutes` (1, 5, 15, 60, then every hour);
// - the check (`erp.summary.checkMinutes`): the open days built again (late facts), then `GET /daily-summaries` over
//   the last `erp.summary.gapDays`: a day the ERP lacks or holds in another version is sent again at once. This is the
//   catch-up when a `summary.missing` webhook is lost (follow-up 490).
// PR 618: the same tick sends each month's latest fixed-cost version (`PUT /fixed-costs/{month}`, same waits, until
// accepted), and the same check compares `GET /fixed-costs` and sends a month the ERP lacks or holds otherwise again.
// The owner sets the months and the cost lines on Money → Costs (books-costs.ts).
//
// CN-029 §16: everything is per store and per ERP link. A store's summaries are built from that store's rows only and
// go out with that store's own key (resolveErp → the store's own connection); store A's job never reads or sends store
// B's days. Nothing here moves money: a summary is the shop's own figures, sent for the ERP's reports.
import type { Prisma } from '@extas/db/client';
import { requirePermission } from '@extas/auth';
import { COST_SUMMARY_LINES, minorOf, type CostSummaryLine, type ErpDailySummary, type ErpStoredSummary, type SummaryBuildReason } from '@extas/erp-types';
import { retailDayFigures } from '@extas/metrics';
import { toErpError, type ErpApi } from '@extas/adapters';
import { nowOf, setting, TX, type Db, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { isV6 } from './erp-model';
import { v6LinkFor } from './erp-link';
import { lockLink } from './erp-account';
import { correctionKinds } from './books-match';
import { behaviourOf, resolveErp } from './guard';
import { retryPolicy } from './sync';
import {
  addDays,
  assembleSummary,
  dayOpen,
  daysFrom,
  emptyDay,
  fixedCostsBody,
  fixedCostsKey,
  fixedCostsSame,
  fixedCostsTotal,
  isRefusal,
  minorPerUnit,
  nextTryAt,
  sendTimeCome,
  stableJson,
  storedVerdict,
  type AssembledSummary,
  type DayFigures,
  type FixedCostsMinor,
  type SummaryMinor,
} from './books-rules';

const DAY_MS = 86_400_000;
const dayText = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** The shop day (YYYY-MM-DD) and clock ("HH:MM") at a moment in the store's time zone. */
export function localNow(at: Date, timeZone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
}

// ---- the store's link and whether the ERP can be reached ---------------------------------------------------------------

/** The store's open ERP link as the books use it: the first day its books count (the switch date, else its start). */
export interface SummaryLink {
  id: string;
  storeId: number;
  startDay: string;
}

export interface BooksTarget {
  link: SummaryLink;
  /** The ERP to send to, or null while sending waits (no connection, the practice ERP without its data). */
  api: ErpApi | null;
  timeZone: string;
  currency: string;
}

/**
 * The store's books target, or null when the store has no books with the ERP yet (v5, no ERP, no open link). In v6 the
 * open link is made on first use through the store's own connection (`v6LinkFor`, never a shared one, §16).
 */
export async function booksTarget(deps: InventoryDeps, storeId: number): Promise<BooksTarget | null> {
  if (!(await isV6(deps, storeId))) return null;
  const erp = await resolveErp(deps, storeId);
  if (erp.state === 'none') return null;
  let linkId: string | null = null;
  let api: ErpApi | null = null;
  if ((erp.state === 'connected' || erp.state === 'mock') && erp.integrationId) {
    linkId = (await v6LinkFor(deps, storeId, erp.integrationId))?.id ?? null;
    if (behaviourOf('books.send', erp) === 'run' && erp.api.v6) api = erp.api;
  }
  linkId ??= (await deps.db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: { id: true } }))?.id ?? null;
  if (!linkId) return null;
  const row = await deps.db.erpStoreLink.findUniqueOrThrow({ where: { id: linkId }, select: { id: true, storeId: true, switchDate: true, createdAt: true } });
  const [timeZone, currency] = await Promise.all([setting(deps, storeId, 'store.timeZone'), setting(deps, storeId, 'store.currency')]);
  const startDay = row.switchDate ? dayText(row.switchDate) : localNow(row.createdAt, timeZone).day;
  return { link: { id: row.id, storeId: row.storeId, startDay }, api, timeZone, currency };
}

// ---- one day's figures from the shop's own records -----------------------------------------------------------------------

const n = (v: bigint | number | null | undefined) => minorOf(v ?? 0);

/** Every figure of one shop day for the store's link (the sources in the header). */
export async function dayFigures(db: Db, q: { storeId: number; linkId: string; day: string; timeZone: string; currency: string }): Promise<DayFigures> {
  const { storeId, linkId, day, timeZone, currency } = q;
  const f = emptyDay(day);
  const [orders, moves, waiting, entries, costs] = await Promise.all([
    retailDayFigures(db, { storeId, linkId, day, timeZone }),
    db.$queryRaw<{ goods: bigint; declined: bigint; handed: bigint }[]>`
      SELECT COALESCE(sum(CASE WHEN m."toState" = 'DELIVERED' THEN m."buyingPriceMinor" WHEN m."fromState" = 'DELIVERED' THEN -m."buyingPriceMinor" ELSE 0 END), 0)::bigint AS "goods",
             COALESCE(sum(CASE WHEN m."toState" = 'DECLINED' THEN m."buyingPriceMinor" WHEN m."fromState" = 'DECLINED' THEN -m."buyingPriceMinor" ELSE 0 END), 0)::bigint AS "declined",
             count(*) FILTER (WHERE m."toState" = 'WAITING_CHECK')::bigint AS "handed"
      FROM "ErpPipelineMove" m
      WHERE m."linkId" = ${linkId}::uuid AND m."storeId" = ${storeId} AND m."businessDate" = ${day}::date AND m."toState" IS DISTINCT FROM m."fromState"`,
    db.$queryRaw<{ value: bigint }[]>`
      SELECT COALESCE(sum(CASE WHEN m."toState" = 'WAITING_CHECK' THEN m."buyingPriceMinor" WHEN m."fromState" = 'WAITING_CHECK' THEN -m."buyingPriceMinor" ELSE 0 END), 0)::bigint AS "value"
      FROM "ErpPipelineMove" m
      WHERE m."linkId" = ${linkId}::uuid AND m."storeId" = ${storeId} AND m."businessDate" <= ${day}::date AND m."toState" IS DISTINCT FROM m."fromState"`,
    db.$queryRaw<{ kind: string; amount: bigint; adjustmentId: string | null; reversedKind: string | null; reversedAdjustmentId: string | null }[]>`
      SELECT e."kind"::text AS "kind", e."amountMinor" AS "amount", e."adjustmentId"::text AS "adjustmentId",
             r."kind"::text AS "reversedKind", r."adjustmentId"::text AS "reversedAdjustmentId"
      FROM "ErpAccountEntry" e
      LEFT JOIN "ErpAccountEntry" r ON r."linkId" = e."linkId" AND r."eventId" = e."reverses"
      WHERE e."linkId" = ${linkId}::uuid AND e."storeId" = ${storeId} AND e."businessDate" = ${day}::date
        AND e."kind"::text IN ('EXCHANGE_EXTRA', 'EXCHANGE_ADJUSTMENT', 'EXCHANGE_BILL', 'EXCHANGE_CREDIT', 'RETURN_CREDIT', 'REVERSAL', 'ADJUSTMENT')`,
    // A cost line's figure is known when it has an entry that stands: a reversal (PR 618) and the entry it reversed
    // still add up (to 0), but neither counts as a figure, so reversing a line's only entry makes it unknown again
    // (qa-gate) instead of a 0 sent as if it were known.
    db.$queryRaw<{ line: string; minor: bigint; entries: bigint; foreign: bigint }[]>`
      SELECT c."line", COALESCE(sum(c."minor") FILTER (WHERE c."currency" = ${currency}), 0)::bigint AS "minor",
             count(*) FILTER (WHERE c."currency" = ${currency} AND NOT c."undone")::bigint AS "entries",
             count(*) FILTER (WHERE c."currency" <> ${currency} AND NOT c."undone")::bigint AS "foreign"
      FROM (
        SELECT e."summaryLine"::text AS "line", e."amountMinor" AS "minor", e."currency",
               (COALESCE(e."refType", '') = 'CostEntry'
                OR EXISTS (SELECT 1 FROM "CostEntry" r WHERE r."storeId" = e."storeId" AND r."refType" = 'CostEntry' AND r."refId" = e."id"::text)) AS "undone"
        FROM "CostEntry" e
        WHERE e."storeId" = ${storeId} AND e."summaryLine" IS NOT NULL
          AND COALESCE(e."costDate", (e."occurredAt" AT TIME ZONE ${timeZone})::date) = ${day}::date
        UNION ALL
        SELECT h."summaryLine"::text, x."amountMinor", ${currency}, false
        FROM "RetailExpense" x JOIN "ExpenseHead" h ON h."id" = x."headId" AND h."storeId" = ${storeId}
        WHERE x."storeId" = ${storeId} AND x."archivedAt" IS NULL AND h."summaryLine" IS NOT NULL AND x."date" = ${day}::date
      ) c
      GROUP BY c."line"`,
  ]);
  f.orders = orders.orders;
  f.sales = orders.sales;
  f.deliveryChargesMinor = orders.deliveryChargesMinor;
  f.deliveries = orders.deliveries;
  f.customers = orders.customers;
  f.goods = { piecesMinor: n(moves[0]?.goods), exchangeMinor: 0, unpricedDeliveries: orders.unpricedDeliveries };
  f.returnLosses = { declinedMinor: n(moves[0]?.declined), exchangeMinor: 0 };
  f.returns = { handedBackPieces: n(moves[0]?.handed), approvedCreditMinor: 0, waitingCheckMinor: n(waiting[0]?.value) };
  // Money review: a shop correction of an exchange group (its REVERSAL and its ADJUSTMENT, PR 616) and the ERP's undoing
  // of one (a REVERSAL of that ADJUSTMENT, PR 615) count as the exchange kind they correct, as the books match's tie
  // counts them (`correctionKinds`); a correction of a closed month (PRIOR_PERIOD) is its own term there, so not here.
  const corr = await correctionKinds(db, linkId, [...new Set(entries.flatMap((e) => [e.adjustmentId, e.reversedAdjustmentId]).filter((x): x is string => !!x))]);
  const asCorrected = (adjustmentId: string | null) => (adjustmentId && !corr.prior.has(adjustmentId) ? (corr.exchange.get(adjustmentId) ?? null) : null);
  // The corrections of a closed month booked today (and the ERP's undoing of one): their own figure, never a line sent.
  f.priorPeriod = (await priorPeriodByDay(db, { linkId, storeId, from: day, to: day })).get(day) ?? { minor: 0, corrections: 0 };
  for (const e of entries) {
    const priorCorrection = !!e.adjustmentId && corr.prior.has(e.adjustmentId);
    const base = e.kind === 'REVERSAL' ? (e.reversedKind === 'ADJUSTMENT' ? asCorrected(e.reversedAdjustmentId) : e.reversedKind) : e.kind === 'ADJUSTMENT' ? asCorrected(e.adjustmentId) : e.kind;
    const kind = priorCorrection && base !== 'RETURN_CREDIT' ? null : base;
    const amount = n(e.amount);
    if (kind === 'EXCHANGE_EXTRA' || kind === 'EXCHANGE_ADJUSTMENT') f.goods.exchangeMinor += amount;
    else if (kind === 'EXCHANGE_BILL' || kind === 'EXCHANGE_CREDIT') f.returnLosses.exchangeMinor += amount;
    else if (kind === 'RETURN_CREDIT') f.returns.approvedCreditMinor -= amount;
  }
  for (const c of costs) {
    const line = c.line as CostSummaryLine;
    if (!COST_SUMMARY_LINES.includes(line)) continue;
    // An entry in another currency (ad spend in USD) is not converted here: the line stays unknown until it is.
    f.costs[line] = { minor: n(c.minor), entries: n(c.foreign) > 0 ? 0 : n(c.entries) };
  }
  return f;
}

/** One day's summary as it would be sent now (nothing is kept). */
export async function buildDaySummary(deps: InventoryDeps, t: BooksTarget, day: string): Promise<AssembledSummary & { figures: DayFigures }> {
  const [figures, noCostLines] = await Promise.all([
    dayFigures(deps.db, { storeId: t.link.storeId, linkId: t.link.id, day, timeZone: t.timeZone, currency: t.currency }),
    setting(deps, t.link.storeId, 'erp.summary.noCostLines'),
  ]);
  return { ...assembleSummary(figures, { perUnit: minorPerUnit(t.currency), noCostLines }), figures };
}

// ---- versions ------------------------------------------------------------------------------------------------------------

export interface SummaryVersionRow {
  id: string;
  date: string;
  version: number;
  body: ErpDailySummary;
  bodyHash: string;
  incomplete: string[];
  netProfitMinor: number;
  /** The same lines exactly in minor units (0056), or null on a version built before them. */
  minorLines: SummaryMinor | null;
  reason: string;
  createdAt: Date;
}

const VERSION_SELECT = { id: true, date: true, version: true, body: true, bodyHash: true, incomplete: true, netProfitMinor: true, minorLines: true, reason: true, createdAt: true } as const;
const versionOf = (r: Prisma.ErpDailySummaryGetPayload<{ select: typeof VERSION_SELECT }>): SummaryVersionRow => ({
  ...r,
  date: dayText(r.date),
  body: r.body as unknown as ErpDailySummary,
  netProfitMinor: minorOf(r.netProfitMinor),
  minorLines: (r.minorLines ?? null) as SummaryMinor | null,
});

/** The months of the link closed by the books (PR 616): a month's latest MONTH close that is not a re-open. */
export async function closedMonths(db: Db, linkId: string): Promise<Set<string>> {
  const rows = await db.booksPeriodClose.findMany({ where: { linkId, level: 'MONTH' }, orderBy: [{ periodStart: 'asc' }, { version: 'desc' }], select: { periodStart: true, reopens: true } });
  const out = new Set<string>();
  const seen = new Set<string>();
  for (const r of rows) {
    const m = dayText(r.periodStart).slice(0, 7);
    if (seen.has(m)) continue;
    seen.add(m);
    if (r.reopens == null) out.add(m);
  }
  return out;
}

export type RecordOutcome = { created: boolean; version: SummaryVersionRow | null; closed?: boolean };

/**
 * Builds a day and keeps it as a new version when its figures changed — the body sent or its exact minor lines (a
 * change of 10 paisa can leave the whole-taka body as it was, and the books tie with the minor lines). The first version
 * of a day is always kept (a day since the link started); a later one only while the day is open (`books.resend.days`,
 * its month not closed). The open-day and closed-month checks and the write run under the link's lock (the books'
 * `lockLink`, which the day and month closes of PR 616 take too), so a month closed at that moment is never written into.
 */
export async function recordDaySummary(deps: InventoryDeps, t: BooksTarget, day: string, reason: SummaryBuildReason): Promise<RecordOutcome> {
  const { link } = t;
  if (day < link.startDay) return { created: false, version: null };
  const s = await buildDaySummary(deps, t, day);
  const resendDays = await setting(deps, link.storeId, 'books.resend.days');
  try {
    return await deps.db.$transaction(async (tx) => {
      await lockLink(tx, link);
      const latest = await tx.erpDailySummary.findFirst({ where: { linkId: link.id, date: asDate(day) }, orderBy: { version: 'desc' }, select: VERSION_SELECT });
      if (latest && latest.bodyHash === s.bodyHash && stableJson(latest.minorLines) === stableJson(s.minor)) return { created: false, version: versionOf(latest) };
      if (latest && !dayOpen(day, localNow(nowOf(deps), t.timeZone).day, resendDays, await closedMonths(tx, link.id))) return { created: false, version: versionOf(latest), closed: true };
      const row = await tx.erpDailySummary.create({
        data: {
          storeId: link.storeId,
          linkId: link.id,
          date: asDate(day),
          version: (latest?.version ?? 0) + 1,
          body: s.body as unknown as Prisma.InputJsonValue,
          bodyHash: s.bodyHash,
          incomplete: s.incomplete,
          netProfitMinor: BigInt(s.netProfitMinor),
          minorLines: s.minor as unknown as Prisma.InputJsonValue,
          reason: latest ? (reason === 'NIGHTLY' ? 'LATE_FACT' : reason) : reason,
        },
        select: VERSION_SELECT,
      });
      return { created: true, version: versionOf(row) };
    }, TX);
  } catch (e) {
    // Built at the same moment by another run: that version stands.
    if ((e as { code?: string }).code !== 'P2002') throw e;
    const row = await deps.db.erpDailySummary.findFirstOrThrow({ where: { linkId: link.id, date: asDate(day) }, orderBy: { version: 'desc' }, select: VERSION_SELECT });
    return { created: false, version: versionOf(row) };
  }
}

// ---- sending and the log -------------------------------------------------------------------------------------------------

export interface SendOutcome {
  accepted: boolean;
  httpStatus: number | null;
  error: string | null;
  /** Not sent: another run holds this version's send, or it was no longer due when read under the lock. */
  skipped?: boolean;
}

/**
 * The Idempotency-Key of a try: the same for every try of a version until the ERP gives a final answer — accepted, or
 * refused (a 4xx, `isRefusal`) — so a try whose answer was lost is never kept twice; a new round after each final
 * answer (the ERP lost the day, asked for it again, or is asked again after a refusal), because the ERP answers a known
 * key from its record and would neither keep the day again nor look at it again.
 */
export const summaryKey = (linkId: string, v: { date: string; version: number }, rounds: number): string => `summary:${linkId}:${v.date}:v${v.version}:r${rounds}`;

/** How a version has been sent so far (ErpBooksSend, oldest first). */
export interface SendState {
  tries: number;
  /** Failed tries since the last final answer (the retry waits count these). */
  failed: number;
  accepted: boolean;
  /** The last answer was a refusal (a 4xx, `isRefusal`): not tried again by itself. */
  refused: boolean;
  /** Final answers so far (accepted or refused): the key round of the next send. */
  rounds: number;
  lastAt: Date | null;
  lastAcceptedAt: Date | null;
  lastError: string | null;
  lastStatus: number | null;
}

const emptyState = (): SendState => ({ tries: 0, failed: 0, accepted: false, refused: false, rounds: 0, lastAt: null, lastAcceptedAt: null, lastError: null, lastStatus: null });

function foldSends(rows: readonly { refId: string; sentAt: Date; accepted: boolean; error: string | null; httpStatus: number | null }[]): Map<string, SendState> {
  const out = new Map<string, SendState>();
  for (const r of rows) {
    const s = out.get(r.refId) ?? emptyState();
    s.tries++;
    const refused = !r.accepted && isRefusal(r.httpStatus);
    if (r.accepted) {
      s.accepted = true;
      s.lastAcceptedAt = r.sentAt;
    }
    if (r.accepted || refused) {
      s.rounds++;
      s.failed = 0;
    } else s.failed++;
    s.refused = refused;
    s.lastAt = r.sentAt;
    s.lastError = r.accepted ? null : r.error;
    s.lastStatus = r.httpStatus;
    out.set(r.refId, s);
  }
  return out;
}

export async function sendStates(db: Db, linkId: string, refIds: string[]): Promise<Map<string, SendState>> {
  if (!refIds.length) return new Map();
  const rows = await db.erpBooksSend.findMany({ where: { linkId, refId: { in: refIds } }, orderBy: [{ sentAt: 'asc' }, { attempt: 'asc' }], select: { refId: true, sentAt: true, accepted: true, error: true, httpStatus: true } });
  return foldSends(rows);
}

/** One send of a version (a day's summary, PR 618 a month's fixed costs). */
export interface LoggedSend {
  kind: 'DAILY_SUMMARY' | 'FIXED_COSTS';
  refId: string;
  doc: Parameters<ErpApi['push']>[0];
  /** The Idempotency-Key from the key round (`SendState.rounds`). */
  key: (rounds: number) => string;
  /** Read again under the version's lock: false when another run sent it meanwhile and its wait is not over. */
  due?: (s: SendState) => boolean;
}

/**
 * One try of a version, logged with the ERP's answer (ErpBooksSend), accepted or not. One run at a time per version
 * (qa-gate): the send holds the version's advisory lock for the ERP call, and a run that finds it held skips, so two
 * overlapping ticks never log two tries or move the retry waits on. The state is read under the lock.
 */
export async function pushLogged(deps: InventoryDeps, t: BooksTarget, send: LoggedSend): Promise<SendOutcome> {
  const api = t.api;
  if (!api) return { accepted: false, httpStatus: null, error: 'NOT_CONNECTED' };
  const policy = await retryPolicy(deps);
  return deps.db.$transaction(
    async (tx) => {
      const [{ locked } = { locked: false }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`books-send:${send.refId}`}, 0)) AS "locked"`;
      if (!locked) return { accepted: false, httpStatus: null, error: null, skipped: true };
      const rows = await tx.erpBooksSend.findMany({ where: { linkId: t.link.id, refId: send.refId }, orderBy: [{ sentAt: 'asc' }, { attempt: 'asc' }], select: { refId: true, sentAt: true, accepted: true, error: true, httpStatus: true } });
      const state = foldSends(rows).get(send.refId) ?? emptyState();
      if (send.due && !send.due(state)) return { accepted: false, httpStatus: null, error: null, skipped: true };
      const sentAt = nowOf(deps);
      let out: SendOutcome;
      let answer: unknown = null;
      try {
        const r = await api.push(send.doc, { idempotencyKey: send.key(state.rounds), timeoutMs: policy.timeoutMs });
        answer = r.body;
        out = { accepted: r.status >= 200 && r.status < 300, httpStatus: r.status, error: null };
      } catch (e) {
        const err = toErpError(e);
        answer = err.detailsBody;
        out = { accepted: false, httpStatus: err.status, error: `${err.code}${err.erpCode ? ` ${err.erpCode}` : ''}: ${err.message}`.slice(0, 500) };
      }
      await tx.erpBooksSend.create({
        data: {
          storeId: t.link.storeId,
          linkId: t.link.id,
          kind: send.kind,
          refId: send.refId,
          attempt: state.tries + 1,
          sentAt,
          httpStatus: out.httpStatus,
          accepted: out.accepted,
          answer: answer == null ? undefined : (answer as Prisma.InputJsonValue),
          error: out.error,
        },
      });
      return out;
    },
    { maxWait: TX.maxWait, timeout: TX.timeout + policy.timeoutMs },
  );
}

/** One try of a summary version: `PUT /daily-summaries/{date}`. */
export function sendSummaryVersion(deps: InventoryDeps, t: BooksTarget, v: SummaryVersionRow, due?: (s: SendState) => boolean): Promise<SendOutcome> {
  return pushLogged(deps, t, { kind: 'DAILY_SUMMARY', refId: v.id, doc: { type: 'dailySummary.put', date: v.date, body: v.body }, key: (rounds) => summaryKey(t.link.id, v, rounds), due });
}

/**
 * Is a version due a send now? Never after it was accepted, unless the ERP asked for the day afterwards (`askedAt`);
 * never after a refusal, unless the ERP asked for the day afterwards; else at once the first time and after the retry
 * waits (`erp.summary.retry.minutes`) since the last failed try.
 */
export function sendDue(s: SendState | undefined, now: Date, waits: readonly number[], askedAt?: Date | null): boolean {
  if (!s?.lastAt) return true;
  const askedAfter = !!askedAt && askedAt > s.lastAt;
  if (s.accepted && !(s.lastAcceptedAt && askedAt && s.lastAcceptedAt < askedAt)) return false;
  if (askedAfter) return true;
  if (s.accepted) return now >= nextTryAt(s.lastAt, Math.max(s.failed, 1), waits);
  if (s.refused) return false;
  return now >= nextTryAt(s.lastAt, s.failed, waits);
}

/** The latest version of each day of the link (oldest day first), optionally only from `from`. */
export async function latestVersions(db: Db, linkId: string, opts: { from?: string; to?: string } = {}): Promise<SummaryVersionRow[]> {
  const rows = await db.erpDailySummary.findMany({
    where: { linkId, ...(opts.from || opts.to ? { date: { ...(opts.from ? { gte: asDate(opts.from) } : {}), ...(opts.to ? { lte: asDate(opts.to) } : {}) } } : {}) },
    orderBy: [{ date: 'asc' }, { version: 'desc' }],
    select: VERSION_SELECT,
  });
  const out: SummaryVersionRow[] = [];
  for (const r of rows) if (!out.length || out.at(-1)!.date !== dayText(r.date)) out.push(versionOf(r));
  return out;
}

/**
 * The latest version of each day before `before` that the tick may still have to send (qa-gate: never the whole history
 * every tick): those the ERP has not accepted yet, and those of the days the ERP asked for. Oldest day first.
 */
export async function pendingVersions(db: Db, linkId: string, opts: { before: string; asked: readonly string[] }): Promise<SummaryVersionRow[]> {
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT s."id"::text AS "id" FROM (
      SELECT DISTINCT ON ("date") "id", "date" FROM "ErpDailySummary"
      WHERE "linkId" = ${linkId}::uuid AND "date" < ${opts.before}::date ORDER BY "date", "version" DESC
    ) s
    WHERE s."date" = ANY(${[...opts.asked]}::date[])
       OR NOT EXISTS (SELECT 1 FROM "ErpBooksSend" b WHERE b."linkId" = ${linkId}::uuid AND b."refId" = s."id" AND b."accepted")`;
  if (!ids.length) return [];
  const rows = await db.erpDailySummary.findMany({ where: { linkId, id: { in: ids.map((r) => r.id) } }, orderBy: { date: 'asc' }, select: VERSION_SELECT });
  return rows.map(versionOf);
}

/** The days the ERP asked for (`summary.missing`, in the store's event ledger) since `since`, with when it asked. */
async function askedDays(db: Db, linkId: string, since: Date): Promise<Map<string, Date>> {
  const rows = await db.erpEvent.findMany({ where: { linkId, type: 'summary.missing', receivedAt: { gte: since } }, select: { data: true, receivedAt: true } });
  const out = new Map<string, Date>();
  for (const r of rows) {
    const dates = (r.data as { dates?: unknown })?.dates;
    if (!Array.isArray(dates)) continue;
    for (const d of dates) {
      if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) continue;
      const day = d.slice(0, 10);
      const prev = out.get(day);
      if (!prev || prev < r.receivedAt) out.set(day, r.receivedAt);
    }
  }
  return out;
}

export interface SummaryTickResult {
  linked: boolean;
  built: number;
  sent: number;
  accepted: number;
  failed: number;
  waiting: number;
  /** Versions the ERP refused (a 4xx): left for a person, a new version or the ERP asking again. */
  refused: number;
  /** PR 618: the months' fixed costs sent in the same tick. */
  fixed: FixedSendResult;
}

/**
 * The tick (job `inventory.books.summaryTick`): yesterday's summary from the send time, every day since the link
 * started that has no version, the days the ERP asked for, and every version not accepted yet whose wait is over.
 */
export async function summaryTick(deps: InventoryDeps, storeId: number): Promise<SummaryTickResult> {
  const out: SummaryTickResult = { linked: false, built: 0, sent: 0, accepted: 0, failed: 0, waiting: 0, refused: 0, fixed: { sent: 0, accepted: 0, failed: 0, waiting: 0, refused: 0 } };
  const t = await booksTarget(deps, storeId);
  if (!t) return out;
  out.linked = true;
  const now = nowOf(deps);
  const [sendAt, waits, gapDays] = await Promise.all([setting(deps, storeId, 'erp.summary.sendAt'), setting(deps, storeId, 'erp.summary.retry.minutes'), setting(deps, storeId, 'erp.summary.gapDays')]);
  const local = localNow(now, t.timeZone);
  const yesterday = addDays(local.day, -1);
  const from = [t.link.startDay, addDays(local.day, -gapDays)].sort().at(-1)!;
  // Days with no version yet: yesterday once the send time has come, earlier days at once (the shop was down).
  const last = sendTimeCome(local.time, sendAt) ? yesterday : addDays(yesterday, -1);
  const have = new Set((await latestVersions(deps.db, t.link.id, { from, to: last })).map((v) => v.date));
  const asked = await askedDays(deps.db, t.link.id, new Date(now.getTime() - gapDays * DAY_MS));
  for (const day of daysFrom(from, last)) {
    if (have.has(day)) continue;
    if ((await recordDaySummary(deps, t, day, 'NIGHTLY')).created) out.built++;
  }
  for (const day of asked.keys()) {
    if (day < t.link.startDay || day >= local.day || have.has(day) || (day >= from && day <= last)) continue;
    if ((await recordDaySummary(deps, t, day, 'MISSING')).created) out.built++;
  }
  // The versions still to send (not accepted, or asked for): due when never tried, when the wait after a failed try is
  // over, or when the ERP asked for the day after its last answer. A refused version waits for a person.
  const versions = await pendingVersions(deps.db, t.link.id, { before: local.day, asked: [...asked.keys()] });
  const states = await sendStates(deps.db, t.link.id, versions.map((v) => v.id));
  for (const v of versions) {
    const s = states.get(v.id);
    const askedAt = asked.get(v.date) ?? null;
    const due = (x: SendState | undefined) => sendDue(x, now, waits, askedAt);
    if (!due(s)) {
      if (s?.refused) out.refused++;
      else if (!s?.accepted) out.waiting++;
      continue;
    }
    if (!t.api) {
      out.waiting++;
      continue;
    }
    const r = await sendSummaryVersion(deps, t, v, due);
    if (r.skipped) continue;
    out.sent++;
    if (r.accepted) out.accepted++;
    else out.failed++;
  }
  out.fixed = await sendDueFixedCosts(deps, t, waits);
  return out;
}

export interface SummaryCheckResult {
  linked: boolean;
  rebuilt: number;
  checked: number;
  resent: number;
  stale: string[];
  missing: string[];
  /** PR 618: the months whose fixed costs the ERP lacked or held otherwise, sent again (check E). */
  fixedResent: string[];
}

/**
 * The check (job `inventory.books.summaryCheck`): the open days built again (a late fact makes a new version, which
 * the tick sends), then the ERP's stored copy of the last `erp.summary.gapDays`: a day it lacks or holds in another
 * version than the one it accepted is sent again at once (check D; the catch-up for a lost `summary.missing`).
 */
export async function summaryCheck(deps: InventoryDeps, storeId: number): Promise<SummaryCheckResult> {
  const out: SummaryCheckResult = { linked: false, rebuilt: 0, checked: 0, resent: 0, stale: [], missing: [], fixedResent: [] };
  const t = await booksTarget(deps, storeId);
  if (!t) return out;
  out.linked = true;
  const [resendDays, gapDays] = await Promise.all([setting(deps, storeId, 'books.resend.days'), setting(deps, storeId, 'erp.summary.gapDays')]);
  const today = localNow(nowOf(deps), t.timeZone).day;
  const yesterday = addDays(today, -1);
  const openFrom = [t.link.startDay, addDays(today, -resendDays)].sort().at(-1)!;
  const existing = new Set((await latestVersions(deps.db, t.link.id, { from: openFrom, to: yesterday })).map((v) => v.date));
  for (const day of daysFrom(openFrom, yesterday)) {
    if (!existing.has(day)) continue; // a day with no version yet is the tick's
    if ((await recordDaySummary(deps, t, day, 'LATE_FACT')).created) out.rebuilt++;
  }
  if (!t.api?.v6) return out;
  out.fixedResent = await checkFixedCosts(deps, t);
  const from = [t.link.startDay, addDays(today, -gapDays)].sort().at(-1)!;
  if (from > yesterday) return out;
  let stored: ErpStoredSummary[];
  try {
    stored = await t.api.v6.dailySummaries({ from, to: yesterday });
  } catch {
    return out; // the ERP cannot be reached now: the next check asks again
  }
  const theirs = new Map(stored.map((s) => [s.date, s]));
  const versions = await latestVersions(deps.db, t.link.id, { from, to: yesterday });
  const states = await sendStates(deps.db, t.link.id, versions.map((v) => v.id));
  for (const v of versions) {
    if (!states.get(v.id)?.accepted) continue; // not accepted yet: the tick's retries
    out.checked++;
    const verdict = storedVerdict({ netProfit: v.body.netProfit, incomplete: v.incomplete }, theirs.get(v.date));
    if (verdict === 'SAME') continue;
    (verdict === 'MISSING' ? out.missing : out.stale).push(v.date);
    if (!(await sendSummaryVersion(deps, t, v)).skipped) out.resent++;
  }
  return out;
}

// ---- PR 618 · the month's fixed costs to the ERP ---------------------------------------------------------------------------

/** One version of a month's fixed costs (ErpFixedCostMonth, append-only), in minor units. */
export interface FixedVersionRow {
  id: string;
  month: string;
  version: number;
  lines: FixedCostsMinor;
  note: string | null;
  createdAt: Date;
}

export const FIXED_SELECT = { id: true, month: true, version: true, salaryMinor: true, rentMinor: true, utilitiesMinor: true, otherMinor: true, note: true, createdAt: true } as const;

export const fixedVersionOf = (r: { id: string; month: Date; version: number; salaryMinor: bigint; rentMinor: bigint; utilitiesMinor: bigint; otherMinor: bigint; note: string | null; createdAt: Date }): FixedVersionRow => ({
  id: r.id,
  month: dayText(r.month).slice(0, 7),
  version: r.version,
  lines: { salary: minorOf(r.salaryMinor), rent: minorOf(r.rentMinor), utilities: minorOf(r.utilitiesMinor), other: minorOf(r.otherMinor) },
  note: r.note,
  createdAt: r.createdAt,
});

/** A stored version, or null when its amounts leave the exact range (qa-gate: one bad row never stops the rest). */
export function fixedVersionOrNull(r: Parameters<typeof fixedVersionOf>[0]): FixedVersionRow | null {
  try {
    const v = fixedVersionOf(r);
    fixedCostsTotal(v.lines);
    return v;
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

/** The latest version of each month the link has fixed costs for, oldest month first; a month whose latest version is
 * unreadable (amounts out of the exact range, written before the caps) is left out — the Costs page shows it. */
export async function latestFixedMonths(db: Db, linkId: string): Promise<FixedVersionRow[]> {
  const rows = await db.erpFixedCostMonth.findMany({ where: { linkId }, orderBy: [{ month: 'asc' }, { version: 'desc' }], select: FIXED_SELECT });
  const out: FixedVersionRow[] = [];
  let last = '';
  for (const r of rows) {
    const month = dayText(r.month).slice(0, 7);
    if (month === last) continue;
    last = month;
    const v = fixedVersionOrNull(r);
    if (v) out.push(v);
  }
  return out;
}

/** `PUT /fixed-costs/{month}` for one version, logged (ErpBooksSend kind FIXED_COSTS). */
export function sendFixedVersion(deps: InventoryDeps, t: BooksTarget, v: FixedVersionRow, due?: (s: SendState) => boolean): Promise<SendOutcome> {
  return pushLogged(deps, t, {
    kind: 'FIXED_COSTS',
    refId: v.id,
    doc: { type: 'fixedCosts.put', month: v.month, body: fixedCostsBody(v.month, v.lines, v.note, minorPerUnit(t.currency)) },
    key: (rounds) => fixedCostsKey(t.link.id, v.month, v.version, rounds),
    due,
  });
}

export interface FixedSendResult {
  sent: number;
  accepted: number;
  failed: number;
  waiting: number;
  /** Months the ERP refused (a 4xx): left for a person or a new version. */
  refused: number;
}

/** Every month whose latest version the ERP has not accepted yet, once its wait is over (the summary waits). */
async function sendDueFixedCosts(deps: InventoryDeps, t: BooksTarget, waits: readonly number[]): Promise<FixedSendResult> {
  const out: FixedSendResult = { sent: 0, accepted: 0, failed: 0, waiting: 0, refused: 0 };
  const now = nowOf(deps);
  const months = await latestFixedMonths(deps.db, t.link.id);
  const states = await sendStates(deps.db, t.link.id, months.map((m) => m.id));
  const due = (x: SendState | undefined) => sendDue(x, now, waits, null);
  for (const m of months) {
    const s = states.get(m.id);
    if (s?.accepted) continue;
    if (s?.refused) {
      out.refused++;
      continue;
    }
    if (!t.api || !due(s)) {
      out.waiting++;
      continue;
    }
    const r = await sendFixedVersion(deps, t, m, due);
    if (r.skipped) continue;
    out.sent++;
    if (r.accepted) out.accepted++;
    else out.failed++;
  }
  return out;
}

/** Check E's catch-up: a month the ERP lacks (`GET /fixed-costs`) or holds with other numbers is sent again at once. */
async function checkFixedCosts(deps: InventoryDeps, t: BooksTarget): Promise<string[]> {
  if (!t.api?.v6) return [];
  const months = await latestFixedMonths(deps.db, t.link.id);
  if (!months.length) return [];
  let stored: { month: string; costs: { salary: string; rent: string; utilities: string; other: string } }[];
  try {
    stored = await t.api.v6.fixedCosts();
  } catch {
    return []; // the ERP cannot be reached now: the next check asks again
  }
  const theirs = new Map(stored.map((m) => [m.month, m.costs]));
  const states = await sendStates(deps.db, t.link.id, months.map((m) => m.id));
  const perUnit = minorPerUnit(t.currency);
  const out: string[] = [];
  for (const m of months) {
    if (!states.get(m.id)?.accepted) continue; // not accepted yet: the tick's retries
    if (fixedCostsSame(m.lines, theirs.get(m.month), perUnit)) continue;
    if (!(await sendFixedVersion(deps, t, m)).skipped) out.push(m.month);
  }
  return out;
}

// ---- for the admin -------------------------------------------------------------------------------------------------------

export interface SummaryLogRow {
  date: string;
  version: number;
  reason: string;
  netProfitMinor: number;
  incomplete: string[];
  builtAt: Date;
  versions: number;
  state: 'ACCEPTED' | 'WAITING' | 'RETRYING' | 'REFUSED';
  tries: number;
  lastTryAt: Date | null;
  lastError: string | null;
  httpStatus: number | null;
  /** The day's earlier-month corrections (the shop's own figure, never in the summary sent; `priorPeriodByDay`). */
  priorPeriod?: { minor: number; corrections: number };
}

async function readAllowed(deps: InventoryDeps, who: Who): Promise<void> {
  if (!Number.isInteger(who.storeId) || who.storeId < 1) throw new InventoryError('INVALID_INPUT', 'store id must be a positive integer', ['storeId']);
  await requirePermission(deps.db, who.actor, 'books.read', { storeId: who.storeId });
}

/** The store's open link for the admin screens (never made here), or null. */
export async function openLinkOf(db: Db, storeId: number): Promise<{ id: string; startDay: string | null } | null> {
  const l = await db.erpStoreLink.findFirst({ where: { storeId, endedAt: null }, orderBy: { epoch: 'desc' }, select: { id: true, switchDate: true } });
  return l ? { id: l.id, startDay: l.switchDate ? dayText(l.switchDate) : null } : null;
}

/**
 * The summaries log the admin sees (`books.read`): each day's latest version with how it was sent — accepted, waiting
 * for its first try, being tried again, or refused by the ERP (a 4xx answer: a person looks) — newest day first.
 */
/**
 * The earlier-month corrections of each day from `from` to `to` (owner's decision, money review): the entries of the
 * corrections of a closed month (PRIOR_PERIOD) booked that day, and the ERP's undoing of one, with how many corrections
 * they belong to. The shop's own figure (`DayFigures.priorPeriod`, the books screens); contract v6 sends no line for it.
 * Days without one are left out.
 */
export async function priorPeriodByDay(db: Db, q: { linkId: string; storeId: number; from: string; to: string }): Promise<Map<string, { minor: number; corrections: number }>> {
  const rows = await db.$queryRaw<{ day: Date; amount: bigint; adj: string }[]>`
    SELECT e."businessDate" AS "day", e."amountMinor" AS "amount", COALESCE(e."adjustmentId", r."adjustmentId")::text AS "adj"
    FROM "ErpAccountEntry" e
    LEFT JOIN "ErpAccountEntry" r ON r."linkId" = e."linkId" AND r."eventId" = e."reverses"
    JOIN "BooksAdjustment" a ON a."linkId" = e."linkId" AND a."id" = COALESCE(e."adjustmentId", r."adjustmentId") AND a."kind" = 'PRIOR_PERIOD'
    WHERE e."linkId" = ${q.linkId}::uuid AND e."storeId" = ${q.storeId} AND e."businessDate" BETWEEN ${q.from}::date AND ${q.to}::date
      AND (e."adjustmentId" IS NOT NULL OR (e."kind" = 'REVERSAL' AND r."kind" = 'ADJUSTMENT'))`;
  const out = new Map<string, { minor: number; corrections: number; adjs: Set<string> }>();
  for (const x of rows) {
    const d = x.day.toISOString().slice(0, 10);
    const cur = out.get(d) ?? { minor: 0, corrections: 0, adjs: new Set<string>() };
    cur.minor += Number(x.amount);
    cur.adjs.add(x.adj);
    cur.corrections = cur.adjs.size;
    out.set(d, cur);
  }
  return new Map([...out].map(([d, v]) => [d, { minor: v.minor, corrections: v.corrections }]));
}

export async function summaryLog(deps: InventoryDeps, who: Who, opts: { days?: number } = {}): Promise<SummaryLogRow[]> {
  await readAllowed(deps, who);
  const link = await openLinkOf(deps.db, who.storeId);
  if (!link) return [];
  // From the store's own day (qa-gate): never the UTC date, which is a day behind in Dhaka until 06:00.
  const today = localNow(nowOf(deps), await setting(deps, who.storeId, 'store.timeZone')).day;
  const from = addDays(today, -(opts.days ?? 31));
  const rows = await deps.db.erpDailySummary.findMany({ where: { linkId: link.id, storeId: who.storeId, date: { gte: asDate(from) } }, orderBy: [{ date: 'desc' }, { version: 'desc' }], select: VERSION_SELECT });
  const latest: SummaryVersionRow[] = [];
  const count = new Map<string, number>();
  for (const r of rows) {
    const v = versionOf(r);
    count.set(v.date, (count.get(v.date) ?? 0) + 1);
    if (!latest.length || latest.at(-1)!.date !== v.date) latest.push(v);
  }
  const states = await sendStates(deps.db, link.id, latest.map((v) => v.id));
  const prior = await priorPeriodByDay(deps.db, { linkId: link.id, storeId: who.storeId, from, to: today });
  return latest.map((v) => {
    const s = states.get(v.id);
    const status = s?.lastStatus ?? null;
    const refused = !s?.accepted && !!s?.refused;
    return {
      date: v.date,
      version: v.version,
      reason: v.reason,
      netProfitMinor: v.netProfitMinor,
      incomplete: v.incomplete,
      builtAt: v.createdAt,
      versions: count.get(v.date) ?? 1,
      state: s?.accepted ? 'ACCEPTED' : refused ? 'REFUSED' : s?.tries ? 'RETRYING' : 'WAITING',
      tries: s?.tries ?? 0,
      lastTryAt: s?.lastAt ?? null,
      lastError: s?.lastError ?? null,
      httpStatus: status,
      ...(prior.get(v.date)?.minor ? { priorPeriod: prior.get(v.date)! } : {}),
    };
  });
}
