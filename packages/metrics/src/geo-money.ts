// S29 · PR 759 (CN-054; register "Geography map: money and stock lens") — where delivery eats the profit, where ad money
// goes, and which styles sell where, area by area, for a period (the store's own days). Figures are for the owner to read:
// nothing here changes a delivery charge, a free-delivery limit, a price, an ad budget or a stock figure (hard rule 6).
//   - Delivery: over the delivered orders of the area (the Sales rule, delivered day), the delivery charge collected
//     (`deliveryChargeMinor`), the courier's charge on the parcels where it is known (`courierMinor`, from the order's
//     profit, PR 348: a parcel without its charge is never counted as 0, it stays out and shows in `courierUnknownOrders`),
//     the gap between the two on those same orders (`deliveryGapMinor`, charge − courier: below 0 means delivery costs
//     more than it brings in), the profit of the orders whose product cost is known (`profitMinor`, `costedSalesMinor`,
//     `marginPct` = profit ÷ costed Sales) and the orders sent with no delivery charge (`freeDeliveryOrders`).
//   - Ads: the Where-to-advertise / ad-return figure (`adDeliveredReturn`, PR 269: each campaign's spend shared over its
//     delivered orders) by the district the orders reached: `adSpendMinor`, `adDeliveredSalesMinor`, `roasPercent`, and
//     `adSpendShareOfSales` = ad spend ÷ the area's Sales. Known by district and, summed, by division; by upazila or area
//     it is not known (`null`). A spend in a currency with no rate is not known (`null`), never 0.
//   - Stock: the styles that sell in the area (`stock` in `extras`, per area, up to `topProducts` styles by pieces, then
//     Sales), each with the share of the style's pieces that went to this area (`areaSharePct`) — what sells where, for the
//     owner to decide which styles to keep near. It never moves, reserves or orders stock.
// The parts are read only when the viewer may see them (`parts`: `delivery` needs `books.read`; `ads` also needs
// `marketing.campaigns.read`; `stock` needs `reports.read`); a part left out is `null` and named in `hidden`.
// Read-only, store-scoped, archived orders left out, minor units.
import { adDeliveredReturn, type AdReturnRow } from './ad-return';
import { basisWhere, type Db } from './metrics';
import { orderProfits, type ProfitInputs } from './order-profit';
import { COUNTED_LINE_STATUS, daysPeriod } from './pure';
import { apportion } from './vat';
import { bump, byFigure, loadPlaces, ratio, Roller, rowsOf, type Counts, type LensPlace, type LensResult } from './geo-lens-base';
import type { GeoLevel } from './geo-types';

export const MONEY_PARTS = ['delivery', 'ads', 'stock'] as const;
export type MoneyPart = (typeof MONEY_PARTS)[number];

export interface MoneyOptions {
  profit: ProfitInputs;
  level: GeoLevel;
  parentAreaId?: string | null;
  /** The setting `reports.geoMap.minOrders`: a delivery-cost flag needs at least this many parcels with a known charge. */
  minOrders: number;
  /** The setting `reports.geoMap.topProducts`: how many styles per area. */
  topProducts: number;
  parts: ReadonlySet<MoneyPart>;
}

/** One delivered order, put in its area. `courierMinor` and `profitMinor` are null when not known. */
export interface MoneyOrder {
  id: string;
  areaId: string | null;
  goodsMinor: number;
  deliveryChargeMinor: number;
  courierMinor: number | null;
  /** The order's profit, only when its product cost is known. */
  profitMinor: number | null;
}

/** The pieces and goods of one product on delivered orders of an area. */
export interface MoneyLine {
  areaId: string | null;
  productId: string;
  pieces: number;
  totalMinor: number;
}

const KEYS = ['delivered', 'salesMinor', 'deliveryChargeMinor', 'courierMinor', 'courierKnownOrders', 'courierUnknownOrders', 'chargeOnKnownMinor', 'costedSalesMinor', 'profitMinor', 'freeDeliveryOrders', 'pieces'] as const;
const zero = (): Counts => Object.fromEntries(KEYS.map((k) => [k, 0]));
const pct1 = (a: number | null): number | null => (a === null ? null : Math.round(a * 1000) / 10);

export interface MoneyAds {
  /** The ad-return rows by district (key = the district's GeoArea id; '' = no district known). */
  districts: readonly AdReturnRow[];
}

export interface StockEntry {
  productId: string;
  pieces: number;
  salesMinor: number;
  /** This area's share of the style's pieces over every area counted, per cent with one decimal. */
  areaSharePct: number;
}

/** The lens from the records (pure: the tests run it without a database). */
export function buildMoney(
  places: ReadonlyMap<string, LensPlace>,
  orders: readonly MoneyOrder[],
  lines: readonly MoneyLine[],
  ads: MoneyAds | null,
  o: Pick<MoneyOptions, 'level' | 'parentAreaId' | 'minOrders' | 'topProducts' | 'parts'>,
  days: { from: string; to: string },
): LensResult & { stockIds: string[] } {
  const roller = new Roller<Counts>(o.level, o.parentAreaId ?? null, places, zero);
  for (const r of orders) {
    for (const f of roller.at(r.areaId)) {
      f.delivered! += 1;
      f.salesMinor! += r.goodsMinor;
      f.deliveryChargeMinor! += r.deliveryChargeMinor;
      if (r.deliveryChargeMinor === 0) f.freeDeliveryOrders! += 1;
      if (r.courierMinor === null) f.courierUnknownOrders! += 1;
      else {
        f.courierKnownOrders! += 1;
        f.courierMinor! += r.courierMinor;
        f.chargeOnKnownMinor! += r.deliveryChargeMinor;
      }
      if (r.profitMinor !== null) {
        f.profitMinor! += r.profitMinor;
        f.costedSalesMinor! += r.goodsMinor;
      }
    }
  }
  for (const l of lines) for (const f of roller.at(l.areaId)) bump(f, 'pieces', l.pieces);

  // ads by district, and summed to the division when the map is at that level
  const adOf = new Map<string, { spend: number | null; sales: number }>();
  if (ads && (o.level === 'district' || o.level === 'division')) {
    for (const d of ads.districts) {
      if (!d.key) continue;
      const key = o.level === 'district' ? d.key : (() => {
        const own = places.get(d.key);
        return own ? (own.ancestorIds.map((id) => places.get(id)).find((p) => p?.level === 'DIVISION')?.id ?? null) : null;
      })();
      if (!key) continue;
      const was = adOf.get(key) ?? { spend: 0, sales: 0 };
      adOf.set(key, { spend: was.spend === null || d.spendMinor === null ? null : was.spend + d.spendMinor, sales: was.sales + d.deliveredSalesMinor });
    }
  }
  const adKnown = !!ads && (o.level === 'district' || o.level === 'division');

  const has = (p: MoneyPart) => o.parts.has(p);
  const figures = (f: Counts, rowId: string | null): Record<string, number | null> => {
    const ad = rowId ? adOf.get(rowId) : undefined;
    const adsOn = has('ads') && adKnown;
    const spend = adsOn ? (rowId ? (ad ? ad.spend : 0) : null) : null;
    const gap = f.courierKnownOrders! > 0 ? f.chargeOnKnownMinor! - f.courierMinor! : null;
    return {
      delivered: f.delivered!,
      pieces: has('stock') ? f.pieces! : null,
      salesMinor: has('delivery') || has('ads') ? f.salesMinor! : null,
      deliveryChargeMinor: has('delivery') ? f.deliveryChargeMinor! : null,
      courierMinor: has('delivery') && f.courierKnownOrders! > 0 ? f.courierMinor! : null,
      courierKnownOrders: has('delivery') ? f.courierKnownOrders! : null,
      courierUnknownOrders: has('delivery') ? f.courierUnknownOrders! : null,
      deliveryGapMinor: has('delivery') ? gap : null,
      freeDeliveryOrders: has('delivery') ? f.freeDeliveryOrders! : null,
      costedSalesMinor: has('delivery') ? f.costedSalesMinor! : null,
      profitMinor: has('delivery') && f.costedSalesMinor! > 0 ? f.profitMinor! : null,
      marginPct: has('delivery') ? pct1(ratio(f.profitMinor!, f.costedSalesMinor!)) : null,
      adSpendMinor: spend,
      adDeliveredSalesMinor: adsOn && rowId ? (ad?.sales ?? 0) : null,
      roasPercent: adsOn && rowId && spend !== null && spend > 0 ? Math.round(((ad?.sales ?? 0) * 100) / spend) : null,
      adSpendShareOfSales: adsOn && spend !== null ? ratio(spend, f.salesMinor!) : null,
    };
  };
  // each row's own ad figures need its id, so the rows are made with it
  const rowIds = new Map<Counts, string>();
  for (const [id, r] of roller.rows) rowIds.set(r.f, id);
  const rows = rowsOf(
    roller,
    (f) => figures(f, rowIds.get(f) ?? null),
    (f, fig) => {
      const out: string[] = [];
      if (has('delivery') && f.courierKnownOrders! >= o.minOrders && f.courierMinor! > f.chargeOnKnownMinor!) out.push('deliveryEatsProfit');
      const spend = fig.adSpendMinor ?? null;
      if (has('ads') && spend !== null && spend > 0 && spend > (fig.salesMinor ?? 0)) out.push('adsExceedSales');
      return out;
    },
    byFigure('salesMinor'),
  );

  // stock: styles by area (pieces, then sales), with the area's share of each style
  const perArea = new Map<string, Map<string, { pieces: number; sales: number }>>();
  const perStyle = new Map<string, number>();
  if (has('stock')) {
    for (const l of lines) {
      const key = roller.keyOf(l.areaId);
      if (!key) continue;
      const m = perArea.get(key) ?? new Map<string, { pieces: number; sales: number }>();
      const was = m.get(l.productId) ?? { pieces: 0, sales: 0 };
      m.set(l.productId, { pieces: was.pieces + l.pieces, sales: was.sales + l.totalMinor });
      perArea.set(key, m);
      perStyle.set(l.productId, (perStyle.get(l.productId) ?? 0) + l.pieces);
    }
  }
  const stock: Record<string, StockEntry[]> = {};
  const stockIds = new Set<string>();
  for (const [areaId, m] of perArea) {
    stock[areaId] = [...m]
      .map(([productId, v]) => ({ productId, pieces: v.pieces, salesMinor: v.sales, areaSharePct: pct1(ratio(v.pieces, perStyle.get(productId) ?? 0)) ?? 0 }))
      .sort((a, b) => b.pieces - a.pieces || b.salesMinor - a.salesMinor || a.productId.localeCompare(b.productId))
      .slice(0, Math.max(0, o.topProducts));
    for (const e of stock[areaId]!) stockIds.add(e.productId);
  }

  const hidden = MONEY_PARTS.filter((p) => !has(p));
  const unknownFig = figures(roller.unknown, null);
  return {
    level: o.level,
    days,
    rows,
    unknown: unknownFig,
    outside: figures(roller.outside, null),
    total: figures(roller.total, null),
    extras: {
      stock: has('stock') ? stock : null,
      // the ad figures are given by district (and division) only; an ad's spend that no delivered order carried is not shared out
      adLevel: has('ads') ? (adKnown ? o.level : null) : null,
    },
    hidden,
    stockIds: [...stockIds],
  };
}

/** The money and stock lens of one store over the days `from`–`to`. */
export async function geoMoney(db: Db, storeId: number, days: { from: string; to: string }, o: MoneyOptions): Promise<LensResult> {
  const period = daysPeriod(days.from, days.to, o.profit.timeZone);
  const has = (p: MoneyPart) => o.parts.has(p);
  const delivered = await db.$queryRaw<{ id: string; areaId: string | null; goods: number; charge: number }[]>`
    SELECT o."id"::text AS "id", o."areaId"::text AS "areaId", (o."subtotalMinor" - o."discountMinor") AS "goods", o."deliveryChargeMinor" AS "charge"
      FROM "Order" o WHERE ${basisWhere('sales', storeId, period)}`;
  const ids = delivered.map((d) => d.id);
  const [profits, rawLines, ads] = await Promise.all([
    has('delivery') && ids.length ? orderProfits(db, storeId, ids, { ...o.profit, ads: { allocate: false, basis: 'month' } }) : Promise.resolve(new Map()),
    has('stock') && ids.length
      ? db.$queryRaw<{ orderId: string; productId: string | null; total: number; quantity: number }[]>`
          SELECT i."orderId"::text AS "orderId", i."productId"::text AS "productId", i."lineTotalMinor" AS "total", i."quantity"
            FROM "OrderItem" i WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
           ORDER BY i."orderId", i."createdAt", i."id"`
      : Promise.resolve([]),
    has('ads') ? adDeliveredReturn(db, storeId, days, { currency: o.profit.currency, timeZone: o.profit.timeZone }) : Promise.resolve(null),
  ]);
  const orders: MoneyOrder[] = delivered.map((d) => {
    const p = profits.get(d.id);
    const cost = p?.parts.productCost.minor ?? null;
    return {
      id: d.id,
      areaId: d.areaId,
      goodsMinor: Number(d.goods),
      deliveryChargeMinor: Number(d.charge),
      // the profit engine gives an order with no parcel a known 0: that is no charge to compare, so a 0 is "not known" here (never counted as a free parcel)
      courierMinor:
        p && p.parts.courier.minor !== null && p.parts.courier.minor > 0
          ? p.parts.courier.minor
          : null,
      profitMinor: p && cost !== null ? p.profitMinor : null,
    };
  });
  // a line's goods are its share of the order's goods (as VAT and Sales by area do), so the parts add up to Sales
  const areaOf = new Map(delivered.map((d) => [d.id, d]));
  const byOrder = new Map<string, typeof rawLines>();
  for (const l of rawLines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);
  const lines: MoneyLine[] = [];
  for (const [orderId, mine] of byOrder) {
    const d = areaOf.get(orderId);
    if (!d) continue;
    const shares = apportion(Number(d.goods), mine.map((l) => Number(l.total)));
    mine.forEach((l, k) => {
      if (l.productId) lines.push({ areaId: d.areaId, productId: l.productId, pieces: Number(l.quantity), totalMinor: shares[k]! });
    });
  }
  const placeIds = [...delivered.map((d) => d.areaId), ...(ads?.districts.map((d) => d.key) ?? [])].filter((x): x is string => !!x);
  if (o.parentAreaId) placeIds.push(o.parentAreaId);
  const places = await loadPlaces(db, placeIds);
  const built = buildMoney(places, orders, lines, ads ? { districts: ads.districts } : null, o, days);

  // the styles' names, for the stock lists
  const { stockIds, ...result } = built;
  if (stockIds.length) {
    const names = await db.$queryRaw<{ id: string; nameEn: string; nameBn: string | null }[]>`
      SELECT p."id"::text AS "id", p."nameEn", p."nameBn" FROM "Product" p WHERE p."storeId" = ${storeId} AND p."id" = ANY(${stockIds}::uuid[])`;
    const byId = new Map(names.map((n) => [n.id, n]));
    const stock = result.extras.stock as Record<string, StockEntry[]>;
    result.extras.stock = Object.fromEntries(
      Object.entries(stock).map(([areaId, list]) => [areaId, list.map((e) => ({ ...e, nameEn: byId.get(e.productId)?.nameEn ?? '', nameBn: byId.get(e.productId)?.nameBn ?? null }))]),
    );
  }
  return result;
}
