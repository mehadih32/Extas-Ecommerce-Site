// PR 12 (CN-025) — the Dashboard's date choice (demo V12.4 a3Range): one of the setting's ranges (`admin.dashboard.ranges`,
// `?range=N`, 1 = today) or two dates of the person's own (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, at most
// `admin.dashboardDesigns.customMaxDays` days, never after today). Every figure is compared with the same number of
// days just before. Shop days are calendar days in the store's time zone; the day arithmetic here is on the calendar alone.

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar day `n` days after (or before, n < 0) a YYYY-MM-DD day. */
export function shiftDay(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Days from `from` to `to`, both included. */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

const realDay = (s: string | undefined): s is string => !!s && YMD.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && shiftDay(s, 0) === s;

export interface DashRange {
  kind: 'preset' | 'custom';
  /** Days in the window (today included for a preset). */
  days: number;
  from: string;
  to: string;
  /** The same number of days just before. */
  prev: { from: string; to: string };
}

/** The window the address asks for: two good dates (not after today, at most `maxDays`), else a preset, else the first. */
export function rangeFrom(q: { range?: string; from?: string; to?: string }, ranges: readonly number[], today: string, maxDays: number): DashRange {
  if (realDay(q.from) && realDay(q.to) && q.from <= q.to && q.to <= today && spanDays(q.from, q.to) <= maxDays) {
    const days = spanDays(q.from, q.to);
    return { kind: 'custom', days, from: q.from, to: q.to, prev: { from: shiftDay(q.from, -days), to: shiftDay(q.from, -1) } };
  }
  const n = Number(q.range);
  const days = ranges.includes(n) ? n : ranges[0]!;
  const from = shiftDay(today, -(days - 1));
  return { kind: 'preset', days, from, to: today, prev: { from: shiftDay(from, -days), to: shiftDay(from, -1) } };
}

/** The chart's window: the range, stretched back to at least `minDays` (so "Today" still draws a line). */
export function chartWindow(r: DashRange, minDays: number): { from: string; to: string; days: number; prev: { from: string; to: string } } {
  const days = Math.max(r.days, minDays);
  const from = shiftDay(r.to, -(days - 1));
  return { from, to: r.to, days, prev: { from: shiftDay(from, -days), to: shiftDay(from, -1) } };
}

/** The address of the Dashboard with a range kept (and the design preview, when one is shown). */
export function rangeHref(r: { kind: 'preset'; days: number } | { kind: 'custom'; from: string; to: string }, design?: string | null): string {
  const q = new URLSearchParams({ home: '1' });
  if (r.kind === 'preset') q.set('range', String(r.days));
  else {
    q.set('from', r.from);
    q.set('to', r.to);
  }
  if (design) q.set('design', design);
  return `/admin?${q.toString()}`;
}
