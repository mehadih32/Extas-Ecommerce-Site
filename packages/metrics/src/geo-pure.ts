// S29 · PR 751 — the parts of `geoByArea` that need no database: the compare days and the difference of two periods.
import type { GeoAreaFigures, GeoDays, GeoDelta, GeoQuery } from './geo-types';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const toUtc = (ymd: string): number => {
  if (!YMD.test(ymd)) throw new RangeError(`not a day: ${ymd}`);
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (t: number): string => new Date(t).toISOString().slice(0, 10);
const DAY_MS = 86_400_000;

/** The number of days from `from` to `to`, both included. */
export function dayCount(days: GeoDays): number {
  return Math.round((toUtc(days.to) - toUtc(days.from)) / DAY_MS) + 1;
}

/** The same day one year earlier (29 Feb becomes 28 Feb). */
function yearBefore(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y - 1, m - 1, d));
  if (t.getUTCMonth() !== m - 1) return fromUtc(Date.UTC(y - 1, m, 0)); // 29 Feb: the last day of that month a year earlier
  return fromUtc(t.getTime());
}

/** The days a compare mode means, or null when compare is off. `custom` needs the caller's own days. */
export function compareDaysOf(days: GeoDays, mode: GeoQuery['compare'], custom?: GeoDays | null): GeoDays | null {
  if (!mode || mode === 'off') return null;
  if (mode === 'previous') {
    const n = dayCount(days);
    return { from: fromUtc(toUtc(days.from) - n * DAY_MS), to: fromUtc(toUtc(days.from) - DAY_MS) };
  }
  if (mode === 'lastYear') return { from: yearBefore(days.from), to: yearBefore(days.to) };
  if (!custom) throw new RangeError('compare "custom" needs its own days (compareDays)');
  if (custom.to < custom.from) throw new RangeError('the compare days end before they start');
  return custom;
}


/** current − previous; Sales and the rate only when both sides have them. */
export function deltaOf(a: GeoAreaFigures, b: GeoAreaFigures): GeoDelta {
  return {
    orders: a.orders - b.orders,
    delivered: a.delivered - b.delivered,
    salesMinor: a.salesMinor === null || b.salesMinor === null ? null : a.salesMinor - b.salesMinor,
    returned: a.returned - b.returned,
    returnRate: a.returnRate === null || b.returnRate === null ? null : a.returnRate - b.returnRate,
  };
}
