// S16 · PR 350 (B3.10, Blueprint §59 answer 23: "VAT system present and dynamic per product/category, off for now") —
// the VAT inside the shop's prices. Prices are VAT inclusive only: VAT is read out of what the customer paid, never added
// on top, so nothing here can change a price, a delivery charge or COD.
//   - The rate of a line: the product's own rate, else its category's, else the nearest parent category's that has one,
//     else the store's default rate, else none ("no rate" is shown as such, never taken as 0; 0 % is a real rate).
//   - The VAT inside an amount at rate r (basis points): amount × r ÷ (10,000 + r), rounded to the nearest minor unit.
//   - An order's goods (its Sales figure M1: subtotal − order discount) are spread over its counted lines by their line
//     totals (largest remainder, so the lines add up to the order's figure exactly), then each line's VAT is taken out.
//   - The delivery charge carries VAT only when the owner says so (`vat.system.onDelivery`), at the default rate.
// Read-only and store-scoped; the caller decides which orders count (Sales: delivered only, through pnl / basisWhere).
import { type Db } from './metrics';
import { COUNTED_LINE_STATUS } from './pure';

/** The owner's rates as `vat.rates` keeps them (packages/settings registry-finance.ts), in basis points. */
export interface VatRatesInput {
  defaultBps: number | null;
  categories: readonly { categoryId: string; bps: number }[];
  products: readonly { productId: string; bps: number }[];
}

/** Where a line's rate came from. */
export type VatSource = 'product' | 'category' | 'parent' | 'default' | 'none';

export interface VatRate {
  bps: number | null;
  source: VatSource;
  /** The category whose rate was used (its own or a parent), for "why this rate". */
  fromCategoryId: string | null;
}

/** The deepest category tree walked before giving up (a loop in the tree never hangs). */
const MAX_DEPTH = 32;

/** VAT already inside a VAT-inclusive amount at `bps` (basis points), to the nearest minor unit (halves up). */
export function vatInsideMinor(grossMinor: number, bps: number): number {
  if (!Number.isInteger(grossMinor) || !Number.isInteger(bps) || bps < 0) throw new RangeError('whole minor units and basis points');
  if (grossMinor === 0 || bps === 0) return 0;
  const sign = grossMinor < 0 ? -1 : 1;
  const g = Math.abs(grossMinor);
  return sign * Math.floor((2 * g * bps + (10_000 + bps)) / (2 * (10_000 + bps)));
}

/** A rate finder for one store's rates and category tree (`parentOf`: category id → parent id or null). */
export function vatResolver(rates: VatRatesInput | null, parentOf: ReadonlyMap<string, string | null>): (productId: string | null, categoryId: string | null) => VatRate {
  const byProduct = new Map((rates?.products ?? []).map((r) => [r.productId, r.bps]));
  const byCategory = new Map((rates?.categories ?? []).map((r) => [r.categoryId, r.bps]));
  const fallback: VatRate = rates?.defaultBps === null || rates?.defaultBps === undefined ? { bps: null, source: 'none', fromCategoryId: null } : { bps: rates.defaultBps, source: 'default', fromCategoryId: null };
  return (productId, categoryId) => {
    if (productId && byProduct.has(productId)) return { bps: byProduct.get(productId)!, source: 'product', fromCategoryId: null };
    let at = categoryId;
    for (let depth = 0; at && depth < MAX_DEPTH; depth += 1) {
      if (byCategory.has(at)) return { bps: byCategory.get(at)!, source: depth === 0 ? 'category' : 'parent', fromCategoryId: at };
      at = parentOf.get(at) ?? null;
    }
    return fallback;
  };
}

/** `total` spread over `weights` in proportion, whole units, adding up to `total` exactly (largest remainder). */
export function apportion(total: number, weights: readonly number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const exact = weights.map((w) => (total * Math.max(0, w)) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left -= 1) out[order[k]!.i]! += 1;
  return out;
}

export interface VatLine {
  itemId: string;
  sku: string;
  productId: string | null;
  categoryId: string | null;
  /** The line's share of the order's goods figure (after line and order discounts). */
  netMinor: number;
  rate: VatRate;
  /** VAT inside `netMinor`; null when the line has no rate. */
  vatMinor: number | null;
}

export interface OrderVat {
  orderId: string;
  /** The order's goods figure (subtotal − order discount), the same as its Sales figure. */
  goodsMinor: number;
  /** VAT inside the goods, over the lines that have a rate. */
  goodsVatMinor: number;
  /** Goods on lines without any rate (no product, category or default rate). */
  unratedMinor: number;
  deliveryMinor: number;
  /** VAT inside the delivery charge: null when off (`onDelivery` false) or when there is no default rate. */
  deliveryVatMinor: number | null;
  lines: VatLine[];
}

export interface VatOptions {
  onDelivery: boolean;
}

/** The store's category tree (id → parent). */
export async function categoryParents(db: Db, storeId: number): Promise<Map<string, string | null>> {
  const rows = await db.$queryRaw<{ id: string; parentId: string | null }[]>`SELECT c."id", c."parentId" FROM "Category" c WHERE c."storeId" = ${storeId}`;
  return new Map(rows.map((r) => [r.id, r.parentId]));
}

/** The VAT inside each order's goods (and delivery charge, when on); unknown ids and other stores' orders are left out. */
export async function ordersVat(db: Db, storeId: number, orderIds: readonly string[], rates: VatRatesInput | null, opts: VatOptions): Promise<Map<string, OrderVat>> {
  const ids = [...new Set(orderIds)];
  const out = new Map<string, OrderVat>();
  if (!ids.length) return out;
  const [orders, items, parents] = await Promise.all([
    db.$queryRaw<{ id: string; goods: number; delivery: number }[]>`
      SELECT o."id", (o."subtotalMinor" - o."discountMinor") AS "goods", o."deliveryChargeMinor" AS "delivery"
        FROM "Order" o
       WHERE o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND o."id" = ANY(${ids}::uuid[])`,
    db.$queryRaw<{ id: string; orderId: string; sku: string; productId: string | null; categoryId: string | null; total: number }[]>`
      SELECT i."id", i."orderId", i."sku", i."productId", p."categoryId", i."lineTotalMinor" AS "total"
        FROM "OrderItem" i LEFT JOIN "Product" p ON p."id" = i."productId" AND p."storeId" = i."storeId"
       WHERE i."storeId" = ${storeId} AND i."orderId" = ANY(${ids}::uuid[]) AND i."status"::text = ${COUNTED_LINE_STATUS}
       ORDER BY i."orderId", i."createdAt", i."id"`,
    categoryParents(db, storeId),
  ]);
  const rateOf = vatResolver(rates, parents);
  const itemsOf = new Map<string, typeof items>();
  for (const i of items) itemsOf.set(i.orderId, [...(itemsOf.get(i.orderId) ?? []), i]);
  const deliveryRate = rates?.defaultBps ?? null;
  for (const o of orders) {
    const goods = Number(o.goods);
    const delivery = Number(o.delivery);
    const mine = itemsOf.get(o.id) ?? [];
    const shares = apportion(goods, mine.map((i) => Number(i.total)));
    const lines: VatLine[] = mine.map((i, k) => {
      const rate = rateOf(i.productId, i.categoryId);
      const net = shares[k]!;
      return { itemId: i.id, sku: i.sku, productId: i.productId, categoryId: i.categoryId, netMinor: net, rate, vatMinor: rate.bps === null ? null : vatInsideMinor(net, rate.bps) };
    });
    // Goods with no counted line at all (an order whose lines were all taken off) have no rate to read.
    const unrated = mine.length ? lines.filter((l) => l.vatMinor === null).reduce((s, l) => s + l.netMinor, 0) : goods;
    out.set(o.id, {
      orderId: o.id,
      goodsMinor: goods,
      goodsVatMinor: lines.reduce((s, l) => s + (l.vatMinor ?? 0), 0),
      unratedMinor: unrated,
      deliveryMinor: delivery,
      deliveryVatMinor: opts.onDelivery && deliveryRate !== null ? vatInsideMinor(delivery, deliveryRate) : null,
      lines,
    });
  }
  return out;
}
