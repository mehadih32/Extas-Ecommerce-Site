// S16 · PR 568 (B3.10 Locked; BACKEND-ARCHITECTURE §5 REP-02: "by district/upazila and area inside Dhaka (table + map,
// return rate per area)") — where the shop sells and where parcels come back. For a period (the store's own days):
//   - Sales (M1): orders delivered in the period, on their delivered day — the goods (subtotal − order discount), or,
//     when a category (with its sub-categories) or a product is chosen, the share of the goods on its counted lines
//     (the goods spread over the lines by their line totals, as for VAT, so the parts add up to the order's figure);
//   - pieces: the quantity on those lines;
//   - returned: orders that came back in the period (status RETURNED, on their returned day), with such a line when a
//     category or product is chosen; return rate = returned ÷ (delivered + returned), none when both are 0.
// Each order is placed by its delivery area (Order.areaId, the place tree of PR 549–552) and rolled up to the level
// asked for: district, upazila/thana, or the areas inside Dhaka City (an area with a city corporation, itself or above).
// An order with no area, or whose area does not reach that level, is counted in `unknown`; at the Dhaka level the
// orders outside Dhaka City are counted in `outside`. Read-only, store-scoped, archived orders left out, minor units.
import { basisWhere, type Db } from './metrics';
import { COUNTED_LINE_STATUS, daysPeriod } from './pure';
import { apportion, categoryParents } from './vat';

export const AREA_LEVELS = ['district', 'upazila', 'dhaka'] as const;
export type AreaLevel = (typeof AREA_LEVELS)[number];

export interface AreaSalesOptions {
  timeZone: string;
  level: AreaLevel;
  /** Only this category and its sub-categories (by the product's category). */
  categoryId?: string | null;
  /** Only this product (wins over the category). */
  productId?: string | null;
}

export interface AreaFigures {
  delivered: number;
  salesMinor: number;
  pieces: number;
  returned: number;
  /** returned ÷ (delivered + returned), 0–1; null when both are 0. */
  returnRate: number | null;
}

export interface AreaRow extends AreaFigures {
  areaId: string;
  nameEn: string;
  nameBn: string | null;
  /** The district above an upazila or a Dhaka area (for "Gabtali, Bogura"); null for a district. */
  parentNameEn: string | null;
  parentNameBn: string | null;
  /** The area's map point, else the middle of the points of the order areas under it; null when none has one. */
  lat: number | null;
  lng: number | null;
}

export interface AreaSales {
  from: string;
  to: string;
  level: AreaLevel;
  /** Highest Sales first, then most returned, then by name. */
  rows: AreaRow[];
  /** Orders with no area, or an area that does not reach the level. */
  unknown: AreaFigures;
  /** At the Dhaka level: orders outside Dhaka City. Zero at the other levels. */
  outside: AreaFigures;
  total: AreaFigures;
}

/** The deepest category tree walked (a loop in the tree never hangs), as in vat.ts. */
const MAX_DEPTH = 32;
/** The order status of a parcel that came back. */
const RETURNED_STATUS = 'RETURNED';

const zero = (): AreaFigures => ({ delivered: 0, salesMinor: 0, pieces: 0, returned: 0, returnRate: null });
const rate = (f: AreaFigures) => (f.delivered + f.returned === 0 ? null : f.returned / (f.delivered + f.returned));

interface Place {
  id: string;
  level: string;
  parentId: string | null;
  ancestorIds: string[];
  nameEn: string;
  nameBn: string | null;
  cityCorporation: string | null;
  lat: string | null;
  lng: string | null;
}

/** The place an area rolls up to at `level` (itself or an ancestor), or null when it does not reach that level. */
function placeAt(level: AreaLevel, own: Place, byId: ReadonlyMap<string, Place>): Place | null {
  const chain = [own, ...[...own.ancestorIds].reverse().map((id) => byId.get(id)).filter((p): p is Place => !!p)];
  if (level === 'district') return chain.find((p) => p.level === 'DISTRICT') ?? null;
  if (level === 'upazila') return chain.find((p) => p.level === 'UPAZILA' || p.level === 'THANA') ?? null;
  // Dhaka City: the order's own place when it (or a place above it) carries a city corporation
  return chain.some((p) => p.cityCorporation) ? own : null;
}

/** Is this area inside Dhaka City (itself or above)? */
function inCity(own: Place, byId: ReadonlyMap<string, Place>): boolean {
  return own.cityCorporation !== null || own.ancestorIds.some((id) => byId.get(id)?.cityCorporation);
}

/** Sales, pieces and returns of one store by area over the days `from`–`to`. */
export async function salesByArea(db: Db, storeId: number, days: { from: string; to: string }, opts: AreaSalesOptions): Promise<AreaSales> {
  const period = daysPeriod(days.from, days.to, opts.timeZone);
  const filtered = !!(opts.productId || opts.categoryId);
  const [delivered, returned, parents] = await Promise.all([
    db.$queryRaw<{ id: string; areaId: string | null; goods: number }[]>`
      SELECT o."id", o."areaId", (o."subtotalMinor" - o."discountMinor") AS "goods" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)}`,
    db.$queryRaw<{ id: string; areaId: string | null }[]>`
      SELECT o."id", o."areaId" FROM "Order" o
       WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."status"::text = ${RETURNED_STATUS}
         AND o."returnedAt" >= ${period.from} AND o."returnedAt" < ${period.to}`,
    opts.categoryId && !opts.productId ? categoryParents(db, storeId) : Promise.resolve(new Map<string, string | null>()),
  ]);
  // the chosen category and every category under it
  const inCategory = (categoryId: string | null): boolean => {
    for (let at = categoryId, depth = 0; at && depth < MAX_DEPTH; depth += 1) {
      if (at === opts.categoryId) return true;
      at = parents.get(at) ?? null;
    }
    return false;
  };
  const wanted = (l: { productId: string | null; categoryId: string | null }) => (!filtered ? true : opts.productId ? l.productId === opts.productId : inCategory(l.categoryId));

  const orderIds = [...delivered.map((o) => o.id), ...returned.map((o) => o.id)];
  const lines = orderIds.length
    ? await db.$queryRaw<{ orderId: string; productId: string | null; categoryId: string | null; total: number; quantity: number }[]>`
        SELECT i."orderId", i."productId", p."categoryId", i."lineTotalMinor" AS "total", i."quantity"
          FROM "OrderItem" i LEFT JOIN "Product" p ON p."id" = i."productId" AND p."storeId" = i."storeId"
         WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${orderIds}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
         ORDER BY i."orderId", i."createdAt", i."id"`
    : [];
  const linesOf = new Map<string, typeof lines>();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);

  const areaIds = [...new Set([...delivered, ...returned].map((o) => o.areaId).filter((x): x is string => !!x))];
  const own = areaIds.length
    ? await db.$queryRaw<Place[]>`
        SELECT g."id", g."level"::text AS "level", g."parentId", g."ancestorIds", g."nameEn", g."nameBn", g."cityCorporation", g."lat"::text AS "lat", g."lng"::text AS "lng"
          FROM "GeoArea" g WHERE g."id" = ANY(${areaIds}::uuid[])`
    : [];
  const aboveIds = [...new Set(own.flatMap((p) => p.ancestorIds))].filter((id) => !areaIds.includes(id));
  const above = aboveIds.length
    ? await db.$queryRaw<Place[]>`
        SELECT g."id", g."level"::text AS "level", g."parentId", g."ancestorIds", g."nameEn", g."nameBn", g."cityCorporation", g."lat"::text AS "lat", g."lng"::text AS "lng"
          FROM "GeoArea" g WHERE g."id" = ANY(${aboveIds}::uuid[])`
    : [];
  const byId = new Map([...own, ...above].map((p) => [p.id, p]));

  // `pts`: map points of the order areas under a row, for a row whose own place has none (a district without a point)
  const rows = new Map<string, { place: Place; f: AreaFigures; pts: Map<string, [number, number]> }>();
  const unknown = zero();
  const outside = zero();
  const total = zero();
  const bucket = (areaId: string | null): AreaFigures => {
    const place = areaId ? byId.get(areaId) : undefined;
    if (!place) return unknown;
    if (opts.level === 'dhaka' && !inCity(place, byId)) return outside;
    const at = placeAt(opts.level, place, byId);
    if (!at) return unknown;
    const row = rows.get(at.id) ?? { place: at, f: zero(), pts: new Map() };
    rows.set(at.id, row);
    // the order's point: its own area's, else the nearest place above it (never above the row's own place)
    const chain = [place, ...[...place.ancestorIds].reverse().map((id) => byId.get(id)).filter((x): x is Place => !!x)];
    const end = chain.indexOf(at);
    const pin = chain.slice(0, end < 0 ? chain.length : end + 1).find((x) => x.lat !== null && x.lng !== null);
    if (pin) row.pts.set(pin.id, [Number(pin.lat), Number(pin.lng)]);
    return row.f;
  };

  for (const o of delivered) {
    const mine = linesOf.get(o.id) ?? [];
    const goods = Number(o.goods);
    let sales = goods;
    let pieces = mine.reduce((s, l) => s + Number(l.quantity), 0);
    if (filtered) {
      const shares = apportion(goods, mine.map((l) => Number(l.total)));
      const pick = mine.map((l, k) => ({ l, share: shares[k]! })).filter((x) => wanted(x.l));
      if (!pick.length) continue;
      sales = pick.reduce((s, x) => s + x.share, 0);
      pieces = pick.reduce((s, x) => s + Number(x.l.quantity), 0);
    }
    for (const f of [bucket(o.areaId), total]) {
      f.delivered += 1;
      f.salesMinor += sales;
      f.pieces += pieces;
    }
  }
  for (const o of returned) {
    if (filtered && !(linesOf.get(o.id) ?? []).some(wanted)) continue;
    for (const f of [bucket(o.areaId), total]) f.returned += 1;
  }

  const num = (v: string | null) => (v === null ? null : Number(v));
  const parentOf = (p: Place) => {
    if (opts.level === 'district') return null;
    const chain = [...p.ancestorIds].reverse().map((id) => byId.get(id));
    return chain.find((x) => x?.level === 'DISTRICT') ?? null;
  };
  const out: AreaRow[] = [...rows.values()].map(({ place, f, pts }) => {
    const parent = parentOf(place);
    // the row's own point, else the middle of the points of the areas under it
    const list = [...pts.values()];
    const mid = (k: 0 | 1) => (list.length ? list.reduce((s, x) => s + x[k], 0) / list.length : null);
    const own = place.lat !== null && place.lng !== null;
    return { areaId: place.id, nameEn: place.nameEn, nameBn: place.nameBn, parentNameEn: parent?.nameEn ?? null, parentNameBn: parent?.nameBn ?? null, lat: own ? num(place.lat) : mid(0), lng: own ? num(place.lng) : mid(1), ...f, returnRate: rate(f) };
  });
  out.sort((a, b) => b.salesMinor - a.salesMinor || b.returned - a.returned || a.nameEn.localeCompare(b.nameEn));
  return {
    from: days.from,
    to: days.to,
    level: opts.level,
    rows: out,
    unknown: { ...unknown, returnRate: rate(unknown) },
    outside: { ...outside, returnRate: rate(outside) },
    total: { ...total, returnRate: rate(total) },
  };
}
