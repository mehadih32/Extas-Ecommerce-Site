// PR 797 (prototype v5 Reports › Delivery & returns): the shop's own parcels of one period, worked into the figures the prototype's
// report draws: success and average days, by courier, by zone (against the band's promise), by district, why parcels came back, returns
// by size and by product, partial deliveries, exchange reasons, the courier-and-zone grid and the COD money still with couriers by age.
// Read-only; every figure is counted from Order, Shipment, ReturnRecord and CodCollection rows (nothing estimated).
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { daysPeriod } from "@extas/metrics";
import { COD_OWED_OUTCOMES, COD_OWED_STATES } from "../money-overview";

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
const DELIVERED = ["DELIVERED", "PARTIALLY_DELIVERED"];
/** A district or size shows in a list only when it has this many finished parcels (the prototype's own floor). */
export const MIN_FINISHED = 3;

export interface ParcelRow {
  id: string;
  number: string;
  courierId: string;
  courier: string;
  zoneKey: string | null;
  zoneEn: string | null;
  zoneBn: string | null;
  promiseDays: number | null;
  district: string | null;
  status: string;
  placedAt: Date;
  deliveredAt: Date | null;
  totalMinor: number;
}

const finished = (p: { status: string }) =>
  DELIVERED.includes(p.status) || p.status === "RETURNED";
const delivered = (p: { status: string }) => DELIVERED.includes(p.status);
const avgDays = (rows: readonly ParcelRow[]) => {
  const d = rows.filter((p) => p.deliveredAt);
  return d.length
    ? d.reduce(
        (n, p) =>
          n + (p.deliveredAt!.getTime() - p.placedAt.getTime()) / DAY_MS,
        0,
      ) / d.length
    : null;
};

export interface DeliveryFacts {
  sent: number;
  finished: number;
  delivered: number;
  returned: number;
  onTheWay: number;
  success: number | null;
  avgDays: number | null;
  byCourier: {
    id: string;
    name: string;
    finished: number;
    delivered: number;
    success: number;
    days: number | null;
  }[];
  byZone: {
    key: string;
    en: string;
    bn: string | null;
    days: number;
    n: number;
    promise: number | null;
  }[];
  byDistrict: {
    name: string;
    finished: number;
    returned: number;
    rate: number;
  }[];
  reasons: { code: string; n: number }[];
  bySize: { size: string; fin: number; ret: number }[];
  byProduct: { name: string; fin: number; ret: number }[];
  partial: {
    orders: number;
    piecesBack: number;
    rows: {
      id: string;
      number: string;
      district: string | null;
      kept: number;
      total: number;
    }[];
  };
  exchangeReasons: { code: string; n: number }[];
  exchangeByProduct: { name: string; n: number; top: string }[];
  grid: {
    courierId: string;
    courier: string;
    zoneKey: string;
    zoneEn: string;
    zoneBn: string | null;
    n: number;
    d: number;
    rt: number;
    success: number;
    days: number | null;
    /** PR 854: the cell's parcels (newest first), for the row's drawer. */
    orders: {
      id: string;
      number: string;
      district: string | null;
      status: string;
      totalMinor: number;
    }[];
  }[];
  cod: {
    parcels: number;
    minor: number;
    ages: { key: "a0" | "a4" | "a8"; parcels: number; minor: number }[];
  };
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const count = <T>(xs: readonly T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};

/** Pure part: everything the page draws that comes from the parcel rows alone. */
export function deliveryFromRows(
  rows: readonly ParcelRow[],
): Pick<
  DeliveryFacts,
  | "sent"
  | "finished"
  | "delivered"
  | "returned"
  | "onTheWay"
  | "success"
  | "avgDays"
  | "byCourier"
  | "byZone"
  | "byDistrict"
  | "grid"
> {
  const fin = rows.filter(finished);
  const del = rows.filter(delivered);
  const byCourier = [...new Set(fin.map((p) => p.courierId))].map((id) => {
    const os = fin.filter((p) => p.courierId === id);
    const d = os.filter(delivered);
    return {
      id,
      name: os[0]!.courier,
      finished: os.length,
      delivered: d.length,
      success: pct(d.length, os.length),
      days: avgDays(d),
    };
  });
  const zones = [
    ...new Set(del.map((p) => p.zoneKey).filter((k): k is string => !!k)),
  ].map((key) => {
    const d = del.filter((p) => p.zoneKey === key);
    return {
      key,
      en: d[0]!.zoneEn ?? key,
      bn: d[0]!.zoneBn,
      days: avgDays(d) ?? 0,
      n: d.length,
      promise: d[0]!.promiseDays,
    };
  });
  const districts = [
    ...count(
      fin.filter((p) => p.district),
      (p) => p.district!,
    ),
  ].map(([name, n]) => {
    const ret = fin.filter(
      (p) => p.district === name && p.status === "RETURNED",
    ).length;
    return { name, finished: n, returned: ret, rate: pct(ret, n) };
  });
  const grid: DeliveryFacts["grid"] = [];
  for (const c of byCourier)
    for (const z of new Set(
      fin
        .filter((p) => p.courierId === c.id && p.zoneKey)
        .map((p) => p.zoneKey!),
    )) {
      const os = fin.filter((p) => p.courierId === c.id && p.zoneKey === z);
      const d = os.filter(delivered);
      grid.push({
        courierId: c.id,
        courier: c.name,
        zoneKey: z,
        zoneEn: os[0]!.zoneEn ?? z,
        zoneBn: os[0]!.zoneBn,
        n: os.length,
        d: d.length,
        rt: os.length - d.length,
        success: pct(d.length, os.length),
        days: avgDays(d),
        orders: [...os]
          .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
          .map((p) => ({
            id: p.id,
            number: p.number,
            district: p.district,
            status: p.status,
            totalMinor: p.totalMinor,
          })),
      });
    }
  return {
    sent: rows.length,
    finished: fin.length,
    delivered: del.length,
    returned: fin.length - del.length,
    onTheWay: rows.filter((p) =>
      ["HANDED_OVER", "IN_TRANSIT"].includes(p.status),
    ).length,
    success: fin.length ? pct(del.length, fin.length) : null,
    avgDays: avgDays(del),
    byCourier: byCourier.sort((a, b) => b.success - a.success),
    byZone: zones,
    byDistrict: districts
      .filter((x) => x.finished >= MIN_FINISHED)
      .sort((a, b) => b.rate - a.rate),
    grid,
  };
}

/** The parcels placed in the span that a courier took, with their courier, zone and district. */
export async function loadParcels(
  db: PrismaClient,
  tz: string,
  from: string,
  to: string,
  scope: { isPractice?: false } = {},
): Promise<ParcelRow[]> {
  const per = daysPeriod(from, to, tz);
  const rows = await db.order.findMany({
    where: {
      storeId: S,
      archivedAt: null,
      courierAccountId: { not: null },
      status: {
        in: [
          "HANDED_OVER",
          "IN_TRANSIT",
          "DELIVERED",
          "PARTIALLY_DELIVERED",
          "RETURNED",
        ],
      },
      placedAt: { gte: per.from, lt: per.to },
      ...scope,
    },
    select: {
      id: true,
      number: true,
      status: true,
      placedAt: true,
      deliveredAt: true,
      totalMinor: true,
      courierAccountId: true,
      deliveryBand: {
        select: { key: true, nameEn: true, nameBn: true, hoursMax: true },
      },
      area: { select: { level: true, nameEn: true, ancestorIds: true } },
    },
    take: 20000,
  });
  const courierIds = [...new Set(rows.map((r) => r.courierAccountId!))];
  const couriers = courierIds.length
    ? await db.courierAccount.findMany({
        where: { id: { in: courierIds } },
        select: { id: true, name: true },
      })
    : [];
  const cname = new Map(couriers.map((c) => [c.id, c.name]));
  const anc = [...new Set(rows.flatMap((r) => r.area?.ancestorIds ?? []))];
  const districts = anc.length
    ? await db.geoArea.findMany({
        where: { id: { in: anc }, level: "DISTRICT" },
        select: { id: true, nameEn: true },
      })
    : [];
  const dname = new Map(districts.map((d) => [d.id, d.nameEn]));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    courierId: r.courierAccountId!,
    courier: cname.get(r.courierAccountId!) ?? "—",
    zoneKey: r.deliveryBand?.key ?? null,
    zoneEn: r.deliveryBand?.nameEn ?? null,
    zoneBn: r.deliveryBand?.nameBn ?? null,
    promiseDays: r.deliveryBand?.hoursMax
      ? Math.ceil(r.deliveryBand.hoursMax / 24)
      : null,
    district: r.area
      ? r.area.level === "DISTRICT"
        ? r.area.nameEn
        : (r.area.ancestorIds.map((a) => dname.get(a)).find(Boolean) ?? null)
      : null,
    status: r.status,
    placedAt: r.placedAt,
    deliveredAt: r.deliveredAt,
    totalMinor: r.totalMinor,
  }));
}

/** Everything the prototype's Delivery & returns report draws, for the span. */
export async function loadDelivery(
  db: PrismaClient,
  tz: string,
  from: string,
  to: string,
  now: Date,
  scope: { isPractice?: false } = {},
): Promise<{ facts: DeliveryFacts; rows: ParcelRow[] }> {
  const rows = await loadParcels(db, tz, from, to, scope);
  const base = deliveryFromRows(rows);
  const finishedIds = rows.filter(finished).map((p) => p.id);
  const retIds = rows.filter((p) => p.status === "RETURNED").map((p) => p.id);
  const partIds = rows
    .filter((p) => p.status === "PARTIALLY_DELIVERED")
    .map((p) => p.id);
  const per = daysPeriod(from, to, tz);
  const [items, returns, exchanges, cod] = await Promise.all([
    finishedIds.length
      ? db.orderItem.findMany({
          where: { orderId: { in: finishedIds }, status: "ACTIVE" },
          select: {
            orderId: true,
            sizeLabel: true,
            productName: true,
            quantity: true,
          },
        })
      : Promise.resolve([]),
    finishedIds.length
      ? db.returnRecord.findMany({
          where: {
            storeId: S,
            orderId: { in: finishedIds },
            kind: { not: "EXCHANGE_PICKUP" },
          },
          select: {
            orderId: true,
            reasonCode: true,
            items: { select: { quantity: true } },
          },
        })
      : Promise.resolve([]),
    db.returnRecord.findMany({
      where: {
        storeId: S,
        kind: "EXCHANGE_PICKUP",
        createdAt: { gte: per.from, lt: per.to },
      },
      select: { reasonCode: true, orderId: true },
    }),
    db.codCollection.findMany({
      where: {
        storeId: S,
        outcome: { in: [...COD_OWED_OUTCOMES] },
        state: { in: [...COD_OWED_STATES] },
        settlementLineId: null,
      },
      select: {
        collectedMinor: true,
        chargeCollectedMinor: true,
        occurredAt: true,
      },
    }),
  ]);
  const retSet = new Set(retIds);
  const size = new Map<string, { fin: number; ret: number }>();
  const prod = new Map<string, { fin: number; ret: number }>();
  for (const i of items) {
    const r = retSet.has(i.orderId);
    const s = size.get(i.sizeLabel ?? "—") ?? { fin: 0, ret: 0 };
    s.fin += i.quantity;
    if (r) s.ret += i.quantity;
    size.set(i.sizeLabel ?? "—", s);
    const p = prod.get(i.productName) ?? { fin: 0, ret: 0 };
    p.fin += i.quantity;
    if (r) p.ret += i.quantity;
    prod.set(i.productName, p);
  }
  const partSet = new Set(partIds);
  const backBy = new Map<string, number>();
  for (const r of returns)
    if (partSet.has(r.orderId))
      backBy.set(
        r.orderId,
        (backBy.get(r.orderId) ?? 0) +
          r.items.reduce((n, x) => n + x.quantity, 0),
      );
  const pcsBy = new Map<string, number>();
  for (const i of items)
    if (partSet.has(i.orderId))
      pcsBy.set(i.orderId, (pcsBy.get(i.orderId) ?? 0) + i.quantity);
  const reasonOf = (code: string | null) => code ?? "—";
  const exOrderIds = [...new Set(exchanges.map((e) => e.orderId))];
  const exItems = exOrderIds.length
    ? await db.orderItem.findMany({
        where: { orderId: { in: exOrderIds } },
        select: { orderId: true, productName: true },
      })
    : [];
  const exName = new Map<string, string>();
  for (const i of exItems)
    if (!exName.has(i.orderId)) exName.set(i.orderId, i.productName);
  const exBy = new Map<string, string[]>();
  for (const e of exchanges)
    exBy.set(exName.get(e.orderId) ?? "—", [
      ...(exBy.get(exName.get(e.orderId) ?? "—") ?? []),
      reasonOf(e.reasonCode),
    ]);
  const live = cod.filter((c) => c.collectedMinor + c.chargeCollectedMinor > 0);
  const age = (c: { occurredAt: Date }) =>
    (now.getTime() - c.occurredAt.getTime()) / DAY_MS;
  const bucket = (f: (a: number) => boolean) => live.filter((c) => f(age(c)));
  const sumOf = (xs: typeof live) =>
    xs.reduce((n, c) => n + c.collectedMinor + c.chargeCollectedMinor, 0);
  const b0 = bucket((a) => a <= 3);
  const b4 = bucket((a) => a > 3 && a <= 7);
  const b8 = bucket((a) => a > 7);
  const facts: DeliveryFacts = {
    ...base,
    reasons: [
      ...count(
        returns.filter((r) => retSet.has(r.orderId)),
        (r) => reasonOf(r.reasonCode),
      ),
    ]
      .map(([code, n]) => ({ code, n }))
      .sort((a, b) => b.n - a.n),
    bySize: [...size]
      .map(([k, v]) => ({ size: k, ...v }))
      .filter((x) => x.fin >= MIN_FINISHED),
    byProduct: [...prod]
      .map(([name, v]) => ({ name, ...v }))
      .filter((x) => x.fin >= MIN_FINISHED && x.ret)
      .sort((a, b) => pct(b.ret, b.fin) - pct(a.ret, a.fin)),
    partial: {
      orders: partIds.length,
      piecesBack: [...backBy.values()].reduce((n, x) => n + x, 0),
      rows: rows
        .filter((p) => partSet.has(p.id))
        .map((p) => ({
          id: p.id,
          number: p.number,
          district: p.district,
          total: pcsBy.get(p.id) ?? 0,
          kept: Math.max(0, (pcsBy.get(p.id) ?? 0) - (backBy.get(p.id) ?? 0)),
        })),
    },
    exchangeReasons: [...count(exchanges, (e) => reasonOf(e.reasonCode))]
      .map(([code, n]) => ({ code, n }))
      .sort((a, b) => b.n - a.n),
    exchangeByProduct: [...exBy]
      .map(([name, rs]) => {
        const top =
          [...count(rs, (r) => r)].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
        return { name, n: rs.length, top };
      })
      .sort((a, b) => b.n - a.n),
    cod: {
      parcels: live.length,
      minor: sumOf(live),
      ages: [
        { key: "a0", parcels: b0.length, minor: sumOf(b0) },
        { key: "a4", parcels: b4.length, minor: sumOf(b4) },
        { key: "a8", parcels: b8.length, minor: sumOf(b8) },
      ],
    },
  };
  return { facts, rows };
}
