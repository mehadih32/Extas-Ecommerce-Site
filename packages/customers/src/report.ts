// PR 303 — Reports › Customers (REP-04, BACKEND-ARCHITECTURE §5.12; demo V12.4 #/admin/reports/customers): over a period,
// how many people bought for the first time (new), how many had bought before and came back (returning), how many have
// gone quiet (churned: an earlier order, none in the period and none in the owner's `quietDays` up to its end) and the
// repeat rate (of the period's buyers, those with two orders or more by its end) — overall and per saved segment.
//
// One person is the Customers list's own (people-sql.ts `peopleBaseSql`): the profile he stays under with the profiles
// merged into it and his guest orders by number; an order counts when it was placed (the "ordered" status rule of
// @extas/metrics, drafts left out), archived orders never. The report shows counts only — no money figure, so nothing
// here adds up order money (the one KPI rule stays in @extas/metrics). The segments are the store's live saved segments
// (newest first, at most `segmentsShown`), counted with their own conditions (segments.ts), only while the owner's
// `customers.segments` switch is on.
//
// Off as shipped (`customers.report`): then nothing is counted. Seeing it needs `reports.read`. It never writes, sends
// or changes anything, and it holds no customer's details.
import { requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { statusRule } from '@extas/metrics';
import { checkStoreId, nowOf, setting, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { readDefinition } from './segment-rules';
import { baseOf, definitionSql } from './segments';

const DAY_MS = 86_400_000;
export const CUSTOMER_REPORT_PERMISSION = 'reports.read' as const;

/** The period's people, each counted once. */
export interface ReportCounts {
  /** Placed an order in the period. */
  buyers: number;
  /** Their first order ever is in the period. */
  newBuyers: number;
  /** Had ordered before the period and ordered again in it. */
  returning: number;
  /** Ordered before, nothing in the period, and nothing in the last `quietDays` up to its end. */
  quiet: number;
  /** Buyers of the period with two orders or more by its end. */
  repeaters: number;
}

export interface ReportSegment extends ReportCounts {
  id: string;
  name: string;
  /** Everyone who matches the segment now. */
  people: number;
}

export interface CustomerReport {
  enabled: boolean;
  quietDays: number;
  from: Date;
  to: Date;
  /** Null while the report is off. */
  totals: (ReportCounts & { repeatRate: number | null }) | null;
  /** Whether saved segments are on (`customers.segments`); the report splits by them only then. */
  segmentsOn: boolean;
  segments: ReportSegment[];
  /** Live saved segments left out by `segmentsShown`. */
  segmentsMore: number;
}

const COUNTS = ['buyers', 'newBuyers', 'returning', 'quiet', 'repeaters'] as const;

/** The report for `[from, to)`; `to` defaults to now. */
export async function customerReport(deps: CustomersDeps, who: Who, period: { from: Date; to?: Date }): Promise<CustomerReport> {
  checkStoreId(who.storeId);
  await requirePermission(deps.db, who.actor, CUSTOMER_REPORT_PERMISSION, { storeId: who.storeId });
  const S = who.storeId;
  const to = period.to ?? nowOf(deps);
  const from = period.from;
  if (!(from instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new CustomersError('INVALID_INPUT', 'the period is not valid', ['from', 'to']);
  const [rep, seg] = await Promise.all([setting(deps, S, 'customers.report'), setting(deps, S, 'customers.segments')]);
  const out: CustomerReport = { enabled: rep.enabled, quietDays: rep.quietDays, from, to, totals: null, segmentsOn: seg.enabled, segments: [], segmentsMore: 0 };
  if (!rep.enabled) return out;

  const live = seg.enabled ? await deps.db.segment.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, definition: true } }) : [];
  const readable = live.flatMap((s) => {
    const def = readDefinition(s.definition);
    return def ? [{ ...s, def }] : [];
  });
  const shown = readable.slice(0, rep.segmentsShown);
  out.segmentsMore = readable.length - shown.length;

  const quietSince = new Date(to.getTime() - rep.quietDays * DAY_MS);
  const flag: Record<(typeof COUNTS)[number], Prisma.Sql> = {
    buyers: Prisma.sql`COALESCE(a.inp, false)`,
    newBuyers: Prisma.sql`COALESCE(a.inp AND a.first_at >= ${from}, false)`,
    returning: Prisma.sql`COALESCE(a.inp AND a.first_at < ${from}, false)`,
    quiet: Prisma.sql`COALESCE(a.upto > 0 AND NOT a.inp AND a.last_at < ${quietSince}, false)`,
    repeaters: Prisma.sql`COALESCE(a.inp AND a.upto >= 2, false)`,
  };
  const c = { storeId: S, now: nowOf(deps) };
  const cols: Prisma.Sql[] = COUNTS.map((k) => Prisma.sql`count(*) FILTER (WHERE ${flag[k]}) AS ${Prisma.raw(`"${k}"`)}`);
  shown.forEach((s, i) => {
    const where = definitionSql(s.def, c);
    cols.push(Prisma.sql`count(*) FILTER (WHERE ${where}) AS ${Prisma.raw(`"s${i}_people"`)}`);
    for (const k of COUNTS) cols.push(Prisma.sql`count(*) FILTER (WHERE ${where} AND ${flag[k]}) AS ${Prisma.raw(`"s${i}_${k}"`)}`);
  });
  const base = await baseOf(deps, S);
  // per person: his first order ever, and up to the period's end his orders and his last one, and one in the period
  const act = Prisma.sql`, act AS (
      SELECT own.k,
             min(o."placedAt") AS first_at,
             max(o."placedAt") FILTER (WHERE o."placedAt" < ${to}) AS last_at,
             count(*) FILTER (WHERE o."placedAt" < ${to}) AS upto,
             bool_or(o."placedAt" >= ${from} AND o."placedAt" < ${to}) AS inp
      FROM own JOIN "Order" o ON o."id" = own."id"
      WHERE o."storeId" = ${S} AND o."archivedAt" IS NULL AND o."placedAt" IS NOT NULL AND ${statusRule('ordered')}
      GROUP BY own.k)`;
  const row = (await deps.db.$queryRaw<Record<string, bigint | number>[]>`${base}${act} SELECT ${Prisma.join(cols, ', ')} FROM base b LEFT JOIN act a ON a.k = b."id"::text`)[0] ?? {};
  const num = (k: string) => Number(row[k] ?? 0);
  const counts = (prefix: string): ReportCounts => Object.fromEntries(COUNTS.map((k) => [k, num(`${prefix}${k}`)])) as unknown as ReportCounts;
  const totals = counts('');
  out.totals = { ...totals, repeatRate: totals.buyers ? totals.repeaters / totals.buyers : null };
  out.segments = shown.map((s, i) => ({ id: s.id, name: s.name, people: num(`s${i}_people`), ...counts(`s${i}_`) }));
  return out;
}
