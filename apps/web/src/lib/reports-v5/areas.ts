// PR 798 (prototype v5 Reports › Areas): the shop's orders of one period, each with where it went (division › district › thana › area),
// its lines, its collected money and (for delivered orders) its profit — and the plain sums the drill-down draws: per place orders,
// pieces, product value, delivered, returned, return rate, collected, profit and average order; the top products of a place; and
// the top places of a product or category. Read-only; nothing is estimated (profit is Money › Profit & loss's own per-order figure).
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { daysPeriod, orderProfits, ymdIn } from "@extas/metrics";
import type { AdminDeps } from "../admin-auth";
import { profitInputs } from "../order-profit-view";
import {
  nameAt,
  placeFromAddress,
  placeFromTree,
  underPath,
  type GeoNode,
  type Place,
  type PlaceLevel,
} from "./geo";
import { practiceScope } from "./practice";

const S = MOTHER_STORE_ID;
const DELIVERED = ["DELIVERED", "PARTIALLY_DELIVERED"];

export interface GeoLine {
  pid: string | null;
  name: string;
  catId: string | null;
  qty: number;
  valueMinor: number;
}

export interface GeoOrder {
  id: string;
  number: string;
  day: string;
  status: string;
  source: string;
  customerId: string | null;
  customerName: string | null;
  totalMinor: number;
  pieces: number;
  /** The goods at the listed price (the prototype's "Product value"). */
  mrpMinor: number;
  /** Money in hand: a delivered order's total when it is paid, else what was paid on it. */
  collectedMinor: number;
  /** Profit before ads of a delivered order; 0 while it is not one (the prototype adds returns as 0 here too). */
  profitMinor: number;
  place: Place;
  lines: GeoLine[];
}

export const isLive = (o: { status: string }) => o.status !== "CANCELLED";
export const isDel = (o: { status: string }) => DELIVERED.includes(o.status);
export const isRet = (o: { status: string }) => o.status === "RETURNED";
const sum = <T>(a: readonly T[], f: (x: T) => number) =>
  a.reduce((n, x) => n + f(x), 0);
const pc = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export interface AreaStat {
  key: string;
  orders: GeoOrder[];
  n: number;
  pcs: number;
  mrp: number;
  v: number;
  d: number;
  rt: number;
  /** Return rate, % of finished parcels. */
  rr: number;
  col: number;
  pr: number;
  aov: number;
}

/** Orders grouped by `keyOf` into the figures one place row shows. */
export function areaStats(
  orders: readonly GeoOrder[],
  keyOf: (o: GeoOrder) => string,
): AreaStat[] {
  const by = new Map<string, GeoOrder[]>();
  for (const o of orders) by.set(keyOf(o), [...(by.get(keyOf(o)) ?? []), o]);
  return [...by].map(([key, list]) => {
    const live = list.filter(isLive);
    const d = list.filter(isDel).length;
    const rt = list.filter(isRet).length;
    const v = sum(live, (o) => o.totalMinor);
    return {
      key,
      orders: list,
      n: live.length,
      pcs: sum(live, (o) => o.pieces),
      mrp: sum(live, (o) => o.mrpMinor),
      v,
      d,
      rt,
      rr: pc(rt, d + rt),
      col: sum(list.filter(isDel), (o) => o.collectedMinor),
      pr: sum(list, (o) => o.profitMinor),
      aov: live.length ? Math.round(v / live.length) : 0,
    };
  });
}

export const AREA_METRICS = ["v", "n", "pr", "rr"] as const;
export type AreaMetric = (typeof AREA_METRICS)[number];
export const metricOf = (m: AreaMetric, x: AreaStat) =>
  m === "v" ? x.v : m === "n" ? x.n : m === "pr" ? x.pr : x.rr;

/** The tile height share (8 to 88) the map draws for a value: 8 + 80 × value ÷ the biggest value. */
export const tileHeat = (value: number, max: number) =>
  Math.round(8 + (80 * value) / Math.max(1e-9, max));

export interface TopLine {
  pid: string;
  name: string;
  qty: number;
  value: number;
}

/** Products by pieces ordered (cancelled orders left out). */
export function topProducts(
  orders: readonly GeoOrder[],
  take: number,
): TopLine[] {
  const m = new Map<string, TopLine>();
  for (const o of orders.filter(isLive))
    for (const l of o.lines) {
      if (!l.pid) continue;
      const x = m.get(l.pid) ?? { pid: l.pid, name: l.name, qty: 0, value: 0 };
      x.qty += l.qty;
      x.value += l.valueMinor;
      m.set(l.pid, x);
    }
  return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, take);
}

/** The places that sell a product (`p:<id>`) or a category (`cat:<id>`) most, by pieces, at one level. */
export function whereItSells(
  orders: readonly GeoOrder[],
  pick: string,
  level: PlaceLevel,
  take: number,
  catOf: (id: string) => readonly string[],
): { name: string; qty: number }[] {
  const [kind, id] = [
    pick.slice(0, pick.indexOf(":")),
    pick.slice(pick.indexOf(":") + 1),
  ];
  const cats = kind === "cat" ? new Set(catOf(id)) : null;
  const m = new Map<string, number>();
  for (const o of orders.filter(isLive))
    for (const l of o.lines)
      if (kind === "cat" ? !!l.catId && cats!.has(l.catId) : l.pid === id)
        m.set(
          nameAt(o.place, level),
          (m.get(nameAt(o.place, level)) ?? 0) + l.qty,
        );
  return [...m]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, take);
}

export const inPath = (o: GeoOrder, path: readonly string[]) =>
  underPath(o.place, path);

export interface AreaFilters {
  source?: string | null;
  catId?: string | null;
}

/** The orders placed in the span (drafts and, as the practice switch says, practice orders left out) with place, lines and profit. */
export async function loadGeoOrders(
  deps: Pick<AdminDeps, "db" | "resolver">,
  tz: string,
  from: string,
  to: string,
  f: AreaFilters = {},
): Promise<GeoOrder[]> {
  const db: PrismaClient = deps.db;
  const per = daysPeriod(from, to, tz);
  const scope = await practiceScope(deps);
  const cats = f.catId ? await categoryTree(db, f.catId) : null;
  const rows = await db.order.findMany({
    where: {
      storeId: S,
      archivedAt: null,
      status: { not: "DRAFT" },
      placedAt: { gte: per.from, lt: per.to },
      ...scope,
      ...(f.source ? { source: f.source as never } : {}),
    },
    select: {
      id: true,
      number: true,
      placedAt: true,
      status: true,
      source: true,
      customerId: true,
      customerName: true,
      totalMinor: true,
      subtotalMinor: true,
      paidMinor: true,
      shippingAddressText: true,
      areaId: true,
    },
    orderBy: { placedAt: "asc" },
    take: 20000,
  });
  const ids = rows.map((r) => r.id);
  const places = await resolvePlaces(db, rows);
  const items = ids.length
    ? await db.orderItem.findMany({
        where: { orderId: { in: ids }, status: "ACTIVE" },
        select: {
          orderId: true,
          productId: true,
          productName: true,
          quantity: true,
          lineTotalMinor: true,
        },
      })
    : [];
  const pids = [
    ...new Set(items.map((i) => i.productId).filter((x): x is string => !!x)),
  ];
  const prods = pids.length
    ? await db.product.findMany({
        where: { id: { in: pids } },
        select: { id: true, categoryId: true },
      })
    : [];
  const catOfProduct = new Map(prods.map((x) => [x.id, x.categoryId]));
  const lines = new Map<string, GeoLine[]>();
  for (const i of items)
    lines.set(i.orderId, [
      ...(lines.get(i.orderId) ?? []),
      {
        pid: i.productId,
        name: i.productName,
        catId: (i.productId && catOfProduct.get(i.productId)) || null,
        qty: i.quantity,
        valueMinor: i.lineTotalMinor,
      },
    ]);
  const deliveredIds = rows.filter(isDel).map((r) => r.id);
  const profits = deliveredIds.length
    ? await orderProfits(
        db,
        S,
        deliveredIds,
        await profitInputs(deps.resolver, S),
      )
    : new Map();
  const out = rows.map<GeoOrder>((r) => {
    const ls = lines.get(r.id) ?? [];
    const delivered = isDel(r);
    return {
      id: r.id,
      number: r.number,
      day: ymdIn(r.placedAt, tz),
      status: r.status,
      source: r.source,
      customerId: r.customerId,
      customerName: r.customerName,
      totalMinor: r.totalMinor,
      pieces: sum(ls, (l) => l.qty),
      mrpMinor: r.subtotalMinor,
      collectedMinor: delivered
        ? r.paidMinor > 0
          ? r.paidMinor
          : r.totalMinor
        : r.paidMinor,
      profitMinor: delivered ? (profits.get(r.id)?.profitMinor ?? 0) : 0,
      place: places.get(r.id)!,
      lines: ls,
    };
  });
  return cats
    ? out.filter((o) => o.lines.some((l) => l.catId && cats.has(l.catId)))
    : out;
}

/** Where each order went: the place tree when the order has an area, else its typed address (by order id). */
export async function resolvePlaces(
  db: PrismaClient,
  rows: readonly {
    id: string;
    areaId: string | null;
    shippingAddressText: string | null;
  }[],
): Promise<Map<string, Place>> {
  const areaIds = [
    ...new Set(rows.map((r) => r.areaId).filter((x): x is string => !!x)),
  ];
  const self = areaIds.length
    ? await db.geoArea.findMany({
        where: { id: { in: areaIds } },
        select: {
          id: true,
          level: true,
          nameEn: true,
          nameBn: true,
          ancestorIds: true,
        },
      })
    : [];
  const anc = [...new Set(self.flatMap((a) => a.ancestorIds))];
  const above = anc.length
    ? await db.geoArea.findMany({
        where: { id: { in: anc } },
        select: { id: true, level: true, nameEn: true, nameBn: true },
      })
    : [];
  const node = new Map<string, GeoNode>(above.map((a) => [a.id, a as GeoNode]));
  const byArea = new Map(
    self.map((a) => [
      a.id,
      placeFromTree(
        a as GeoNode,
        a.ancestorIds.map((i) => node.get(i)).filter((x): x is GeoNode => !!x),
      ),
    ]),
  );
  return new Map(
    rows.map((r) => [
      r.id,
      (r.areaId && byArea.get(r.areaId)) ||
        placeFromAddress(r.shippingAddressText),
    ]),
  );
}

/** A category and every category under it (ids). */
export async function categoryTree(
  db: PrismaClient,
  id: string,
): Promise<Set<string>> {
  const all = await db.category.findMany({
    where: { storeId: S },
    select: { id: true, parentId: true },
  });
  const kids = new Map<string, string[]>();
  for (const c of all)
    if (c.parentId)
      kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  const out = new Set<string>([id]);
  const walk = (x: string) => {
    for (const k of kids.get(x) ?? []) if (!out.has(k)) (out.add(k), walk(k));
  };
  walk(id);
  return out;
}
