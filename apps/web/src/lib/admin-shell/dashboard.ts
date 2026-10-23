// PR 12, PR 155 (follow-up 90) — what the Dashboard (DSH-01, docs/BACKEND-ARCHITECTURE.md §5.2) needs that is not
// drawing: the date choice, the greeting's part of the day, the money pair through
// @extas/metrics (Sales, M1 = the goods value of delivered orders on the delivered day, no delivery charge; Ordered
// value = the total of every placed order on the placed day; never added up anywhere else) with the period before it
// for the ▲/▼, and how old a waiting item is.
import type { PrismaClient } from '@extas/db/client';
import { dayStart, kpi, kpiByDay, lastDays, type Kpi } from '@extas/metrics';

export interface DashboardSettings {
  ranges: number[];
  afternoonHour: number;
  eveningHour: number;
  sparkDays: number;
}

/** The date choice from `?range=`: one of the setting's choices, else the first. */
export function rangeOf(raw: string | undefined, ranges: readonly number[]): number {
  const n = Number(raw);
  return ranges.includes(n) ? n : ranges[0]!;
}

/** The greeting's part of the day at this hour (0–23, store time zone). */
export function partOfDay(hour: number, s: Pick<DashboardSettings, 'afternoonHour' | 'eveningHour'>): 'morning' | 'afternoon' | 'evening' {
  return hour < s.afternoonHour ? 'morning' : hour < s.eveningHour ? 'afternoon' : 'evening';
}

/** The hour of a moment in a time zone (0–23). */
export function hourIn(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(at)) % 24;
}

/** The change from the period before as a fraction, or null when there is nothing to compare with. */
export function trend(cur: number, prev: number): number | null {
  return prev > 0 ? (cur - prev) / prev : null;
}

export interface MoneyPair {
  days: number;
  current: Kpi;
  previous: Kpi;
  /** Day by day for the last `sparkDays` (oldest first): Sales (goods alone, M1) and Ordered value (order totals). */
  spark: { sales: number[]; ordered: number[] };
}

/** The money pair for the last `days` shop days and the same number of days before them. */
export async function moneyPair(db: PrismaClient, storeId: number, days: number, now: Date, timeZone: string, sparkDays: number): Promise<MoneyPair> {
  const cur = lastDays(days, now, timeZone);
  const before = lastDays(days, new Date(dayStart(cur.from, timeZone).getTime() - 1), timeZone);
  const spark = lastDays(sparkDays, now, timeZone);
  const [current, previous, byDay] = await Promise.all([kpi(db, storeId, cur.period), kpi(db, storeId, before.period), kpiByDay(db, storeId, spark, timeZone)]);
  return { days, current, previous, spark: { sales: byDay.map((r) => r.sales.itemsMinor), ordered: byDay.map((r) => r.ordered.valueMinor) } };
}

export type Age = { unit: 'now' } | { unit: 'm' | 'h' | 'd'; n: number };

/** How long ago, in the largest whole unit that reads well (minutes under an hour, hours under two days). */
export function ageOf(iso: string | null, now: Date): Age | null {
  if (!iso) return null;
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return { unit: 'now' };
  if (min < 60) return { unit: 'm', n: min };
  const h = Math.floor(min / 60);
  return h < 48 ? { unit: 'h', n: h } : { unit: 'd', n: Math.floor(h / 24) };
}
