// S28 · PR 714-717 (CN-048; prototype v5 Reports › Profit, Products, Marketing & ads, Monthly review) — the pure part shared by
// the four report pages: the span before a period, a figure's change, a day-by-day line for the hero chart, the rule-based
// "went well / went badly / next" lines of the Monthly review, and the CSV files. No database, no React: every figure arrives
// already counted by the existing money, catalogue and marketing queries, nothing here makes a number up or adds money.
import type { HeroRange } from '@/components/admin/lumen/HeroChart';

const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day

/** `ymd` moved by `n` days (UTC date arithmetic on the shop's own day string). */
export function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, oldest first; at most `cap` days (the newest ones when it is longer). */
export function daysBetween(from: string, to: string, cap: number): string[] {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  const n = Math.min(cap, Math.round((b - a) / DAY_MS) + 1);
  return Array.from({ length: n }, (_, i) => addDays(to, i - (n - 1)));
}

/** The span of the same length that ends the day before `from`. */
export function previousSpan(from: string, to: string): { from: string; to: string } {
  const len = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/** The number of days of a span (both ends counted). */
export const spanDays = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1);

/** `now` against `before` as a fraction (0.1 = up 10%); null when there is nothing to compare. */
export function change(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return (now - before) / Math.abs(before);
}

/** The same, per day (spans of different length). */
export function changePerDay(now: number | null, nowDays: number, before: number | null, beforeDays: number): number | null {
  return change(now === null ? null : now / Math.max(1, nowDays), before === null ? null : before / Math.max(1, beforeDays));
}

/** A share as a percentage with one decimal; null when there is no base. */
export function pct(part: number | null, whole: number): number | null {
  return part === null || whole <= 0 ? null : Math.round((part * 1000) / whole) / 10;
}

/** The value of each of `days` from the rows that have a day (days with no row count 0). */
export function seriesOf<T extends { day: string }>(days: readonly string[], rows: readonly T[], pick: (r: T) => number): number[] {
  const by = new Map(rows.map((r) => [r.day, pick(r)]));
  return days.map((d) => by.get(d) ?? 0);
}

export interface HeroInput {
  key: string;
  label: string;
  days: readonly string[];
  values: readonly number[];
  /** The span before, on the same points (drawn dashed); left out when its length differs. */
  before?: readonly number[];
  /** The figure's own total (what the big number says); the sum of `values` when left out. */
  total?: number;
  delta?: number | null;
  vs?: string;
  amount: (minor: number) => string;
  dayLabel: (ymd: string) => string;
  mini?: readonly { label: string; shown: string }[];
}

/** One range of the hero chart (the Lumen pattern of PR 627) from a day-by-day series. */
export function heroRange(i: HeroInput): HeroRange {
  const total = i.total ?? i.values.reduce((s, v) => s + v, 0);
  const prev = i.before && i.before.length === i.values.length ? [...i.before] : undefined;
  return {
    key: i.key,
    label: i.label,
    total,
    shown: i.amount(total),
    ...(i.delta !== undefined ? { delta: i.delta } : {}),
    ...(i.vs ? { vs: i.vs } : {}),
    ...(prev ? { prev } : {}),
    points: i.days.map((d, n) => ({ label: i.dayLabel(d), value: i.values[n] ?? 0, shown: i.amount(i.values[n] ?? 0), ...(prev ? { prevShown: i.amount(prev[n] ?? 0) } : {}) })),
    ...(i.mini ? { mini: i.mini } : {}),
  };
}

/* ---------------- Monthly review: the rule-based lines (no AI, no thresholds of its own) ---------------- */

export interface ReviewGroup {
  name: string;
  salesMinor: number;
  costedSalesMinor: number;
  profitMinor: number;
}

export interface ReviewFacts {
  salesChange: number | null;
  profitChange: number | null;
  netProfitMinor: number | null;
  adsUnknown: boolean;
  uncostedOrders: number;
  returnRate: number | null;
  returnRateBefore: number | null;
  groups: readonly ReviewGroup[];
  restockStyles: number | null;
  unsoldStyles: number | null;
}

export interface ReviewLine {
  /** The words key under `reportsV5.review.line.*`. */
  key: string;
  vars: Record<string, string | number>;
  href?: string;
}

const margin = (g: ReviewGroup) => (g.costedSalesMinor > 0 ? g.profitMinor / g.costedSalesMinor : null);

/** Went well, went badly and up to three next steps, from the month's own figures only. */
export function reviewLines(f: ReviewFacts, fmt: { money: (minor: number) => string; pct: (fraction: number) => string }): { good: ReviewLine[]; bad: ReviewLine[]; next: ReviewLine[] } {
  const good: ReviewLine[] = [];
  const bad: ReviewLine[] = [];
  const next: ReviewLine[] = [];
  const withSales = f.groups.filter((g) => g.salesMinor > 0 && g.name);
  const best = [...withSales].sort((a, b) => b.profitMinor - a.profitMinor)[0];
  const margins = withSales.map((g) => ({ g, m: margin(g) })).filter((x): x is { g: ReviewGroup; m: number } => x.m !== null);
  const thin = margins.length > 1 ? [...margins].sort((a, b) => a.m - b.m)[0] : undefined;

  if (f.salesChange !== null) (f.salesChange >= 0 ? good : bad).push({ key: f.salesChange >= 0 ? 'salesUp' : 'salesDown', vars: { pct: fmt.pct(Math.abs(f.salesChange)) } });
  // a loss has its own line below; the change line is for a month that still made money
  if (f.profitChange !== null && f.netProfitMinor !== null && f.netProfitMinor >= 0) (f.profitChange >= 0 ? good : bad).push({ key: f.profitChange >= 0 ? 'profitUp' : 'profitDown', vars: { pct: fmt.pct(Math.abs(f.profitChange)), amount: fmt.money(f.netProfitMinor) } });
  if (f.netProfitMinor !== null && f.netProfitMinor < 0) bad.push({ key: 'loss', vars: { amount: fmt.money(Math.abs(f.netProfitMinor)) } });
  if (best && best.profitMinor > 0) good.push({ key: 'bestGroup', vars: { name: best.name, amount: fmt.money(best.profitMinor) } });
  if (f.returnRate !== null && f.returnRateBefore !== null) (f.returnRate <= f.returnRateBefore ? good : bad).push({ key: f.returnRate <= f.returnRateBefore ? 'returnsDown' : 'returnsUp', vars: { now: `${f.returnRate}%`, before: `${f.returnRateBefore}%` } });
  if (thin && thin.m < 0) bad.push({ key: 'thinGroup', vars: { name: thin.g.name, pct: fmt.pct(thin.m) } });
  else if (thin && margins.length > 1 && thin.g !== best) bad.push({ key: 'lowGroup', vars: { name: thin.g.name, pct: fmt.pct(thin.m) } });
  if (f.adsUnknown) bad.push({ key: 'adsUnknown', vars: {} });
  if (f.uncostedOrders > 0) bad.push({ key: 'uncosted', vars: { n: f.uncostedOrders } });
  if ((f.unsoldStyles ?? 0) > 0) bad.push({ key: 'unsold', vars: { n: f.unsoldStyles ?? 0 } });

  // missing figures first (the profit is not right until they are in), then stock, then prices
  if (f.adsUnknown) next.push({ key: 'adsNext', vars: {}, href: '/admin/marketing/ad-platforms' });
  if (f.uncostedOrders > 0) next.push({ key: 'costsNext', vars: {}, href: '/admin/money/profit' });
  if ((f.restockStyles ?? 0) > 0) next.push({ key: 'restock', vars: { n: f.restockStyles ?? 0 }, href: '/admin/stock' });
  if ((f.unsoldStyles ?? 0) > 0) next.push({ key: 'unsoldNext', vars: { n: f.unsoldStyles ?? 0 }, href: '/admin/combos' });
  if (thin && thin.g !== best && thin.m < (margin(best ?? thin.g) ?? 0)) next.push({ key: 'checkPrices', vars: { name: thin.g.name }, href: '/admin/products' });
  return { good, bad: bad.slice(0, 4), next: next.slice(0, 3) };
}

/* ---------------- CSV ---------------- */

const cell = (v: string | number | null) => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Lines of cells as one CSV file (amounts in minor units; an empty cell = not known). */
export const toCsv = (lines: readonly (readonly (string | number | null)[])[]) => lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';

/** The rows of a group tree that have nothing under them (a parent's figure already holds its children, so counts use the leaves). */
export function leaves<T extends { depth: number }>(rows: readonly T[]): T[] {
  return rows.filter((r, i) => !(rows[i + 1] && rows[i + 1]!.depth > r.depth));
}
