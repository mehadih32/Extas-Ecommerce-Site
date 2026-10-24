// PR 204 — the product publishing queue driven by real ERP stock (Blueprint A3.4: variants and stock come from the
// ERP; the "Ready to publish" queue, PR 35, holds new ERP styles and failing checklists).
//
// - After every stock pull the products whose ERP stock changed run their publish checklist again
//   (`inventory.publish.recheckAfterPull`), so a draft whose stock arrives moves to "ready" by itself and a live product
//   whose stock is gone shows up as failing — the queue follows the ERP, nobody has to press "recheck". The checklist's
//   `sellableStock` check (catalogue health.ts) reads the stock mirror itself; it is a setting like every check.
// - `stockQueue` is the queue as the stock page shows it: open items with the sellable pieces each product has now,
//   the ones with stock first. Products never checked yet are checked first, as on the Products queue page.
// - `newErpStyles` lists the ERP's styles the shop does not have yet (SKUs not in this store, retired SKUs count as
//   known: they are never reused), grouped by style — the start of the queue for a new ERP style. On the practice ERP
//   it lists practice styles, marked so; with no ERP it is empty (PR 499).
import { SYSTEM } from '@extas/auth';
import { checkProduct, queueUnchecked, type CatalogueDeps } from '@extas/catalogue';
import { allow, setting, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { behaviourOf, resolveErp } from './guard';
import { sellableKinds } from './locations';
import { checkCompany } from './mapping';
import { sellableUnits } from './stock';
import { callErp, retryPolicy } from './sync';

const catalogueDeps = (deps: InventoryDeps): CatalogueDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/** Runs the publish checklist again for the products of these variants (in this store). */
export async function recheckProductsForStock(deps: InventoryDeps, storeId: number, variantIds: string[]): Promise<number> {
  if (!variantIds.length || !(await setting(deps, null, 'inventory.publish.recheckAfterPull'))) return 0;
  const products = await deps.db.productVariant.findMany({ where: { storeId, id: { in: variantIds }, product: { archivedAt: null } }, select: { productId: true }, distinct: ['productId'] });
  const who = { actor: SYSTEM, storeId, ctx: { source: 'erp-sync' } };
  let n = 0;
  for (const p of products) {
    await checkProduct(catalogueDeps(deps), who, p.productId);
    n++;
  }
  return n;
}

export interface StockQueueItem {
  productId: string;
  name: { en: string; bn: string | null };
  status: string;
  reason: string;
  /** The checklist passed when it last ran. */
  ready: boolean;
  /** Pieces the shop can sell now (every live variant, sellable locations, after holds). */
  sellable: number;
  since: string;
}

/** The open publish queue items of this store with their real stock, the ones with stock first (`inventory.read`). */
export async function stockQueue(deps: InventoryDeps, who: Who, opts: { limit?: number } = {}): Promise<{ total: number; items: StockQueueItem[] }> {
  await allow(deps, who, 'inventory.read');
  const [limit, kinds] = await Promise.all([opts.limit ?? setting(deps, null, 'inventory.admin.listSize'), sellableKinds(deps)]);
  // Products never checked yet join the queue here too, so this list does not wait for the Products queue to be opened.
  await queueUnchecked(catalogueDeps(deps), { actor: SYSTEM, storeId: who.storeId, ctx: { source: 'stock-page' } }, limit);
  const where = { storeId: who.storeId, status: { in: ['OPEN' as const, 'IN_PROGRESS' as const] } };
  const [total, items] = await Promise.all([deps.db.publishQueueItem.count({ where }), deps.db.publishQueueItem.findMany({ where, orderBy: { createdAt: 'asc' } })]);
  const products = await deps.db.product.findMany({
    where: { storeId: who.storeId, id: { in: items.map((i) => i.productId) } },
    select: {
      id: true,
      nameEn: true,
      nameBn: true,
      status: true,
      variants: {
        where: { archivedAt: null },
        select: { stockLevels: { select: { available: true, cartReserved: true, onHand: true, location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } } } } },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: StockQueueItem[] = items.flatMap((i) => {
    const p = byId.get(i.productId);
    if (!p) return [];
    const checklist = (i.checklist ?? {}) as { ready?: unknown };
    return [
      {
        productId: p.id,
        name: { en: p.nameEn, bn: p.nameBn },
        status: p.status,
        reason: i.reason,
        ready: checklist.ready === true,
        sellable: p.variants.reduce((s, v) => s + sellableUnits(v.stockLevels, kinds), 0),
        since: i.createdAt.toISOString(),
      },
    ];
  });
  rows.sort((a, b) => Number(b.sellable > 0) - Number(a.sellable > 0) || Number(b.ready) - Number(a.ready) || a.since.localeCompare(b.since));
  return { total, items: rows.slice(0, limit) };
}

export interface NewErpStyle {
  styleCode: string | null;
  styleName: string | null;
  skus: { sku: string; color: string | null; size: string | null }[];
}

export interface NewErpStyles {
  state: 'skipped' | 'practice' | 'run';
  reason: 'ERP_NONE' | null;
  styles: NewErpStyle[];
  /** The page cap stopped the reading; more may exist. */
  truncated: boolean;
}

/** The ERP's active styles the shop does not have yet (needs `inventory.read`). */
export async function newErpStyles(deps: InventoryDeps, who: Who): Promise<NewErpStyles> {
  await allow(deps, who, 'inventory.read');
  const link = await resolveErp(deps, who.storeId);
  const b = behaviourOf('variants.discover', link);
  if (link.state === 'unavailable') throw new InventoryError('ERP_UNAVAILABLE', link.reason, [link.code]);
  if (b === 'skip' || !('api' in link)) return { state: 'skipped', reason: 'ERP_NONE', styles: [], truncated: false };
  const policy = await retryPolicy(deps);
  if (link.state === 'connected') await checkCompany(deps, link, (await callErp(deps, policy, (o) => link.api.health(o))).value);
  const [pageSize, maxPages] = await Promise.all([setting(deps, null, 'erp.sync.pageSize'), setting(deps, null, 'inventory.publish.discoverMaxPages')]);
  const known = new Set((await deps.db.productVariant.findMany({ where: { storeId: who.storeId }, select: { sku: true } })).map((v) => v.sku));
  const styles = new Map<string, NewErpStyle>();
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;
  for (;;) {
    const page = (await callErp(deps, policy, (o) => link.api.variants({ cursor, limit: pageSize }, o))).value;
    pages++;
    for (const v of page.items) {
      if (!v.active || known.has(v.sku)) continue;
      const key = v.styleCode ?? '';
      const s = styles.get(key) ?? { styleCode: v.styleCode, styleName: v.styleName, skus: [] };
      s.skus.push({ sku: v.sku, color: v.color, size: v.size });
      styles.set(key, s);
    }
    cursor = page.nextCursor;
    if (!cursor) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
  }
  return {
    state: link.state === 'mock' ? 'practice' : 'run',
    reason: null,
    styles: [...styles.values()].sort((a, b) => (a.styleCode ?? '').localeCompare(b.styleCode ?? '')),
    truncated,
  };
}
