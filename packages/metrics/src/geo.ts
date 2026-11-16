// S29 · PR 751 (CN-054) — `geoByArea`: the figures of Reports › Geography map. Built on the rules of `salesByArea`
// (areas.ts, PR 568), the same days and the same basis, plus what the map needs:
//   - Orders: orders placed in the period (not archived, not drafts), on their placed day;
//   - Delivered / Sales / pieces: orders delivered in the period, on their delivered day; Sales = the goods (subtotal −
//     order discount), or, with a category (and its sub-categories) or a product chosen, the share of the goods on its
//     counted lines (spread over the lines by their line totals, so the parts add up to the order's figure);
//   - Returned: orders that came back (status RETURNED) on their returned day; return rate = returned ÷ (delivered +
//     returned), none when both are 0;
//   - the top category of every area (by pieces of delivered lines, then line totals, then name) and, for one area on
//     demand (`geoAreaDetail`), its top products (pieces, then Sales);
//   - the same figures for a second period (the previous period of the same length, the same days a year earlier, or
//     two days the caller names): an area with no figure in one period counts as zero there.
// Each order is placed by its delivery area (Order.areaId, the place tree of PR 549–552) and rolled up to the level
// asked for: division, district, upazila/thana, or `area` (the places inside Dhaka City). Parts add up to the whole:
// `total` = rows + `unknown` (no area, or an area that does not reach the level) + `outside` (area level only: not in
// Dhaka City). With `parentAreaId` only the orders under that place are read (a drill-down); an order with no area has
// no place to be under, so it is not counted there. Read-only, store-scoped, archived orders left out, minor units, no
// customer name or phone anywhere. The Sales figure is given only when `includeMoney` is true (the viewer holds
// `books.read`); otherwise it is null and never computed into a delta.
import { Prisma } from '@extas/db/client';
import { basisWhere, practiceVisible, type Db } from './metrics';
import { COUNTED_LINE_STATUS, daysPeriod, type Period } from './pure';
import { apportion, categoryParents } from './vat';
import type { GeoAreaDetail, GeoAreaFigures, GeoAreaRow, GeoByArea, GeoDays, GeoLevel, GeoQuery, GeoTopCategory, GeoTopProduct } from './geo-types';
import { compareDaysOf, deltaOf } from './geo-pure';

export * from './geo-types';
export * from './geo-pure';

/** The deepest category tree walked (a loop in the tree never hangs), as in vat.ts. */
const MAX_DEPTH = 32;
/** The order status of a parcel that came back. */
const RETURNED_STATUS = 'RETURNED';

// ---- figures --------------------------------------------------------------------------------------------------------

interface CatSum {
  pieces: number;
  total: number;
}
/** What one area (or bucket) holds in one period, before it is shaped for the caller. */
interface Acc {
  orders: number;
  delivered: number;
  goods: number;
  pieces: number;
  returned: number;
  cats: Map<string, CatSum>;
}
const newAcc = (): Acc => ({ orders: 0, delivered: 0, goods: 0, pieces: 0, returned: 0, cats: new Map() });

function addTo(into: Acc, from: Acc): void {
  into.orders += from.orders;
  into.delivered += from.delivered;
  into.goods += from.goods;
  into.pieces += from.pieces;
  into.returned += from.returned;
  for (const [k, v] of from.cats) {
    const c = into.cats.get(k) ?? { pieces: 0, total: 0 };
    c.pieces += v.pieces;
    c.total += v.total;
    into.cats.set(k, c);
  }
}

const rate = (delivered: number, returned: number): number | null => (delivered + returned === 0 ? null : returned / (delivered + returned));

function figuresOf(a: Acc, money: boolean): GeoAreaFigures {
  return { orders: a.orders, delivered: a.delivered, salesMinor: money ? a.goods : null, pieces: a.pieces, returned: a.returned, returnRate: rate(a.delivered, a.returned) };
}

const NO_AREA = '';

interface Filters {
  categoryId?: string | null;
  productId?: string | null;
}

/** All the counts of one period, by the order's own area id ('' = no area). `areaIds` narrows to those areas. */
async function accsByArea(db: Db, storeId: number, days: GeoDays, timeZone: string, filters: Filters, areaIds: string[] | null): Promise<Map<string, Acc>> {
  const period = daysPeriod(days.from, days.to, timeZone);
  const filtered = !!(filters.productId || filters.categoryId);
  const out = new Map<string, Acc>();
  const at = (areaId: string | null): Acc => {
    const k = areaId ?? NO_AREA;
    let a = out.get(k);
    if (!a) {
      a = newAcc();
      out.set(k, a);
    }
    return a;
  };
  const inAreas = areaIds ? Prisma.sql`AND o."areaId" = ANY(${areaIds}::uuid[])` : Prisma.empty;

  if (!filtered) {
    const [placed, delivered, lines, returned] = await Promise.all([
      db.$queryRaw<{ areaId: string | null; n: bigint | number }[]>`
        SELECT o."areaId", count(*) AS "n" FROM "Order" o WHERE ${basisWhere('ordered', storeId, period)} ${inAreas} GROUP BY o."areaId"`,
      db.$queryRaw<{ areaId: string | null; n: bigint | number; goods: bigint | number }[]>`
        SELECT o."areaId", count(*) AS "n", COALESCE(SUM(o."subtotalMinor" - o."discountMinor"), 0) AS "goods"
          FROM "Order" o WHERE ${basisWhere('sales', storeId, period)} ${inAreas} GROUP BY o."areaId"`,
      db.$queryRaw<{ areaId: string | null; categoryId: string | null; pieces: bigint | number; total: bigint | number }[]>`
        SELECT o."areaId", p."categoryId", COALESCE(SUM(i."quantity"), 0) AS "pieces", COALESCE(SUM(i."lineTotalMinor"), 0) AS "total"
          FROM "Order" o
          JOIN "OrderItem" i ON i."orderId" = o."id" AND i."storeId" = o."storeId" AND i."status"::text = ${COUNTED_LINE_STATUS}
          LEFT JOIN "Product" p ON p."id" = i."productId" AND p."storeId" = i."storeId"
         WHERE ${basisWhere('sales', storeId, period)} ${inAreas} GROUP BY o."areaId", p."categoryId"`,
      db.$queryRaw<{ areaId: string | null; n: bigint | number }[]>`
        SELECT o."areaId", count(*) AS "n" FROM "Order" o
         WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${practiceVisible} AND o."status"::text = ${RETURNED_STATUS}
           AND o."returnedAt" >= ${period.from} AND o."returnedAt" < ${period.to} ${inAreas} GROUP BY o."areaId"`,
    ]);
    for (const r of placed) at(r.areaId).orders += Number(r.n);
    for (const r of delivered) {
      const a = at(r.areaId);
      a.delivered += Number(r.n);
      a.goods += Number(r.goods);
    }
    for (const r of lines) {
      const a = at(r.areaId);
      a.pieces += Number(r.pieces);
      if (r.categoryId) {
        const c = a.cats.get(r.categoryId) ?? { pieces: 0, total: 0 };
        c.pieces += Number(r.pieces);
        c.total += Number(r.total);
        a.cats.set(r.categoryId, c);
      }
    }
    for (const r of returned) at(r.areaId).returned += Number(r.n);
    return out;
  }

  // a category or a product is chosen: read the orders and their lines (as `salesByArea` does) and take each order's share
  const [placed, delivered, returned, parents] = await Promise.all([
    db.$queryRaw<{ id: string; areaId: string | null }[]>`SELECT o."id", o."areaId" FROM "Order" o WHERE ${basisWhere('ordered', storeId, period)} ${inAreas}`,
    db.$queryRaw<{ id: string; areaId: string | null; goods: number }[]>`
      SELECT o."id", o."areaId", (o."subtotalMinor" - o."discountMinor") AS "goods" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)} ${inAreas}`,
    db.$queryRaw<{ id: string; areaId: string | null }[]>`
      SELECT o."id", o."areaId" FROM "Order" o
       WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${practiceVisible} AND o."status"::text = ${RETURNED_STATUS}
         AND o."returnedAt" >= ${period.from} AND o."returnedAt" < ${period.to} ${inAreas}`,
    filters.categoryId && !filters.productId ? categoryParents(db, storeId) : Promise.resolve(new Map<string, string | null>()),
  ]);
  const inCategory = (categoryId: string | null): boolean => {
    for (let c = categoryId, depth = 0; c && depth < MAX_DEPTH; depth += 1) {
      if (c === filters.categoryId) return true;
      c = parents.get(c) ?? null;
    }
    return false;
  };
  const wanted = (l: { productId: string | null; categoryId: string | null }) => (filters.productId ? l.productId === filters.productId : inCategory(l.categoryId));
  const ids = [...new Set([...placed, ...delivered, ...returned].map((o) => o.id))];
  const lines = ids.length
    ? await db.$queryRaw<{ orderId: string; productId: string | null; categoryId: string | null; total: number; quantity: number }[]>`
        SELECT i."orderId", i."productId", p."categoryId", i."lineTotalMinor" AS "total", i."quantity"
          FROM "OrderItem" i LEFT JOIN "Product" p ON p."id" = i."productId" AND p."storeId" = i."storeId"
         WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
         ORDER BY i."orderId", i."createdAt", i."id"`
    : [];
  const linesOf = new Map<string, typeof lines>();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);
  const has = (id: string) => (linesOf.get(id) ?? []).some(wanted);
  for (const o of placed) if (has(o.id)) at(o.areaId).orders += 1;
  for (const o of returned) if (has(o.id)) at(o.areaId).returned += 1;
  for (const o of delivered) {
    const mine = linesOf.get(o.id) ?? [];
    const shares = apportion(Number(o.goods), mine.map((l) => Number(l.total)));
    const pick = mine.map((l, k) => ({ l, share: shares[k]! })).filter((x) => wanted(x.l));
    if (!pick.length) continue;
    const a = at(o.areaId);
    a.delivered += 1;
    for (const x of pick) {
      a.goods += x.share;
      a.pieces += Number(x.l.quantity);
      if (x.l.categoryId) {
        const c = a.cats.get(x.l.categoryId) ?? { pieces: 0, total: 0 };
        c.pieces += Number(x.l.quantity);
        c.total += Number(x.l.total);
        a.cats.set(x.l.categoryId, c);
      }
    }
  }
  return out;
}

// ---- places ---------------------------------------------------------------------------------------------------------

interface Place {
  id: string;
  code: string | null;
  level: string;
  parentId: string | null;
  ancestorIds: string[];
  nameEn: string;
  nameBn: string | null;
  cityCorporation: string | null;
  lat: string | null;
  lng: string | null;
}

const PLACE_COLUMNS = Prisma.sql`g."id", g."code", g."level"::text AS "level", g."parentId", g."ancestorIds", g."nameEn", g."nameBn", g."cityCorporation", g."lat"::text AS "lat", g."lng"::text AS "lng"`;

/** The places of these ids and every place above them. */
async function loadPlaces(db: Db, ids: string[]): Promise<Map<string, Place>> {
  if (!ids.length) return new Map();
  const own = await db.$queryRaw<Place[]>`SELECT ${PLACE_COLUMNS} FROM "GeoArea" g WHERE g."id" = ANY(${ids}::uuid[])`;
  const have = new Set(own.map((p) => p.id));
  const aboveIds = [...new Set(own.flatMap((p) => p.ancestorIds))].filter((id) => !have.has(id));
  const above = aboveIds.length ? await db.$queryRaw<Place[]>`SELECT ${PLACE_COLUMNS} FROM "GeoArea" g WHERE g."id" = ANY(${aboveIds}::uuid[])` : [];
  return new Map([...own, ...above].map((p) => [p.id, p]));
}

/** The place and the places above it, nearest first. */
function chainOf(own: Place, byId: ReadonlyMap<string, Place>): Place[] {
  return [own, ...[...own.ancestorIds].reverse().map((id) => byId.get(id)).filter((p): p is Place => !!p)];
}

/** The place an order's area rolls up to at `level`, or null when it does not reach it. */
function placeAt(level: GeoLevel, chain: Place[]): Place | null {
  if (level === 'division') return chain.find((p) => p.level === 'DIVISION') ?? null;
  if (level === 'district') return chain.find((p) => p.level === 'DISTRICT') ?? null;
  if (level === 'upazila') return chain.find((p) => p.level === 'UPAZILA' || p.level === 'THANA') ?? null;
  return chain.some((p) => p.cityCorporation) ? chain[0]! : null; // area: the place itself, inside Dhaka City
}

const levelOfPlace = (p: Place): GeoLevel => (p.level === 'DIVISION' ? 'division' : p.level === 'DISTRICT' ? 'district' : p.level === 'AREA' ? 'area' : 'upazila');

/** One bucket of the answer: a row's place, or `unknown`, or `outside`. */
interface Bucket {
  place: Place | null;
  cur: Acc;
  prev: Acc;
  pts: Map<string, [number, number]>;
}

// ---- geoByArea ------------------------------------------------------------------------------------------------------

/** Orders, Sales, Delivered, Returned and return rate of one store by area, for a period and optionally a second one. */
export async function geoByArea(db: Db, q: GeoQuery): Promise<GeoByArea> {
  const compareDays = compareDaysOf(q.days, q.compare, q.compareDays);
  const filters: Filters = { categoryId: q.categoryId, productId: q.productId };
  const [cur, prev] = await Promise.all([
    accsByArea(db, q.storeId, q.days, q.timeZone, filters, null),
    compareDays ? accsByArea(db, q.storeId, compareDays, q.timeZone, filters, null) : Promise.resolve(new Map<string, Acc>()),
  ]);
  const areaIds = [...new Set([...cur.keys(), ...prev.keys()])].filter((k) => k !== NO_AREA);
  const byId = await loadPlaces(db, areaIds);

  const rows = new Map<string, Bucket>();
  const unknown: Bucket = { place: null, cur: newAcc(), prev: newAcc(), pts: new Map() };
  const outside: Bucket = { place: null, cur: newAcc(), prev: newAcc(), pts: new Map() };
  const total: Bucket = { place: null, cur: newAcc(), prev: newAcc(), pts: new Map() };

  const place = (areaId: string, which: 'cur' | 'prev', acc: Acc): void => {
    const own = areaId === NO_AREA ? undefined : byId.get(areaId);
    // a drill-down reads only what lies under the parent; an order with no area has no place to be under
    if (q.parentAreaId && (!own || (own.id !== q.parentAreaId && !own.ancestorIds.includes(q.parentAreaId)))) return;
    let bucket: Bucket;
    if (!own) bucket = unknown;
    else {
      const chain = chainOf(own, byId);
      if (q.level === 'area' && !chain.some((p) => p.cityCorporation)) bucket = outside;
      else {
        const at = placeAt(q.level, chain);
        if (!at) bucket = unknown;
        else {
          bucket = rows.get(at.id) ?? { place: at, cur: newAcc(), prev: newAcc(), pts: new Map() };
          rows.set(at.id, bucket);
          // the row's point: the order's own place, else the nearest one above it (never above the row's own place)
          const end = chain.indexOf(at);
          const pin = chain.slice(0, end < 0 ? chain.length : end + 1).find((x) => x.lat !== null && x.lng !== null);
          if (pin) bucket.pts.set(pin.id, [Number(pin.lat), Number(pin.lng)]);
        }
      }
    }
    addTo(bucket[which], acc);
    addTo(total[which], acc);
  };
  for (const [k, a] of cur) place(k, 'cur', a);
  for (const [k, a] of prev) place(k, 'prev', a);

  const money = q.includeMoney;
  const withCompare = !!compareDays;
  const minOrders = q.minOrders ?? 0;

  // the top category of each row, then their names
  const topOf = (cats: Map<string, CatSum>): { id: string; pieces: number } | null => {
    let best: { id: string; pieces: number; total: number } | null = null;
    for (const [id, c] of cats) if (!best || c.pieces > best.pieces || (c.pieces === best.pieces && (c.total > best.total || (c.total === best.total && id < best.id)))) best = { id, pieces: c.pieces, total: c.total };
    return best ? { id: best.id, pieces: best.pieces } : null;
  };
  const tops = new Map([...rows.entries()].map(([id, b]) => [id, topOf(b.cur.cats)] as const));
  const catNames = await categoryNames(db, q.storeId, [...new Set([...tops.values()].filter((t): t is { id: string; pieces: number } => !!t).map((t) => t.id))]);

  const parentOf = (p: Place): Place | null => {
    if (q.level === 'division') return null;
    const wanted = q.level === 'district' ? 'DIVISION' : 'DISTRICT';
    return [...p.ancestorIds].reverse().map((id) => byId.get(id)).find((x) => x?.level === wanted) ?? null;
  };

  const out: GeoAreaRow[] = [...rows.values()].map((b) => {
    const p = b.place!;
    const parent = parentOf(p);
    const list = [...b.pts.values()];
    const mid = (k: 0 | 1) => (list.length ? list.reduce((s, x) => s + x[k], 0) / list.length : null);
    const own = p.lat !== null && p.lng !== null;
    const current = figuresOf(b.cur, money);
    const previous = withCompare ? figuresOf(b.prev, money) : null;
    const t = tops.get(p.id);
    const nm = t ? catNames.get(t.id) : undefined;
    return {
      areaId: p.id,
      code: p.code ?? p.id,
      level: q.level,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      parentAreaId: parent?.id ?? null,
      parentNameEn: parent?.nameEn ?? null,
      parentNameBn: parent?.nameBn ?? null,
      lat: own ? Number(p.lat) : mid(0),
      lng: own ? Number(p.lng) : mid(1),
      current,
      previous,
      delta: previous ? deltaOf(current, previous) : null,
      topCategory: t && nm ? { categoryId: t.id, nameEn: nm.nameEn, nameBn: nm.nameBn, pieces: t.pieces } : null,
      belowMinOrders: current.orders < minOrders,
    };
  });
  out.sort((a, b) => (money ? (b.current.salesMinor ?? 0) - (a.current.salesMinor ?? 0) : 0) || b.current.orders - a.current.orders || b.current.returned - a.current.returned || a.nameEn.localeCompare(b.nameEn));

  return {
    query: { level: q.level, parentAreaId: q.parentAreaId ?? null, days: q.days, compare: q.compare ?? 'off', compareDays },
    rows: out,
    unknown: figuresOf(unknown.cur, money),
    outside: figuresOf(outside.cur, money),
    total: figuresOf(total.cur, money),
    totalPrevious: withCompare ? figuresOf(total.prev, money) : null,
    unknownShare: total.cur.orders === 0 ? null : unknown.cur.orders / total.cur.orders,
  };
}

async function categoryNames(db: Db, storeId: number, ids: string[]): Promise<Map<string, { nameEn: string; nameBn: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await db.$queryRaw<{ id: string; nameEn: string; nameBn: string | null }[]>`
    SELECT c."id", c."nameEn", c."nameBn" FROM "Category" c WHERE c."storeId" = ${storeId} AND c."id" = ANY(${ids}::uuid[])`;
  return new Map(rows.map((r) => [r.id, { nameEn: r.nameEn, nameBn: r.nameBn }]));
}

// ---- one area, on demand --------------------------------------------------------------------------------------------

/**
 * The panel of one area: its figures (the area and every place under it), the compare figures, its top category and its
 * top products (pieces, then Sales; Sales = the product's share of each delivered order's goods). One query set per click.
 */
export async function geoAreaDetail(db: Db, q: GeoQuery & { areaId: string; topProducts: number }): Promise<GeoAreaDetail> {
  const compareDays = compareDaysOf(q.days, q.compare, q.compareDays);
  const filters: Filters = { categoryId: q.categoryId, productId: q.productId };
  const found = await db.$queryRaw<Place[]>`SELECT ${PLACE_COLUMNS} FROM "GeoArea" g WHERE g."id" = ${q.areaId}::uuid`;
  const place = found[0];
  if (!place) throw new RangeError('no such area');
  const under = await db.$queryRaw<{ id: string }[]>`SELECT g."id" FROM "GeoArea" g WHERE g."id" = ${q.areaId}::uuid OR ${q.areaId}::uuid = ANY(g."ancestorIds")`;
  const ids = under.map((r) => r.id);
  const sum = (m: Map<string, Acc>): Acc => {
    const t = newAcc();
    for (const a of m.values()) addTo(t, a);
    return t;
  };
  const [cur, prev, products] = await Promise.all([
    accsByArea(db, q.storeId, q.days, q.timeZone, filters, ids),
    compareDays ? accsByArea(db, q.storeId, compareDays, q.timeZone, filters, ids) : Promise.resolve(null),
    q.topProducts > 0 ? topProductsIn(db, q.storeId, q.days, q.timeZone, filters, ids, q.topProducts, q.includeMoney) : Promise.resolve([] as GeoTopProduct[]),
  ]);
  const c = sum(cur);
  let topCategory: GeoTopCategory | null = null;
  let best: { id: string; pieces: number; total: number } | null = null;
  for (const [id, v] of c.cats) if (!best || v.pieces > best.pieces || (v.pieces === best.pieces && (v.total > best.total || (v.total === best.total && id < best.id)))) best = { id, pieces: v.pieces, total: v.total };
  if (best) {
    const nm = (await categoryNames(db, q.storeId, [best.id])).get(best.id);
    if (nm) topCategory = { categoryId: best.id, nameEn: nm.nameEn, nameBn: nm.nameBn, pieces: best.pieces };
  }
  return {
    areaId: place.id,
    level: levelOfPlace(place),
    days: q.days,
    current: figuresOf(c, q.includeMoney),
    previous: prev ? figuresOf(sum(prev), q.includeMoney) : null,
    topCategory,
    topProducts: products,
  };
}

/** The best-selling products of delivered orders in the given areas: pieces, then Sales (share of each order's goods). */
async function topProductsIn(db: Db, storeId: number, days: GeoDays, timeZone: string, filters: Filters, areaIds: string[], limit: number, money: boolean): Promise<GeoTopProduct[]> {
  const period: Period = daysPeriod(days.from, days.to, timeZone);
  const orders = await db.$queryRaw<{ id: string; goods: number }[]>`
    SELECT o."id", (o."subtotalMinor" - o."discountMinor") AS "goods" FROM "Order" o
     WHERE ${basisWhere('sales', storeId, period)} AND o."areaId" = ANY(${areaIds}::uuid[])`;
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const lines = await db.$queryRaw<{ orderId: string; productId: string | null; categoryId: string | null; total: number; quantity: number }[]>`
    SELECT i."orderId", i."productId", p."categoryId", i."lineTotalMinor" AS "total", i."quantity"
      FROM "OrderItem" i LEFT JOIN "Product" p ON p."id" = i."productId" AND p."storeId" = i."storeId"
     WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
     ORDER BY i."orderId", i."createdAt", i."id"`;
  const parents = filters.categoryId && !filters.productId ? await categoryParents(db, storeId) : new Map<string, string | null>();
  const inCategory = (categoryId: string | null): boolean => {
    for (let c = categoryId, depth = 0; c && depth < MAX_DEPTH; depth += 1) {
      if (c === filters.categoryId) return true;
      c = parents.get(c) ?? null;
    }
    return false;
  };
  const filtered = !!(filters.productId || filters.categoryId);
  const wanted = (l: { productId: string | null; categoryId: string | null }) => (!filtered ? true : filters.productId ? l.productId === filters.productId : inCategory(l.categoryId));
  const linesOf = new Map<string, typeof lines>();
  for (const l of lines) linesOf.set(l.orderId, [...(linesOf.get(l.orderId) ?? []), l]);
  const byProduct = new Map<string, { pieces: number; sales: number }>();
  for (const o of orders) {
    const mine = linesOf.get(o.id) ?? [];
    const shares = apportion(Number(o.goods), mine.map((l) => Number(l.total)));
    mine.forEach((l, k) => {
      if (!l.productId || !wanted(l)) return;
      const p = byProduct.get(l.productId) ?? { pieces: 0, sales: 0 };
      p.pieces += Number(l.quantity);
      p.sales += shares[k]!;
      byProduct.set(l.productId, p);
    });
  }
  const top = [...byProduct.entries()].sort((a, b) => b[1].pieces - a[1].pieces || b[1].sales - a[1].sales || (a[0] < b[0] ? -1 : 1)).slice(0, limit);
  if (!top.length) return [];
  const names = await db.$queryRaw<{ id: string; nameEn: string; nameBn: string | null }[]>`
    SELECT p."id", p."nameEn", p."nameBn" FROM "Product" p WHERE p."storeId" = ${storeId} AND p."id" = ANY(${top.map(([id]) => id)}::uuid[])`;
  const nameOf = new Map(names.map((n) => [n.id, n]));
  return top.map(([id, v]) => ({ productId: id, nameEn: nameOf.get(id)?.nameEn ?? '', nameBn: nameOf.get(id)?.nameBn ?? null, pieces: v.pieces, salesMinor: money ? v.sales : null }));
}
