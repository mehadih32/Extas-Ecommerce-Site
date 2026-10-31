// PR 71 (follow-up 63) — the pieces of each variant that can be sold now, counted the way the product page counts them
// (lib/shop/product.ts): flagged in stock, then Σ available − the bags' holds over live locations of the sellable kinds
// (`inventory.sellableLocationKinds`). Given to the catalogue's back-in-stock request (it may not import the
// inventory) and used by the wishlist page to say which saved sizes can go straight into the bag.
import type { PrismaClient } from '@extas/db/client';
import { bGradeClosed, sellableUnits } from '@extas/inventory';
import type { Key, Value } from '@extas/settings';

interface Reader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

const levels = {
  select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } },
} as const;

/** A reader of the sellable pieces per variant id for one store (ids of another store, or unknown, count 0). */
export function sellableReader(db: PrismaClient, settings: Reader, storeId: number): (variantIds: string[]) => Promise<Map<string, number>> {
  return async (variantIds) => {
    const ids = [...new Set(variantIds)];
    if (!ids.length) return new Map();
    const [kinds, closed, rows] = await Promise.all([
      settings.value('inventory.sellableLocationKinds', { storeId }),
      bGradeClosed({ settings }, storeId),
      db.productVariant.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, inStock: true, grade: true, stockLevels: levels } }),
    ]);
    const k = new Set(kinds);
    // PR 610: a B-grade piece is not sold (0) while the ERP takes no B-grade line, as on the product page
    return new Map(rows.map((v) => [v.id, v.inStock && !(closed && v.grade === 'B') ? sellableUnits(v.stockLevels, k) : 0]));
  };
}
