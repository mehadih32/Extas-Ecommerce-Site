// S29 · PR 752 (CN-054) — the Geography map's table as a CSV file (the same figures as the map, the panel and the JSON).
// Amounts are in minor units, rates in per cent with one decimal, empty = none. The Sales columns exist only when the
// viewer may see money (`books.read`). With compare on, the earlier period's figures follow. A text that could be read by a
// spreadsheet as a formula is made safe. Counts only: no customer name or phone.
import type { GeoAreaFigures, GeoByArea } from '@extas/metrics/geo-types';

type Cell = string | number | null;

const cell = (v: Cell): string => {
  if (v === null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** A return rate as a percentage with one decimal; none when there is none. */
export const ratePct = (r: number | null): number | null => (r === null ? null : Math.round(r * 1000) / 10);

/** The table as CSV. */
export function geoMapCsv(r: GeoByArea, currency: string, money: boolean): string {
  const compare = r.totalPrevious !== null;
  const fig = (f: GeoAreaFigures): Cell[] => [f.orders, f.delivered, ...(money ? [f.salesMinor] : []), f.pieces, f.returned, ratePct(f.returnRate)];
  const head: Cell[] = ['code', 'area', 'parent', 'level', 'orders', 'deliveredOrders', ...(money ? ['salesMinor'] : []), 'pieces', 'returnedOrders', 'returnRatePct', 'topCategory'];
  const earlier: Cell[] = ['earlierOrders', 'earlierDeliveredOrders', ...(money ? ['earlierSalesMinor'] : []), 'earlierPieces', 'earlierReturnedOrders', 'earlierReturnRatePct'];
  // the earlier figures of a row (an area with none then is zero); the unknown and outside rows have none of their own
  const zero: GeoAreaFigures = { orders: 0, delivered: 0, salesMinor: money ? 0 : null, pieces: 0, returned: 0, returnRate: null };
  const earlierOf = (f: GeoAreaFigures | null): Cell[] => (compare ? fig(f ?? zero) : []);
  const blank: Cell[] = compare ? earlier.map(() => null) : [];
  const lines: Cell[][] = [
    [...head, ...(compare ? earlier : []), 'currency'],
    ...r.rows.map((x) => [x.code, x.nameEn, x.parentNameEn, x.level, ...fig(x.current), x.topCategory?.nameEn ?? null, ...earlierOf(x.previous), currency]),
    ['', '(area not known)', null, r.query.level, ...fig(r.unknown), null, ...blank, currency],
    ...(r.query.level === 'area' ? [['', '(outside Dhaka City)', null, r.query.level, ...fig(r.outside), null, ...blank, currency] as Cell[]] : []),
    ['', '(total)', null, r.query.level, ...fig(r.total), null, ...earlierOf(r.totalPrevious), currency],
  ];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** The file's name. */
export const geoMapFileName = (r: GeoByArea): string => `geography-${r.query.level}-${r.query.days.from}-${r.query.days.to}.csv`;
