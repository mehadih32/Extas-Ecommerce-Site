// PR 207 — the stock movement report, reconciled against the ERP.
//
// The report (`stockMovementReport`, needs `inventory.read`): for a time range, per variant and location of this store,
// what came in, what went out and the net — from StockMovement, the append-only ledger every change of on-hand writes
// (one row per change, its idempotency key from the ERP's own state, so a row read twice is counted once). Beside it the
// ledger is checked against the mirror: the sum of every movement of a row must equal its on-hand now; a row where it
// does not is marked (`ledgerMatches: false`) — something changed the mirror without a movement.
//
// The reconciliation (`reconcileWithErp`, needs `inventory.sync`; the job `inventory.erp.reconcile` every
// `inventory.reconcile.everyHours`): every stock row of the ERP is read and compared with the mirror. It changes
// nothing — it reports, the stock pull or a re-sync (PR 206) fixes. The kinds of difference:
// - MISSING_IN_SHOP   the ERP has stock of a known SKU in a linked warehouse; the mirror has no row there;
// - MISSING_IN_ERP    the mirror has stock in a linked location the ERP no longer lists;
// - ON_HAND_DIFFERS   on-hand differs;
// - RESERVED_DIFFERS  on-hand agrees but the ERP's reserved (and so available) differs.
// Unknown SKUs (new ERP styles) are counted, not differences: they belong to the publishing queue (PR 204). The run is
// an ErpSyncRun (`stock.reconcile`) with the counts, so the health panel shows the last check.
import { z } from 'zod';
import type { ErpStockRow } from '@extas/adapters';
import { allow, nowOf, parse, setting, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';
import { behaviourOf, resolveErp } from './guard';
import { checkCompany } from './mapping';
import { erpStockLocations } from './stock-pull';
import { callErp, errorCode, errorText, finishRun, retryPolicy, startRun } from './sync';

export const movementReportInput = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    sku: z.string().trim().min(1).max(64).optional(),
    locationId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => new Date(v.from) < new Date(v.to), { message: 'from must be before to', path: ['from'] });

export interface MovementRow {
  variantId: string;
  sku: string;
  locationId: string;
  locationCode: string;
  warehouseCode: string;
  /** On hand by the ledger at the start of the range. */
  opening: number;
  in: number;
  out: number;
  net: number;
  /** opening + net. */
  closing: number;
  movements: number;
  /** The mirror's on-hand now, and whether the whole ledger adds up to it. */
  onHandNow: number;
  ledgerMatches: boolean;
}

export interface MovementReport {
  from: string;
  to: string;
  rows: MovementRow[];
  totals: { in: number; out: number; net: number; movements: number; mismatched: number };
  /** More rows exist than `inventory.report.maxRows`. */
  truncated: boolean;
}

type Sums = Map<string, { sum: number; n: number }>;
const k2 = (variantId: string, locationId: string) => `${variantId}:${locationId}`;

export async function stockMovementReport(deps: InventoryDeps, who: Who, input: z.input<typeof movementReportInput>): Promise<MovementReport> {
  await allow(deps, who, 'inventory.read');
  const d = parse(movementReportInput, input, 'report');
  const from = new Date(d.from);
  const to = new Date(d.to);
  const maxRows = await setting(deps, null, 'inventory.report.maxRows');
  const db = deps.db;
  const variants = await db.productVariant.findMany({ where: { storeId: who.storeId, ...(d.sku ? { sku: d.sku } : {}) }, select: { id: true, sku: true } });
  const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
  const base = { variantId: { in: [...skuOf.keys()] }, ...(d.locationId ? { locationId: d.locationId } : {}) };
  const sums = async (where: object): Promise<Sums> => {
    const g = await db.stockMovement.groupBy({ by: ['variantId', 'locationId'], where: { ...base, ...where }, _sum: { delta: true }, _count: { _all: true } });
    return new Map(g.map((x) => [k2(x.variantId, x.locationId), { sum: x._sum.delta ?? 0, n: x._count._all }]));
  };
  const [before, ins, outs, all] = await Promise.all([
    sums({ createdAt: { lt: from } }),
    sums({ createdAt: { gte: from, lt: to }, delta: { gt: 0 } }),
    sums({ createdAt: { gte: from, lt: to }, delta: { lt: 0 } }),
    sums({}),
  ]);
  const levels = await db.stockLevel.findMany({ where: base, select: { variantId: true, locationId: true, onHand: true } });
  const onHand = new Map(levels.map((l) => [k2(l.variantId, l.locationId), l.onHand]));
  // Rows with a movement in the range, plus rows whose ledger does not add up (shown whatever the range).
  const keys = new Set([...ins.keys(), ...outs.keys()]);
  for (const key of new Set([...all.keys(), ...onHand.keys()])) if ((all.get(key)?.sum ?? 0) !== (onHand.get(key) ?? 0)) keys.add(key);
  const sorted = [...keys].map((key) => key.split(':') as [string, string]).sort((a, b) => skuOf.get(a[0])!.localeCompare(skuOf.get(b[0])!) || a[1].localeCompare(b[1]));
  const page = sorted.slice(0, maxRows);
  const locs = await db.inventoryLocation.findMany({ where: { id: { in: [...new Set(page.map(([, l]) => l))] } }, select: { id: true, code: true, warehouse: { select: { code: true } } } });
  const locOf = new Map(locs.map((l) => [l.id, l]));
  const rows: MovementRow[] = page.map(([variantId, locationId]) => {
    const key = k2(variantId, locationId);
    const opening = before.get(key)?.sum ?? 0;
    const i = ins.get(key)?.sum ?? 0;
    const o = Math.abs(outs.get(key)?.sum ?? 0);
    const now = onHand.get(key) ?? 0;
    return {
      variantId,
      sku: skuOf.get(variantId)!,
      locationId,
      locationCode: locOf.get(locationId)?.code ?? '',
      warehouseCode: locOf.get(locationId)?.warehouse.code ?? '',
      opening,
      in: i,
      out: o,
      net: i - o,
      closing: opening + i - o,
      movements: (ins.get(key)?.n ?? 0) + (outs.get(key)?.n ?? 0),
      onHandNow: now,
      ledgerMatches: (all.get(key)?.sum ?? 0) === now,
    };
  });
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
    totals: {
      in: rows.reduce((s, r) => s + r.in, 0),
      out: rows.reduce((s, r) => s + r.out, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
      movements: rows.reduce((s, r) => s + r.movements, 0),
      mismatched: rows.filter((r) => !r.ledgerMatches).length,
    },
    truncated: sorted.length > page.length,
  };
}

export const MISMATCH_KINDS = ['MISSING_IN_SHOP', 'MISSING_IN_ERP', 'ON_HAND_DIFFERS', 'RESERVED_DIFFERS'] as const;
export type MismatchKind = (typeof MISMATCH_KINDS)[number];

export interface Mismatch {
  kind: MismatchKind;
  sku: string;
  erpWarehouseId: string;
  locationId: string;
  erp: { onHand: number; reserved: number; available: number; updatedAt: string } | null;
  shop: { onHand: number; reserved: number; available: number; updatedAt: string | null } | null;
}

/** Compares the ERP's rows with the mirror's (pure, for the tests and the job). */
export function compareStock(
  erp: ErpStockRow[],
  shop: { sku: string; locationId: string; onHand: number; reserved: number; available: number; erpUpdatedAt: Date | null }[],
  locations: Map<string, { locationId: string }>,
  knownSkus: Set<string>,
  erpComplete: boolean,
): { mismatches: Mismatch[]; matched: number; unknownSku: number; unmappedWarehouse: number } {
  const erpOf = new Map<string, string>();
  for (const [wh, l] of locations) erpOf.set(l.locationId, wh);
  const shopByKey = new Map(shop.map((s) => [k2(s.sku, s.locationId), s]));
  const seen = new Set<string>();
  const mismatches: Mismatch[] = [];
  let matched = 0;
  let unknownSku = 0;
  let unmappedWarehouse = 0;
  const shopView = (s: (typeof shop)[number]) => ({ onHand: s.onHand, reserved: s.reserved, available: s.available, updatedAt: s.erpUpdatedAt?.toISOString() ?? null });
  for (const r of erp) {
    const loc = locations.get(r.warehouseId);
    if (!loc) {
      unmappedWarehouse++;
      continue;
    }
    if (!knownSkus.has(r.sku)) {
      unknownSku++;
      continue;
    }
    const key = k2(r.sku, loc.locationId);
    seen.add(key);
    const s = shopByKey.get(key);
    const e = { onHand: r.onHand, reserved: r.reserved, available: r.available, updatedAt: r.updatedAt.toISOString() };
    const base = { sku: r.sku, erpWarehouseId: r.warehouseId, locationId: loc.locationId, erp: e };
    if (!s) {
      if (r.onHand !== 0 || r.reserved !== 0) mismatches.push({ ...base, kind: 'MISSING_IN_SHOP', shop: null });
      else matched++;
    } else if (s.onHand !== r.onHand) mismatches.push({ ...base, kind: 'ON_HAND_DIFFERS', shop: shopView(s) });
    else if (s.reserved !== r.reserved || s.available !== r.available) mismatches.push({ ...base, kind: 'RESERVED_DIFFERS', shop: shopView(s) });
    else matched++;
  }
  // Only a complete read can say the ERP has no row.
  if (erpComplete) {
    for (const s of shop) {
      const wh = erpOf.get(s.locationId);
      if (!wh || seen.has(k2(s.sku, s.locationId)) || s.onHand === 0) continue;
      mismatches.push({ kind: 'MISSING_IN_ERP', sku: s.sku, erpWarehouseId: wh, locationId: s.locationId, erp: null, shop: shopView(s) });
    }
  }
  mismatches.sort((a, b) => a.sku.localeCompare(b.sku) || a.locationId.localeCompare(b.locationId));
  return { mismatches, matched, unknownSku, unmappedWarehouse };
}

export interface ReconcileResult {
  status: 'skipped' | 'succeeded' | 'failed';
  reason: 'ERP_NONE' | 'ERP_ON_PRACTICE' | null;
  runId: string | null;
  rows: number;
  matched: number;
  unknownSku: number;
  unmappedWarehouse: number;
  /** The page cap stopped the read: MISSING_IN_ERP is not judged. */
  complete: boolean;
  counts: Record<MismatchKind, number>;
  /** The first `inventory.report.maxRows` differences. */
  mismatches: Mismatch[];
  error: { code: string; text: string } | null;
}

const zeroCounts = (): Record<MismatchKind, number> => ({ MISSING_IN_SHOP: 0, MISSING_IN_ERP: 0, ON_HAND_DIFFERS: 0, RESERVED_DIFFERS: 0 });

/** Checks every stock number of this store against the ERP (staff need `inventory.sync`; the job runs as SYSTEM). */
export async function reconcileWithErp(deps: InventoryDeps, who: Who): Promise<ReconcileResult> {
  await allow(deps, who, 'inventory.sync');
  const storeId = who.storeId;
  const out: ReconcileResult = { status: 'succeeded', reason: null, runId: null, rows: 0, matched: 0, unknownSku: 0, unmappedWarehouse: 0, complete: true, counts: zeroCounts(), mismatches: [], error: null };
  const link = await resolveErp(deps, storeId);
  const b = behaviourOf('stock.reconcile', link);
  if (b === 'skip') return { ...out, status: 'skipped', reason: link.state === 'none' ? 'ERP_NONE' : 'ERP_ON_PRACTICE' };
  const runId = await startRun(deps.db, storeId, 'stock.reconcile', nowOf(deps));
  out.runId = runId;
  const fail = async (e: unknown): Promise<ReconcileResult> => {
    const text = errorText(e);
    await finishRun(deps.db, runId, { ok: false, itemsOk: out.matched, itemsFailed: 0, error: text }, nowOf(deps));
    return { ...out, status: 'failed', complete: false, error: { code: errorCode(e), text } };
  };
  if (!('api' in link)) return fail(link.state === 'unavailable' ? new InventoryError('ERP_UNAVAILABLE', `${link.code}: ${link.reason}`) : new InventoryError('ERP_NOT_CONNECTED', 'no ERP'));
  try {
    const policy = await retryPolicy(deps);
    await checkCompany(deps, link, (await callErp(deps, policy, (o) => link.api.health(o))).value);
    const [pageSize, maxPages, stockCode, maxRows] = await Promise.all([
      setting(deps, null, 'erp.sync.pageSize'),
      setting(deps, null, 'erp.sync.maxPagesPerRun'),
      setting(deps, null, 'inventory.erp.stockLocationCode'),
      setting(deps, null, 'inventory.report.maxRows'),
    ]);
    const locations = await erpStockLocations(deps.db, stockCode);
    const erp: ErpStockRow[] = [];
    let cursor: string | null = null;
    for (let pages = 1; ; pages++) {
      const page = (await callErp(deps, policy, (o) => link.api.stock({ updatedSince: null, cursor, limit: pageSize, warehouseId: link.setup.erpWarehouseId }, o))).value;
      erp.push(...page.items);
      cursor = page.nextCursor;
      if (!cursor) break;
      if (pages >= maxPages) {
        out.complete = false;
        break;
      }
    }
    out.rows = erp.length;
    // The store's ERP warehouse limits the check, as it limits the pull.
    const linked = new Map([...locations].filter(([wh]) => !link.setup.erpWarehouseId || wh === link.setup.erpWarehouseId));
    const variants = await deps.db.productVariant.findMany({ where: { storeId, archivedAt: null }, select: { id: true, sku: true } });
    const skuOf = new Map(variants.map((v) => [v.id, v.sku]));
    const levels = await deps.db.stockLevel.findMany({
      where: { variantId: { in: [...skuOf.keys()] }, locationId: { in: [...linked.values()].map((l) => l.locationId) } },
      select: { variantId: true, locationId: true, onHand: true, reserved: true, available: true, erpUpdatedAt: true },
    });
    const c = compareStock(
      erp,
      levels.map((l) => ({ ...l, sku: skuOf.get(l.variantId)! })),
      linked,
      new Set(skuOf.values()),
      out.complete,
    );
    out.matched = c.matched;
    out.unknownSku = c.unknownSku;
    out.unmappedWarehouse = c.unmappedWarehouse;
    for (const m of c.mismatches) out.counts[m.kind]++;
    out.mismatches = c.mismatches.slice(0, maxRows);
    const summary = MISMATCH_KINDS.filter((k) => out.counts[k] > 0).map((k) => `${k} ×${out.counts[k]}`).join(' · ') || null;
    await finishRun(deps.db, runId, { ok: true, itemsOk: c.matched, itemsFailed: c.mismatches.length, error: summary }, nowOf(deps));
    return out;
  } catch (e) {
    return fail(e);
  }
}
