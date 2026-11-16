// PR 799 (prototype v5 Reports › Profit): the tables the prototype adds under the Money figures — profit by area (division) and by
// product — and the category and area filters. They are built from the same per-order profit the Areas report uses
// (lib/reports-v5/areas.ts, Money › Profit & loss's own figure): an order's profit is shared over its lines by line value, exactly like
// the prototype's `profitBy`. Pure; the page loads the orders.
import { isDel, isLive, type GeoLine, type GeoOrder } from "./areas";
import { divisionOf } from "./geo";

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

const sum = <T>(a: readonly T[], f: (x: T) => number) =>
  a.reduce((n, x) => n + f(x), 0);

/** The division an order went to (a district outside the 64 counts as Dhaka, as the prototype's `divOf` does). */
export const divOfOrder = (o: Pick<GeoOrder, "place">) =>
  o.place.division ?? divisionOf(o.place.district) ?? "Dhaka"; // hardcode-ok: the prototype's own fallback division

/** Delivered orders grouped by `keyOf` (a line's group, or null to leave the line out) with sales, profit and margin. */
export function profitGroups(
  orders: readonly GeoOrder[],
  keyOf: (l: GeoLine, o: GeoOrder) => string | null,
  lineOk: (l: GeoLine) => boolean = () => true,
): ProfitGroup[] {
  const by = new Map<
    string,
    { sales: number; profit: number; pieces: number; orders: Set<GeoOrder> }
  >();
  for (const o of orders) {
    if (!isDel(o) || !isLive(o)) continue;
    const total = sum(o.lines, (l) => l.valueMinor);
    for (const l of o.lines) {
      if (!lineOk(l)) continue;
      const k = keyOf(l, o);
      if (k === null) continue;
      const x = by.get(k) ?? {
        sales: 0,
        profit: 0,
        pieces: 0,
        orders: new Set<GeoOrder>(),
      };
      x.sales += l.valueMinor;
      x.pieces += l.qty;
      x.profit += total
        ? Math.round((o.profitMinor * l.valueMinor) / total)
        : 0;
      x.orders.add(o);
      by.set(k, x);
    }
  }
  return [...by].map(([key, x]) => ({
    key,
    sales: x.sales,
    profit: x.profit,
    pieces: x.pieces,
    orders: [...x.orders],
    margin: x.sales ? (x.profit / x.sales) * 100 : 0,
  }));
}

export interface ProfitFilter {
  /** A category id ('all' for none). */
  cat: string;
  /** A division name ('all' for none). */
  div: string;
  /** An order source, the report's channel key ('all' or missing for none). */
  ch?: string;
}

/** The orders the filter keeps: the area filter keeps whole orders, the category filter keeps orders with a line of it (lines are cut again by `lineOk`). */
export function filterOrders(
  orders: readonly GeoOrder[],
  f: ProfitFilter,
  catIds: ReadonlySet<string> | null,
): GeoOrder[] {
  return orders.filter(
    (o) =>
      (!f.ch || f.ch === "all" || o.source === f.ch) &&
      (f.div === "all" || divOfOrder(o) === f.div) &&
      (f.cat === "all" ||
        !catIds ||
        o.lines.some((l) => !!l.catId && catIds.has(l.catId))),
  );
}

/** The margin colour of the prototype's table: 35 % and up good, under 20 % bad. */
export const marginTone = (
  m: number,
  hasSales: boolean,
): "good" | "bad" | "plain" | "none" =>
  !hasSales ? "none" : m >= 35 ? "good" : m >= 20 ? "plain" : "bad"; // hardcode-ok: the prototype's own colour steps

/** Products that lose money, the prototype's "Products losing money" figure (two or more pieces counted). */
export const losingProducts = (g: readonly ProfitGroup[]) =>
  g.filter((x) => x.pieces >= 2 && x.profit < 0).length; // hardcode-ok: the prototype's own floor

// PR 854 (prototype v5 Reports › Profit): with a category or area filter on, the prototype's top tiles follow it too (`pnlF`: the
// filtered orders' own lines, and the ads, office and other costs shared by sales). Money's whole-shop figures give the costs; the
// filtered delivered orders give the profit before ads and the share.
export interface WholeFigures {
  /** Delivered sales of the whole shop for the span (Money's `parts.sales`). */
  sales: number;
  /** Profit before ads of the whole shop. */
  contribution: number;
  /** Net profit of the whole shop (null while the ad spend is not known). */
  net: number | null;
  ads: number | null;
  returnLoss: number;
}

export interface FilteredFigures {
  before: number;
  net: number | null;
  margin: number | null;
  perOrder: number | null;
  ads: number | null;
  returns: number;
  orders: number;
}

/** The share of the whole shop's delivered value that the filtered orders hold (0 to 1). */
export function salesShare(
  filtered: readonly GeoOrder[],
  all: readonly GeoOrder[],
): number {
  const v = (os: readonly GeoOrder[]) =>
    sum(
      os.filter((o) => isDel(o) && isLive(o)),
      (o) => o.totalMinor,
    );
  const whole = v(all);
  return whole ? Math.min(1, v(filtered) / whole) : 0;
}

/** The top tiles of the Profit report for the filtered orders. */
export function filteredFigures(
  filtered: readonly GeoOrder[],
  all: readonly GeoOrder[],
  whole: WholeFigures,
): FilteredFigures {
  const del = filtered.filter((o) => isDel(o) && isLive(o));
  const share = salesShare(filtered, all);
  const before = sum(del, (o) => o.profitMinor);
  const shared = whole.net === null ? null : whole.contribution - whole.net; // ads + office + other costs of the whole shop
  const net = shared === null ? null : Math.round(before - shared * share);
  const sales = whole.sales * share;
  return {
    before,
    net,
    margin: net === null || sales <= 0 ? null : net / sales,
    perOrder: del.length ? Math.round(before / del.length) : null,
    ads: whole.ads === null ? null : Math.round(whole.ads * share),
    returns: Math.round(whole.returnLoss * share),
    orders: del.length,
  };
}

// PR 863 (prototype v5 Reports › Profit): with a category or area filter on, the week chart, the channel table and the style table follow it
// too, from the filtered orders' own lines (the same profit shared over lines by value as every other table here).

/** Delivered sales and profit before ads per day, from the orders' own lines. */
export function dayFigures(
  orders: readonly GeoOrder[],
  lineOk: (l: GeoLine) => boolean = () => true,
): Map<string, { sales: number; contribution: number }> {
  const out = new Map<string, { sales: number; contribution: number }>();
  const byDay = new Map<string, GeoOrder[]>();
  for (const o of orders) byDay.set(o.day, [...(byDay.get(o.day) ?? []), o]);
  for (const [day, list] of byDay) {
    const g = profitGroups(list, () => "all", lineOk)[0];
    if (g) out.set(day, { sales: g.sales, contribution: g.profit });
  }
  return out;
}

/** The period's days in blocks of seven: margin before ads = profit ÷ delivered sales, in percent with one decimal (null with no sales). */
export function weekMargins(
  days: readonly string[],
  figs: ReadonlyMap<string, { sales: number; contribution: number }>,
  size = 7, // hardcode-ok: a week
): { first: string; value: number | null }[] {
  const asc = [...days].sort((x, y) => x.localeCompare(y));
  const out: { first: string; value: number | null }[] = [];
  for (let i = 0; i < asc.length; i += size) {
    const chunk = asc.slice(i, i + size);
    const sales = sum(chunk, (d) => figs.get(d)?.sales ?? 0);
    const contribution = sum(chunk, (d) => figs.get(d)?.contribution ?? 0);
    out.push({
      first: chunk[0]!,
      value: sales > 0 ? Math.round((contribution / sales) * 1000) / 10 : null, // hardcode-ok: a share in percent, one decimal
    });
  }
  return out;
}
