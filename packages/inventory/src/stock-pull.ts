// PR 195 — the stock pull: the ERP's stock per SKU per ERP warehouse into the local mirror (StockLevel per variant per
// location), so the shop's colour × size stock follows the ERP (A3.4: StockBalance → shop). Shaped as a job a BullMQ
// worker calls every `erp.sync.stockPollMinutes` (jobs.ts); tests and a manual re-sync (PR 206) call it inline.
//
// - Incremental: it asks for rows changed since the last complete pull (minus `erp.sync.updatedSinceOverlapSeconds`
//   for clock differences), page by page (`erp.sync.pageSize`, at most `erp.sync.maxPagesPerRun`). Where it stopped is
//   kept, so a pull cut short by a failure or the page cap carries on where it was (same query, same cursor).
// - Every row is matched by the ERP SKU (the key, PR 19) in this store, and by the ERP warehouse to the local warehouse
//   linked to it (PR 196); it lands in that warehouse's location `inventory.erp.stockLocationCode`. Unknown SKUs (new
//   ERP styles, the publishing queue's job, PR 204), retired SKUs and unlinked warehouses are counted, never guessed.
// - Order: a row older than what the mirror already has is ignored (a late "5" never overwrites a newer "3").
// - Every change of on-hand writes one StockMovement with an idempotency key from the ERP's own state, so re-reading the
//   same rows can never move stock twice (PR 200's rule, kept here from the start).
// - `ProductVariant.inStock` and the product summary follow in the same transaction (stock.ts).
// - Before any row is read, the key's company is checked against the store's mapping (PR 196); a mismatch stops the
//   pull with nothing written.
// - With no ERP (PR 499) nothing runs; on the practice ERP it runs only with `erp.mock.stockEnabled`.
import type { ErpStockRow } from '@extas/adapters';
import type { LocationKindName } from '@extas/settings';
import { nowOf, setting, TX, type Db, type InventoryDeps } from './context';
import { behaviourOf, resolveErp, type ErpLink } from './guard';
import { sellableKinds } from './locations';
import { checkCompany } from './mapping';
import { evaluateLowStock } from './low-stock';
import { recheckProductsForStock } from './publish-queue';
import { lockPools, refreshPools, releaseHandedOver } from './reservations';
import { recomputeVariantStock, sellableUnits } from './stock';
import { InventoryError } from './errors';
import { callErp, ErpCallFailed, errorCode, errorText, finishRun, readState, retryPolicy, saveState, startRun } from './sync';

export interface StockPullJob {
  storeId: number;
  /** Ignore the saved position and read everything again. */
  full?: boolean;
}

export interface StockPullResult {
  status: 'skipped' | 'succeeded' | 'failed';
  /** Why nothing ran (PR 499). */
  reason: 'ERP_NONE' | 'ERP_ON_PRACTICE' | null;
  runId: string | null;
  /** The adapter mode used (MOCK, SANDBOX, LIVE). */
  adapterMode: string | null;
  pages: number;
  rows: number;
  applied: number;
  unchanged: number;
  stale: number;
  unknownSku: number;
  retiredSku: number;
  unmappedWarehouse: number;
  rejected: number;
  movements: number;
  variantsChanged: number;
  productsRefreshed: number;
  /** PR 202: low-stock alerts raised or changed after this pull. */
  lowStock: number;
  /** PR 204: products whose publish checklist ran again because their ERP stock changed. */
  productsRechecked: number;
  /** False when the page cap stopped the pull; the next pull carries on. */
  complete: boolean;
  error: { code: string; text: string } | null;
}

const blank = (): StockPullResult => ({
  status: 'succeeded',
  reason: null,
  runId: null,
  adapterMode: null,
  pages: 0,
  rows: 0,
  applied: 0,
  unchanged: 0,
  stale: 0,
  unknownSku: 0,
  retiredSku: 0,
  unmappedWarehouse: 0,
  rejected: 0,
  movements: 0,
  variantsChanged: 0,
  productsRefreshed: 0,
  lowStock: 0,
  productsRechecked: 0,
  complete: true,
  error: null,
});

/** Where a pull stopped: the query and the ERP's cursor (kept in ErpSyncState.cursor). */
interface ResumePoint {
  since: string | null;
  cursor: string;
}
const encodeResume = (r: ResumePoint) => JSON.stringify(r);
function decodeResume(v: string | null | undefined): ResumePoint | null {
  if (!v) return null;
  try {
    const r = JSON.parse(v) as ResumePoint;
    return typeof r.cursor === 'string' && (r.since === null || typeof r.since === 'string') ? r : null;
  } catch {
    return null;
  }
}

interface ErpLocation {
  locationId: string;
  kind: LocationKindName;
}

/** ERP warehouse id → the location its stock lands in. */
export async function erpStockLocations(db: Db, stockCode: string): Promise<Map<string, ErpLocation>> {
  const rows = await db.warehouse.findMany({
    where: { erpWarehouseId: { not: null }, archivedAt: null },
    select: { erpWarehouseId: true, locations: { where: { code: stockCode, archivedAt: null }, select: { id: true, kind: true } } },
  });
  const out = new Map<string, ErpLocation>();
  for (const w of rows) {
    const l = w.locations[0];
    if (w.erpWarehouseId && l) out.set(w.erpWarehouseId, { locationId: l.id, kind: l.kind });
  }
  return out;
}

type PageCounts = Pick<StockPullResult, 'applied' | 'unchanged' | 'stale' | 'unknownSku' | 'retiredSku' | 'unmappedWarehouse' | 'movements' | 'variantsChanged' | 'productsRefreshed'> & {
  maxSeen: Date | null;
  /** Variants whose numbers changed (PR 202 low stock, PR 204 publish recheck read them after the pull). */
  touched: string[];
};

export async function applyPage(deps: InventoryDeps, storeId: number, runId: string, rows: ErpStockRow[], locations: Map<string, ErpLocation>, kinds: Set<LocationKindName>): Promise<PageCounts> {
  return deps.db.$transaction(async (tx) => {
    const c: PageCounts = { applied: 0, unchanged: 0, stale: 0, unknownSku: 0, retiredSku: 0, unmappedWarehouse: 0, movements: 0, variantsChanged: 0, productsRefreshed: 0, maxSeen: null, touched: [] };
    const skus = [...new Set(rows.map((r) => r.sku))];
    // PR 198: the page's pools are locked first, in the same order every hold locks them, so a checkout and the pull
    // never interleave on a row (and never deadlock each other).
    await lockPools(tx, skus);
    const variants = await tx.productVariant.findMany({ where: { storeId, sku: { in: skus } }, select: { id: true, sku: true, archivedAt: true } });
    const bySku = new Map(variants.map((v) => [v.sku, v]));
    const locationIds = [...new Set([...locations.values()].map((l) => l.locationId))];
    const levels = await tx.stockLevel.findMany({ where: { variantId: { in: variants.map((v) => v.id) }, locationId: { in: locationIds } } });
    const byKey = new Map(levels.map((l) => [`${l.variantId}:${l.locationId}`, l]));
    const moves: { variantId: string; locationId: string; delta: number; reason: string; referenceType: string; referenceId: string; idempotencyKey: string; erpRef: string }[] = [];
    const touched = new Set<string>();
    const applied: { variantId: string; locationId: string; erpUpdatedAt: Date }[] = [];

    for (const r of rows) {
      if (!c.maxSeen || r.updatedAt > c.maxSeen) c.maxSeen = r.updatedAt;
      const loc = locations.get(r.warehouseId);
      if (!loc) {
        c.unmappedWarehouse++;
        continue;
      }
      const v = bySku.get(r.sku);
      if (!v) {
        c.unknownSku++;
        continue;
      }
      if (v.archivedAt) {
        c.retiredSku++;
        continue;
      }
      const key = `${v.id}:${loc.locationId}`;
      const cur = byKey.get(key);
      if (cur?.erpUpdatedAt && cur.erpUpdatedAt.getTime() > r.updatedAt.getTime()) {
        c.stale++;
        continue;
      }
      const sameNumbers = cur != null && cur.onHand === r.onHand && cur.reserved === r.reserved && cur.available === r.available;
      if (sameNumbers && cur.erpUpdatedAt?.getTime() === r.updatedAt.getTime()) {
        c.unchanged++;
        continue;
      }
      const data = { onHand: r.onHand, reserved: r.reserved, available: r.available, erpUpdatedAt: r.updatedAt };
      const saved = cur ? await tx.stockLevel.update({ where: { id: cur.id }, data }) : await tx.stockLevel.create({ data: { variantId: v.id, locationId: loc.locationId, ...data } });
      byKey.set(key, saved);
      applied.push({ variantId: v.id, locationId: loc.locationId, erpUpdatedAt: r.updatedAt });
      if (sameNumbers) {
        c.unchanged++;
        continue;
      }
      c.applied++;
      touched.add(v.id);
      const delta = r.onHand - (cur?.onHand ?? 0);
      if (delta !== 0) {
        moves.push({
          variantId: v.id,
          locationId: loc.locationId,
          delta,
          reason: 'erp.sync',
          referenceType: 'ErpSyncRun',
          referenceId: runId,
          // The ERP's own state names the movement: the same row read again can never move stock twice.
          idempotencyKey: `erp-stock:${v.id}:${loc.locationId}:${r.updatedAt.toISOString()}:${r.onHand}`,
          erpRef: r.warehouseId,
        });
      }
    }
    if (moves.length) c.movements = (await tx.stockMovement.createMany({ data: moves, skipDuplicates: true })).count;
    // PR 197/198: order holds the ERP now counts itself let go; new rows take their pool's holds (cartReserved).
    if (applied.length) {
      const now = nowOf(deps);
      await releaseHandedOver(tx, applied, now);
      await refreshPools(tx, await lockPools(tx, skus), now, kinds);
    }
    const re = await recomputeVariantStock(tx, storeId, [...touched], kinds);
    c.variantsChanged = re.variantsChanged;
    c.productsRefreshed = re.productsRefreshed;
    c.touched = [...touched];
    return c;
  }, TX);
}

/** Rows read but not applied for want of a match, as one line for the run row (the run itself still succeeded). A
 * retired SKU is expected and counts as done. */
function skippedSummary(r: StockPullResult): string | null {
  const parts = ([['UNKNOWN_SKU', r.unknownSku], ['UNMAPPED_WAREHOUSE', r.unmappedWarehouse], ['REJECTED_ROW', r.rejected]] as const).filter(([, n]) => n > 0);
  return parts.length ? parts.map(([k, n]) => `${k} ×${n}`).join(' · ') : null;
}

/**
 * What follows a change of the mirror (the pull, a single-product re-sync): low-stock alerts for the SKUs that changed
 * (PR 202) and the publish checklist of their products (PR 204). A failure here never undoes the stock change.
 */
export async function afterStockChange(deps: InventoryDeps, storeId: number, variantIds: string[]): Promise<{ lowStock: number; productsRechecked: number }> {
  if (!variantIds.length) return { lowStock: 0, productsRechecked: 0 };
  const skus = (await deps.db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { sku: true } })).map((v) => v.sku);
  const low = await evaluateLowStock(deps, { skus });
  const productsRechecked = await recheckProductsForStock(deps, storeId, variantIds);
  return { lowStock: low.raised + low.updated + low.resolved, productsRechecked };
}

export async function pullStock(deps: InventoryDeps, job: StockPullJob): Promise<StockPullResult> {
  const { storeId } = job;
  const result = blank();
  const link = await resolveErp(deps, storeId);
  if (behaviourOf('stock.pull', link) === 'skip') return { ...result, status: 'skipped', reason: link.state === 'none' ? 'ERP_NONE' : 'ERP_ON_PRACTICE' };

  const runId = await startRun(deps.db, storeId, 'stock.pull', nowOf(deps));
  result.runId = runId;
  const fail = async (e: unknown): Promise<StockPullResult> => {
    const text = errorText(e);
    await saveState(deps.db, storeId, 'stock', { lastError: text });
    await finishRun(deps.db, runId, { ok: false, itemsOk: result.applied + result.unchanged + result.stale, itemsFailed: result.unknownSku + result.unmappedWarehouse + result.rejected, error: text }, nowOf(deps));
    return { ...result, status: 'failed', complete: false, error: { code: errorCode(e), text } };
  };
  if (link.state === 'unavailable') return fail(new InventoryError('ERP_UNAVAILABLE', `${link.code}: ${link.reason}`));
  if (link.state === 'none') return { ...result, status: 'skipped', reason: 'ERP_NONE' };
  return run(deps, job, link, result, fail);
}

async function run(deps: InventoryDeps, job: StockPullJob, link: Extract<ErpLink, { api: unknown }>, result: StockPullResult, fail: (e: unknown) => Promise<StockPullResult>): Promise<StockPullResult> {
  const { storeId } = job;
  const runId = result.runId!;
  result.adapterMode = link.adapterMode;
  try {
    const policy = await retryPolicy(deps);
    const health = (await callErp(deps, policy, (o) => link.api.health(o))).value;
    await checkCompany(deps, link, health);

    const [pageSize, maxPages, overlapS, stockCode, kinds] = await Promise.all([
      setting(deps, null, 'erp.sync.pageSize'),
      setting(deps, null, 'erp.sync.maxPagesPerRun'),
      setting(deps, null, 'erp.sync.updatedSinceOverlapSeconds'),
      setting(deps, null, 'inventory.erp.stockLocationCode'),
      sellableKinds(deps),
    ]);
    const locations = await erpStockLocations(deps.db, stockCode);
    const state = await readState(deps.db, storeId, 'stock');
    const resume = job.full ? null : decodeResume(state?.cursor);
    const sinceDate = job.full ? null : resume ? (resume.since ? new Date(resume.since) : null) : state?.updatedSince ? new Date(state.updatedSince.getTime() - overlapS * 1000) : null;
    let cursor: string | null = resume?.cursor ?? null;
    let maxSeen: Date | null = job.full ? null : (state?.updatedSince ?? null);
    const touched = new Set<string>();

    for (;;) {
      const page = (await callErp(deps, policy, (o) => link.api.stock({ updatedSince: sinceDate, cursor, limit: pageSize, warehouseId: link.setup.erpWarehouseId }, o))).value;
      result.pages++;
      result.rows += page.items.length + page.rejected.length;
      result.rejected += page.rejected.length;
      const c = await applyPage(deps, storeId, runId, page.items, locations, kinds);
      for (const k of ['applied', 'unchanged', 'stale', 'unknownSku', 'retiredSku', 'unmappedWarehouse', 'movements', 'variantsChanged', 'productsRefreshed'] as const) result[k] += c[k];
      if (c.maxSeen && (!maxSeen || c.maxSeen > maxSeen)) maxSeen = c.maxSeen;
      for (const id of c.touched) touched.add(id);
      cursor = page.nextCursor;
      await saveState(deps.db, storeId, 'stock', { cursor: cursor ? encodeResume({ since: sinceDate ? sinceDate.toISOString() : null, cursor }) : null });
      if (!cursor) break;
      if (result.pages >= maxPages) {
        result.complete = false;
        break;
      }
    }

    const follow = await afterStockChange(deps, storeId, [...touched]);
    result.lowStock = follow.lowStock;
    result.productsRechecked = follow.productsRechecked;
    const at = nowOf(deps);
    await saveState(deps.db, storeId, 'stock', { ...(result.complete ? { cursor: null, updatedSince: maxSeen } : {}), lastSuccessAt: at, lastError: null });
    await finishRun(deps.db, runId, { ok: true, itemsOk: result.applied + result.unchanged + result.stale + result.retiredSku, itemsFailed: result.unknownSku + result.unmappedWarehouse + result.rejected, error: skippedSummary(result) }, at);
    return { ...result, status: 'succeeded' };
  } catch (e) {
    return fail(e);
  }
}

export interface LiveStock {
  sku: string;
  variantId: string | null;
  /** `erp` = asked the ERP just now; `mirror` = the shop's own copy. */
  source: 'erp' | 'mirror';
  /** Why the copy was used: ERP_NONE, ERP_ON_PRACTICE, ERP_UNAVAILABLE, UNKNOWN_SKU or the ERP error code. */
  reason: string | null;
  sellable: number;
}

/**
 * The checkout's last stock check for one SKU (PR 195; the reservation itself is PR 197/198). One quick try at the ERP
 * (`erp.liveCheck.timeoutSeconds`, never retried: a customer is waiting), else the mirror — it never fails for want of
 * an ERP (PR 499). ERP stock counts only in linked warehouses whose location is sellable; the shop's cart holds are
 * taken off.
 */
export async function liveStock(deps: InventoryDeps, storeId: number, sku: string): Promise<LiveStock> {
  const v = await deps.db.productVariant.findFirst({
    where: { storeId, sku: sku.trim(), archivedAt: null },
    select: { id: true, stockLevels: { select: { locationId: true, available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } } } },
  });
  if (!v) return { sku, variantId: null, source: 'mirror', reason: 'UNKNOWN_SKU', sellable: 0 };
  const kinds = await sellableKinds(deps);
  const mirror = (reason: string): LiveStock => ({ sku, variantId: v.id, source: 'mirror', reason, sellable: sellableUnits(v.stockLevels, kinds) });

  const link = await resolveErp(deps, storeId);
  if (behaviourOf('stock.liveCheck', link) !== 'run' || !('api' in link)) {
    return mirror(link.state === 'none' ? 'ERP_NONE' : link.state === 'mock' ? 'ERP_ON_PRACTICE' : 'ERP_UNAVAILABLE');
  }
  try {
    const [timeoutS, stockCode] = await Promise.all([setting(deps, null, 'erp.liveCheck.timeoutSeconds'), setting(deps, null, 'inventory.erp.stockLocationCode')]);
    const policy = { maxAttempts: 1, baseMs: 0, maxMs: 0, jitter: false, timeoutMs: timeoutS * 1000 };
    const rows = (await callErp(deps, policy, (o) => link.api.stockForSku(sku.trim(), o))).value;
    const locations = await erpStockLocations(deps.db, stockCode);
    let sellable = 0;
    for (const r of rows) {
      const loc = locations.get(r.warehouseId);
      if (!loc || !kinds.has(loc.kind)) continue;
      const held = v.stockLevels.find((l) => l.locationId === loc.locationId)?.cartReserved ?? 0;
      sellable += Math.max(0, r.available - held);
    }
    return { sku, variantId: v.id, source: 'erp', reason: null, sellable };
  } catch (e) {
    // The ERP (the master) has no stock row for this SKU: nothing of it can be sold.
    if (e instanceof ErpCallFailed && e.erp.code === 'NOT_FOUND') return { sku, variantId: v.id, source: 'erp', reason: 'NOT_FOUND', sellable: 0 };
    return mirror(errorCode(e));
  }
}
