// S16 · PR 347 (B3.9 "a Costs section the owner asked for separately") — Money → Cost ledger → Costs report
// (`/admin/money/cost-ledger/report`) and its CSV. Every cost row (CostEntry: paid messages, the daily cost lines of
// PR 618, return losses …) of one store, for any period, added up by day, month or year and by service or by module,
// with the total of each service or module over the period and this month's AI spend against the AI cap
// (`ai.monthlyCapMinor`, the owner's own figure, none as shipped).
//
// The day a row counts on is its business day: `costDate` when it has one (a cost line entered for an earlier open day),
// else the store-time-zone day of `occurredAt` — the same rule as the ERP daily summary (PR 617/618), so a month here
// and on Month-end agree. Read-only: nothing here pays, buys or moves money.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { nextDay, ymdIn } from '@extas/metrics';

type Db = Pick<PrismaClient, '$queryRaw'>;

export const REPORT_BY = ['day', 'month', 'year'] as const;
export type ReportBy = (typeof REPORT_BY)[number];
export const REPORT_GROUP = ['service', 'module'] as const;
export type ReportGroup = (typeof REPORT_GROUP)[number];
/** The one-press periods above the form ("one click to any period"). */
export const QUICK_PERIODS = ['today', 'week', 'month', 'lastMonth', 'year', 'lastYear'] as const;
export type QuickPeriod = (typeof QUICK_PERIODS)[number];

export interface ReportQuery {
  from: string;
  to: string;
  by: ReportBy;
  group: ReportGroup;
}

export interface ReportLimits {
  /** The longest period one report covers, in days. */
  maxDays: number;
  /** The most rows a "by day" report lists (a longer period is shown by month instead, and the page says so). */
  maxDayRows: number;
}

const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isDay = (s: unknown): s is string => typeof s === 'string' && YMD.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A one-press period's first and last day, with `today` the store's own date. */
export function quickPeriod(key: QuickPeriod, today: string): { from: string; to: string } {
  const y = today.slice(0, 4);
  const month = today.slice(0, 7);
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') return { from: addDays(today, -6), to: today };
  if (key === 'month') return { from: `${month}-01`, to: today };
  if (key === 'year') return { from: `${y}-01-01`, to: today };
  if (key === 'lastYear') return { from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31` };
  const first = `${month}-01`;
  const last = addDays(first, -1);
  return { from: `${last.slice(0, 7)}-01`, to: last };
}

export type ParsedQuery = { q: ReportQuery; notes: ('future' | 'swapped' | 'tooLong' | 'byMonth')[] };

/**
 * The report's period and grouping from the page's query (`from`, `to`, `by`, `group`), made safe: this month by day and
 * by service when nothing is given; never past today; a reversed period is turned round; a period longer than
 * `maxDays` is cut to its last `maxDays` days; "by day" over more than `maxDayRows` days is shown by month. Each change
 * is named in `notes`, so the page can say what it did.
 */
export function parseReportQuery(sp: Record<string, string | string[] | undefined>, today: string, limits: ReportLimits): ParsedQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const notes: ParsedQuery['notes'] = [];
  const quick = QUICK_PERIODS.find((p) => p === one('period'));
  const base = quick ? quickPeriod(quick, today) : quickPeriod('month', today);
  let from = !quick && isDay(one('from')) ? one('from')! : base.from;
  let to = !quick && isDay(one('to')) ? one('to')! : base.to;
  if (to > today) {
    to = today;
    notes.push('future');
  }
  if (from > to) {
    [from, to] = [to, from];
    notes.push('swapped');
  }
  if (daysBetween(from, to) > limits.maxDays) {
    from = addDays(to, -(limits.maxDays - 1));
    notes.push('tooLong');
  }
  let by = REPORT_BY.find((b) => b === one('by')) ?? 'day';
  if (by === 'day' && daysBetween(from, to) > limits.maxDayRows) {
    by = 'month';
    notes.push('byMonth');
  }
  const group = REPORT_GROUP.find((g) => g === one('group')) ?? 'service';
  return { q: { from, to, by, group }, notes };
}

export interface ReportPart {
  key: string;
  minor: number;
  count: number;
}
export interface ReportBucket {
  /** YYYY-MM-DD, YYYY-MM or YYYY */
  bucket: string;
  minor: number;
  count: number;
  parts: ReportPart[];
}
export interface CostReport {
  query: ReportQuery;
  total: { minor: number; count: number };
  /** Each service (or module) over the whole period, the largest first. */
  groups: ReportPart[];
  /** Each day, month or year that has a cost row, the newest first. */
  buckets: ReportBucket[];
}

/** The group key of rows that have no module (messages before modules were named …). */
export const NO_MODULE = '';

const FORMAT: Record<ReportBy, string> = { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' };
const COLUMN: Record<ReportGroup, Prisma.Sql> = { service: Prisma.sql`"service"`, module: Prisma.sql`COALESCE("module", '')` };

const byMinor = (a: ReportPart, b: ReportPart) => b.minor - a.minor || a.key.localeCompare(b.key);

/** The report of one store (the business-day rule at the top of this file). */
export async function costReport(db: Db, storeId: number, q: ReportQuery, timeZone: string): Promise<CostReport> {
  const rows = await db.$queryRaw<{ bucket: string; key: string; minor: bigint; count: number }[]>`
    SELECT to_char(x.day, ${FORMAT[q.by]}) AS bucket, x.key AS key, SUM(x.amount)::bigint AS minor, COUNT(*)::int AS count
      FROM (SELECT COALESCE("costDate", ("occurredAt" AT TIME ZONE ${timeZone})::date) AS day, ${COLUMN[q.group]} AS key, "amountMinor" AS amount
              FROM "CostEntry" WHERE "storeId" = ${storeId}) x
     WHERE x.day >= ${q.from}::date AND x.day < ${nextDay(q.to)}::date
     GROUP BY 1, 2`;
  const buckets = new Map<string, ReportBucket>();
  const groups = new Map<string, ReportPart>();
  let minor = 0;
  let count = 0;
  for (const r of rows) {
    const v = Number(r.minor);
    minor += v;
    count += r.count;
    const b = buckets.get(r.bucket) ?? { bucket: r.bucket, minor: 0, count: 0, parts: [] };
    b.minor += v;
    b.count += r.count;
    b.parts.push({ key: r.key, minor: v, count: r.count });
    buckets.set(r.bucket, b);
    const g = groups.get(r.key) ?? { key: r.key, minor: 0, count: 0 };
    g.minor += v;
    g.count += r.count;
    groups.set(r.key, g);
  }
  const list = [...buckets.values()].sort((a, b) => b.bucket.localeCompare(a.bucket));
  for (const b of list) b.parts.sort(byMinor);
  return { query: q, total: { minor, count }, groups: [...groups.values()].sort(byMinor), buckets: list };
}

/** The AI service's spend this month (the store's own month) against the owner's monthly cap. */
export interface AiAgainstCap {
  month: string;
  spentMinor: number;
  capMinor: number | null;
  /** Whole per cent of the cap used, or null without a cap. */
  usedPct: number | null;
  over: boolean;
}

/** This store's AI cost rows this month against `ai.monthlyCapMinor` (none set: no cap, never 0). */
export async function aiAgainstCap(db: Db, storeId: number, timeZone: string, capMinor: number | null, now = new Date()): Promise<AiAgainstCap> {
  const today = ymdIn(now, timeZone);
  const month = today.slice(0, 7);
  const r = await costReport(db, storeId, { from: `${month}-01`, to: today, by: 'month', group: 'service' }, timeZone);
  const spentMinor = r.groups.find((g) => g.key === 'AI')?.minor ?? 0;
  const capped = capMinor !== null && capMinor > 0 ? capMinor : null;
  return { month, spentMinor, capMinor: capped, usedPct: capped === null ? null : Math.floor((spentMinor * 100) / capped), over: capped !== null && spentMinor > capped };
}

/** One CSV cell (a leading = + - @ is defused for spreadsheets; quoted when needed). */
function cell(v: string | number): string {
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** The report as a CSV text: one line per period and service (or module), amounts in minor units. */
export function reportCsv(r: CostReport, currency: string): string {
  const head = ['period', r.query.group, 'amountMinor', 'currency', 'rows'];
  const lines = [...r.buckets].reverse().flatMap((b) => b.parts.map((p) => [b.bucket, p.key, p.minor, currency, p.count].map(cell).join(',')));
  return [head.join(','), ...lines, ['total', '', r.total.minor, currency, r.total.count].map(cell).join(',')].join('\r\n') + '\r\n';
}

/** The CSV's file name: costs-by-<by>-<group>-<from>-<to>.csv */
export const reportFileName = (q: ReportQuery) => `costs-by-${q.by}-${q.group}-${q.from}-${q.to}.csv`;
