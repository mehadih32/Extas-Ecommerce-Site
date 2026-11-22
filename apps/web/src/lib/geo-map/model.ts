// S29 · PR 753 — Reports › Geography map: the screen's own small rules, without React so they can be tested. Which figure
// colours a shape, which of the colour steps it gets, which pack and level the next drill-down opens, how the table sorts.
// Nothing here is a business number: the number of steps and the minimum orders come from the setting.
import type { GeoAreaFigures, GeoAreaRow, GeoLevel, GeoMetric } from '@extas/metrics/geo-types';

/** The pack file of each level (the areas of Dhaka City are drawn from the Dhaka thana shapes). */
export const PACK_OF: Record<GeoLevel, 'division' | 'district' | 'upazila' | 'dhakaThana'> = {
  division: 'division',
  district: 'district',
  upazila: 'upazila',
  area: 'dhakaThana',
};

/** The level below this one, or null at the bottom. */
export function childLevel(level: GeoLevel): GeoLevel | null {
  const order: GeoLevel[] = ['division', 'district', 'upazila', 'area'];
  const i = order.indexOf(level);
  return i >= 0 && i < order.length - 1 ? (order[i + 1] ?? null) : null;
}

/** The figure one metric colours by; null when it has none (no rate yet, Sales hidden, no compare). */
export function metricValue(f: GeoAreaFigures, metric: GeoMetric, previous: GeoAreaFigures | null = null): number | null {
  switch (metric) {
    case 'orders':
      return f.orders;
    case 'delivered':
      return f.delivered;
    case 'returned':
      return f.returned;
    case 'sales':
      return f.salesMinor;
    case 'returnRate':
      return f.returnRate;
    case 'change':
      return previous && previous.orders > 0 ? (f.orders - previous.orders) / previous.orders : null;
    default:
      return null;
  }
}

/** The step (0-based, `steps` of them) of a value between 0 and the largest; 0 is the lightest. Null for no value. */
export function rampStep(value: number | null, max: number, steps: number): number | null {
  if (value === null || !Number.isFinite(value) || steps < 1) return null;
  if (max <= 0) return 0;
  const share = Math.min(1, Math.max(0, value / max));
  return Math.min(steps - 1, Math.floor(share * steps));
}

/** The shapes' fill: a grey (no data, or fewer orders than the minimum) or a step of the ramp. */
export function fillClass(row: GeoAreaRow | undefined, metric: GeoMetric, max: number, steps: number): string {
  if (!row || row.belowMinOrders) return 'gm-none';
  const step = rampStep(metricValue(row.current, metric, row.previous), max, steps);
  return step === null ? 'gm-none' : `gm-s${step}`;
}

/** The largest figure among the rows (what the top step means), for the legend. */
export function maxOf(rows: GeoAreaRow[], metric: GeoMetric): number {
  let m = 0;
  for (const r of rows) {
    if (r.belowMinOrders) continue;
    const v = metricValue(r.current, metric, r.previous);
    if (v !== null && v > m) m = v;
  }
  return m;
}

export type SortKey = 'name' | 'orders' | 'delivered' | 'sales' | 'returned' | 'returnRate';

/** The table order. Missing figures (null) go last whichever way it sorts. */
export function sortRows(rows: GeoAreaRow[], key: SortKey, dir: 'asc' | 'desc'): GeoAreaRow[] {
  const pick = (r: GeoAreaRow): number | string | null => {
    switch (key) {
      case 'name':
        return r.nameEn.toLowerCase();
      case 'orders':
        return r.current.orders;
      case 'delivered':
        return r.current.delivered;
      case 'sales':
        return r.current.salesMinor;
      case 'returned':
        return r.current.returned;
      case 'returnRate':
        return r.current.returnRate;
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = pick(a);
    const y = pick(b);
    if (x === null && y === null) return a.nameEn.localeCompare(b.nameEn);
    if (x === null) return 1;
    if (y === null) return -1;
    if (x < y) return -sign;
    if (x > y) return sign;
    return a.nameEn.localeCompare(b.nameEn);
  });
}

/** One step of the drill-down trail. */
export interface Crumb {
  areaId: string | null;
  level: GeoLevel;
  name: string;
}

/** "12%" for a share 0-1, one decimal at most, "—" for none. */
export function pctText(share: number | null, digits = 1): string {
  if (share === null || !Number.isFinite(share)) return '—';
  const p = Math.round(share * 100 * 10 ** digits) / 10 ** digits;
  return `${p}%`;
}

/** The viewBox "x y w h" that fits a box with a margin; the margin is a share of the box. */
export function fitBox(b: { x: number; y: number; width: number; height: number }, margin: number): string {
  const mx = b.width * margin;
  const my = b.height * margin;
  return `${round2(b.x - mx)} ${round2(b.y - my)} ${round2(b.width + 2 * mx)} ${round2(b.height + 2 * my)}`;
}

/** Zooms a viewBox about its middle by a factor (>1 closer), keeping it a valid box. */
export function zoomBox(view: string, factor: number): string {
  const [x, y, w, h] = view.split(' ').map(Number) as [number, number, number, number];
  const nw = w / factor;
  const nh = h / factor;
  return `${round2(x + (w - nw) / 2)} ${round2(y + (h - nh) / 2)} ${round2(nw)} ${round2(nh)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
