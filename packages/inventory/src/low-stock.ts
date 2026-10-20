// PR 202 — low-stock alerts per variant, raised once on the shared number (Blueprint A4.4: "stock alerts and restock
// suggestions are raised once on the shared number, not three times"; Bhandari B03).
//
// - The shared number of an SKU: what can be sold of it over every live location of a sellable kind — the ERP's
//   available minus the shop's holds, pool by pool, counted once however many stores sell the SKU.
// - Threshold: `inventory.lowStock.skuThresholds[sku]`, else `inventory.lowStock.defaultThreshold`. At or below it the
//   SKU has one open LowStockAlert (on the variant of the lowest store id that sells it); above it the alert is
//   resolved. A change of the number while low updates the open alert; nothing is ever deleted.
// - Only SKUs the stock mirror knows (a row in a sellable location) are looked at: a variant that never had stock is
//   not "low".
// - The alert is recorded only. Sending it (Telegram, e-mail) is the notification stage's job; it sets `notifiedAt`.
// - Runs after every stock pull for the SKUs that changed, and as the job `inventory.lowStock.evaluate` over every SKU
//   (every `inventory.lowStock.sweepMinutes`).
import type { LocationKindName } from '@extas/settings';
import { allow, nowOf, setting, type Db, type InventoryDeps, type Who } from './context';
import { sellableKinds } from './locations';
import { poolsOf, type PoolRow } from './reservations';

/** Sellable pieces per SKU on the shared pool. */
export function sharedSellable(rows: PoolRow[], kinds: Set<LocationKindName>): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of poolsOf(rows).values()) {
    if (!p.live || !kinds.has(p.kind)) continue;
    const held = Math.max(...p.rows.map((r) => r.cartReserved));
    out.set(p.sku, (out.get(p.sku) ?? 0) + Math.max(0, p.available - held));
  }
  return out;
}

/** Low or not, for one SKU. */
export function lowStockDecision(sellable: number, threshold: number): boolean {
  return sellable <= threshold;
}

async function poolRows(db: Db, skus: string[] | null): Promise<PoolRow[]> {
  const rows = await db.stockLevel.findMany({
    where: skus ? { variant: { sku: { in: skus } } } : {},
    select: {
      id: true,
      variantId: true,
      locationId: true,
      available: true,
      cartReserved: true,
      erpUpdatedAt: true,
      variant: { select: { sku: true, storeId: true } },
      location: { select: { kind: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    variantId: r.variantId,
    locationId: r.locationId,
    available: r.available,
    cartReserved: r.cartReserved,
    erpUpdatedAt: r.erpUpdatedAt,
    sku: r.variant.sku,
    storeId: r.variant.storeId,
    kind: r.location.kind,
    live: !r.location.archivedAt && !r.location.warehouse.archivedAt,
  }));
}

export interface LowStockRun {
  checked: number;
  raised: number;
  updated: number;
  resolved: number;
  open: number;
}

/** Raises, updates and resolves alerts for these SKUs (all SKUs when omitted). */
export async function evaluateLowStock(deps: InventoryDeps, opts: { skus?: string[] } = {}): Promise<LowStockRun> {
  const out: LowStockRun = { checked: 0, raised: 0, updated: 0, resolved: 0, open: 0 };
  if (!(await setting(deps, null, 'inventory.lowStock.enabled'))) return out;
  if (opts.skus && !opts.skus.length) return out;
  const [def, own, kinds] = await Promise.all([setting(deps, null, 'inventory.lowStock.defaultThreshold'), setting(deps, null, 'inventory.lowStock.skuThresholds'), sellableKinds(deps)]);
  const db = deps.db;
  const rows = await poolRows(db, opts.skus ?? null);
  const known = new Set(rows.filter((r) => r.live && kinds.has(r.kind)).map((r) => r.sku));
  const sellable = sharedSellable(rows, kinds);
  const variants = await db.productVariant.findMany({ where: { sku: { in: [...known] } }, select: { id: true, sku: true, storeId: true, archivedAt: true }, orderBy: [{ storeId: 'asc' }, { id: 'asc' }] });
  const canonical = new Map<string, string>();
  for (const v of variants) if (!v.archivedAt && !canonical.has(v.sku)) canonical.set(v.sku, v.id);
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
  const open = await db.lowStockAlert.findMany({ where: { resolvedAt: null, variantId: { in: variants.map((v) => v.id) } }, orderBy: { createdAt: 'asc' } });
  const openBySku = new Map<string, (typeof open)[number]>();
  for (const a of open) if (!openBySku.has(skuOf.get(a.variantId)!)) openBySku.set(skuOf.get(a.variantId)!, a);
  const now = nowOf(deps);

  for (const sku of known) {
    const variantId = canonical.get(sku);
    const current = openBySku.get(sku);
    out.checked++;
    if (!variantId) {
      // Every variant of the SKU is retired: an open alert has nothing left to say.
      if (current) out.resolved += (await db.lowStockAlert.updateMany({ where: { id: current.id, resolvedAt: null }, data: { resolvedAt: now } })).count;
      continue;
    }
    const threshold = own[sku] ?? def;
    const n = sellable.get(sku) ?? 0;
    if (lowStockDecision(n, threshold)) {
      if (!current) {
        await db.lowStockAlert.create({ data: { variantId, threshold, available: n } });
        out.raised++;
      } else if (current.available !== n || current.threshold !== threshold) {
        await db.lowStockAlert.update({ where: { id: current.id }, data: { available: n, threshold } });
        out.updated++;
      }
    } else if (current) {
      out.resolved += (await db.lowStockAlert.updateMany({ where: { id: current.id, resolvedAt: null }, data: { resolvedAt: now } })).count;
    }
  }
  out.open = await db.lowStockAlert.count({ where: { resolvedAt: null } });
  return out;
}

export interface LowStockItem {
  alertId: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: { en: string; bn: string | null };
  colour: string | null;
  size: string | null;
  available: number;
  threshold: number;
  since: string;
  notified: boolean;
}

/** The open alerts, lowest first (needs `inventory.read`). */
export async function listLowStock(deps: InventoryDeps, who: Who, opts: { limit?: number } = {}): Promise<{ total: number; items: LowStockItem[] }> {
  await allow(deps, who, 'inventory.read');
  const limit = opts.limit ?? (await setting(deps, null, 'inventory.admin.listSize'));
  const [total, alerts] = await Promise.all([
    deps.db.lowStockAlert.count({ where: { resolvedAt: null } }),
    deps.db.lowStockAlert.findMany({ where: { resolvedAt: null }, orderBy: [{ available: 'asc' }, { createdAt: 'asc' }], take: limit }),
  ]);
  const variants = await deps.db.productVariant.findMany({
    where: { id: { in: alerts.map((a) => a.variantId) } },
    select: { id: true, sku: true, productId: true, product: { select: { nameEn: true, nameBn: true } }, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  return {
    total,
    items: alerts.flatMap((a) => {
      const v = byId.get(a.variantId);
      if (!v) return [];
      return [
        {
          alertId: a.id,
          variantId: v.id,
          sku: v.sku,
          productId: v.productId,
          productName: { en: v.product.nameEn, bn: v.product.nameBn },
          colour: v.colour?.nameEn ?? null,
          size: v.size?.label ?? null,
          available: a.available,
          threshold: a.threshold,
          since: a.createdAt.toISOString(),
          notified: a.notifiedAt != null,
        },
      ];
    }),
  };
}
