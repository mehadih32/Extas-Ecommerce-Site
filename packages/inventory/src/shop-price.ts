// PR 609 (CN-028) — the buying price ("bought from ERP at"): in `erp.model` v6 the shop buys every piece from the ERP
// at the ERP's shop price. It is kept on the variant (ProductVariant.shopPriceMinor) and never shown to customers.
// - It arrives with the import by style code (erp-import.ts), in `variant.changed` (webhook.ts) and in the
//   `shop-price.changed` event (the ledger's handler, erp-events.ts).
// - A changed buying price updates the variant and flags it for the admin (the "Buying price changed" list on the
//   import page: the old and new price, the selling price, and whether it now falls below the floor). It never changes
//   a selling price by itself (CLAUDE.md rule 6). "Seen" clears the flag, kept in the audit log.
// - qa-gate (30 Oct): the variant's row is locked while it is read and written (an import and an event for the same SKU
//   never interleave). `shopPriceChangedAt` is when the price held was set (the event's time, or the import's): a price
//   older than that is ignored ('older'), so an event that arrives late never undoes a newer price. A first price is
//   stamped too and counts as seen at once (there is nothing to look at). How many changes the list shows is
//   `catalogue.shopPrice.changesShown`.
import { allow as allowCatalogue, floorOf, floorPercent, type CatalogueDeps } from '@extas/catalogue';
import { z } from 'zod';
import type { PrismaClient } from '@extas/db/client';
import { allow, logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Tx, type Who } from './context';
import { currencyDigits } from './erp-push';
import { decimalToMinor } from './money';

export type ShopPriceResult = 'first' | 'changed' | 'same' | 'unknown' | 'older';

interface HeldPrice {
  id: string;
  shopPriceMinor: number | null;
  shopPriceChangedAt: Date | null;
}

/**
 * Records one SKU's buying price from the ERP. The first one is just kept; a different one later is flagged. `asOf` is
 * when the ERP set it (an event's time; the import's own time when not given): one older than the price held is
 * ignored. The variant's row stays locked until the transaction ends (one is opened when `db` is not one already).
 */
export async function applyShopPrice(db: Db, storeId: number, sku: string, shopPrice: string | null | undefined, now: Date, opts: { asOf?: Date | null } = {}): Promise<ShopPriceResult> {
  if (shopPrice == null) return 'same';
  const run = async (tx: Tx): Promise<ShopPriceResult> => {
    const store = await tx.store.findUnique({ where: { id: storeId }, select: { currency: true } });
    if (!store) return 'unknown';
    const [v] = await tx.$queryRaw<HeldPrice[]>`
      SELECT "id", "shopPriceMinor", "shopPriceChangedAt" FROM "ProductVariant"
      WHERE "storeId" = ${storeId} AND "sku" = ${sku.trim()} AND "archivedAt" IS NULL
      LIMIT 1 FOR UPDATE`;
    if (!v) return 'unknown';
    const asOf = opts.asOf ?? now;
    if (v.shopPriceChangedAt && asOf.getTime() < v.shopPriceChangedAt.getTime()) return 'older';
    const minor = decimalToMinor(shopPrice, currencyDigits(store.currency));
    if (minor === null || minor === v.shopPriceMinor) return 'same';
    if (v.shopPriceMinor === null) {
      await tx.productVariant.update({ where: { id: v.id }, data: { shopPriceMinor: minor, shopPriceChangedAt: asOf, shopPriceSeenAt: asOf } });
      return 'first';
    }
    await tx.productVariant.update({ where: { id: v.id }, data: { shopPricePrevMinor: v.shopPriceMinor, shopPriceMinor: minor, shopPriceChangedAt: asOf, shopPriceSeenAt: null } });
    return 'changed';
  };
  const open = (db as { $transaction?: unknown }).$transaction;
  return typeof open === 'function' ? (db as PrismaClient).$transaction(run, TX) : run(db as Tx);
}

export interface ShopPriceChange {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  grade: 'A' | 'B';
  previousMinor: number | null;
  shopPriceMinor: number;
  /** The shop's own selling price, unchanged. */
  priceMinor: number | null;
  /** The lowest selling price at the floor margin (null = floor off). */
  floorMinor: number | null;
  belowFloor: boolean;
  /** The selling price no longer covers the buying price at all. */
  belowCost: boolean;
  changedAt: string;
}

const catDeps = (deps: InventoryDeps): CatalogueDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/**
 * The buying prices that changed and were not seen yet, newest first, at most `catalogue.shopPrice.changesShown` (or
 * `opts.limit`). Needs `catalogue.prices` (they are cost data).
 */
export async function shopPriceChanges(deps: InventoryDeps, who: Who, opts: { limit?: number } = {}): Promise<{ total: number; items: ShopPriceChange[] }> {
  await allow(deps, who, 'inventory.read');
  await allowCatalogue(catDeps(deps), who, 'catalogue.prices');
  const where = { storeId: who.storeId, archivedAt: null, shopPriceChangedAt: { not: null }, shopPriceSeenAt: null, shopPriceMinor: { not: null } };
  const take = opts.limit ?? (await setting(deps, null, 'catalogue.shopPrice.changesShown'));
  const [total, rows, percent] = await Promise.all([
    deps.db.productVariant.count({ where }),
    deps.db.productVariant.findMany({
      where,
      orderBy: [{ shopPriceChangedAt: 'desc' }, { sku: 'asc' }],
      take,
      select: { id: true, productId: true, sku: true, grade: true, shopPriceMinor: true, shopPricePrevMinor: true, priceMinor: true, shopPriceChangedAt: true, product: { select: { nameEn: true } } },
    }),
    floorPercent(deps, who),
  ]);
  return {
    total,
    items: rows.map((r) => {
      const floor = floorOf(r.shopPriceMinor, percent);
      return {
        variantId: r.id,
        productId: r.productId,
        productName: r.product.nameEn,
        sku: r.sku,
        grade: r.grade,
        previousMinor: r.shopPricePrevMinor,
        shopPriceMinor: r.shopPriceMinor!,
        priceMinor: r.priceMinor,
        floorMinor: floor,
        belowFloor: floor !== null && r.priceMinor !== null && r.priceMinor < floor,
        belowCost: r.priceMinor !== null && r.priceMinor < r.shopPriceMinor!,
        changedAt: r.shopPriceChangedAt!.toISOString(),
      };
    }),
  };
}

export const seenInput = z
  .object({ ids: z.array(z.uuid()).min(1).max(1000).optional(), all: z.literal(true).optional() })
  .strict()
  .refine((v) => !!v.ids !== !!v.all, { message: 'name the prices or ask for all' });
export type SeenInput = z.input<typeof seenInput>;

/** "Seen": the admin has looked at these changed buying prices. Clears the flag; nothing else changes. */
export async function markShopPricesSeen(deps: InventoryDeps, who: Who, input: SeenInput): Promise<{ seen: number }> {
  await allow(deps, who, 'inventory.read');
  await allowCatalogue(catDeps(deps), who, 'catalogue.prices');
  const d = parse(seenInput, input, 'seen');
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const where = { storeId: who.storeId, shopPriceChangedAt: { not: null }, shopPriceSeenAt: null, ...(d.ids ? { id: { in: d.ids } } : {}) };
    const ids = (await tx.productVariant.findMany({ where, select: { id: true } })).map((r) => r.id);
    if (!ids.length) return { seen: 0 };
    await tx.productVariant.updateMany({ where: { id: { in: ids } }, data: { shopPriceSeenAt: now } });
    await logChange(tx, who, { action: 'variant.shopPrice.seen', entityType: 'ProductVariant', entityId: ids[0]!, before: null, after: { ids }, storeId: who.storeId });
    return { seen: ids.length };
  });
}
