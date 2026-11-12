// PR 660 (CN-048) — the date bar of the order lists: a "from" and a "to" day (both included) are the store's own days, so
// 00:00-05:59 in Dhaka belongs to that day there, not to the UTC one before it. `from` and `to` are optional; a "to"
// before the "from" is swapped, never an error. No money or order is touched here.
import { setting, type OrdersDeps } from './context';

/** The first moment of a calendar day (YYYY-MM-DD) in a time zone. */
export function zonedDayStart(day: string, timeZone: string): Date {
  const utc = new Date(`${day}T00:00:00Z`);
  const there = new Date(utc.toLocaleString('en-US', { timeZone }));
  const here = new Date(utc.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(utc.getTime() - (there.getTime() - here.getTime()));
}

const nextDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** The moments a range of days covers: on or after the first day's start, before the day after the last day's start. */
export function dayRange(from: string | undefined, to: string | undefined, timeZone: string): { from?: Date; before?: Date } | undefined {
  if (!from && !to) return undefined;
  const [a, b] = from && to && from > to ? [to, from] : [from, to];
  return { ...(a ? { from: zonedDayStart(a, timeZone) } : {}), ...(b ? { before: zonedDayStart(nextDay(b), timeZone) } : {}) };
}

/** `dayRange` in the store's own time zone (the `store.timeZone` setting). */
export async function placedRange(deps: OrdersDeps, storeId: number, from: string | undefined, to: string | undefined): Promise<{ from?: Date; before?: Date } | undefined> {
  if (!from && !to) return undefined;
  return dayRange(from, to, await setting(deps, storeId, 'store.timeZone'));
}
