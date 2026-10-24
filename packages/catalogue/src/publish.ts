// PR 21, 35 — publishing: nothing reaches the storefront until its checklist passes (Blueprint B7.4).
// - publishProduct() runs the checklist again at that moment (health.ts) and refuses with CHECKLIST_FAILED while any
//   blocking check fails; there is no way around it. Publishing shows the product's category listings; unpublishing
//   hides them and keeps the page (the ghost archive, PR 36, decides what the page shows).
// - The "Ready to publish" queue is PublishQueueItem: one open item per product that is not on the shop (reason `new`
//   or `unpublished`), and one for a live product whose checklist started failing (`live-failing`, never taken off by
//   itself: that is the owner's call). Publishing closes the item (DONE); archiving dismisses it. Items are never
//   deleted.
// - checkProduct() stores the health score on the product and moves a draft to READY_TO_PUBLISH (and back) as its
//   checklist passes or fails.
// - Bulk actions run product by product and report each one; one refusal never stops the rest.
// Status changes need `catalogue.publish`; every one writes the audit log in the same transaction.
import { z } from 'zod';
import { requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { allow, found, logChange, parse, setting, TX, type CatalogueDeps, type Db, type Who } from './context';
import { CatalogueError, isCatalogueError } from './errors';
import { productReadiness, readStoredHealth, type Readiness, type StoredHealth } from './health';
import { updateProduct } from './products';

export type QueueReason = 'new' | 'unpublished' | 'live-failing';

async function allowPublish(deps: CatalogueDeps, who: Who): Promise<void> {
  await allow(deps, who, 'catalogue.read');
  await requirePermission(deps.db, who.actor, 'catalogue.publish', { storeId: who.storeId });
}

const storedOf = (r: Readiness): StoredHealth => ({ checkedAt: r.checkedAt, ready: r.ready, checks: r.checks });
const sameHealth = (a: StoredHealth | null, b: StoredHealth) => !!a && a.ready === b.ready && JSON.stringify(a.checks) === JSON.stringify(b.checks);

/** Keeps the product's open queue item in step with its status and checklist. */
async function syncQueue(tx: Db, who: Who, p: { id: string; status: string; archivedAt: Date | null }, r: Readiness, reason: QueueReason | null, now: Date): Promise<void> {
  const open = await tx.publishQueueItem.findMany({ where: { storeId: who.storeId, productId: p.id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'asc' } });
  const close = (status: 'DONE' | 'DISMISSED') =>
    open.length ? tx.publishQueueItem.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status, resolvedById: who.actor.staffUserId, resolvedAt: now } }) : null;
  const checklist = storedOf(r) as unknown as Prisma.InputJsonValue;
  if (p.archivedAt) return void (await close('DISMISSED'));
  const want: QueueReason | null = p.status === 'PUBLISHED' ? (r.ready ? null : 'live-failing') : (reason ?? (open[0]?.reason as QueueReason | undefined) ?? 'new');
  if (!want) return void (await close('DONE'));
  const keep = open.find((o) => o.reason === want) ?? (p.status !== 'PUBLISHED' ? open.find((o) => o.reason !== 'live-failing') : undefined);
  if (keep) {
    await tx.publishQueueItem.update({ where: { id: keep.id }, data: { reason: want, checklist } });
    const others = open.filter((o) => o.id !== keep.id).map((o) => o.id);
    if (others.length) await tx.publishQueueItem.updateMany({ where: { id: { in: others } }, data: { status: 'DONE', resolvedById: who.actor.staffUserId, resolvedAt: now } });
  } else {
    await close('DONE');
    await tx.publishQueueItem.create({ data: { storeId: who.storeId, productId: p.id, reason: want, status: 'OPEN', checklist } });
  }
}

/**
 * Checks the product, stores its health (score + what is missing), moves a draft to READY_TO_PUBLISH or back, and keeps
 * its queue item in step. Needs `catalogue.read` (it stores derived data only; a status move is logged).
 */
export async function checkProduct(deps: CatalogueDeps, who: Who, productId: string, opts: { reason?: QueueReason; /** Store the check's time even when nothing changed (the audit report, PR 39). */ stamp?: boolean } = {}): Promise<Readiness> {
  const r = await productReadiness(deps, who, productId);
  const now = deps.now?.() ?? new Date();
  const stored = storedOf(r);
  const status = await deps.db.$transaction(async (tx) => {
    const p = found(await tx.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, status: true, archivedAt: true, healthScore: true, healthIssues: true } }), 'product');
    let next = p.status;
    if (p.status === 'DRAFT' && r.ready) next = 'READY_TO_PUBLISH';
    if (p.status === 'READY_TO_PUBLISH' && !r.ready) next = 'DRAFT';
    const healthChanged = p.healthScore !== r.score || !sameHealth(readStoredHealth(p.healthIssues), stored);
    if (healthChanged || next !== p.status || opts.stamp) {
      await tx.product.update({ where: { id: p.id }, data: { healthScore: r.score, healthIssues: stored as unknown as Prisma.InputJsonValue, status: next } });
    }
    if (next !== p.status) await logChange(tx, who, next === 'READY_TO_PUBLISH' ? 'product.ready' : 'product.notReady', 'Product', p.id, { status: p.status }, { status: next, blocking: r.blocking });
    await syncQueue(tx, who, { ...p, status: next }, r, opts.reason ?? null, now);
    return next;
  }, TX);
  return { ...r, status };
}

export interface PublishResult {
  productId: string;
  status: string;
  publishedAt: string | null;
  readiness: Readiness;
}

/** Puts a product on the shop. Refused with CHECKLIST_FAILED (details: the blocking checks) until the checklist passes. */
export async function publishProduct(deps: CatalogueDeps, who: Who, productId: string): Promise<PublishResult> {
  await allowPublish(deps, who);
  const r = await checkProduct(deps, who, productId);
  if (r.archived) throw new CatalogueError('CONFLICT', 'restore the product before publishing it', ['archived']);
  if (!r.ready) throw new CatalogueError('CHECKLIST_FAILED', 'the publish checklist is not complete', r.blocking);
  const now = deps.now?.() ?? new Date();
  const out = await deps.db.$transaction(async (tx) => {
    const p = found(await tx.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, status: true, archivedAt: true, publishedAt: true } }), 'product');
    if (p.status === 'PUBLISHED') return { status: p.status, publishedAt: p.publishedAt };
    const row = await tx.product.update({ where: { id: p.id }, data: { status: 'PUBLISHED', publishedAt: now, unpublishedAt: null } });
    await tx.categoryProduct.updateMany({ where: { storeId: who.storeId, productId: p.id }, data: { isVisible: true } });
    await syncQueue(tx, who, row, r, null, now);
    await logChange(tx, who, 'product.publish', 'Product', p.id, { status: p.status }, { status: row.status, score: r.score, reminders: r.reminders });
    return { status: row.status, publishedAt: row.publishedAt };
  }, TX);
  return { productId, status: out.status, publishedAt: out.publishedAt?.toISOString() ?? null, readiness: { ...r, status: out.status } };
}

/** Takes a product off the shop: its listings are hidden, its page and everything else stay. */
export async function unpublishProduct(deps: CatalogueDeps, who: Who, productId: string): Promise<PublishResult> {
  await allowPublish(deps, who);
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    const p = found(await tx.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true, status: true } }), 'product');
    if (p.status !== 'PUBLISHED') throw new CatalogueError('CONFLICT', 'the product is not on the shop', ['status']);
    await tx.product.update({ where: { id: p.id }, data: { status: 'UNPUBLISHED', unpublishedAt: now } });
    await tx.categoryProduct.updateMany({ where: { storeId: who.storeId, productId: p.id }, data: { isVisible: false } });
    await logChange(tx, who, 'product.unpublish', 'Product', p.id, { status: p.status }, { status: 'UNPUBLISHED' });
  }, TX);
  const r = await checkProduct(deps, who, productId, { reason: 'unpublished' });
  const row = await deps.db.product.findUniqueOrThrow({ where: { id: productId }, select: { status: true, publishedAt: true } });
  return { productId, status: row.status, publishedAt: row.publishedAt?.toISOString() ?? null, readiness: r };
}

// ---------------------------------------------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------------------------------------------

export const BULK_ACTIONS = ['publish', 'unpublish', 'recheck', 'archive', 'restore'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const bulkInput = z
  .object({ action: z.enum(BULK_ACTIONS), productIds: z.array(z.uuid()).min(1).max(1000).refine((l) => new Set(l).size === l.length, { message: 'each product once' }) })
  .strict();
export type BulkInput = z.input<typeof bulkInput>;

export interface BulkItemResult {
  productId: string;
  ok: boolean;
  status?: string;
  error?: string;
  details?: string[];
}
export interface BulkResult {
  action: BulkAction;
  done: number;
  failed: number;
  results: BulkItemResult[];
}

export async function bulkProducts(deps: CatalogueDeps, who: Who, input: BulkInput): Promise<BulkResult> {
  const d = parse(bulkInput, input, 'bulk action');
  const max = await setting(deps, who, 'catalogue.bulk.maxProducts');
  if (d.productIds.length > max) throw new CatalogueError('TOO_MANY_CHANGES', `at most ${max} products in one go`, [`max:${max}`]);
  if (d.action === 'publish' || d.action === 'unpublish') await allowPublish(deps, who);
  else await allow(deps, who, d.action === 'recheck' ? 'catalogue.read' : 'catalogue.write');
  const results: BulkItemResult[] = [];
  for (const id of d.productIds) {
    try {
      let status: string;
      if (d.action === 'publish') status = (await publishProduct(deps, who, id)).status;
      else if (d.action === 'unpublish') status = (await unpublishProduct(deps, who, id)).status;
      else if (d.action === 'recheck') status = (await checkProduct(deps, who, id)).status;
      else {
        status = (await updateProduct(deps, who, id, { archived: d.action === 'archive' })).status;
        await checkProduct(deps, who, id);
      }
      results.push({ productId: id, ok: true, status });
    } catch (e) {
      if (!isCatalogueError(e)) throw e;
      results.push({ productId: id, ok: false, error: e.code, details: e.details });
    }
  }
  const done = results.filter((r) => r.ok).length;
  return { action: d.action, done, failed: results.length - done, results };
}

// ---------------------------------------------------------------------------------------------------------------
// The publish queue
// ---------------------------------------------------------------------------------------------------------------

export const QUEUE_FILTERS = ['all', 'ready', 'waiting', 'live'] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];
export const queueQuery = z.object({ filter: z.enum(QUEUE_FILTERS).optional(), page: z.int().min(1).optional() }).strict();
export type QueueQuery = z.input<typeof queueQuery>;

export interface QueueItem {
  id: string;
  productId: string;
  nameEn: string;
  nameBn: string | null;
  status: string;
  reason: QueueReason;
  since: string;
  ready: boolean;
  score: number;
  checks: StoredHealth['checks'];
  checkedAt: string | null;
}

export interface QueueView {
  items: QueueItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<QueueFilter, number>;
}

/**
 * Checks up to `limit` products that were never checked (made before the queue, by an import or by the sample data):
 * the ones not on the shop with no open queue item yet, and the live ones whose checklist never ran (a failing one
 * joins as "live-failing"). So every one of them shows in the queue: here and on the stock page (PR 204), whichever
 * opens first, without waiting for someone to open a product. Returns how many were checked.
 */
export async function queueUnchecked(deps: CatalogueDeps, who: Who, limit: number): Promise<number> {
  const queued = (await deps.db.publishQueueItem.findMany({ where: { storeId: who.storeId, status: 'OPEN' }, select: { productId: true } })).map((i) => i.productId);
  const unchecked = await deps.db.product.findMany({
    where: {
      storeId: who.storeId,
      archivedAt: null,
      NOT: { id: { in: queued } },
      OR: [{ status: { not: 'PUBLISHED' } }, { healthIssues: { equals: Prisma.DbNull } }],
    },
    select: { id: true, status: true },
    take: limit,
  });
  for (const p of unchecked) await checkProduct(deps, who, p.id, p.status === 'PUBLISHED' ? {} : { reason: p.status === 'UNPUBLISHED' ? 'unpublished' : 'new' });
  return unchecked.length;
}

/**
 * The "Ready to publish" queue, oldest first. Products not on the shop that were never checked (made before this
 * screen, or by an import) are checked first, so every one of them shows.
 */
export async function publishQueue(deps: CatalogueDeps, who: Who, query: QueueQuery = {}): Promise<QueueView> {
  await allow(deps, who, 'catalogue.read');
  const q = parse(queueQuery, query, 'publish queue');
  const pageSize = await setting(deps, who, 'catalogue.admin.pageSize');
  await queueUnchecked(deps, who, pageSize);

  const open = await deps.db.publishQueueItem.findMany({ where: { storeId: who.storeId, status: 'OPEN' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const products = new Map(
    (
      await deps.db.product.findMany({
        where: { storeId: who.storeId, id: { in: open.map((o) => o.productId) }, archivedAt: null },
        select: { id: true, nameEn: true, nameBn: true, status: true, healthScore: true, healthIssues: true },
      })
    ).map((p) => [p.id, p]),
  );
  const all: QueueItem[] = [];
  for (const o of open) {
    const p = products.get(o.productId);
    if (!p) continue;
    const h = readStoredHealth(p.healthIssues);
    all.push({
      id: o.id,
      productId: p.id,
      nameEn: p.nameEn,
      nameBn: p.nameBn,
      status: p.status,
      reason: o.reason as QueueReason,
      since: o.createdAt.toISOString(),
      ready: h?.ready ?? false,
      score: p.healthScore,
      checks: h?.checks ?? [],
      checkedAt: h?.checkedAt ?? null,
    });
  }
  const of = (f: QueueFilter) => all.filter((i) => f === 'all' || (f === 'live' ? i.status === 'PUBLISHED' : i.status !== 'PUBLISHED' && (f === 'ready' ? i.ready : !i.ready)));
  const counts = Object.fromEntries(QUEUE_FILTERS.map((f) => [f, of(f).length])) as Record<QueueFilter, number>;
  const list = of(q.filter ?? 'all');
  const page = q.page ?? 1;
  return { items: list.slice((page - 1) * pageSize, page * pageSize), total: list.length, page, pageSize, counts };
}
