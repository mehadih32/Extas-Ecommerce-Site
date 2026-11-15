// Parity round 3, lane F — the five one-press periods the prototype v5 puts above its Marketing and Finance figures
// (core.js `U.rangeOpts`): Today, 7 days, 30 days, This month, Last month. Pure: the store's own date in, days out.
export const PERIOD_KEYS = ['today', '7d', '30d', 'month', 'lastmonth'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
/** The period a page opens on (the prototype's own default). */
export const DEFAULT_PERIOD: PeriodKey = '30d'; // hardcode-ok: the prototype's opening period, not a business number

const DAY_MS = 86_400_000; // hardcode-ok: ms in a day
const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export function periodKey(raw: string | string[] | undefined): PeriodKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PERIOD_KEYS.find((k) => k === v) ?? DEFAULT_PERIOD;
}

/** First and last shop day of a period, `today` being the store's own date (a month stops at today). */
export function resolvePeriod(key: PeriodKey, today: string): { from: string; to: string } {
  const month = today.slice(0, 7);
  if (key === 'today') return { from: today, to: today };
  if (key === '7d') return { from: addDay(today, -6), to: today };
  if (key === '30d') return { from: addDay(today, -29), to: today };
  if (key === 'month') return { from: `${month}-01`, to: today };
  const lastEnd = addDay(`${month}-01`, -1);
  return { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd };
}

/** The period of the same length just before `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  const pTo = addDay(from, -1);
  return { from: addDay(pTo, -(len - 1)), to: pTo };
}
