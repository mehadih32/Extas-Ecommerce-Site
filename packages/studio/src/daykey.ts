// S23 · PR 442 — the store's own calendar day, in its own time zone (`store.timeZone`), for the daily publishing
// limit (Blueprint C5.1's per-platform caps) and the content calendar. Pure, no database: the same three functions
// `@extas/metrics/src/pure.ts` and `@extas/combos/src/model.ts` already carry on their own (each small enough, and
// each package already its own, that copying is simpler and safer than a new cross-package dependency — the same
// choice `@extas/combos` made first).
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The store's calendar day (YYYY-MM-DD) that a moment falls on, in its own time zone. */
export function ymdIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** How far the time zone is ahead of UTC at that moment, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}

/** The moment a store day starts (local midnight) as a UTC instant. */
export function dayStart(ymd: string, timeZone: string): Date {
  if (!YMD.test(ymd)) throw new RangeError(`not a day: ${ymd}`);
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  // Twice, so a day whose offset differs from the guess's (a clock change) still lands on its own midnight.
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  return new Date(t);
}

/** The day after a YYYY-MM-DD day. */
export function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The weekday (0=Sunday … 6=Saturday) a YYYY-MM-DD day falls on, read in UTC (a day has no time of its own). */
export function weekdayOf(ymd: string): number {
  if (!YMD.test(ymd)) throw new RangeError(`not a day: ${ymd}`);
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
