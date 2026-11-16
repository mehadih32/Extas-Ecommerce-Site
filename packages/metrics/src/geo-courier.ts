// S29 · PR 757 (CN-054) — Reports › Geography map, the courier and coverage lens. Per area, from the shop's own parcels:
//   - courier success: parcels delivered ÷ (delivered + returned), the same days the other reports use (a parcel counts on
//     the day the courier delivered it, or on the day it came back); `parcels` is how many settled;
//   - delivery time against the promise: the hours from pick-up (else booking) to delivery, against the hours the order's
//     delivery band promised (`DeliveryBand.hoursMax`); `lateShare` is the delivered parcels that took longer than promised,
//     counted only where the band gave a promise;
//   - the best courier of the area from the shop's own parcels (advice only: it never changes the courier rules, a booking
//     or a mapping), among couriers with at least `minParcels` settled parcels there;
//   - coverage gaps: areas that have orders but no courier mapped (`CourierAreaMapping`, an enabled courier, the place or any
//     place above it). Only orders count as demand here: the shop keeps no visit per area.
// Counts and hours only: no customer name, phone or address is ever read. Read-only, store-scoped, practice parcels (the
// MOCK adapter) and archived orders left out. The thresholds are the setting `reports.geoMapCourier`, the lens switch is
// `reports.geoMap.lenses.courier` (off as shipped); this file has no business number of its own.
import { Prisma } from '@extas/db/client';
import { basisWhere, type Db } from './metrics';
import { daysPeriod } from './pure';
import type { GeoDays, GeoLensResponse, GeoLensRow, GeoLevel } from './geo-types';

export interface CourierLensThresholds {
  /** Settled parcels an area (or a courier in it) needs before a rate means anything. */
  minParcels: number;
  /** A success rate under this (per cent) is flagged. */
  lowSuccessPct: number;
  /** A share of late deliveries at or over this (per cent) is flagged. */
  lateWarnPct: number;
  /** How many coverage gaps the list names. */
  gapLimit: number;
}

/** One group of parcels the loader reads: one courier, one order area. */
export interface ParcelGroup {
  courierId: string;
  /** The order's delivery area (null: the order has none). */
  areaId: string | null;
  delivered: number;
  returned: number;
  /** Σ hours from pick-up to delivery over the delivered parcels. */
  hoursSum: number;
  /** Delivered parcels whose band promised a time. */
  withPromise: number;
  /** Of those, the ones that took longer. */
  late: number;
  /** Σ promised hours over `withPromise`. */
  promiseSum: number;
}

/** A place of the tree, as much of it as the roll-up needs. */
export interface LensPlace {
  id: string;
  /** DIVISION, DISTRICT, UPAZILA, THANA or AREA. */
  level: string;
  ancestorIds: string[];
  nameEn: string;
  nameBn: string | null;
  cityCorporation: string | null;
}

export interface CourierAreaDetail {
  /** The courier that did most of the settled parcels here (null when none). */
  mostUsedCourierId: string | null;
  /** Every courier with settled parcels here, best success first. */
  couriers: { courierId: string; delivered: number; returned: number; successRate: number | null; avgHours: number | null }[];
  /** The best courier by the shop's own parcels (advice only), or null when none has enough parcels. */
  best: { courierId: string; successRate: number; parcels: number } | null;
}

export interface CoverageGap {
  areaId: string;
  level: string;
  nameEn: string;
  nameBn: string | null;
  /** Orders placed in the period to this place that no courier covers. */
  orders: number;
}

export interface CourierLensResponse extends GeoLensResponse {
  lens: 'courier';
  /** By areaId, for the rows of the map; advice only. */
  details: Record<string, CourierAreaDetail>;
  /** Names of the couriers the details mention. */
  couriers: { id: string; name: string }[];
  /** Places with orders and no courier mapped, most orders first, at most `gapLimit`. */
  gaps: CoverageGap[];
  /** Orders with no area at all (not in any row or gap). */
  unknownOrders: number;
  days: GeoDays;
  thresholds: CourierLensThresholds;
}

export interface LensInput {
  level: GeoLevel;
  /** Only the places under this one (a division for districts, a district for upazilas / areas); null = the whole country. */
  parentAreaId: string | null;
  thresholds: CourierLensThresholds;
  groups: readonly ParcelGroup[];
  /** Orders placed in the period by their own area (null areaId: none). */
  placed: readonly { areaId: string | null; orders: number }[];
  /** Every place the groups, the orders and their ancestors mention. */
  places: readonly LensPlace[];
  /** The areas a courier is mapped on, by area id → the number of couriers (enabled, mapping not archived). */
  mapped: ReadonlyMap<string, number>;
  couriers: readonly { id: string; name: string }[];
  days: GeoDays;
}

/** The place a given place rolls up to at `level`, or null when it does not reach that level (the rule of `salesByArea`). */
export function rollUp(level: GeoLevel, own: LensPlace, byId: ReadonlyMap<string, LensPlace>): LensPlace | null {
  const chain = [own, ...[...own.ancestorIds].reverse().map((id) => byId.get(id)).filter((p): p is LensPlace => !!p)];
  switch (level) {
    case 'division':
      return chain.find((p) => p.level === 'DIVISION') ?? null;
    case 'district':
      return chain.find((p) => p.level === 'DISTRICT') ?? null;
    case 'upazila':
      return chain.find((p) => p.level === 'UPAZILA' || p.level === 'THANA') ?? null;
    case 'area':
      // the areas inside Dhaka City: the place itself, when it (or a place above it) carries a city corporation
      return chain.some((p) => p.cityCorporation) ? own : null;
  }
}

const rate = (a: number, b: number): number | null => (b > 0 ? a / b : null);

interface Acc {
  delivered: number;
  returned: number;
  hoursSum: number;
  withPromise: number;
  late: number;
  promiseSum: number;
  byCourier: Map<string, { delivered: number; returned: number; hoursSum: number }>;
  placed: number;
  gapOrders: number;
}
const blank = (): Acc => ({ delivered: 0, returned: 0, hoursSum: 0, withPromise: 0, late: 0, promiseSum: 0, byCourier: new Map(), placed: 0, gapOrders: 0 });

/** Is this order area covered: a courier is mapped on it or on a place above it. */
function covered(place: LensPlace, mapped: ReadonlyMap<string, number>): boolean {
  return (mapped.get(place.id) ?? 0) > 0 || place.ancestorIds.some((id) => (mapped.get(id) ?? 0) > 0);
}

/** Builds the lens from the loaded facts. No database: the loader below feeds it, the tests feed it directly. */
export function buildCourierLens(input: LensInput): CourierLensResponse {
  const { level, thresholds: th } = input;
  const byId = new Map(input.places.map((p) => [p.id, p]));
  const inScope = (p: LensPlace) => !input.parentAreaId || p.id === input.parentAreaId || p.ancestorIds.includes(input.parentAreaId);
  const rows = new Map<string, Acc>();
  const at = (place: LensPlace): Acc => {
    let a = rows.get(place.id);
    if (!a) rows.set(place.id, (a = blank()));
    return a;
  };
  const target = (areaId: string | null): { own: LensPlace; row: LensPlace } | null => {
    const own = areaId ? byId.get(areaId) : undefined;
    if (!own || !inScope(own)) return null;
    const row = rollUp(level, own, byId);
    return row ? { own, row } : null;
  };

  for (const g of input.groups) {
    const t = target(g.areaId);
    if (!t) continue;
    const a = at(t.row);
    a.delivered += g.delivered;
    a.returned += g.returned;
    a.hoursSum += g.hoursSum;
    a.withPromise += g.withPromise;
    a.late += g.late;
    a.promiseSum += g.promiseSum;
    const c = a.byCourier.get(g.courierId) ?? { delivered: 0, returned: 0, hoursSum: 0 };
    c.delivered += g.delivered;
    c.returned += g.returned;
    c.hoursSum += g.hoursSum;
    a.byCourier.set(g.courierId, c);
  }

  let unknownOrders = 0;
  const gapAt = new Map<string, number>();
  for (const o of input.placed) {
    if (!o.areaId || !byId.has(o.areaId)) {
      unknownOrders += o.orders;
      continue;
    }
    const t = target(o.areaId);
    if (!t) continue;
    const a = at(t.row);
    a.placed += o.orders;
    if (!covered(t.own, input.mapped)) {
      a.gapOrders += o.orders;
      gapAt.set(t.own.id, (gapAt.get(t.own.id) ?? 0) + o.orders);
    }
  }

  const resultRows: GeoLensRow[] = [];
  const details: Record<string, CourierAreaDetail> = {};
  for (const [areaId, a] of rows) {
    const settled = a.delivered + a.returned;
    const success = rate(a.delivered, settled);
    const couriers = [...a.byCourier]
      .map(([courierId, c]) => ({ courierId, delivered: c.delivered, returned: c.returned, successRate: rate(c.delivered, c.delivered + c.returned), avgHours: c.delivered ? c.hoursSum / c.delivered : null }))
      .sort((x, y) => (y.successRate ?? -1) - (x.successRate ?? -1) || y.delivered + y.returned - (x.delivered + x.returned) || x.courierId.localeCompare(y.courierId));
    const eligible = couriers.filter((c) => c.successRate !== null && c.delivered + c.returned >= th.minParcels);
    const bestC = eligible
      .slice()
      .sort((x, y) => y.successRate! - x.successRate! || y.delivered + y.returned - (x.delivered + x.returned) || (x.avgHours ?? Infinity) - (y.avgHours ?? Infinity) || x.courierId.localeCompare(y.courierId))[0];
    const mostUsed = couriers.slice().sort((x, y) => y.delivered + y.returned - (x.delivered + x.returned) || x.courierId.localeCompare(y.courierId))[0];
    const lateShare = rate(a.late, a.withPromise);
    const flags: string[] = [];
    if (settled < th.minParcels) flags.push('tooFewParcels');
    else if (success !== null && success * 100 < th.lowSuccessPct) flags.push('lowSuccess');
    if (lateShare !== null && a.withPromise >= th.minParcels && lateShare * 100 >= th.lateWarnPct) flags.push('late');
    if (a.gapOrders > 0) flags.push('coverageGap');
    if (bestC && mostUsed && bestC.courierId !== mostUsed.courierId && (mostUsed.successRate ?? 0) < bestC.successRate!) flags.push('betterCourier');
    resultRows.push({
      areaId,
      figures: {
        parcels: settled,
        delivered: a.delivered,
        returned: a.returned,
        courierSuccessRate: success,
        avgHours: a.delivered ? a.hoursSum / a.delivered : null,
        promiseHours: a.withPromise ? a.promiseSum / a.withPromise : null,
        lateShare,
        couriersUsed: a.byCourier.size,
        orders: a.placed,
        gapOrders: a.gapOrders,
      },
      flags,
    });
    details[areaId] = { mostUsedCourierId: mostUsed?.courierId ?? null, couriers, best: bestC ? { courierId: bestC.courierId, successRate: bestC.successRate!, parcels: bestC.delivered + bestC.returned } : null };
  }
  resultRows.sort((x, y) => (y.figures.orders ?? 0) - (x.figures.orders ?? 0) || (y.figures.parcels ?? 0) - (x.figures.parcels ?? 0) || x.areaId.localeCompare(y.areaId));

  const gaps: CoverageGap[] = [...gapAt]
    .map(([id, orders]) => ({ p: byId.get(id)!, orders }))
    .sort((x, y) => y.orders - x.orders || x.p.nameEn.localeCompare(y.p.nameEn) || x.p.id.localeCompare(y.p.id))
    .slice(0, th.gapLimit)
    .map(({ p, orders }) => ({ areaId: p.id, level: p.level, nameEn: p.nameEn, nameBn: p.nameBn, orders }));

  const used = new Set(Object.values(details).flatMap((d) => d.couriers.map((c) => c.courierId)));
  return {
    lens: 'courier',
    level,
    rows: resultRows,
    details,
    couriers: input.couriers.filter((c) => used.has(c.id)),
    gaps,
    unknownOrders,
    days: input.days,
    thresholds: th,
  };
}

/** The hours between two moments as SQL (pick-up, else booking, to delivery). */
const HOURS = Prisma.sql`(extract(epoch FROM (s."deliveredAt" - coalesce(s."pickedAt", s."bookedAt", s."createdAt"))) / 3600.0)`;

/** Reads the shop's parcels, orders, places and mappings for the period and builds the lens. */
export async function courierLens(
  db: Db,
  q: { storeId: number; timeZone: string; days: GeoDays; level: GeoLevel; parentAreaId?: string | null; thresholds: CourierLensThresholds },
): Promise<CourierLensResponse> {
  const period = daysPeriod(q.days.from, q.days.to, q.timeZone);
  const [delivered, returned, placed, mappings, couriers] = await Promise.all([
    db.$queryRaw<{ cid: string; aid: string | null; n: bigint; hours: number | null; promised: bigint; late: bigint; promise: number | null }[]>`
      SELECT s."courierAccountId"::text AS "cid", o."areaId"::text AS "aid", count(*) AS "n",
             (sum(${HOURS}))::float8 AS "hours",
             count(*) FILTER (WHERE b."hoursMax" IS NOT NULL) AS "promised",
             count(*) FILTER (WHERE b."hoursMax" IS NOT NULL AND ${HOURS} > b."hoursMax") AS "late",
             (sum(b."hoursMax") FILTER (WHERE b."hoursMax" IS NOT NULL))::float8 AS "promise"
        FROM "Shipment" s
        JOIN "Order" o ON o."id" = s."orderId"
        LEFT JOIN "DeliveryBand" b ON b."id" = o."deliveryBandId"
       WHERE s."storeId" = ${q.storeId} AND o."archivedAt" IS NULL AND s."isExchangeLeg" = false AND s."mode"::text IS DISTINCT FROM 'MOCK'
         AND s."status"::text IN ('DELIVERED', 'PARTIALLY_DELIVERED') AND s."deliveredAt" >= ${period.from} AND s."deliveredAt" < ${period.to}
       GROUP BY 1, 2`,
    db.$queryRaw<{ cid: string; aid: string | null; n: bigint }[]>`
      SELECT s."courierAccountId"::text AS "cid", o."areaId"::text AS "aid", count(*) AS "n"
        FROM "Shipment" s JOIN "Order" o ON o."id" = s."orderId"
       WHERE s."storeId" = ${q.storeId} AND o."archivedAt" IS NULL AND s."isExchangeLeg" = false AND s."mode"::text IS DISTINCT FROM 'MOCK'
         AND s."status"::text = 'RETURNED' AND s."returnedAt" >= ${period.from} AND s."returnedAt" < ${period.to}
       GROUP BY 1, 2`,
    db.$queryRaw<{ aid: string | null; n: bigint }[]>`
      SELECT o."areaId"::text AS "aid", count(*) AS "n" FROM "Order" o WHERE ${basisWhere('ordered', q.storeId, period)} GROUP BY 1`,
    db.$queryRaw<{ aid: string; n: bigint }[]>`
      SELECT m."areaId"::text AS "aid", count(DISTINCT m."courierAccountId") AS "n"
        FROM "CourierAreaMapping" m JOIN "CourierAccount" c ON c."id" = m."courierAccountId"
       WHERE m."storeId" = ${q.storeId} AND m."archivedAt" IS NULL AND c."archivedAt" IS NULL AND c."enabled" = true
       GROUP BY 1`,
    db.$queryRaw<{ id: string; name: string }[]>`SELECT c."id"::text AS "id", c."name" FROM "CourierAccount" c WHERE c."storeId" = ${q.storeId}`,
  ]);

  const groups = new Map<string, ParcelGroup>();
  const key = (cid: string, aid: string | null) => `${cid}|${aid ?? ''}`;
  const group = (cid: string, aid: string | null): ParcelGroup => {
    let g = groups.get(key(cid, aid));
    if (!g) groups.set(key(cid, aid), (g = { courierId: cid, areaId: aid, delivered: 0, returned: 0, hoursSum: 0, withPromise: 0, late: 0, promiseSum: 0 }));
    return g;
  };
  for (const r of delivered) {
    const g = group(r.cid, r.aid);
    g.delivered += Number(r.n);
    g.hoursSum += Number(r.hours ?? 0);
    g.withPromise += Number(r.promised);
    g.late += Number(r.late);
    g.promiseSum += Number(r.promise ?? 0);
  }
  for (const r of returned) group(r.cid, r.aid).returned += Number(r.n);

  const areaIds = [...new Set([...[...groups.values()].map((g) => g.areaId), ...placed.map((p) => p.aid)])].filter((x): x is string => !!x);
  const own = areaIds.length
    ? await db.$queryRaw<LensPlace[]>`
        SELECT g."id"::text AS "id", g."level"::text AS "level", g."ancestorIds"::text[] AS "ancestorIds", g."nameEn", g."nameBn", g."cityCorporation" FROM "GeoArea" g WHERE g."id" = ANY(${areaIds}::uuid[])`
    : [];
  const aboveIds = [...new Set(own.flatMap((p) => p.ancestorIds))].filter((id) => !areaIds.includes(id));
  const above = aboveIds.length
    ? await db.$queryRaw<LensPlace[]>`
        SELECT g."id"::text AS "id", g."level"::text AS "level", g."ancestorIds"::text[] AS "ancestorIds", g."nameEn", g."nameBn", g."cityCorporation" FROM "GeoArea" g WHERE g."id" = ANY(${aboveIds}::uuid[])`
    : [];

  return buildCourierLens({
    level: q.level,
    parentAreaId: q.parentAreaId ?? null,
    thresholds: q.thresholds,
    groups: [...groups.values()],
    placed: placed.map((p) => ({ areaId: p.aid, orders: Number(p.n) })),
    places: [...own, ...above],
    mapped: new Map(mappings.map((m) => [m.aid, Number(m.n)])),
    couriers,
    days: q.days,
  });
}
