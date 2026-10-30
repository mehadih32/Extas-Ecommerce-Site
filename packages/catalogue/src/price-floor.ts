// PR 609 (CN-028) — the selling-price floor. In `erp.model` v6 the shop buys each piece from the ERP at its shop price
// (ProductVariant.shopPriceMinor, "bought from ERP at", never shown to customers). The owner can set a lowest margin
// over it (`catalogue.floor.minMarginPercent`, empty = off): a selling price, or a combo's set price, that would leave
// less is refused with BELOW_FLOOR. The shop never changes a price by itself: a buying price that rises above a
// selling price is flagged for the admin (shop-price.ts), never "fixed".
//
// The CSV import shows a price below the floor as an issue before anything is applied (catalogue-csv.ts). Set tiers,
// discounts and coupons are held at the floor in the bag and at checkout by the rules engine (@extas/rules
// `floorMinorOf`, the same formula; a test in packages/combos keeps the two equal).
import { setting, type CatalogueDeps, type Db, type Who } from './context';
import { CatalogueError } from './errors';

/** The lowest selling price for a buying price, or null when the floor is off or the buying price is not known. */
export function floorOf(buyMinor: number | null | undefined, percent: number | null | undefined): number | null {
  if (percent == null || buyMinor == null) return null;
  return Math.ceil((buyMinor * (100 + percent)) / 100);
}

/** The store's floor margin (null = off). */
export const floorPercent = (deps: Pick<CatalogueDeps, 'settings'>, who: Pick<Who, 'storeId'>): Promise<number | null> =>
  setting(deps as CatalogueDeps, who as Who, 'catalogue.floor.minMarginPercent');

/** Refuses a selling price below the floor of its variant (BELOW_FLOOR, details `sku: …`, `floor: …`). */
export async function assertVariantFloor(deps: Pick<CatalogueDeps, 'settings'>, who: Pick<Who, 'storeId'>, v: { sku: string; shopPriceMinor: number | null }, priceMinor: number | null | undefined): Promise<void> {
  if (priceMinor == null) return;
  const floor = floorOf(v.shopPriceMinor, await floorPercent(deps, who));
  if (floor !== null && priceMinor < floor) throw new CatalogueError('BELOW_FLOOR', 'the price is below the lowest margin over the buying price', [`sku: ${v.sku}`, `floor: ${floor}`]);
}

export interface FloorItem {
  /** Null for a piece that is not one product (it then adds nothing to the floor). */
  productId: string | null;
  /** A fixed piece, or null when the customer picks the colour and size. */
  fixedVariantId: string | null;
  quantity: number;
}

/**
 * The floor of a set of pieces (a combo): each piece at the highest buying price it can be bought at (its fixed variant,
 * or the dearest live variant of its product), times the margin. Null when the floor is off or no buying price is known.
 */
export async function setFloorMinor(db: Db, deps: Pick<CatalogueDeps, 'settings'>, who: Pick<Who, 'storeId'>, items: FloorItem[]): Promise<number | null> {
  const percent = await floorPercent(deps, who);
  if (percent == null || !items.length) return null;
  let buy = 0;
  let known = false;
  for (const i of items) {
    if (!i.fixedVariantId && !i.productId) continue;
    const rows = await db.productVariant.findMany({
      where: { storeId: who.storeId, ...(i.fixedVariantId ? { id: i.fixedVariantId } : { productId: i.productId!, archivedAt: null }) },
      select: { shopPriceMinor: true },
    });
    const prices = rows.map((r) => r.shopPriceMinor).filter((p): p is number => p != null);
    if (!prices.length) continue;
    known = true;
    buy += Math.max(...prices) * i.quantity;
  }
  return known ? floorOf(buy, percent) : null;
}
