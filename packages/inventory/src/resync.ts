// PR 206 — "re-sync now" from the admin: all stock at once, or one product. Both need `inventory.sync` and are written
// to the audit log. They change the mirror exactly the way the scheduled pull does (same page code, same idempotent
// movements, same locks against checkout), so a manual re-sync can never move stock twice.
//
// - All stock: the stock pull (PR 195) run now, from the saved position or (`full`) from the start.
// - One product: each of its live SKUs is read live from the ERP (`stockForSku`) and applied like a pull page; the run
//   is its own ErpSyncRun (`stock.resyncProduct`) so the health panel shows it. Rows older than the mirror's are still
//   ignored. An SKU the ERP does not know is counted, never zeroed.
// - With no ERP the buttons answer ERP_NOT_CONNECTED, an unusable ERP ERP_UNAVAILABLE; on the practice ERP nothing is
//   read unless its stock is switched on (`erp.mock.stockEnabled`), as for the pull (PR 499).
import { z } from 'zod';
import type { ErpStockRow } from '@extas/adapters';
import { allow, logChange, nowOf, parse, setting, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { behaviourOf, resolveErp, type ErpLink } from './guard';
import { sellableKinds } from './locations';
import { checkCompany } from './mapping';
import { afterStockChange, applyPage, erpStockLocations, pullStock, type StockPullResult } from './stock-pull';
import { callErp, ErpCallFailed, errorCode, errorText, finishRun, retryPolicy, startRun } from './sync';

/** Refuses the admin action when the store has no usable ERP (PR 499: `stock.resync` is `refuse` there). */
function refuseWithoutErp(link: ErpLink): void {
  if (link.state === 'none') throw new InventoryError('ERP_NOT_CONNECTED', 'this store runs without an ERP');
  if (link.state === 'unavailable') throw new InventoryError('ERP_UNAVAILABLE', link.reason, [link.code]);
}

export const resyncInput = z.object({ full: z.boolean().optional() }).strict();
export type ResyncInput = z.input<typeof resyncInput>;

/** Re-syncs all stock of this store now (needs `inventory.sync`). */
export async function resyncStock(deps: InventoryDeps, who: Who, input: z.input<typeof resyncInput> = {}): Promise<StockPullResult> {
  await allow(deps, who, 'inventory.sync');
  const d = parse(resyncInput, input, 're-sync');
  const link = await resolveErp(deps, who.storeId);
  refuseWithoutErp(link);
  await logChange(deps.db, who, { action: 'erp.resync', entityType: 'ErpSyncState', entityId: `${who.storeId}:stock`, before: null, after: { full: d.full ?? false }, storeId: who.storeId });
  return pullStock(deps, { storeId: who.storeId, full: d.full });
}

export const resyncProductInput = z
  .object({ productId: z.uuid().optional(), sku: z.string().trim().min(1).max(64).optional() })
  .strict()
  .refine((v) => !!v.productId !== !!v.sku, { message: 'name a product or an SKU' });
export type ResyncProductInput = z.input<typeof resyncProductInput>;

export interface ProductResyncResult {
  status: 'skipped' | 'succeeded' | 'failed';
  reason: 'ERP_ON_PRACTICE' | null;
  runId: string | null;
  skus: number;
  rows: number;
  applied: number;
  unchanged: number;
  stale: number;
  /** SKUs the ERP has no stock row for. */
  notFound: number;
  unmappedWarehouse: number;
  movements: number;
  variantsChanged: number;
  lowStock: number;
  productsRechecked: number;
  error: { code: string; text: string } | null;
}

/** Re-syncs one product (or one SKU) of this store now (needs `inventory.sync`). */
export async function resyncProduct(deps: InventoryDeps, who: Who, input: z.input<typeof resyncProductInput>): Promise<ProductResyncResult> {
  await allow(deps, who, 'inventory.sync');
  const d = parse(resyncProductInput, input, 're-sync');
  const variants = await deps.db.productVariant.findMany({
    where: { storeId: who.storeId, archivedAt: null, ...(d.productId ? { productId: d.productId } : { sku: d.sku }) },
    select: { sku: true },
    orderBy: { sku: 'asc' },
  });
  if (!variants.length) throw new InventoryError('NOT_FOUND', d.productId ? 'no such product, or it has no live variants' : 'no such SKU in this store');
  const out: ProductResyncResult = { status: 'succeeded', reason: null, runId: null, skus: variants.length, rows: 0, applied: 0, unchanged: 0, stale: 0, notFound: 0, unmappedWarehouse: 0, movements: 0, variantsChanged: 0, lowStock: 0, productsRechecked: 0, error: null };

  const link = await resolveErp(deps, who.storeId);
  refuseWithoutErp(link);
  if (behaviourOf('stock.resync', link) !== 'run' || !('api' in link)) return { ...out, status: 'skipped', reason: 'ERP_ON_PRACTICE' };
  await logChange(deps.db, who, { action: 'erp.resync.product', entityType: d.productId ? 'Product' : 'ProductVariant', entityId: d.productId ?? d.sku!, before: null, after: { skus: variants.length }, storeId: who.storeId });

  const runId = await startRun(deps.db, who.storeId, 'stock.resyncProduct', nowOf(deps));
  out.runId = runId;
  try {
    const policy = await retryPolicy(deps);
    await checkCompany(deps, link, (await callErp(deps, policy, (o) => link.api.health(o))).value);
    const [stockCode, kinds] = await Promise.all([setting(deps, null, 'inventory.erp.stockLocationCode'), sellableKinds(deps)]);
    const locations = await erpStockLocations(deps.db, stockCode);
    const rows: ErpStockRow[] = [];
    for (const v of variants) {
      try {
        const got = (await callErp(deps, policy, (o) => link.api.stockForSku(v.sku, o))).value;
        // The store's ERP warehouse limits what counts, as in the pull.
        rows.push(...got.filter((r) => !link.setup.erpWarehouseId || r.warehouseId === link.setup.erpWarehouseId));
      } catch (e) {
        if (e instanceof ErpCallFailed && e.erp.code === 'NOT_FOUND') {
          out.notFound++;
          continue;
        }
        throw e;
      }
    }
    out.rows = rows.length;
    const c = await applyPage(deps, who.storeId, runId, rows, locations, kinds);
    for (const k of ['applied', 'unchanged', 'stale', 'unmappedWarehouse', 'movements', 'variantsChanged'] as const) out[k] = c[k];
    const follow = await afterStockChange(deps, who.storeId, c.touched);
    out.lowStock = follow.lowStock;
    out.productsRechecked = follow.productsRechecked;
    await finishRun(deps.db, runId, { ok: true, itemsOk: c.applied + c.unchanged + c.stale, itemsFailed: out.notFound + c.unmappedWarehouse, error: out.notFound ? `NOT_FOUND ×${out.notFound}` : null }, nowOf(deps));
    return out;
  } catch (e) {
    const text = errorText(e);
    await finishRun(deps.db, runId, { ok: false, itemsOk: 0, itemsFailed: variants.length, error: text }, nowOf(deps));
    return { ...out, status: 'failed', error: { code: errorCode(e), text } };
  }
}
