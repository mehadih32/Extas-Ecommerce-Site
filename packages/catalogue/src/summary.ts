// The product's denormalised summary (A3.4 / PR 603: list and category pages read these, never the variants):
// `Product.inStock`, `Product.minPriceMinor`, and the same two on each of its category listings. Recomputed in the
// same transaction as any variant change, so the lists never disagree with the product page.
import type { Tx } from './context';

export interface ProductSummary {
  inStock: boolean;
  minPriceMinor: number | null;
}

/** "From" price: the lowest price of the in-stock variants, or of all active ones when none is in stock. */
export function summarise(variants: { inStock: boolean; priceMinor: number | null }[]): ProductSummary {
  const inStock = variants.some((v) => v.inStock);
  const pool = (inStock ? variants.filter((v) => v.inStock) : variants).map((v) => v.priceMinor).filter((p): p is number => p != null);
  return { inStock, minPriceMinor: pool.length ? Math.min(...pool) : null };
}

export async function refreshProductSummary(tx: Tx, storeId: number, productId: string): Promise<ProductSummary> {
  const variants = await tx.productVariant.findMany({ where: { storeId, productId, archivedAt: null, active: true }, select: { inStock: true, priceMinor: true } });
  const s = summarise(variants);
  await tx.product.update({ where: { id: productId }, data: { inStock: s.inStock, minPriceMinor: s.minPriceMinor } });
  await tx.categoryProduct.updateMany({ where: { storeId, productId }, data: { inStock: s.inStock, priceMinor: s.minPriceMinor } });
  return s;
}
