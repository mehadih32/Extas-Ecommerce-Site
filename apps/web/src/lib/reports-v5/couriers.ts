// PR 799 (prototype v5 Reports › Couriers): the courier comparison the prototype draws as its own report — per courier the parcels, success,
// returned share, average days, cost per parcel, cash still held and open claims (the best figure of a column marked), success week by week,
// the delivery charge per parcel, success by district and courier, and what per-area routing would have saved this month and last month.
// Counted from the shop's own parcels (Order, Shipment, CodCollection, CourierClaim) and the couriers' rate cards; nothing is estimated
// except the routing line, which is the prototype's own "delivery charge against the cheapest connected courier". Read-only.
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { COD_OWED_OUTCOMES, COD_OWED_STATES } from "../money-overview";
import { addDays } from "./model";
import { loadParcels, type ParcelRow } from "./delivery";

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
const DELIVERED = ["DELIVERED", "PARTIALLY_DELIVERED"];
/** The trend covers this many weeks. */
export const TREND_WEEKS = 8; // hardcode-ok: the prototype's own trend length
/** A week with fewer finished parcels than this keeps the courier's last figure (the prototype's own floor). */
const TREND_FLOOR = 3; // hardcode-ok: the prototype's own floor
/** The districts table lists this many districts, most parcels first. */
export const DISTRICT_ROWS = 10; // hardcode-ok: the prototype's own list length

const fin = (p: { status: string }) =>
  DELIVERED.includes(p.status) || p.status === "RETURNED";
const del = (p: { status: string }) => DELIVERED.includes(p.status);
const sum = <T>(a: readonly T[], f: (x: T) => number) =>
  a.reduce((n, x) => n + f(x), 0);

export interface CourierInfo {
  id: string;
  name: string;
}

export interface CourierStat {
  id: string;
  name: string;
  parcels: number;
  delivered: number;
  returned: number;
  /** % of finished parcels delivered; null with none finished. */
  success: number | null;
  returnPct: number | null;
  avgDays: number | null;
  /** The whole cost per finished parcel (minor): the delivery charge, the cash-collection fee and the return charges; null with none finished. */
  perParcel: number | null;
  /** PR 854: the parts of that cost for the period (minor): delivery charge of delivered parcels, cash fee, charges of returned parcels. */
  delivery: number;
  codFee: number;
  returnCharges: number;
  held: number;
  openClaims: number;
}

/** PR 854: a parcel's fees beyond the delivery charge: the cash-collection fee of a delivered COD parcel, and the courier's return charge of a returned one (null = the card has none, the parcel's own charge stands). */
export interface ParcelFee {
  cod: number;
  ret: number | null;
}

/** One courier's rate-card line for a zone (the fee columns of `CourierRateCard`). */
export interface RateFee {
  courierId: string;
  zoneKey: string;
  codFeeBps: number | null;
  returnChargeMinor: number | null;
  validFrom: Date;
  validTo: Date | null;
}

/** The rate-card line of a courier and zone that was in force the day the parcel was placed (the newest start wins). */
const cardFor = (p: ParcelRow, cards: readonly RateFee[]) =>
  cards
    .filter(
      (c) =>
        c.courierId === p.courierId &&
        c.zoneKey === p.zoneKey &&
        c.validFrom.getTime() <= p.placedAt.getTime() &&
        (!c.validTo || c.validTo.getTime() >= p.placedAt.getTime()),
    )
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];

/** The COD fee and the return charge of each finished parcel, from its courier's rate card of the day (`codAmount` = the COD amount of its shipment). */
export function parcelFees(
  rows: readonly ParcelRow[],
  codAmount: ReadonlyMap<string, number>,
  cards: readonly RateFee[],
): Map<string, ParcelFee> {
  const out = new Map<string, ParcelFee>();
  for (const p of rows) {
    if (!fin(p)) continue;
    const card = cardFor(p, cards);
    const cod = codAmount.get(p.id) ?? 0;
    out.set(p.id, {
      cod:
        del(p) && cod > 0 && card?.codFeeBps != null
          ? Math.round((cod * card.codFeeBps) / 10_000)
          : 0, // hardcode-ok: basis points
      ret: p.status === "RETURNED" ? (card?.returnChargeMinor ?? null) : null,
    });
  }
  return out;
}

/** The comparison row of each courier from the parcels of the period, the delivery charge per order, the cash held and the open claims; `fees` adds the cash fee and the return charges to the cost. */
export function courierStats(
  couriers: readonly CourierInfo[],
  rows: readonly ParcelRow[],
  charge: ReadonlyMap<string, number>,
  held: ReadonlyMap<string, number>,
  claims: ReadonlyMap<string, number>,
  fees: ReadonlyMap<string, ParcelFee> = new Map(),
): CourierStat[] {
  return couriers.map((c) => {
    const mine = rows.filter((p) => p.courierId === c.id);
    const d = mine.filter(del);
    const r = mine.filter((p) => p.status === "RETURNED");
    const f = d.length + r.length;
    const days = d.filter((p) => p.deliveredAt);
    // the cost: the delivery charge of delivered parcels + their cash fee + the charge of returned parcels (the card's return charge, else what the courier charged)
    const delivery = sum(d, (p) => charge.get(p.id) ?? 0);
    const codFee = sum(d, (p) => fees.get(p.id)?.cod ?? 0);
    const returnCharges = sum(
      r,
      (p) => fees.get(p.id)?.ret ?? charge.get(p.id) ?? 0,
    );
    return {
      id: c.id,
      name: c.name,
      parcels: mine.length,
      delivered: d.length,
      returned: r.length,
      success: f ? (d.length / f) * 100 : null,
      returnPct: f ? (r.length / f) * 100 : null,
      avgDays: days.length
        ? sum(
            days,
            (p) => (p.deliveredAt!.getTime() - p.placedAt.getTime()) / DAY_MS,
          ) / days.length
        : null,
      perParcel: f ? Math.round((delivery + codFee + returnCharges) / f) : null,
      delivery,
      codFee,
      returnCharges,
      held: held.get(c.id) ?? 0,
      openClaims: claims.get(c.id) ?? 0,
    };
  });
}

/** Which courier is best in a column (the highest success, the lowest of the others); null when none has a figure. */
export function bestOf(
  stats: readonly CourierStat[],
  key: "success" | "returnPct" | "avgDays" | "perParcel",
): number | null {
  const v = stats.map((s) => s[key]).filter((x): x is number => x !== null);
  return v.length
    ? key === "success"
      ? Math.max(...v)
      : Math.min(...v)
    : null;
}

/** Success per courier per week for the last 8 weeks ending the day `to` (a week with too few parcels keeps the last figure; the first starts at 90). */
export function weeklySuccess(
  couriers: readonly CourierInfo[],
  rows: readonly ParcelRow[],
  to: string,
): {
  labels: string[];
  series: { id: string; name: string; values: number[] }[];
} {
  const end = new Date(`${addDays(to, 1)}T00:00:00Z`).getTime();
  const labels: string[] = [];
  const series = couriers.map((c) => ({
    id: c.id,
    name: c.name,
    values: [] as number[],
  }));
  const last = new Map<string, number>();
  for (let w = TREND_WEEKS - 1; w >= 0; w--) {
    const hi = end - w * 7 * DAY_MS; // hardcode-ok: days in a week
    const lo = hi - 7 * DAY_MS; // hardcode-ok: days in a week
    labels.push(new Date(lo).toISOString().slice(0, 10));
    for (const s of series) {
      const os = rows.filter(
        (p) =>
          p.courierId === s.id &&
          p.placedAt.getTime() >= lo &&
          p.placedAt.getTime() < hi,
      );
      const d = os.filter(del).length;
      const r = os.filter((p) => p.status === "RETURNED").length;
      const v =
        d + r >= TREND_FLOOR ? (d / (d + r)) * 100 : (last.get(s.id) ?? 90); // hardcode-ok: the prototype's starting figure
      last.set(s.id, v);
      s.values.push(Math.round(v * 10) / 10);
    }
  }
  return { labels, series };
}

export interface DistrictRow {
  district: string;
  n: number;
  /** Per courier id: parcels and success (null with none finished). */
  by: Map<string, { n: number; success: number | null }>;
}

/** The districts with the most parcels, each with every courier's parcels and success there. */
export function districtRows(
  couriers: readonly CourierInfo[],
  rows: readonly ParcelRow[],
  take = DISTRICT_ROWS,
): DistrictRow[] {
  const m = new Map<string, ParcelRow[]>();
  for (const p of rows)
    m.set(p.district ?? "—", [...(m.get(p.district ?? "—") ?? []), p]);
  return [...m]
    .map(([district, list]) => ({
      district,
      n: list.length,
      by: new Map(
        couriers.map((c) => {
          const mine = list.filter((p) => p.courierId === c.id);
          const f = mine.filter(fin);
          return [
            c.id,
            {
              n: mine.length,
              success: f.length
                ? (mine.filter(del).length / f.length) * 100
                : null,
            },
          ] as const;
        }),
      ),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, take);
}

export interface RoutingRow {
  zone: string;
  en: string;
  bn: string | null;
  parcels: number;
  /** The cheapest connected courier's charge for the zone, and its name (minor). */
  fee: number;
  best: string;
  save: number;
}

/** What the delivery charges of the delivered parcels would have saved with the cheapest connected courier per zone (only a charge above it counts). */
export function routingSavings(
  rows: readonly ParcelRow[],
  charge: ReadonlyMap<string, number>,
  cheapest: ReadonlyMap<string, { fee: number; name: string }>,
): { rows: RoutingRow[]; total: number } {
  const out: RoutingRow[] = [];
  for (const [zone, best] of cheapest) {
    const os = rows.filter((p) => del(p) && p.zoneKey === zone);
    const first = os[0] ?? rows.find((p) => p.zoneKey === zone);
    out.push({
      zone,
      en: first?.zoneEn ?? zone,
      bn: first?.zoneBn ?? null,
      parcels: os.length,
      fee: best.fee,
      best: best.name,
      save: sum(os, (p) => Math.max(0, (charge.get(p.id) ?? 0) - best.fee)),
    });
  }
  return {
    rows: out.sort((a, b) => b.save - a.save),
    total: sum(out, (r) => r.save),
  };
}

export interface CouriersData {
  couriers: CourierInfo[];
  /** The parcels placed in the window the page reads (the longest of the period, the trend and last month). */
  rows: ParcelRow[];
  charge: Map<string, number>;
  held: Map<string, number>;
  claims: Map<string, number>;
  /** PR 854: each finished parcel's cash-collection fee and return charge (see `parcelFees`). */
  fees: Map<string, ParcelFee>;
  cheapest: Map<string, { fee: number; name: string }>;
}

/** Everything the Couriers report draws; `from`–`to` is the page's period, the window reaches back far enough for the trend and last month. */
export async function loadCouriers(
  db: PrismaClient,
  tz: string,
  from: string,
  to: string,
  today: string,
  scope: { isPractice?: false } = {},
): Promise<CouriersData> {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthStart = (() => {
    const d = new Date(`${monthStart}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const trendStart = addDays(to, -TREND_WEEKS * 7 + 1); // hardcode-ok: days in a week
  const lo = [from, trendStart, lastMonthStart].sort()[0]!;
  const hi = [to, today].sort().reverse()[0]!;
  const rows = await loadParcels(db, tz, lo, hi, scope);
  const accounts = await db.courierAccount.findMany({
    where: {
      storeId: S,
      archivedAt: null,
      ...(scope.isPractice === false ? { isPractice: false } : {}),
    },
    select: { id: true, name: true, enabled: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  const used = new Set(rows.map((p) => p.courierId));
  const couriers = accounts
    .filter((a) => a.enabled || used.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
  const ids = rows.map((p) => p.id);
  const ships = ids.length
    ? await db.shipment.findMany({
        where: { storeId: S, orderId: { in: ids } },
        select: {
          id: true,
          orderId: true,
          courierAccountId: true,
          chargeMinor: true,
          codAmountMinor: true,
        },
        take: 50_000,
      })
    : [];
  const charge = new Map<string, number>();
  const codAmount = new Map<string, number>();
  for (const s of ships) {
    charge.set(s.orderId, (charge.get(s.orderId) ?? 0) + (s.chargeMinor ?? 0));
    codAmount.set(
      s.orderId,
      (codAmount.get(s.orderId) ?? 0) + s.codAmountMinor,
    );
  }
  const shipCourier = new Map(ships.map((s) => [s.id, s.courierAccountId]));
  const cod = await db.codCollection.findMany({
    where: {
      storeId: S,
      outcome: { in: [...COD_OWED_OUTCOMES] },
      state: { in: [...COD_OWED_STATES] },
      settlementLineId: null,
      shipmentId: { not: null },
    },
    select: {
      shipmentId: true,
      collectedMinor: true,
      chargeCollectedMinor: true,
    },
    take: 50_000,
  });
  const unknown = cod
    .map((c) => c.shipmentId!)
    .filter((x) => !shipCourier.has(x));
  if (unknown.length)
    for (const s of await db.shipment.findMany({
      where: { id: { in: unknown } },
      select: { id: true, courierAccountId: true },
    }))
      shipCourier.set(s.id, s.courierAccountId);
  const held = new Map<string, number>();
  for (const c of cod) {
    const cid = shipCourier.get(c.shipmentId!);
    if (cid)
      held.set(
        cid,
        (held.get(cid) ?? 0) + c.collectedMinor + c.chargeCollectedMinor,
      );
  }
  const open = await db.courierClaim.groupBy({
    by: ["courierAccountId"],
    where: {
      storeId: S,
      status: { in: ["OPEN", "SENT"] },
      ...(scope.isPractice === false ? { isPractice: false } : {}),
    },
    _count: { _all: true },
  });
  const claims = new Map(open.map((o) => [o.courierAccountId, o._count._all]));
  // the cheapest connected courier per zone: its lowest rate card charge for the zone
  const cards = await db.courierRateCard.findMany({
    where: {
      storeId: S,
      courierAccountId: {
        in: couriers
          .filter((c) => accounts.find((a) => a.id === c.id)?.enabled)
          .map((c) => c.id),
      },
      OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
    },
    select: { courierAccountId: true, zoneKey: true, chargeMinor: true },
    take: 20_000,
  });
  // PR 854: the cash-collection fee and the return charge come from each courier's rate card of the day (any card, a switched-off courier included)
  const feeCards = couriers.length
    ? await db.courierRateCard.findMany({
        where: {
          storeId: S,
          courierAccountId: { in: couriers.map((c) => c.id) },
        },
        select: {
          courierAccountId: true,
          zoneKey: true,
          codFeeBps: true,
          returnChargeMinor: true,
          validFrom: true,
          validTo: true,
        },
        take: 20_000,
      })
    : [];
  const fees = parcelFees(
    rows,
    codAmount,
    feeCards.map((c) => ({
      courierId: c.courierAccountId,
      zoneKey: c.zoneKey,
      codFeeBps: c.codFeeBps,
      returnChargeMinor: c.returnChargeMinor,
      validFrom: c.validFrom,
      validTo: c.validTo,
    })),
  );
  const nameOf = new Map(couriers.map((c) => [c.id, c.name]));
  const cheapest = new Map<string, { fee: number; name: string }>();
  for (const c of cards) {
    const cur = cheapest.get(c.zoneKey);
    if (!cur || c.chargeMinor < cur.fee)
      cheapest.set(c.zoneKey, {
        fee: c.chargeMinor,
        name: nameOf.get(c.courierAccountId) ?? "—",
      });
  }
  return { couriers, rows, charge, held, claims, fees, cheapest };
}

/** The parcels placed in `from`–`to` (the shop-day strings), out of a wider window. */
export const inSpan = (
  rows: readonly ParcelRow[],
  from: string,
  to: string,
  tz: string,
): ParcelRow[] => {
  const key = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  return rows.filter((p) => {
    const day = key(p.placedAt);
    return day >= from && day <= to;
  });
};
