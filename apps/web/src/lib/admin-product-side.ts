// PR 968 (admin prototype v5, Products › one product): what the cards beside the edit form need — the ERP buying price and
// the owner's margin floor (the "Pricing" card), the words people find the page with on Google ("Google ranking for this
// type") and the collections the product sits in. Read only, one product, one store. The buying price and margin show only
// to someone with `catalogue.prices` (the same rule as the product list).
import { catalogueAccess } from './admin-products';

type Access = ReturnType<typeof catalogueAccess>;

export interface ProductSide {
  /** The lowest ERP buying price of the live variants (minor units); null when none is known or the person may not see prices. */
  buyingMinor: number | null;
  /** The owner's lowest margin, said as a margin on the selling price (a percent); null: no floor set or not allowed to see. */
  floorMarginPct: number | null;
  keywords: { query: string; position: number | null; impressions: number }[];
  collections: { id: string; nameEn: string; nameBn: string | null }[];
}

const DAY_MS = 86_400_000; // hardcode-ok: milliseconds in a day
const KEYWORDS = 5; // hardcode-ok: how many search words the small card lists

export async function loadProductSide(c: Access, productId: string, path: string): Promise<ProductSide> {
  const db = c.deps.db;
  const showsBuying = c.can('catalogue.prices');
  const now = (c.deps.now ?? (() => new Date()))();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [variants, floor, metrics, links] = await Promise.all([
    showsBuying ? db.productVariant.findMany({ where: { storeId: c.storeId, productId, archivedAt: null }, select: { shopPriceMinor: true } }) : Promise.resolve([]),
    showsBuying ? Promise.resolve(c.deps.settings.value('catalogue.floor.minMarginPercent', { storeId: c.storeId })).then((v): number | null => (typeof v === 'number' ? v : null)) : Promise.resolve(null),
    db.searchConsoleMetric.findMany({ where: { storeId: c.storeId, page: { endsWith: path }, date: { gte: since } }, select: { query: true, impressions: true, position: true }, take: 2000 }),
    db.collectionProduct.findMany({ where: { storeId: c.storeId, productId, archivedAt: null, collection: { archivedAt: null } }, select: { collection: { select: { id: true, nameEn: true, nameBn: true } } }, take: 50 }),
  ]);
  const costs = variants.map((v) => v.shopPriceMinor).filter((n): n is number => typeof n === 'number' && n > 0);
  const byQuery = new Map<string, { impressions: number; weighted: number; counted: number }>();
  for (const m of metrics) {
    const row = byQuery.get(m.query) ?? { impressions: 0, weighted: 0, counted: 0 };
    row.impressions += m.impressions;
    if (m.position != null) {
      const w = Math.max(1, m.impressions);
      row.weighted += m.position * w;
      row.counted += w;
    }
    byQuery.set(m.query, row);
  }
  const keywords = [...byQuery.entries()]
    .map(([query, r]) => ({ query, impressions: r.impressions, position: r.counted ? Math.round((r.weighted / r.counted) * 10) / 10 : null }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, KEYWORDS);
  return {
    buyingMinor: costs.length ? Math.min(...costs) : null,
    floorMarginPct: showsBuying && floor != null ? Math.round(((floor * 100) / (100 + floor)) * 10) / 10 : null,
    keywords,
    collections: links.map((l) => l.collection),
  };
}
