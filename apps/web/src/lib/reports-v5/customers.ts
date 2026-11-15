// PR 798 (prototype v5 Reports › Customers): who ordered in the period and the span before, new against returning, the repeat rate, the
// average customer value, buyers who have gone quiet, sales by grade, the first-order-month cohorts and the top customers and districts.
// Read-only: every figure is counted from Order and Customer rows (the customer's own counters for "all time"); practice records count
// only while practice mode is on.
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { daysPeriod, ymdIn } from "@extas/metrics";
import type { AdminDeps } from "../admin-auth";
import { resolvePlaces } from "./areas";
import { practiceScope } from "./practice";

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day

export interface CustOrder {
  id: string;
  number: string;
  customerId: string;
  /** Placed at, in ms. */
  at: number;
  day: string;
  status: string;
  totalMinor: number;
  district: string | null;
  area: string | null;
}

export interface Buyer {
  id: string;
  name: string;
  phone: string | null;
  orders: number;
  delivered: number;
  spentMinor: number;
  lastOrderAt: number | null;
  /** The grade's sort order (higher is better); -1 = no grade yet. */
  gradeRank: number;
  grade: string | null;
}

export const liveOrders = <T extends { status: string }>(os: readonly T[]) =>
  os.filter((o) => o.status !== "CANCELLED");
const sum = <T>(a: readonly T[], f: (x: T) => number) =>
  a.reduce((n, x) => n + f(x), 0);
const pc = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export interface WhoOrdered {
  n: number;
  nw: number;
  ret: number;
}

/** Customers who ordered (live orders), how many of them placed their very first order in these orders, and the rest. */
export function whoOrdered(
  os: readonly CustOrder[],
  first: ReadonlyMap<string, number>,
): WhoOrdered {
  const live = liveOrders(os);
  const ids = new Set(live.map((o) => o.customerId));
  const nw = new Set(
    live
      .filter((o) => first.get(o.customerId) === o.at)
      .map((o) => o.customerId),
  );
  return { n: ids.size, nw: nw.size, ret: ids.size - nw.size };
}

export interface CustFacts {
  repeat: number;
  avgValue: number;
  atRisk: Buyer[];
  topCustomers: {
    buyer: Buyer | null;
    customerId: string;
    n: number;
    v: number;
    isNew: boolean;
  }[];
  byDistrict: {
    d: string;
    n: number;
    o: number;
    v: number;
    orders: CustOrder[];
  }[];
}

/** Repeat rate (% of buyers with 2+ orders), average delivered value per buyer, quiet buyers, top customers and districts of the period. */
export function customerFacts(
  cur: readonly CustOrder[],
  buyers: readonly Buyer[],
  first: ReadonlyMap<string, number>,
  now: number,
  quietDays: number,
): CustFacts {
  const withOrders = buyers.filter((b) => b.orders > 0);
  const byId = new Map(buyers.map((b) => [b.id, b]));
  const live = liveOrders(cur);
  const per = new Map<string, CustOrder[]>();
  for (const o of live)
    per.set(o.customerId, [...(per.get(o.customerId) ?? []), o]);
  const dist = new Map<string, CustOrder[]>();
  for (const o of live)
    dist.set(o.district ?? "—", [...(dist.get(o.district ?? "—") ?? []), o]);
  return {
    repeat: pc(
      withOrders.filter((b) => b.orders >= 2).length,
      withOrders.length,
    ),
    avgValue: withOrders.length
      ? Math.round(sum(withOrders, (b) => b.spentMinor) / withOrders.length)
      : 0,
    atRisk: withOrders
      .filter(
        (b) =>
          b.delivered > 0 &&
          b.lastOrderAt !== null &&
          (now - b.lastOrderAt) / DAY_MS > quietDays,
      )
      .sort((a, b) => b.spentMinor - a.spentMinor),
    topCustomers: [...per].map(([customerId, os]) => ({
      buyer: byId.get(customerId) ?? null,
      customerId,
      n: os.length,
      v: sum(os, (o) => o.totalMinor),
      isNew: os.some((o) => first.get(o.customerId) === o.at),
    })),
    byDistrict: [...dist].map(([d, os]) => ({
      d,
      n: new Set(os.map((o) => o.customerId)).size,
      o: os.length,
      v: sum(os, (o) => o.totalMinor),
      orders: os,
    })),
  };
}

export interface GradeRow {
  rank: number;
  name: string | null;
  customers: number;
  sales: number;
  orders: number;
  ltv: number;
  repeat: number;
}

/** Sales (delivered orders of the period), orders, average lifetime value and repeat rate by customer grade, best grade first. */
export function gradeRows(
  cur: readonly CustOrder[],
  buyers: readonly Buyer[],
): GradeRow[] {
  const by = new Map<number, Buyer[]>();
  for (const b of buyers.filter((x) => x.orders > 0))
    by.set(b.gradeRank, [...(by.get(b.gradeRank) ?? []), b]);
  const gradeOf = new Map(buyers.map((b) => [b.id, b.gradeRank]));
  return [...by]
    .map(([rank, list]) => {
      const mine = cur.filter((o) => gradeOf.get(o.customerId) === rank);
      return {
        rank,
        name: list[0]!.grade,
        customers: list.length,
        sales: sum(
          mine.filter((o) =>
            ["DELIVERED", "PARTIALLY_DELIVERED"].includes(o.status),
          ),
          (o) => o.totalMinor,
        ),
        orders: liveOrders(mine).length,
        ltv: Math.round(sum(list, (b) => b.spentMinor) / list.length),
        repeat: pc(list.filter((b) => b.orders >= 2).length, list.length),
      };
    })
    .sort((a, b) => b.rank - a.rank);
}

export interface Cohort {
  /** "2026-11". */
  month: string;
  customers: number;
  /** Share (%) who ordered again in the same month, the next and the one after; null for a month not yet reached. */
  back: (number | null)[];
  avgValue: number;
}

const monthOf = (ms: number, tz: string) => ymdIn(new Date(ms), tz).slice(0, 7);
const monthNo = (m: string) =>
  Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;

/** Cohorts: for each first-order month, the share of its new customers who ordered again in that month, the next and the one after. */
export function cohorts(
  orders: readonly { customerId: string; at: number }[],
  first: ReadonlyMap<string, number>,
  spent: ReadonlyMap<string, number>,
  tz: string,
  nowMs: number,
  months: number,
): Cohort[] {
  const nowM = monthNo(monthOf(nowMs, tz));
  const by = new Map<string, { ids: Set<string>; ltv: number }>();
  for (const [id, at] of first) {
    const m = monthOf(at, tz);
    if (nowM - monthNo(m) >= months) continue;
    const x = by.get(m) ?? { ids: new Set<string>(), ltv: 0 };
    x.ids.add(id);
    x.ltv += spent.get(id) ?? 0;
    by.set(m, x);
  }
  const later = new Map<string, Set<number>>();
  for (const o of orders) {
    if (first.get(o.customerId) === o.at) continue;
    later.set(
      o.customerId,
      (later.get(o.customerId) ?? new Set()).add(monthNo(monthOf(o.at, tz))),
    );
  }
  return [...by]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, x]) => ({
      month,
      customers: x.ids.size,
      back: [0, 1, 2].map((i) =>
        monthNo(month) + i > nowM
          ? null
          : pc(
              [...x.ids].filter((id) => later.get(id)?.has(monthNo(month) + i))
                .length,
              x.ids.size,
            ),
      ),
      avgValue: Math.round(x.ltv / x.ids.size),
    }));
}

const NOT = ["DRAFT"] as const;

/** The orders of one span that have a customer (drafts left out), with the district they went to. */
export async function loadCustOrders(
  db: PrismaClient,
  deps: Pick<AdminDeps, "resolver">,
  tz: string,
  from: string,
  to: string,
): Promise<CustOrder[]> {
  const per = daysPeriod(from, to, tz);
  const scope = await practiceScope(deps);
  const rows = await db.order.findMany({
    where: {
      storeId: S,
      archivedAt: null,
      customerId: { not: null },
      status: { notIn: [...NOT] },
      placedAt: { gte: per.from, lt: per.to },
      ...scope,
    },
    select: {
      id: true,
      number: true,
      customerId: true,
      placedAt: true,
      status: true,
      totalMinor: true,
      areaId: true,
      shippingAddressText: true,
    },
    orderBy: { placedAt: "asc" },
    take: 20000,
  });
  const places = await resolvePlaces(db, rows);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customerId: r.customerId!,
    at: r.placedAt.getTime(),
    day: ymdIn(r.placedAt, tz),
    status: r.status,
    totalMinor: r.totalMinor,
    district: places.get(r.id)?.district ?? null,
    area: places.get(r.id)?.area ?? null,
  }));
}

export interface CustomersData {
  cur: CustOrder[];
  prev: CustOrder[];
  first: Map<string, number>;
  buyers: Buyer[];
  quietDays: number;
  cohorts: Cohort[];
}

const COHORT_MONTHS = 6; // hardcode-ok: the cohort table covers the last six months

/** Everything the Customers report draws for the span and the span before it. */
export async function loadCustomers(
  deps: Pick<AdminDeps, "db" | "resolver">,
  tz: string,
  from: string,
  to: string,
  before: { from: string; to: string },
  now: Date,
): Promise<CustomersData> {
  const db: PrismaClient = deps.db;
  const scope = await practiceScope(deps);
  const [cur, prev, settings, buyerRows] = await Promise.all([
    loadCustOrders(db, deps, tz, from, to),
    loadCustOrders(db, deps, tz, before.from, before.to),
    deps.resolver.value("customers.report", { storeId: S }) as Promise<{
      quietDays: number;
    }>,
    db.customer.findMany({
      where: {
        storeId: S,
        orderCount: { gt: 0 },
        archivedAt: null,
        mergedIntoId: null,
        erasedAt: null,
        ...scope,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        orderCount: true,
        deliveredCount: true,
        lifetimeValueMinor: true,
        lastOrderAt: true,
        grade: { select: { nameEn: true, sortOrder: true } },
      },
      take: 20000,
    }),
  ]);
  const buyers: Buyer[] = buyerRows.map((c) => ({
    id: c.id,
    name: c.name ?? "—",
    phone: c.phone,
    orders: c.orderCount,
    delivered: c.deliveredCount,
    spentMinor: c.lifetimeValueMinor,
    lastOrderAt: c.lastOrderAt?.getTime() ?? null,
    gradeRank: c.grade ? c.grade.sortOrder : -1,
    grade: c.grade?.nameEn ?? null,
  }));
  const ids = [...new Set([...cur, ...prev].map((o) => o.customerId))];
  const mins = ids.length
    ? await db.order.groupBy({
        by: ["customerId"],
        where: {
          storeId: S,
          customerId: { in: ids },
          archivedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED"] },
          ...scope,
        },
        _min: { placedAt: true },
      })
    : [];
  const first = new Map<string, number>(
    mins.flatMap((m) =>
      m.customerId && m._min.placedAt
        ? [[m.customerId, m._min.placedAt.getTime()] as const]
        : [],
    ),
  );
  // the cohort table: customers whose first order was in the last months, with every order they placed since
  const cohortFrom = new Date(now.getTime() - COHORT_MONTHS * 31 * DAY_MS); // hardcode-ok: a month's length, wide enough to reach the window
  const recent = await db.order.findMany({
    where: {
      storeId: S,
      customerId: { not: null },
      archivedAt: null,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      placedAt: { gte: cohortFrom },
      ...scope,
    },
    select: { customerId: true, placedAt: true },
    take: 50000,
  });
  const rids = [...new Set(recent.map((o) => o.customerId!))];
  const rmins = rids.length
    ? await db.order.groupBy({
        by: ["customerId"],
        where: {
          storeId: S,
          customerId: { in: rids },
          archivedAt: null,
          status: { notIn: ["DRAFT", "CANCELLED"] },
          ...scope,
        },
        _min: { placedAt: true },
      })
    : [];
  const rfirst = new Map<string, number>(
    rmins.flatMap((m) =>
      m.customerId && m._min.placedAt
        ? [[m.customerId, m._min.placedAt.getTime()] as const]
        : [],
    ),
  );
  const spent = new Map(buyers.map((b) => [b.id, b.spentMinor]));
  return {
    cur,
    prev,
    first,
    buyers,
    quietDays: settings?.quietDays ?? 60,
    cohorts: cohorts(
      recent.map((o) => ({
        customerId: o.customerId!,
        at: o.placedAt.getTime(),
      })),
      rfirst,
      spent,
      tz,
      now.getTime(),
      COHORT_MONTHS,
    ),
  }; // hardcode-ok: quiet days fall back to the registry's own default
}
