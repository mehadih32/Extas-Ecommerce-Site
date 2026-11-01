// S16 · PR 537 (B3.10 V2, the 18 Oct round: "VAT system present and dynamic per product/category") — the VAT report of a
// period: the delivered orders of the period (Sales, M1, on their delivered day, through `basisWhere('sales')`), and the
// VAT already inside them by `ordersVat` (vat.ts): VAT inside the goods, inside the delivery charge (only when the owner
// says so), the goods with no rate (shown as such, never taken as 0 %), by rate, by category and day by day. Prices are
// VAT inclusive only, so this reads what the customer paid and never changes a price, a delivery charge or COD.
// Read-only and store-scoped; archived orders are left out (as everywhere in the metrics).
import { Prisma } from '@extas/db/client';
import { basisWhere, type Db } from './metrics';
import { BASIS_RULE, daysPeriod } from './pure';
import { ordersVat, type VatRatesInput } from './vat';

export interface VatReportInputs {
  timeZone: string;
  rates: VatRatesInput | null;
  onDelivery: boolean;
}

export interface VatByRate {
  /** The rate in basis points; null = the goods with no rate. */
  bps: number | null;
  lines: number;
  netMinor: number;
  /** VAT inside `netMinor`; null for the goods with no rate. */
  vatMinor: number | null;
}

export interface VatByCategory {
  /** The product's category; null = a line with no product or a product with no category. */
  categoryId: string | null;
  lines: number;
  netMinor: number;
  vatMinor: number;
  unratedMinor: number;
}

export interface VatReport {
  from: string;
  to: string;
  orders: number;
  /** The goods of the delivered orders (subtotal − order discount) — the same figure as Sales on Profit & loss. */
  salesMinor: number;
  goodsVatMinor: number;
  /** Goods on lines with no rate anywhere (no product, category or default rate). */
  unratedMinor: number;
  /** The SKUs of those lines, so the owner knows which rates are missing (sorted). */
  unratedSkus: string[];
  deliveryMinor: number;
  /** VAT inside the delivery charges; null when off or when there is no default rate. */
  deliveryVatMinor: number | null;
  /** Goods VAT plus delivery VAT (when counted). */
  totalVatMinor: number;
  byRate: VatByRate[];
  byCategory: VatByCategory[];
  /** Day by day (the delivered day in the store's time zone), newest first. */
  byDay: { day: string; orders: number; salesMinor: number; vatMinor: number }[];
}

/** The VAT report of one store over the days `from`–`to` (the store's own days). */
export async function vatReport(db: Db, storeId: number, days: { from: string; to: string }, inputs: VatReportInputs): Promise<VatReport> {
  const period = daysPeriod(days.from, days.to, inputs.timeZone);
  const at = Prisma.raw(`o."${BASIS_RULE.sales.at}"`);
  const delivered = await db.$queryRaw<{ id: string; day: string }[]>`
    SELECT o."id", to_char(${at} AT TIME ZONE ${inputs.timeZone}, 'YYYY-MM-DD') AS "day"
      FROM "Order" o
     WHERE ${basisWhere('sales', storeId, period)}`;
  const dayOf = new Map(delivered.map((r) => [r.id, r.day]));
  const vat = await ordersVat(db, storeId, [...dayOf.keys()], inputs.rates, { onDelivery: inputs.onDelivery });

  const rates = new Map<string, VatByRate>();
  const cats = new Map<string, VatByCategory>();
  const daysMap = new Map<string, { day: string; orders: number; salesMinor: number; vatMinor: number }>();
  const unratedSkus = new Set<string>();
  let sales = 0;
  let goodsVat = 0;
  let unrated = 0; // hardcode-ok: a running total starts at nothing
  let delivery = 0; // hardcode-ok: a running total starts at nothing
  let deliveryVat: number | null = null;
  for (const v of vat.values()) {
    sales += v.goodsMinor;
    goodsVat += v.goodsVatMinor;
    unrated += v.unratedMinor;
    delivery += v.deliveryMinor;
    if (v.deliveryVatMinor !== null) deliveryVat = (deliveryVat ?? 0) + v.deliveryVatMinor;
    const day = dayOf.get(v.orderId)!;
    const d = daysMap.get(day) ?? { day, orders: 0, salesMinor: 0, vatMinor: 0 };
    d.orders += 1;
    d.salesMinor += v.goodsMinor;
    d.vatMinor += v.goodsVatMinor + (v.deliveryVatMinor ?? 0);
    daysMap.set(day, d);
    // An order with no counted line at all keeps its goods as unrated, with no line to put under a rate or category.
    if (!v.lines.length && v.goodsMinor !== 0) {
      const r = rates.get('none') ?? { bps: null, lines: 0, netMinor: 0, vatMinor: null };
      r.netMinor += v.goodsMinor;
      rates.set('none', r);
      const c = cats.get('') ?? { categoryId: null, lines: 0, netMinor: 0, vatMinor: 0, unratedMinor: 0 }; // hardcode-ok: totals start at nothing
      c.netMinor += v.goodsMinor;
      c.unratedMinor += v.goodsMinor;
      cats.set('', c);
    }
    for (const l of v.lines) {
      const key = l.rate.bps === null ? 'none' : String(l.rate.bps);
      const r = rates.get(key) ?? { bps: l.rate.bps, lines: 0, netMinor: 0, vatMinor: l.rate.bps === null ? null : 0 };
      r.lines += 1;
      r.netMinor += l.netMinor;
      if (r.vatMinor !== null) r.vatMinor += l.vatMinor ?? 0;
      rates.set(key, r);
      const c = cats.get(l.categoryId ?? '') ?? { categoryId: l.categoryId, lines: 0, netMinor: 0, vatMinor: 0, unratedMinor: 0 }; // hardcode-ok: totals start at nothing
      c.lines += 1;
      c.netMinor += l.netMinor;
      if (l.vatMinor === null) {
        c.unratedMinor += l.netMinor;
        unratedSkus.add(l.sku);
      } else c.vatMinor += l.vatMinor;
      cats.set(l.categoryId ?? '', c);
    }
  }
  return {
    from: days.from,
    to: days.to,
    orders: vat.size,
    salesMinor: sales,
    goodsVatMinor: goodsVat,
    unratedMinor: unrated,
    unratedSkus: [...unratedSkus].sort(),
    deliveryMinor: delivery,
    deliveryVatMinor: deliveryVat,
    totalVatMinor: goodsVat + (deliveryVat ?? 0),
    // highest rate first, the goods with no rate last
    byRate: [...rates.values()].sort((a, b) => (a.bps === null ? 1 : b.bps === null ? -1 : b.bps - a.bps)),
    byCategory: [...cats.values()].sort((a, b) => b.netMinor - a.netMinor || (a.categoryId ?? '~').localeCompare(b.categoryId ?? '~')),
    byDay: [...daysMap.values()].sort((a, b) => b.day.localeCompare(a.day)),
  };
}
