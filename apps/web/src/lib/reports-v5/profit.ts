// PR 799 (prototype v5 Reports › Profit): the tables the prototype adds under the Money figures — profit by area (division) and by
// product — and the category and area filters. They are built from the same per-order profit the Areas report uses
// (lib/reports-v5/areas.ts, Money › Profit & loss's own figure): an order's profit is shared over its lines by line value, exactly like
// the prototype's `profitBy`. Pure; the page loads the orders.
import { isDel, isLive, type GeoLine, type GeoOrder } from './areas';
import { divisionOf } from './geo';

export interface ProfitGroup {
  key: string;
  /** Delivered value of the group's lines. */
  sales: number;
  /** Profit before ads: each delivered order's profit shared over its lines by value. */
  profit: number;
  pieces: number;
  orders: GeoOrder[];
  /** Profit as a share of sales, in percent. */
  margin: number;
}

const sum = <T>(a: readonly T[], f: (x: T) => number) => a.reduce((n, x) => n + f(x), 0);

/** The division an order went to (a district outside the 64 counts as Dhaka, as the prototype's `divOf` does). */
export const divOfOrder = (o: Pick<GeoOrder, 'place'>) => o.place.division ?? divisionOf(o.place.district) ?? 'Dhaka'; // hardcode-ok: the prototype's own fallback division

/** Delivered orders grouped by `keyOf` (a line's group, or null to leave the line out) with sales, profit and margin. */
export function profitGroups(orders: readonly GeoOrder[], keyOf: (l: GeoLine, o: GeoOrder) => string | null, lineOk: (l: GeoLine) => boolean = () => true): ProfitGroup[] {
  const by = new Map<string, { sales: number; profit: number; pieces: number; orders: Set<GeoOrder> }>();
  for (const o of orders) {
    if (!isDel(o) || !isLive(o)) continue;
    const total = sum(o.lines, (l) => l.valueMinor);
    for (const l of o.lines) {
      if (!lineOk(l)) continue;
      const k = keyOf(l, o);
      if (k === null) continue;
      const x = by.get(k) ?? { sales: 0, profit: 0, pieces: 0, orders: new Set<GeoOrder>() };
      x.sales += l.valueMinor;
      x.pieces += l.qty;
      x.profit += total ? Math.round((o.profitMinor * l.valueMinor) / total) : 0;
      x.orders.add(o);
      by.set(k, x);
    }
  }
  return [...by].map(([key, x]) => ({ key, sales: x.sales, profit: x.profit, pieces: x.pieces, orders: [...x.orders], margin: x.sales ? (x.profit / x.sales) * 100 : 0 }));
}

export interface ProfitFilter {
  /** A category id ('all' for none). */
  cat: string;
  /** A division name ('all' for none). */
  div: string;
}

/** The orders the filter keeps: the area filter keeps whole orders, the category filter keeps orders with a line of it (lines are cut again by `lineOk`). */
export function filterOrders(orders: readonly GeoOrder[], f: ProfitFilter, catIds: ReadonlySet<string> | null): GeoOrder[] {
  return orders.filter((o) => (f.div === 'all' || divOfOrder(o) === f.div) && (f.cat === 'all' || !catIds || o.lines.some((l) => !!l.catId && catIds.has(l.catId))));
}

/** The margin colour of the prototype's table: 35 % and up good, under 20 % bad. */
export const marginTone = (m: number, hasSales: boolean): 'good' | 'bad' | 'plain' | 'none' => (!hasSales ? 'none' : m >= 35 ? 'good' : m >= 20 ? 'plain' : 'bad'); // hardcode-ok: the prototype's own colour steps

/** Products that lose money, the prototype's "Products losing money" figure (two or more pieces counted). */
export const losingProducts = (g: readonly ProfitGroup[]) => g.filter((x) => x.pieces >= 2 && x.profit < 0).length; // hardcode-ok: the prototype's own floor
