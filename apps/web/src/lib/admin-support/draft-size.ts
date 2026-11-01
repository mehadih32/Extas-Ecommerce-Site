// S22 · PR 432 (Blueprint B4.7; SIM-F-012 "a size answer from Find My Size in chat is a direct sale") — the size a
// support draft gives: the shop's own Find My Size (PR 58) on the product last sent in the chat, with the store's own
// finder rules, exactly as the product page would answer. A product that is not live, has one size, or has no chart the
// finder can read gives no size (the draft then asks for the measures); measures outside the finder's range are not
// answered. Nothing is recorded here (the shop's SizeRecommendation rows stay the shoppers').
import type { PrismaClient } from '@extas/db/client';
import type { AppResolver } from '../settings';
import { finderOffered, sizeFor } from '../shop/pdp-finder';
import { productData } from '../shop/product';

/** Find My Size for a support draft in this store, or null when the product's chart cannot answer. */
export function draftSizeFinder(db: PrismaClient, resolver: AppResolver, storeId: number) {
  return async (productId: string, b: { heightIn: number; weightKg: number }): Promise<string | null> => {
    const f = await resolver.value('pdp.finder', { storeId });
    if (b.heightIn < f.heightMinIn || b.heightIn > f.heightMaxIn || b.weightKg < f.weightMinKg || b.weightKg > f.weightMaxKg) return null;
    const row = await db.product.findFirst({ where: { id: productId, storeId, status: 'PUBLISHED', archivedAt: null }, select: { slug: true } });
    if (!row) return null;
    const p = await productData(storeId, row.slug);
    if (!p) return null;
    const m = { onSale: p.state === 'live', sizes: p.sizes, chart: p.chart.en ?? null, garment: p.garment };
    // the chart answers in the chat even while the product page's own finder button is switched off
    if (!finderOffered(m, { ...f, on: true })) return null;
    return sizeFor(m, f, b)?.size ?? null;
  };
}
