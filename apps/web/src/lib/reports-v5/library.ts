// PR 799 (prototype v5 Reports › Report library): the question cards of the library, in the prototype's eight groups. One card is one
// question with its answer for the period (and how it moved against the span before), a short line under it and the report it opens.
// `libraryGroups` is pure (tested); `loadLibraryInput` reads the shop's own figures through the other v5 loaders. Read-only.
import type { PermissionKey } from "@extas/auth";
import type { AdminDeps } from "../admin-auth";
import { incompleteOpenCount } from "../admin-orders/incomplete";
import {
  areaStats,
  isDel,
  isRet,
  loadGeoOrders,
  topProducts,
  type GeoOrder,
} from "./areas";
import { customerFacts, loadCustomers, whoOrdered } from "./customers";
import { loadDelivery } from "./delivery";
import { nameAt } from "./geo";
import { loadMarketing, loadProfit, loadRestock, type Base } from "./load";
import { change } from "./model";
import { practiceScope } from "./practice";
import {
  filteredFigures,
  filterOrders,
  salesShare,
  type WholeFigures,
} from "./profit";
import { loadSaleOrders, saleFacts } from "./sales";
import { avg, loadTeam } from "./team";

/** A district must have this many finished parcels before it can be "the area that returns the most" (the prototype's own floor). */
export const AREA_FLOOR = 5; // hardcode-ok: the prototype's own floor

export interface Span {
  orders: number;
  pieces: number;
  orderValue: number;
  aov: number;
  netProfit: number | null;
  margin: number | null;
}

export interface LibInput {
  cur: Span;
  prev: Span;
  bestChannel: { key: string; profit: number; was: number } | null;
  restock: number | null;
  unsold: number | null;
  top: { name: string; qty: number; valueMinor: number; was: number } | null;
  repeat: number | null;
  newCust: { now: number; was: number };
  returns: { rate: number; was: number | null; n: number };
  reason: { code: string; n: number } | null;
  roas: number | null;
  roasWas: number | null;
  adSpend: number | null;
  adSpendWas: number | null;
  topArea: { name: string; valueMinor: number; share: number } | null;
  badArea: { name: string; rate: number; n: number } | null;
  confirmH: number | null;
  confirmHWas: number | null;
  courier: { name: string; success: number; n: number } | null;
  incomplete: number | null;
}

/** What a card says: the number is written by the page (money, %, ×, hours, products); `text` is a word such as a channel or an area. */
export type CardVal =
  | {
      k: "money" | "pct" | "x" | "hours" | "products" | "num";
      n: number | null;
    }
  | { k: "text"; text: string }
  | { k: "none" };

export interface LibCard {
  id: string;
  q: string;
  val: CardVal;
  /** Against the span before, as a fraction; null when it cannot be told. */
  change: number | null;
  /** True when a rise is bad (returns, ad cost, confirm time). */
  lowerBetter?: boolean;
  /** The line under the figure: a message key and its values (a name that starts with "$" is money in minor units). */
  sub: { key: string; vars?: Record<string, string | number> } | null;
  href: string;
  small?: boolean;
}

export interface LibGroup {
  id:
    | "sales"
    | "products"
    | "customers"
    | "delivery"
    | "marketing"
    | "areas"
    | "team";
  cards: LibCard[];
}

export const CARD_IDS = [
  "sales",
  "profit",
  "chprofit",
  "aov",
  "restock",
  "best",
  "dead",
  "repeat",
  "newc",
  "checkoutj",
  "returns",
  "why",
  "courierrep",
  "roas",
  "ads",
  "toparea",
  "badarea",
  "geomap",
  "confirmtime",
] as const;

const R = "/admin/reports";
const NONE: CardVal = { k: "none" };
const num = (n: number | null): CardVal => ({ k: "num", n });

/** The cards, in the prototype's order and groups. */
export function libraryGroups(i: LibInput): LibGroup[] {
  const margin = i.cur.margin;
  return [
    {
      id: "sales",
      cards: [
        {
          id: "sales",
          q: "sales",
          val: { k: "money", n: i.cur.orderValue },
          change: change(i.cur.orderValue, i.prev.orderValue),
          sub: {
            key: "subSales",
            vars: { orders: i.cur.orders, pieces: i.cur.pieces },
          },
          href: `${R}/orders`,
        },
        {
          id: "profit",
          q: "profit",
          val:
            i.cur.netProfit === null
              ? NONE
              : { k: "money", n: i.cur.netProfit },
          change: change(i.cur.netProfit, i.prev.netProfit),
          sub:
            margin === null
              ? { key: "subProfitUnknown" }
              : { key: "subProfit", vars: { margin } },
          href: `${R}/profit`,
        },
        {
          id: "chprofit",
          q: "chprofit",
          val: i.bestChannel ? { k: "text", text: i.bestChannel.key } : NONE,
          change: i.bestChannel
            ? change(i.bestChannel.profit, i.bestChannel.was)
            : null,
          sub: i.bestChannel
            ? { key: "subChProfit", vars: { $profit: i.bestChannel.profit } }
            : null,
          href: `${R}/profit`,
        },
        {
          id: "aov",
          q: "aov",
          val: { k: "money", n: i.cur.aov },
          change: change(i.cur.aov, i.prev.aov),
          sub: {
            key: "subAov",
            vars: {
              pieces: i.cur.orders
                ? Math.round((i.cur.pieces / i.cur.orders) * 10) / 10
                : 0,
            },
          },
          href: `${R}/orders`,
        },
      ],
    },
    {
      id: "products",
      cards: [
        {
          id: "restock",
          q: "restock",
          val: i.restock === null ? NONE : { k: "products", n: i.restock },
          change: null,
          sub: { key: "subRestock" },
          href: `${R}/products`,
        },
        {
          id: "best",
          q: "best",
          val: i.top ? { k: "text", text: i.top.name } : NONE,
          change: i.top ? change(i.top.qty, i.top.was) : null,
          sub: i.top
            ? {
                key: "subBest",
                vars: { qty: i.top.qty, $value: i.top.valueMinor },
              }
            : null,
          href: `${R}/products`,
          small: true,
        },
        {
          id: "dead",
          q: "unsold",
          val: i.unsold === null ? NONE : { k: "products", n: i.unsold },
          change: null,
          sub: { key: "subDead" },
          href: `${R}/products`,
        },
      ],
    },
    {
      id: "customers",
      cards: [
        {
          id: "repeat",
          q: "repeat",
          val: i.repeat === null ? NONE : { k: "pct", n: i.repeat },
          change: null,
          sub: { key: "subRepeat" },
          href: `${R}/customers`,
        },
        {
          id: "newc",
          q: "newc",
          val: num(i.newCust.now),
          change: change(i.newCust.now, i.newCust.was),
          sub: { key: "subNewc" },
          href: `${R}/customers`,
        },
        {
          id: "checkoutj",
          q: "checkoutj",
          val: i.incomplete === null ? NONE : num(i.incomplete),
          change: null,
          sub: { key: "subCheckoutj" },
          href: "/admin/orders/incomplete",
        },
      ],
    },
    {
      id: "delivery",
      cards: [
        {
          id: "returns",
          q: "returns",
          val: { k: "pct", n: i.returns.rate },
          change: change(i.returns.rate, i.returns.was),
          lowerBetter: true,
          sub: { key: "subReturns", vars: { n: i.returns.n } },
          href: `${R}/delivery`,
        },
        {
          id: "why",
          q: "why",
          val: i.reason ? { k: "text", text: i.reason.code } : NONE,
          change: null,
          sub: i.reason ? { key: "subWhy", vars: { n: i.reason.n } } : null,
          href: `${R}/delivery`,
          small: true,
        },
        {
          id: "courierrep",
          q: "courierrep",
          val: i.courier ? { k: "text", text: i.courier.name } : NONE,
          change: null,
          sub: i.courier
            ? {
                key: "subCourier",
                vars: { pct: Math.round(i.courier.success), n: i.courier.n },
              }
            : null,
          href: `${R}/couriers`,
        },
      ],
    },
    {
      id: "marketing",
      cards: [
        {
          id: "roas",
          q: "roas",
          val: i.roas === null ? NONE : { k: "x", n: i.roas },
          change: change(i.roas, i.roasWas),
          sub: { key: "subRoas" },
          href: `${R}/marketing`,
        },
        {
          id: "ads",
          q: "ads",
          val: i.adSpend === null ? NONE : { k: "money", n: i.adSpend },
          change: change(i.adSpend, i.adSpendWas),
          lowerBetter: true,
          sub: { key: "subAds" },
          href: `${R}/marketing`,
        },
      ],
    },
    {
      id: "areas",
      cards: [
        {
          id: "toparea",
          q: "toparea",
          val: i.topArea ? { k: "text", text: i.topArea.name } : NONE,
          change: null,
          sub: i.topArea
            ? {
                key: "subTopArea",
                vars: {
                  $value: i.topArea.valueMinor,
                  pct: Math.round(i.topArea.share),
                },
              }
            : null,
          href: `${R}/areas`,
        },
        {
          id: "badarea",
          q: "badarea",
          val: i.badArea ? { k: "text", text: i.badArea.name } : NONE,
          change: null,
          sub: i.badArea
            ? {
                key: "subBadArea",
                vars: { pct: Math.round(i.badArea.rate), n: i.badArea.n },
              }
            : null,
          href: `${R}/areas`,
        },
        {
          // S29 · PR 755: the same top area, opened on the Geography map (the old cards keep their own page)
          id: "geomap",
          q: "geomap",
          val: i.topArea ? { k: "text", text: i.topArea.name } : NONE,
          change: null,
          sub: i.topArea
            ? {
                key: "subTopArea",
                vars: {
                  $value: i.topArea.valueMinor,
                  pct: Math.round(i.topArea.share),
                },
              }
            : null,
          href: `${R}/geo-map`,
        },
      ],
    },
    {
      id: "team",
      cards: [
        {
          id: "confirmtime",
          q: "confirmtime",
          val: i.confirmH === null ? NONE : { k: "hours", n: i.confirmH },
          change: change(i.confirmH, i.confirmHWas),
          lowerBetter: true,
          sub: { key: "subConfirm" },
          href: `${R}/team`,
        },
      ],
    },
  ];
}

type Access = {
  deps: AdminDeps;
  guard: {
    permissions?: ReadonlySet<PermissionKey>;
    actor: unknown;
    ctx: unknown;
  };
};
const spanOf = (
  rows: Awaited<ReturnType<typeof loadSaleOrders>>,
  net: number | null,
  salesMinor: number,
): Span => {
  const f = saleFacts(rows);
  return {
    orders: f.orders,
    pieces: f.pieces,
    orderValue: f.orderValue,
    aov: f.aov,
    netProfit: net,
    margin:
      net !== null && salesMinor > 0
        ? Math.round((net / salesMinor) * 1000) / 10
        : null,
  };
};

// PR 863 (prototype v5 Reports › Report library): the channel, category and area filters (the prototype's `fo` and `lineOk`). The cards
// that come from orders follow them (sales, profit, average order, the top product, the best and worst area, returns); the cards that
// come from other places (stock, customers, ads, the team, couriers, open checkouts) stay for the whole shop and the page says so.
export interface LibFilter {
  /** An order source ('all' for none). */
  ch: string;
  /** A category id ('all' for none). */
  cat: string;
  /** A division name ('all' for none). */
  div: string;
}
export const LIB_FILTER_OFF: LibFilter = { ch: "all", cat: "all", div: "all" };
export const libFilterOn = (f: LibFilter) =>
  f.ch !== "all" || f.cat !== "all" || f.div !== "all";

/** The orders a filter keeps, their lines cut to the category when one is picked (an order keeps only the lines it asks for). */
export function libOrders(
  orders: readonly GeoOrder[],
  f: LibFilter,
  catIds: ReadonlySet<string> | null,
): GeoOrder[] {
  return filterOrders(
    orders.filter((o) => f.ch === "all" || o.source === f.ch),
    { cat: f.cat, div: f.div },
    catIds,
  ).map((o) =>
    f.cat === "all" || !catIds
      ? o
      : {
          ...o,
          lines: o.lines.filter((l) => !!l.catId && catIds.has(l.catId)),
        },
  );
}

const sumBy = <T>(a: readonly T[], g: (x: T) => number) =>
  a.reduce((n, x) => n + g(x), 0);
const pcOf = (x: number, y: number) => (y ? (x / y) * 100 : 0); // hardcode-ok: a share in percent

/** One span's order figures from the kept orders (live orders; a category filter counts only its lines). */
export function spanFromOrders(
  kept: readonly GeoOrder[],
  all: readonly GeoOrder[],
  whole: WholeFigures,
  cutLines: boolean,
): Span {
  const live = kept.filter((o) => o.status !== "CANCELLED");
  const orderValue = sumBy(live, (o) =>
    cutLines ? sumBy(o.lines, (l) => l.valueMinor) : o.totalMinor,
  );
  const pieces = sumBy(live, (o) => sumBy(o.lines, (l) => l.qty));
  const fig = filteredFigures(kept, all, whole);
  const share = salesShare(kept, all);
  const sales = whole.sales * share;
  return {
    orders: live.length,
    pieces,
    orderValue,
    aov: live.length ? Math.round(orderValue / live.length) : 0,
    netProfit: fig.net,
    margin:
      fig.net !== null && sales > 0
        ? Math.round((fig.net / sales) * 1000) / 10 // hardcode-ok: a share in percent, one decimal
        : null,
  };
}

/** The library's inputs with the order-based cards following the filter; everything else is left as it was. */
export function filterLibInput(
  base: LibInput,
  geo: readonly GeoOrder[],
  geoWas: readonly GeoOrder[],
  f: LibFilter,
  catIds: ReadonlySet<string> | null,
  whole: { cur: WholeFigures; prev: WholeFigures },
): LibInput {
  if (!libFilterOn(f)) return base;
  const cut = f.cat !== "all" && !!catIds;
  const now = libOrders(geo, f, catIds);
  const was = libOrders(geoWas, f, catIds);
  const top = topProducts(now, 1)[0];
  const topWas = top
    ? (topProducts(was, 5000).find((x) => x.pid === top.pid)?.qty ?? 0)
    : 0;
  const districts = areaStats(now, (o) => nameAt(o.place, "district"));
  const liveTotal = sumBy(districts, (x) => x.v);
  const topD = [...districts].sort((x, y) => y.v - x.v)[0];
  const badD = districts
    .filter((x) => x.d + x.rt >= AREA_FLOOR)
    .sort((x, y) => y.rr - x.rr)[0];
  const rate = (os: readonly GeoOrder[]) => {
    const d = os.filter(isDel).length;
    const r = os.filter(isRet).length;
    return { n: r, fin: d + r, rate: pcOf(r, d + r) };
  };
  const rn = rate(now);
  const rw = rate(was);
  return {
    ...base,
    cur: spanFromOrders(now, geo, whole.cur, cut),
    prev: spanFromOrders(was, geoWas, whole.prev, cut),
    top: top
      ? { name: top.name, qty: top.qty, valueMinor: top.value, was: topWas }
      : null,
    returns: { rate: rn.rate, was: rw.fin ? rw.rate : null, n: rn.n },
    topArea:
      topD && topD.v > 0
        ? { name: topD.key, valueMinor: topD.v, share: pcOf(topD.v, liveTotal) }
        : null,
    badArea:
      badD && badD.rt > 0
        ? { name: badD.key, rate: badD.rr, n: badD.d + badD.rt }
        : null,
  };
}

/** Every figure the cards need, for the page's period and the span before it. */
export async function loadLibraryInput(
  a: Access,
  b: Base,
  filter: LibFilter = LIB_FILTER_OFF,
  catIds: ReadonlySet<string> | null = null,
): Promise<LibInput> {
  const d = a.deps;
  const scope = await practiceScope(d);
  const { from, to } = b.period.q;
  const was = b.before;
  const tz = b.timeZone;
  const sp = { from, to };
  const [
    rows,
    rowsWas,
    profit,
    restock,
    geo,
    geoWas,
    cust,
    del,
    delWas,
    mkt,
    team,
  ] = await Promise.all([
    loadSaleOrders(d.db, tz, from, to, null, scope),
    loadSaleOrders(d.db, tz, was.from, was.to, null, scope),
    loadProfit(d, b),
    loadRestock(a),
    loadGeoOrders(d, tz, from, to),
    loadGeoOrders(d, tz, was.from, was.to),
    loadCustomers(d, tz, from, to, was, new Date()),
    loadDelivery(d.db, tz, from, to, new Date(), scope),
    loadDelivery(d.db, tz, was.from, was.to, new Date(), scope),
    loadMarketing(d, sp),
    loadTeam(d, tz, from, to, was),
  ]);
  const wasBy = new Map<string, number | null>(
    profit.channelsWas.rows.map((x) => [x.key, x.profitMinor]),
  );
  const bestCh = profit.channels.rows
    .flatMap((x) =>
      x.key !== "total" && x.profitMinor !== null
        ? [{ key: x.key as string, profitMinor: x.profitMinor }]
        : [],
    )
    .sort((x, y) => y.profitMinor - x.profitMinor)[0];
  const tops = topProducts(geo, 1)[0];
  const topWas = tops
    ? (topProducts(geoWas, 5000).find((x) => x.pid === tops.pid)?.qty ?? 0)
    : 0;
  const first = cust.first;
  const facts = customerFacts(
    cust.cur,
    cust.buyers,
    first,
    Date.now(),
    cust.quietDays,
  );
  const pc = (x: number, y: number) => (y ? (x / y) * 100 : 0);
  const districts = areaStats(geo, (o) => nameAt(o.place, "district"));
  const liveTotal = districts.reduce((n, x) => n + x.v, 0);
  const topD = [...districts].sort((x, y) => y.v - x.v)[0];
  const badD = districts
    .filter((x) => x.d + x.rt >= AREA_FLOOR)
    .sort((x, y) => y.rr - x.rr)[0];
  const fin = del.facts.delivered + del.facts.returned;
  const finWas = delWas.facts.delivered + delWas.facts.returned;
  const bestCourier = [...del.facts.byCourier]
    .filter((c) => c.finished > 0)
    .sort((x, y) => y.success - x.success)[0];
  const ct = [...team.cur.values()].flatMap((x) => x.ct);
  const ctWas = [...team.prev.values()].flatMap((x) => x.ct);
  const rep = mkt.now.report;
  const repWas = mkt.was.report;
  let incomplete: number | null = null;
  try {
    incomplete = await incompleteOpenCount({
      db: d.db,
      resolver: d.resolver,
      now: d.now,
    });
  } catch {
    incomplete = null;
  }
  const base: LibInput = {
    cur: spanOf(rows, profit.now.netProfitMinor, profit.now.salesMinor),
    prev: spanOf(rowsWas, profit.was.netProfitMinor, profit.was.salesMinor),
    bestChannel: bestCh
      ? {
          key: bestCh.key,
          profit: bestCh.profitMinor,
          was: wasBy.get(bestCh.key) ?? 0,
        }
      : null,
    restock: restock ? restock.restock.length : null,
    unsold: restock ? restock.unsold.length : null,
    top: tops
      ? { name: tops.name, qty: tops.qty, valueMinor: tops.value, was: topWas }
      : null,
    repeat: facts.repeat,
    newCust: {
      now: whoOrdered(cust.cur, first).nw,
      was: whoOrdered(cust.prev, first).nw,
    },
    returns: {
      rate: pc(del.facts.returned, fin),
      was: finWas ? pc(delWas.facts.returned, finWas) : null,
      n: del.facts.returned,
    },
    reason: del.facts.reasons[0] ?? null,
    roas: rep && rep.roasPercent !== null ? rep.roasPercent / 100 : null,
    roasWas:
      repWas && repWas.roasPercent !== null ? repWas.roasPercent / 100 : null,
    adSpend: rep ? rep.adSpendMinor : null,
    adSpendWas: repWas ? repWas.adSpendMinor : null,
    topArea:
      topD && topD.v > 0
        ? { name: topD.key, valueMinor: topD.v, share: pc(topD.v, liveTotal) }
        : null,
    badArea:
      badD && badD.rt > 0
        ? { name: badD.key, rate: badD.rr, n: badD.d + badD.rt }
        : null,
    confirmH: ct.length ? avg(ct) : null,
    confirmHWas: ctWas.length ? avg(ctWas) : null,
    courier: bestCourier
      ? {
          name: bestCourier.name,
          success: bestCourier.success,
          n: bestCourier.finished,
        }
      : null,
    incomplete,
  };
  const wholeOf = (x: typeof profit.now) => ({
    sales: x.parts.sales,
    contribution: x.contributionMinor,
    net: x.netProfitMinor,
    ads: x.adsMinor,
    returnLoss: x.parts.returnLoss,
  });
  return filterLibInput(base, geo, geoWas, filter, catIds, {
    cur: wholeOf(profit.now),
    prev: wholeOf(profit.was),
  });
}
