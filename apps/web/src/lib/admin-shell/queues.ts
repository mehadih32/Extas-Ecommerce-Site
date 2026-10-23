// PR 12 — "Needs you now" and the sidebar badges (docs/BACKEND-ARCHITECTURE.md §5.1, §5.2): live work waiting, counted
// from the real tables, never a sample. Each row says how many and how old the oldest is, and links to the list that
// holds them; a row at 0 is not shown, and nobody sees a row (or a badge) for work they cannot open (its key).
// The order queues (to confirm, risky, parcels to book …) come with the order screens (S05) and add their rows here.
// Counts are kept for `admin.shell.badgeCacheSeconds` per store (one count for everyone; the keys filter per person).
import type { PrismaClient } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { workerStatus } from '@extas/jobs';
import type { AdminSectionId } from '@extas/settings';
import type { ShellIconName } from './icons';
import type { ShellViewer } from './sections';

export type QueueId = 'launch' | 'lowStock' | 'countsReview' | 'erpFailed' | 'jobsDead';

export interface QueueDef {
  id: QueueId;
  perm: PermissionKey;
  href: string;
  section: AdminSectionId;
  tone: 'bad' | 'warn' | 'info';
  icon: ShellIconName;
  /** Counted in its section's sidebar badge (§5.1: Products = launch queue, Reports = urgent problems). */
  badge: boolean;
}

export const QUEUES: readonly QueueDef[] = [
  { id: 'launch', perm: 'catalogue.read', href: '/admin/products/queue', section: 'products', tone: 'info', icon: 'shirt', badge: true },
  { id: 'lowStock', perm: 'inventory.read', href: '/admin/stock#st-low', section: 'products', tone: 'warn', icon: 'box', badge: false },
  { id: 'countsReview', perm: 'inventory.read', href: '/admin/stock/counts', section: 'products', tone: 'info', icon: 'check', badge: false },
  { id: 'erpFailed', perm: 'inventory.read', href: '/admin/stock#st-docs', section: 'products', tone: 'bad', icon: 'sync', badge: false },
  { id: 'jobsDead', perm: 'system.read', href: '/admin/server', section: 'reports', tone: 'bad', icon: 'alert', badge: true },
];

export interface QueueCount {
  id: QueueId;
  n: number;
  /** When the oldest waiting item arrived (ISO), or null. */
  oldest: string | null;
}

export interface QueueRow extends QueueCount {
  def: QueueDef;
}

export interface QueueDeps {
  db: PrismaClient;
  settings: { value(key: string, scope?: { storeId?: number | null }): Promise<unknown> };
  now?: () => Date;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Every queue of the store, counted now (no cache, no key filter). */
export async function countQueues(deps: QueueDeps, storeId: number): Promise<QueueCount[]> {
  const { db } = deps;
  const [launchN, launchOld, lowN, lowOld, reviewN, reviewOld, erpN, erpOld, jobs] = await Promise.all([
    db.publishQueueItem.count({ where: { storeId, status: 'OPEN' } }),
    db.publishQueueItem.findFirst({ where: { storeId, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.lowStockAlert.count({ where: { resolvedAt: null } }),
    db.lowStockAlert.findFirst({ where: { resolvedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.stockAudit.count({ where: { status: 'REVIEW' } }),
    db.stockAudit.findFirst({ where: { status: 'REVIEW' }, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }),
    db.erpPush.count({ where: { storeId, status: { in: ['FAILED', 'DEAD'] } } }),
    db.erpPush.findFirst({ where: { storeId, status: { in: ['FAILED', 'DEAD'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    // The Server page's own count (PR 6): runs whose newest attempt was given up, in its window.
    workerStatus({ db, settings: deps.settings as Parameters<typeof workerStatus>[0]['settings'], now: deps.now }),
  ]);
  const dead = jobs.failed.filter((r) => r.status === 'DEAD_LETTERED').map((r) => r.startedAt).sort();
  return [
    { id: 'launch', n: launchN, oldest: iso(launchOld?.createdAt) },
    { id: 'lowStock', n: lowN, oldest: iso(lowOld?.createdAt) },
    { id: 'countsReview', n: reviewN, oldest: iso(reviewOld?.updatedAt) },
    { id: 'erpFailed', n: erpN, oldest: iso(erpOld?.createdAt) },
    { id: 'jobsDead', n: jobs.failedCounts.dead, oldest: dead[0] ?? null },
  ];
}

const holder = globalThis as unknown as { __shellQueues?: Map<number, { at: number; rows: Promise<QueueCount[]> }> };

/** The store's counts, at most `maxAgeSeconds` old (0 = always fresh). A failed count is not kept. */
export function cachedQueues(deps: QueueDeps, storeId: number, maxAgeSeconds: number): Promise<QueueCount[]> {
  const memo = (holder.__shellQueues ??= new Map());
  const now = (deps.now ?? (() => new Date()))().getTime();
  const hit = memo.get(storeId);
  if (hit && maxAgeSeconds > 0 && now - hit.at < maxAgeSeconds * 1000) return hit.rows;
  const rows = countQueues(deps, storeId);
  memo.set(storeId, { at: now, rows });
  rows.catch(() => memo.delete(storeId));
  return rows;
}

/** The rows this person may open, with work waiting, in the table's order. */
export function visibleQueues(counts: readonly QueueCount[], v: ShellViewer): QueueRow[] {
  return QUEUES.flatMap((def) => {
    const c = counts.find((x) => x.id === def.id);
    if (!c || c.n <= 0 || !(v.owner || v.perms.has(def.perm))) return [];
    return [{ ...c, def }];
  });
}

/** Sidebar badges: per section, the waiting work this person may open. */
export function badgesFrom(rows: readonly QueueRow[]): Partial<Record<AdminSectionId, number>> {
  const out: Partial<Record<AdminSectionId, number>> = {};
  for (const r of rows) if (r.def.badge) out[r.def.section] = (out[r.def.section] ?? 0) + r.n;
  return out;
}
