// PR 203 — the stock count (audit) by barcode, with the variance and its reason (Blueprint A3.4: stock numbers are the
// ERP's; the shop counts and reports, it never adjusts).
//
// One count is one location of the shared pool (A4.4), so starting one needs `inventory.audit` for every store, like
// every change of the pool. The flow:
// 1. start — one open count per location at a time (AUDIT_OPEN otherwise).
// 2. scan — a code is looked up as a barcode, else as an SKU (the ERP key); an unknown code is kept as its own line
//    (nothing is guessed). Scanning the same item again adds to its line. At most `inventory.audit.maxQuantityPerScan`
//    pieces per scan and `inventory.audit.maxLines` lines per count.
// 3. review — the expected number of every line is frozen from the stock mirror (on hand at that location, the ERP's
//    number), and every SKU the mirror has there that nobody scanned gets a line with 0 counted. Scanning goes on while
//    in review (a forgotten shelf); a new line takes its expected number at once.
// 4. reasons — each line whose count differs gets a reason from `inventory.audit.reasons`.
// 5. complete — with `inventory.audit.requireReason` every differing line must have a reason (REASON_REQUIRED names
//    them). Completing records the result only: the stock stays the ERP's, and the variance goes to the ERP team as a
//    report (the export is PR 207's report). Nothing is deleted; a cancelled count stays as a row.
import { z } from 'zod';
import { allow, allowEveryStore, found, logChange, nowOf, parse, setting, TX, type Db, type InventoryDeps, type Tx, type Who } from './context';
import { InventoryError } from './errors';

export const AUDIT_STATUSES = ['COUNTING', 'REVIEW', 'COMPLETED', 'CANCELLED'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];
const OPEN: AuditStatus[] = ['COUNTING', 'REVIEW'];

export interface AuditLineView {
  id: string;
  barcode: string;
  variantId: string | null;
  sku: string | null;
  productName: { en: string; bn: string | null } | null;
  colour: string | null;
  size: string | null;
  expected: number;
  counted: number;
  /** counted − expected. */
  variance: number;
  reason: string | null;
}

export interface AuditView {
  id: string;
  locationId: string;
  location: { code: string; name: string; warehouseCode: string };
  status: AuditStatus;
  startedById: string | null;
  createdAt: string;
  completedAt: string | null;
  totals: { lines: number; expected: number; counted: number; over: number; short: number; differing: number; withoutReason: number; unknown: number };
  lines: AuditLineView[];
}

const lineInclude = { lines: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] } };

async function view(db: Db, id: string): Promise<AuditView> {
  const a = found(await db.stockAudit.findUnique({ where: { id }, include: lineInclude }), 'stock count');
  const loc = await db.inventoryLocation.findUniqueOrThrow({ where: { id: a.locationId }, select: { code: true, name: true, warehouse: { select: { code: true } } } });
  const variants = await db.productVariant.findMany({
    where: { id: { in: a.lines.flatMap((l) => (l.variantId ? [l.variantId] : [])) } },
    select: { id: true, sku: true, product: { select: { nameEn: true, nameBn: true } }, colour: { select: { nameEn: true } }, size: { select: { label: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: AuditLineView[] = a.lines.map((l) => {
    const v = l.variantId ? byId.get(l.variantId) : undefined;
    return {
      id: l.id,
      barcode: l.barcode,
      variantId: l.variantId,
      sku: v?.sku ?? null,
      productName: v ? { en: v.product.nameEn, bn: v.product.nameBn } : null,
      colour: v?.colour?.nameEn ?? null,
      size: v?.size?.label ?? null,
      expected: l.expectedQty,
      counted: l.countedQty,
      variance: l.countedQty - l.expectedQty,
      reason: l.reason,
    };
  });
  const differing = lines.filter((l) => l.variance !== 0);
  return {
    id: a.id,
    locationId: a.locationId,
    location: { code: loc.code, name: loc.name, warehouseCode: loc.warehouse.code },
    status: a.status as AuditStatus,
    startedById: a.startedById,
    createdAt: a.createdAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
    totals: {
      lines: lines.length,
      expected: lines.reduce((s, l) => s + l.expected, 0),
      counted: lines.reduce((s, l) => s + l.counted, 0),
      over: differing.filter((l) => l.variance > 0).reduce((s, l) => s + l.variance, 0),
      short: differing.filter((l) => l.variance < 0).reduce((s, l) => s - l.variance, 0),
      differing: differing.length,
      withoutReason: differing.filter((l) => !l.reason).length,
      unknown: lines.filter((l) => !l.variantId).length,
    },
    lines,
  };
}

/** The mirror's on-hand number of one SKU at one location: the freshest row of the pool (every store mirrors it). */
async function onHandAt(db: Db, locationId: string, skus: string[]): Promise<Map<string, number>> {
  const rows = await db.stockLevel.findMany({ where: { locationId, variant: { sku: { in: skus } } }, select: { onHand: true, erpUpdatedAt: true, variant: { select: { sku: true } } } });
  const best = new Map<string, { onHand: number; t: number }>();
  for (const r of rows) {
    const t = r.erpUpdatedAt?.getTime() ?? -Infinity;
    const cur = best.get(r.variant.sku);
    if (!cur || t > cur.t) best.set(r.variant.sku, { onHand: r.onHand, t });
  }
  return new Map([...best].map(([k, v]) => [k, v.onHand]));
}

/** The variant a count line stands for: one SKU is one item however many stores sell it (the lowest store's live variant). */
async function canonicalVariants(db: Db, where: { barcode?: string; sku?: string } | { skus: string[] }): Promise<{ id: string; sku: string }[]> {
  const rows = await db.productVariant.findMany({
    where: 'skus' in where ? { sku: { in: where.skus }, archivedAt: null } : { ...where, archivedAt: null },
    select: { id: true, sku: true },
    orderBy: [{ storeId: 'asc' }, { id: 'asc' }],
  });
  const seen = new Map<string, { id: string; sku: string }>();
  for (const r of rows) if (!seen.has(r.sku)) seen.set(r.sku, r);
  return [...seen.values()];
}

async function openAudit(tx: Tx, id: string): Promise<{ id: string; locationId: string; status: AuditStatus }> {
  // Locks the count row: two scanners on one count add up instead of overwriting each other.
  const rows = await tx.$queryRaw<{ id: string; locationId: string; status: string }[]>`SELECT "id", "locationId", "status" FROM "StockAudit" WHERE "id" = ${id}::uuid FOR UPDATE`;
  const a = found(rows[0], 'stock count');
  if (!OPEN.includes(a.status as AuditStatus)) throw new InventoryError('CONFLICT', 'this stock count is closed', [a.status]);
  return { ...a, status: a.status as AuditStatus };
}

const startInput = z.object({ locationId: z.uuid() }).strict();

/** Starts a count of one location (needs `inventory.audit` for every store). */
export async function startStockAudit(deps: InventoryDeps, who: Who, input: z.input<typeof startInput>): Promise<AuditView> {
  await allowEveryStore(deps, who, 'inventory.audit');
  const d = parse(startInput, input, 'stock count');
  const id = await deps.db.$transaction(async (tx) => {
    const loc = found(await tx.inventoryLocation.findUnique({ where: { id: d.locationId }, select: { id: true, archivedAt: true, warehouse: { select: { archivedAt: true } } } }), 'location');
    if (loc.archivedAt || loc.warehouse.archivedAt) throw new InventoryError('PARENT_ARCHIVED', 'the location is archived');
    // One open count per location; the location row lock makes two starts at once wait for each other.
    await tx.$queryRaw`SELECT "id" FROM "InventoryLocation" WHERE "id" = ${d.locationId}::uuid FOR UPDATE`;
    const open = await tx.stockAudit.findFirst({ where: { locationId: d.locationId, status: { in: OPEN } }, select: { id: true } });
    if (open) throw new InventoryError('AUDIT_OPEN', 'this location is being counted already', [open.id]);
    const a = await tx.stockAudit.create({ data: { locationId: d.locationId, status: 'COUNTING', startedById: who.actor.staffUserId ?? null } });
    await logChange(tx, who, { action: 'stock.audit.start', entityType: 'StockAudit', entityId: a.id, before: null, after: { locationId: d.locationId }, storeId: null });
    return a.id;
  }, TX);
  return view(deps.db, id);
}

export const scanInput = z.object({ code: z.string().trim().min(1).max(64), quantity: z.int().min(1).optional() }).strict();
export type ScanInput = z.input<typeof scanInput>;

/** One scan: the item's line goes up by `quantity` (default 1). */
export async function scanStockAudit(deps: InventoryDeps, who: Who, auditId: string, input: z.input<typeof scanInput>): Promise<{ lineId: string; known: boolean; counted: number; audit: AuditView }> {
  await allowEveryStore(deps, who, 'inventory.audit');
  const d = parse(scanInput, input, 'scan');
  const [maxQty, maxLines] = await Promise.all([setting(deps, null, 'inventory.audit.maxQuantityPerScan'), setting(deps, null, 'inventory.audit.maxLines')]);
  const qty = d.quantity ?? 1;
  if (qty > maxQty) throw new InventoryError('INVALID_INPUT', `at most ${maxQty} pieces in one scan`, [`quantity:max ${maxQty}`]);
  const r = await deps.db.$transaction(async (tx) => {
    const a = await openAudit(tx, auditId);
    const byBarcode = await canonicalVariants(tx, { barcode: d.code });
    const match = byBarcode.length ? byBarcode : await canonicalVariants(tx, { sku: d.code });
    // A barcode two SKUs share is ambiguous: kept as its own line, like an unknown code.
    const v = match.length === 1 ? match[0]! : null;
    const existing = await tx.stockAuditLine.findFirst({ where: v ? { auditId, variantId: v.id } : { auditId, variantId: null, barcode: d.code } });
    if (existing) {
      const line = await tx.stockAuditLine.update({ where: { id: existing.id }, data: { countedQty: { increment: qty } } });
      return { lineId: line.id, known: !!v, counted: line.countedQty };
    }
    if ((await tx.stockAuditLine.count({ where: { auditId } })) >= maxLines) throw new InventoryError('INVALID_INPUT', `at most ${maxLines} lines in one stock count`, [`lines:max ${maxLines}`]);
    // Expected numbers are frozen at review; a line made later (in review) takes its number now.
    const expected = v && a.status === 'REVIEW' ? ((await onHandAt(tx, a.locationId, [v.sku])).get(v.sku) ?? 0) : 0;
    const line = await tx.stockAuditLine.create({ data: { auditId, variantId: v?.id ?? null, barcode: d.code, expectedQty: expected, countedQty: qty } });
    return { lineId: line.id, known: !!v, counted: line.countedQty };
  }, TX);
  return { ...r, audit: await view(deps.db, auditId) };
}

/** Freezes the expected numbers from the mirror and adds a 0-counted line for every SKU there that nobody scanned. */
export async function reviewStockAudit(deps: InventoryDeps, who: Who, auditId: string): Promise<AuditView> {
  await allowEveryStore(deps, who, 'inventory.audit');
  const maxLines = await setting(deps, null, 'inventory.audit.maxLines');
  await deps.db.$transaction(async (tx) => {
    const a = await openAudit(tx, auditId);
    const lines = await tx.stockAuditLine.findMany({ where: { auditId }, select: { id: true, variantId: true, expectedQty: true } });
    const variantIds = lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
    const skuOf = new Map((await tx.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true } })).map((v) => [v.id, v.sku]));
    // Every SKU the mirror has at this location (any store's row), on hand or not.
    const there = await tx.stockLevel.findMany({ where: { locationId: a.locationId, onHand: { not: 0 } }, select: { variant: { select: { sku: true } } } });
    const skus = [...new Set([...skuOf.values(), ...there.map((r) => r.variant.sku)])];
    const onHand = await onHandAt(tx, a.locationId, skus);
    for (const l of lines) {
      if (!l.variantId) continue;
      const n = onHand.get(skuOf.get(l.variantId)!) ?? 0;
      if (n !== l.expectedQty) await tx.stockAuditLine.update({ where: { id: l.id }, data: { expectedQty: n } });
    }
    const scanned = new Set(skuOf.values());
    const missing = (await canonicalVariants(tx, { skus: skus.filter((s) => !scanned.has(s) && (onHand.get(s) ?? 0) !== 0) })).sort((x, y) => x.sku.localeCompare(y.sku));
    if (lines.length + missing.length > maxLines) throw new InventoryError('INVALID_INPUT', `at most ${maxLines} lines in one stock count`, [`lines:max ${maxLines}`]);
    if (missing.length) {
      const barcodes = new Map((await tx.productVariant.findMany({ where: { id: { in: missing.map((m) => m.id) } }, select: { id: true, barcode: true } })).map((v) => [v.id, v.barcode]));
      await tx.stockAuditLine.createMany({ data: missing.map((m) => ({ auditId, variantId: m.id, barcode: barcodes.get(m.id) ?? m.sku, expectedQty: onHand.get(m.sku) ?? 0, countedQty: 0 })) });
    }
    await tx.stockAudit.update({ where: { id: auditId }, data: { status: 'REVIEW' } });
    await logChange(tx, who, { action: 'stock.audit.review', entityType: 'StockAudit', entityId: auditId, before: { status: a.status }, after: { status: 'REVIEW', lines: lines.length + missing.length, added: missing.length }, storeId: null });
  }, TX);
  return view(deps.db, auditId);
}

export const reasonInput = z.object({ reason: z.string().trim().min(1).max(40).nullable() }).strict();
export type ReasonInput = z.input<typeof reasonInput>;

/** Sets (or clears) a line's reason; it must be one of `inventory.audit.reasons`. */
export async function setAuditLineReason(deps: InventoryDeps, who: Who, lineId: string, input: z.input<typeof reasonInput>): Promise<AuditView> {
  await allowEveryStore(deps, who, 'inventory.audit');
  const d = parse(reasonInput, input, 'reason');
  const reasons = await setting(deps, null, 'inventory.audit.reasons');
  if (d.reason && !reasons.some((r) => r.key === d.reason)) throw new InventoryError('INVALID_INPUT', 'not one of the stock count reasons', [`reason:${d.reason}`]);
  const auditId = await deps.db.$transaction(async (tx) => {
    const line = found(await tx.stockAuditLine.findUnique({ where: { id: lineId }, select: { id: true, auditId: true, reason: true } }), 'stock count line');
    await openAudit(tx, line.auditId);
    if (line.reason === d.reason) return line.auditId;
    await tx.stockAuditLine.update({ where: { id: lineId }, data: { reason: d.reason } });
    await logChange(tx, who, { action: 'stock.audit.reason', entityType: 'StockAuditLine', entityId: lineId, before: { reason: line.reason }, after: { reason: d.reason }, storeId: null });
    return line.auditId;
  }, TX);
  return view(deps.db, auditId);
}

/** Closes the count. Records the result only: the stock numbers stay the ERP's. */
export async function completeStockAudit(deps: InventoryDeps, who: Who, auditId: string): Promise<AuditView> {
  await allowEveryStore(deps, who, 'inventory.audit');
  const requireReason = await setting(deps, null, 'inventory.audit.requireReason');
  await deps.db.$transaction(async (tx) => {
    const a = await openAudit(tx, auditId);
    if (a.status !== 'REVIEW') throw new InventoryError('CONFLICT', 'review the count before completing it', [a.status]);
    const lines = await tx.stockAuditLine.findMany({ where: { auditId }, select: { id: true, barcode: true, expectedQty: true, countedQty: true, reason: true } });
    const open = lines.filter((l) => l.expectedQty !== l.countedQty && !l.reason);
    if (requireReason && open.length) throw new InventoryError('REASON_REQUIRED', 'every line that differs needs a reason', open.map((l) => `${l.id}:${l.barcode}`));
    await tx.stockAudit.update({ where: { id: auditId }, data: { status: 'COMPLETED', completedAt: nowOf(deps) } });
    const differing = lines.filter((l) => l.expectedQty !== l.countedQty);
    await logChange(tx, who, {
      action: 'stock.audit.complete',
      entityType: 'StockAudit',
      entityId: auditId,
      before: { status: a.status },
      after: { status: 'COMPLETED', lines: lines.length, differing: differing.length, variance: differing.reduce((s, l) => s + l.countedQty - l.expectedQty, 0) },
      storeId: null,
    });
  }, TX);
  return view(deps.db, auditId);
}

/** Stops a count without a result (kept as a row). */
export async function cancelStockAudit(deps: InventoryDeps, who: Who, auditId: string): Promise<AuditView> {
  await allowEveryStore(deps, who, 'inventory.audit');
  await deps.db.$transaction(async (tx) => {
    const a = await openAudit(tx, auditId);
    await tx.stockAudit.update({ where: { id: auditId }, data: { status: 'CANCELLED', completedAt: nowOf(deps) } });
    await logChange(tx, who, { action: 'stock.audit.cancel', entityType: 'StockAudit', entityId: auditId, before: { status: a.status }, after: { status: 'CANCELLED' }, storeId: null });
  }, TX);
  return view(deps.db, auditId);
}

/** One count with its lines (needs `inventory.read`). */
export async function getStockAudit(deps: InventoryDeps, who: Who, auditId: string): Promise<AuditView> {
  await allow(deps, who, 'inventory.read');
  return view(deps.db, auditId);
}

export interface AuditSummary {
  id: string;
  locationId: string;
  status: AuditStatus;
  lines: number;
  createdAt: string;
  completedAt: string | null;
}

/** The latest counts, open ones first (needs `inventory.read`). */
export async function listStockAudits(deps: InventoryDeps, who: Who, opts: { limit?: number } = {}): Promise<AuditSummary[]> {
  await allow(deps, who, 'inventory.read');
  const limit = opts.limit ?? (await setting(deps, null, 'inventory.admin.listSize'));
  const rows = await deps.db.stockAudit.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, include: { _count: { select: { lines: true } } } });
  return rows
    .map((a) => ({ id: a.id, locationId: a.locationId, status: a.status as AuditStatus, lines: a._count.lines, createdAt: a.createdAt.toISOString(), completedAt: a.completedAt?.toISOString() ?? null }))
    .sort((x, y) => Number(OPEN.includes(y.status)) - Number(OPEN.includes(x.status)));
}
