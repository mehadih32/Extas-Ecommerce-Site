// S29 · PR 760 (CN-054; register "Geography map: demand and customers lens") — who buys where, and where people want
// something they do not buy, area by area, for a period (the store's own days). Counts only: a customer is never named
// and no phone, address or order number leaves this file.
//   - New against repeat: of the customers who placed an order in the area in the period, those whose first order of all
//     was before the period are repeat, the others new (`newCustomers`, `repeatCustomers`, `repeatShare`); an order with
//     no customer record is a guest order (`guestOrders`) and is in neither. The flag `repeatLeaning` / `newLeaning`: with
//     at least `minOrders` known customers, a repeat share above / below the whole shop's.
//   - Demand without sales: wishlist adds (`wishlistAdds`) and searches (`searches`) of the period, and how many of the
//     signed-in customers' ones ended without a sale (`wishlistNoSale`: no order of that customer with that product after
//     the add; `searchesNoSale`: no order of that customer after the search in the period), together `demandWithoutSales`.
//     The flag `demandGap` = at least `minOrders` of them. A wishlist add or a search is put in the area of the
//     customer's latest order with an area; a guest's has no area and is counted in "unknown" (`unlocatedShare` in
//     `extras` says how much of the demand that is), and a guest's is never called "without a sale" (it cannot be tied to one).
//   - Products: the styles that sold (delivered, the Sales rule) in the area, up to `topProducts` by pieces, and the
//     style a campaign should push there (`extras.products`): the style most wished for there without a sale, else the best
//     seller. A suggestion for a person to read; no campaign, budget, price or stock is changed.
// Read-only, store-scoped, archived orders left out, practice orders only while practice mode is on.
import { basisWhere, practiceVisible, type Db } from './metrics';
import { COUNTED_LINE_STATUS, daysPeriod } from './pure';
import { byFigure, loadPlaces, ratio, Roller, rowsOf, type Counts, type LensPlace, type LensResult } from './geo-lens-base';
import type { GeoLevel } from './geo-types';

export interface DemandOptions {
  timeZone: string;
  level: GeoLevel;
  parentAreaId?: string | null;
  /** The setting `reports.geoMap.minOrders`. */
  minOrders: number;
  /** The setting `reports.geoMap.topProducts`. */
  topProducts: number;
}

export interface DemandOrder {
  areaId: string | null;
  customerId: string | null;
  /** When the customer's first order of all was placed; null for a guest. */
  firstOrderAt: Date | null;
}
export interface DemandWish {
  areaId: string | null;
  productId: string;
  /** true: a signed-in customer with no later order of that product; false: sold, or a guest (cannot be tied). */
  noSale: boolean;
}
export interface DemandSearch {
  areaId: string | null;
  noSale: boolean;
}
export interface DemandLine {
  areaId: string | null;
  productId: string;
  pieces: number;
}

const KEYS = ['orders', 'guestOrders', 'newCustomers', 'repeatCustomers', 'wishlistAdds', 'wishlistNoSale', 'searches', 'searchesNoSale'] as const;
const zero = (): Counts => Object.fromEntries(KEYS.map((k) => [k, 0]));

export interface PushPick {
  productId: string;
  /** `wishlist`: wished for there without a sale; `topSeller`: the best seller there. */
  reason: 'wishlist' | 'topSeller';
  count: number;
}
export interface DemandProduct {
  productId: string;
  pieces: number;
}

/** The lens from the records (pure: the tests run it without a database). */
export function buildDemand(
  places: ReadonlyMap<string, LensPlace>,
  rec: { orders: readonly DemandOrder[]; wishes: readonly DemandWish[]; searches: readonly DemandSearch[]; lines: readonly DemandLine[] },
  o: Omit<DemandOptions, 'timeZone'>,
  period: { from: Date },
  days: { from: string; to: string },
): LensResult & { productIds: string[] } {
  const roller = new Roller<Counts>(o.level, o.parentAreaId ?? null, places, zero);
  const people = new Map<Counts, { fresh: Set<string>; again: Set<string> }>();
  const peopleOf = (f: Counts) => people.get(f) ?? people.set(f, { fresh: new Set(), again: new Set() }).get(f)!;
  for (const r of rec.orders) {
    for (const f of roller.at(r.areaId)) {
      f.orders! += 1;
      if (!r.customerId || !r.firstOrderAt) {
        f.guestOrders! += 1;
        continue;
      }
      if (r.firstOrderAt < period.from) peopleOf(f).again.add(r.customerId);
      else peopleOf(f).fresh.add(r.customerId);
    }
  }
  for (const [f, p] of people) {
    // a customer who is both (cannot be: the first order is one moment) counts once, as repeat
    for (const id of p.again) p.fresh.delete(id);
    f.newCustomers = p.fresh.size;
    f.repeatCustomers = p.again.size;
  }
  const wishNo = new Map<string, Map<string, number>>(); // area row -> product -> wished without a sale
  for (const w of rec.wishes) {
    for (const f of roller.at(w.areaId)) {
      f.wishlistAdds! += 1;
      if (w.noSale) f.wishlistNoSale! += 1;
    }
    const key = roller.keyOf(w.areaId);
    if (key && w.noSale) {
      const m = wishNo.get(key) ?? new Map<string, number>();
      m.set(w.productId, (m.get(w.productId) ?? 0) + 1);
      wishNo.set(key, m);
    }
  }
  for (const s of rec.searches) {
    for (const f of roller.at(s.areaId)) {
      f.searches! += 1;
      if (s.noSale) f.searchesNoSale! += 1;
    }
  }
  const sold = new Map<string, Map<string, number>>(); // area row -> product -> pieces
  for (const l of rec.lines) {
    const key = roller.keyOf(l.areaId);
    if (!key) continue;
    const m = sold.get(key) ?? new Map<string, number>();
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.pieces);
    sold.set(key, m);
  }

  const totalKnown = roller.total.newCustomers! + roller.total.repeatCustomers!;
  // the whole shop's repeat share (each customer once over the whole shop; one who ordered in two areas is in both rows)
  const wholeShare = ratio(roller.total.repeatCustomers!, totalKnown);
  const figures = (f: Counts): Record<string, number | null> => {
    const known = f.newCustomers! + f.repeatCustomers!;
    return {
      orders: f.orders!,
      guestOrders: f.guestOrders!,
      customers: known,
      newCustomers: f.newCustomers!,
      repeatCustomers: f.repeatCustomers!,
      repeatShare: ratio(f.repeatCustomers!, known),
      wishlistAdds: f.wishlistAdds!,
      wishlistNoSale: f.wishlistNoSale!,
      searches: f.searches!,
      searchesNoSale: f.searchesNoSale!,
      demandWithoutSales: f.wishlistNoSale! + f.searchesNoSale!,
    };
  };
  const flags = (f: Counts, fig: Record<string, number | null>): string[] => {
    const out: string[] = [];
    const known = f.newCustomers! + f.repeatCustomers!;
    const share = fig.repeatShare ?? null;
    if (known >= o.minOrders && wholeShare !== null && share !== null && share !== wholeShare) out.push(share > wholeShare ? 'repeatLeaning' : 'newLeaning');
    if ((fig.demandWithoutSales ?? 0) >= o.minOrders) out.push('demandGap');
    return out;
  };
  const rows = rowsOf(roller, figures, flags, byFigure('orders'));

  const products: Record<string, { top: DemandProduct[]; push: PushPick | null }> = {};
  const productIds = new Set<string>();
  for (const id of new Set([...sold.keys(), ...wishNo.keys()])) {
    const s = sold.get(id) ?? new Map<string, number>();
    const top = [...s]
      .map(([productId, pieces]) => ({ productId, pieces }))
      .sort((a, b) => b.pieces - a.pieces || a.productId.localeCompare(b.productId))
      .slice(0, Math.max(0, o.topProducts));
    const wished = [...(wishNo.get(id) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || (s.get(b[0]) ?? 0) - (s.get(a[0]) ?? 0) || a[0].localeCompare(b[0]));
    const push: PushPick | null = wished[0] ? { productId: wished[0][0], reason: 'wishlist', count: wished[0][1] } : top[0] ? { productId: top[0].productId, reason: 'topSeller', count: top[0].pieces } : null;
    products[id] = { top, push };
    for (const t of top) productIds.add(t.productId);
    if (push) productIds.add(push.productId);
  }
  const demandAll = roller.total.wishlistAdds! + roller.total.searches!;
  return {
    level: o.level,
    days,
    rows,
    unknown: figures(roller.unknown),
    outside: figures(roller.outside),
    total: figures(roller.total),
    extras: { products, unlocatedShare: ratio(roller.unknown.wishlistAdds! + roller.unknown.searches!, demandAll) },
    hidden: [],
    productIds: [...productIds],
  };
}

/** The demand and customers lens of one store over the days `from`–`to`. */
export async function geoDemand(db: Db, storeId: number, days: { from: string; to: string }, o: DemandOptions): Promise<LensResult> {
  const period = daysPeriod(days.from, days.to, o.timeZone);
  const [orders, wishes, searches, delivered] = await Promise.all([
    db.$queryRaw<{ areaId: string | null; customerId: string | null; firstAt: Date | null }[]>`
      SELECT o."areaId"::text AS "areaId", o."customerId"::text AS "customerId",
             (SELECT min(x."placedAt") FROM "Order" x WHERE x."storeId" = o."storeId" AND x."customerId" = o."customerId" AND x."archivedAt" IS NULL AND x."status"::text <> 'DRAFT') AS "firstAt"
        FROM "Order" o
       WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND ${practiceVisible} AND o."status"::text <> 'DRAFT'
         AND o."placedAt" >= ${period.from} AND o."placedAt" < ${period.to}`,
    db.$queryRaw<{ areaId: string | null; productId: string; noSale: boolean }[]>`
      SELECT (SELECT o."areaId"::text FROM "Order" o WHERE o."storeId" = w."storeId" AND o."customerId" = w."customerId" AND o."areaId" IS NOT NULL
                 AND o."archivedAt" IS NULL AND o."status"::text <> 'DRAFT' ORDER BY o."placedAt" DESC LIMIT 1) AS "areaId",
             w."productId"::text AS "productId",
             (w."customerId" IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "OrderItem" i JOIN "Order" o2 ON o2."id" = i."orderId"
                 WHERE o2."storeId" = w."storeId" AND o2."customerId" = w."customerId" AND i."productId" = w."productId" AND i."status"::text = ${COUNTED_LINE_STATUS}
                   AND o2."placedAt" >= w."createdAt" AND o2."archivedAt" IS NULL AND o2."status"::text NOT IN ('DRAFT', 'CANCELLED'))) AS "noSale"
        FROM "WishlistItem" w
       WHERE w."storeId" = ${storeId} AND w."archivedAt" IS NULL AND w."createdAt" >= ${period.from} AND w."createdAt" < ${period.to}`,
    db.$queryRaw<{ areaId: string | null; noSale: boolean }[]>`
      SELECT (SELECT o."areaId"::text FROM "Order" o WHERE o."storeId" = e."storeId" AND o."customerId" = e."customerId" AND o."areaId" IS NOT NULL
                 AND o."archivedAt" IS NULL AND o."status"::text <> 'DRAFT' ORDER BY o."placedAt" DESC LIMIT 1) AS "areaId",
             (e."customerId" IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM "Order" o2 WHERE o2."storeId" = e."storeId" AND o2."customerId" = e."customerId" AND o2."placedAt" >= e."occurredAt"
                   AND o2."placedAt" < ${period.to} AND o2."archivedAt" IS NULL AND o2."status"::text NOT IN ('DRAFT', 'CANCELLED'))) AS "noSale"
        FROM "AnalyticsEvent" e
       WHERE e."storeId" = ${storeId} AND e."name" = 'search' AND e."occurredAt" >= ${period.from} AND e."occurredAt" < ${period.to}`,
    db.$queryRaw<{ id: string; areaId: string | null }[]>`SELECT o."id"::text AS "id", o."areaId"::text AS "areaId" FROM "Order" o WHERE ${basisWhere('sales', storeId, period)}`,
  ]);
  const ids = delivered.map((d) => d.id);
  const rawLines = ids.length
    ? await db.$queryRaw<{ orderId: string; productId: string | null; quantity: number }[]>`
        SELECT i."orderId"::text AS "orderId", i."productId"::text AS "productId", i."quantity"
          FROM "OrderItem" i WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}`
    : [];
  const areaOf = new Map(delivered.map((d) => [d.id, d.areaId]));
  const lines: DemandLine[] = rawLines.filter((l) => l.productId).map((l) => ({ areaId: areaOf.get(l.orderId) ?? null, productId: l.productId!, pieces: Number(l.quantity) }));
  const rec = { orders: orders.map((r) => ({ areaId: r.areaId, customerId: r.customerId, firstOrderAt: r.firstAt })), wishes, searches, lines };
  const placeIds = [...orders, ...wishes, ...searches, ...lines].map((r) => r.areaId).filter((x): x is string => !!x);
  if (o.parentAreaId) placeIds.push(o.parentAreaId);
  const { productIds, ...result } = buildDemand(await loadPlaces(db, placeIds), rec, o, { from: period.from }, days);
  if (productIds.length) {
    const names = await db.$queryRaw<{ id: string; nameEn: string; nameBn: string | null }[]>`
      SELECT p."id"::text AS "id", p."nameEn", p."nameBn" FROM "Product" p WHERE p."storeId" = ${storeId} AND p."id" = ANY(${productIds}::uuid[])`;
    result.extras.productNames = Object.fromEntries(names.map((n) => [n.id, { nameEn: n.nameEn, nameBn: n.nameBn }]));
  }
  return result;
}
