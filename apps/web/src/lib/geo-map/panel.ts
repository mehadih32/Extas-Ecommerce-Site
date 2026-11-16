// S29 · PR 754 (CN-054) — Reports › Geography map, the panel that opens when an area is clicked (a bottom sheet on a
// phone). This file turns one area's figures (the row of `geoByArea`, and for the top products the one-area answer of
// `geoAreaDetail`) into what the panel draws, with no database: the lines (now, before, difference), the top products,
// the link that opens the Orders list for that area and period, and the "Go deeper" level. Money lines are left out
// when the viewer may not see money (`moneyHidden`). Counts only: no customer name or phone is ever in the panel.
import type { GeoAreaFigures, GeoAreaRow, GeoDays, GeoLevel, GeoTopCategory, GeoTopProduct } from '@extas/metrics';
import { GOOD_WHEN, diffOf, earlier, percentChange, type PanelKey } from './compare';

/** The level one click deeper (an area has no deeper level). */
export const DEEPER: Record<GeoLevel, GeoLevel | null> = { division: 'district', district: 'upazila', upazila: 'area', area: null };

/** The level one step up, for the breadcrumb. */
export const SHALLOWER: Record<GeoLevel, GeoLevel | null> = { division: null, district: 'division', upazila: 'district', area: 'upazila' };

export type PanelKind = 'count' | 'money' | 'rate';
export interface PanelLine {
  key: PanelKey;
  kind: PanelKind;
  /** This period's figure (money in minor units, a rate 0–1); null when not known. */
  now: number | null;
  /** The earlier period's figure; null when compare is off. */
  before: number | null;
  /** now − before; null when compare is off or either is not known (a rate's is in rate points, 0–1). */
  diff: number | null;
  /** The change in per cent of the earlier figure (not for a rate); null when it has none. */
  percent: number | null;
  /** Is the move good news (+1), bad news (−1) or none (0). */
  tone: -1 | 0 | 1;
}

const KINDS: Record<PanelKey, PanelKind> = { orders: 'count', sales: 'money', delivered: 'count', returned: 'count', returnRate: 'rate' };
const ORDER: readonly PanelKey[] = ['orders', 'sales', 'delivered', 'returned', 'returnRate'];

function figureOf(f: GeoAreaFigures, key: PanelKey): number | null {
  return key === 'sales' ? f.salesMinor : f[key];
}

/** The panel's five lines for one area, in the order of the plan: orders, sales, delivered, returned, return rate. */
export function panelLines(current: GeoAreaFigures, previous: GeoAreaFigures | null, opts: { compare: boolean; moneyHidden: boolean }): PanelLine[] {
  const before = earlier(previous, opts.compare, opts.moneyHidden);
  return ORDER.filter((k) => !(k === 'sales' && opts.moneyHidden)).map((key) => {
    const now = figureOf(current, key);
    const was = before ? figureOf(before, key) : null;
    const diff = diffOf(now, was);
    const dir = diff === null || diff === 0 ? 0 : diff > 0 ? 1 : -1;
    return {
      key,
      kind: KINDS[key],
      now,
      before: was,
      diff,
      percent: key === 'returnRate' ? null : percentChange(now, was),
      tone: dir === 0 ? 0 : (GOOD_WHEN[key] === 'up' ? dir : -dir) as 1 | -1,
    };
  });
}

/** One product line of the panel: the products are never more than the setting `topProducts`. */
export interface PanelProduct {
  productId: string;
  nameEn: string;
  nameBn: string | null;
  pieces: number;
  /** null when the viewer may not see money. */
  salesMinor: number | null;
}

/** The top products to show: most pieces first (the answer already is), at most `take`, money dropped when hidden. */
export function panelProducts(products: readonly GeoTopProduct[], take: number, moneyHidden: boolean): PanelProduct[] {
  return products
    .slice(0, Math.max(0, take))
    .map((p) => ({ productId: p.productId, nameEn: p.nameEn, nameBn: p.nameBn, pieces: p.pieces, salesMinor: moneyHidden ? null : p.salesMinor }));
}

/**
 * The Orders list for this area and period: orders placed on those days to this place or any place under it. (The
 * Orders figure of the map counts orders placed, so this list has exactly that count.) The list's own filter bar can
 * narrow it further.
 */
export function ordersHref(areaId: string, days: GeoDays): string {
  const sp = new URLSearchParams({ area: areaId, from: days.from, to: days.to });
  return `/admin/orders?${sp.toString()}`;
}

export interface PanelModel {
  areaId: string;
  level: GeoLevel;
  lines: PanelLine[];
  topCategory: GeoTopCategory | null;
  /** Fewer orders than the setting `minOrders`: the map shows the area grey; the panel says so and still gives the numbers. */
  tooFew: boolean;
  /** The level "Go deeper" opens, or null at the deepest level. */
  deeper: GeoLevel | null;
  ordersHref: string;
  /** The return rate is at or above the owner's warning line (the setting `warnReturnPct`, in per cent). */
  returnWarn: boolean;
}

/** What the panel draws for a row of the map (the figures are already in the row; the products come in separately). */
export function panelModel(row: GeoAreaRow, args: { days: GeoDays; compare: boolean; moneyHidden: boolean; warnReturnPct: number }): PanelModel {
  const rate = row.current.returnRate;
  return {
    areaId: row.areaId,
    level: row.level,
    lines: panelLines(row.current, row.previous, { compare: args.compare, moneyHidden: args.moneyHidden }),
    topCategory: row.topCategory,
    tooFew: row.belowMinOrders,
    deeper: DEEPER[row.level],
    ordersHref: ordersHref(row.areaId, args.days),
    returnWarn: rate !== null && rate * 100 >= args.warnReturnPct,
  };
}

/** A figure as text for its kind: a count with grouping, money from minor units, a rate in per cent with one decimal. */
export function formatFigure(kind: PanelKind, value: number | null, fmt: { number: (n: number) => string; money: (minor: number) => string }): string {
  if (value === null) return '—';
  if (kind === 'money') return fmt.money(value);
  if (kind === 'rate') return `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
  return fmt.number(value);
}

/** A signed difference as text: "+12", "−3", "0"; a rate's is in points ("+3.4 pts"). `pts` is the word for points. */
export function formatDiff(kind: PanelKind, diff: number | null, fmt: { number: (n: number) => string; money: (minor: number) => string }, pts: string): string {
  if (diff === null) return '—';
  if (diff === 0) return '0';
  const sign = diff > 0 ? '+' : '−';
  const abs = Math.abs(diff);
  if (kind === 'money') return `${sign}${fmt.money(abs)}`;
  if (kind === 'rate') return `${sign}${(Math.round(abs * 1000) / 10).toFixed(1)} ${pts}`;
  return `${sign}${fmt.number(abs)}`;
}
