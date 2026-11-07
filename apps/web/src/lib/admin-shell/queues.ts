// PR 12 — "Needs you now" and the sidebar badges (docs/BACKEND-ARCHITECTURE.md §5.1, §5.2): live work waiting, counted
// from the real tables, never a sample. Each row says how many and how old the oldest is, and links to the list that
// holds them; a row at 0 is not shown, and nobody sees a row (or a badge) for work they cannot open (its key).
// The order rows (follow-up 200, S05): orders to confirm and duplicate reviews (the Orders badge), the customers'
// cancel requests and cancels waiting for the courier; parcels to book and returns come with S07/S08. PR 541: the
// prepaid orders to confirm without a call (SIM-F-020), and the review row counts risk reviews beside duplicates.
// Follow-up 224 (PR 140): the orders awaiting their advance, as a row and in the Orders badge.
// Follow-up 266 (PR 146): the orders flagged "2 sizes — check" (list view `twoSizes`), as a row and in the Orders badge.
// CN-028 · PR 616: the books differences past their timing window (MISMATCH), on Money → Books → Differences.
// CN-029 Phase 3 qa-gate I4 (PR 619; docs/RETAIL-ERP-MODEL.md §8): the ERP account's hold (v6 only) — one urgent row
// from when the hold began, until the ERP releases it; it stops new orders, so it leads the dashboard's card.
// S21 · PR 420 (B7.3): agent fixes and new skills waiting for the owner's OK (Reports › Site health › Fixes to approve).
// Follow-up 509 (PR 425, 431): customers waiting for the team's answer in Support (the Support badge) and late chats.
// PR 180 follow-up 436: parcels waiting for the rider — booked, sticker printed, still with us and not handed over (an
// open handover sheet's parcels among them), oldest by booking, on Orders › Packing & print › Handover.
// Counts are kept for `admin.shell.badgeCacheSeconds` per store (one count for everyone; the keys filter per person).
import type { PrismaClient } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import { workerStatus } from '@extas/jobs';
import { erpHoldNotice, heldTooLong, keptAtSwitchTooLong } from '@extas/inventory';
import { orderQueueCounts } from '@extas/orders';
import { STILL_WITH_US } from '@extas/shipping';
import type { AdminSectionId } from '@extas/settings';
import type { ShellIconName } from './icons';
import type { ShellViewer } from './sections';
import type { TodoGroup } from './todo';
import { waitingProposals } from '../admin-health/fixes';

export type QueueId = 'ordersConfirm' | 'ordersPrepaid' | 'ordersAwaitingAdvance' | 'ordersTwoSizes' | 'ordersReview' | 'ordersCancelRequests' | 'ordersCancelPending' | 'launch' | 'lowStock' | 'countsReview' | 'erpFailed' | 'jobsDead' | 'booksDifferences' | 'erpHold' | 'erpHeldLong' | 'erpKeptAtSwitch' | 'agentFixes' | 'supportWaiting' | 'supportLate' | 'handoverWaiting';

export interface QueueDef {
  id: QueueId;
  perm: PermissionKey;
  href: string;
  section: AdminSectionId;
  tone: 'bad' | 'warn' | 'info';
  icon: ShellIconName;
  /** Counted in its section's sidebar badge (§5.1: Products = launch queue, Reports = urgent problems). */
  badge: boolean;
  /** PR 12 (CN-025): the heading it sits under in the "To do" drawer (demo V12.4 A3_TODO_GROUP); else by section. */
  group?: TodoGroup;
}

export const QUEUES: readonly QueueDef[] = [
  { id: 'ordersConfirm', perm: 'orders.confirm', href: '/admin/orders/confirm', section: 'orders', tone: 'warn', icon: 'phone', badge: true, group: 'orders' },
  { id: 'ordersPrepaid', perm: 'orders.confirm', href: '/admin/orders/confirm?view=prepaid', section: 'orders', tone: 'info', icon: 'wallet', badge: true, group: 'orders' },
  // follow-up 224 (PR 140): orders waiting for their advance payment, with the Orders badge
  { id: 'ordersAwaitingAdvance', perm: 'orders.read', href: '/admin/orders?view=awaitingAdvance', section: 'orders', tone: 'warn', icon: 'wallet', badge: true, group: 'orders' },
  { id: 'ordersTwoSizes', perm: 'orders.read', href: '/admin/orders?view=twoSizes', section: 'orders', tone: 'info', icon: 'shirt', badge: true, group: 'orders' },
  { id: 'ordersReview', perm: 'orders.risk.read', href: '/admin/orders?view=inReview', section: 'orders', tone: 'warn', icon: 'shield', badge: true, group: 'orders' },
  { id: 'ordersCancelRequests', perm: 'orders.confirm', href: '/admin/orders/confirm?view=cancelRequests', section: 'orders', tone: 'bad', icon: 'x', badge: false, group: 'orders' },
  { id: 'ordersCancelPending', perm: 'orders.read', href: '/admin/orders?view=cancelPending', section: 'orders', tone: 'bad', icon: 'uturn', badge: false, group: 'orders' },
  // follow-up 436 (PR 180): printed parcels still with us, waiting for the rider's handover sheet (no badge: a line)
  { id: 'handoverWaiting', perm: 'fulfilment.read', href: '/admin/orders/packing/handover', section: 'orders', tone: 'info', icon: 'truck', badge: false, group: 'delivery' },
  { id: 'launch', perm: 'catalogue.read', href: '/admin/products/queue', section: 'products', tone: 'info', icon: 'shirt', badge: true, group: 'products' },
  { id: 'lowStock', perm: 'inventory.read', href: '/admin/stock#st-low', section: 'products', tone: 'warn', icon: 'box', badge: false, group: 'stock' },
  { id: 'countsReview', perm: 'inventory.read', href: '/admin/stock/counts', section: 'products', tone: 'info', icon: 'check', badge: false, group: 'stock' },
  { id: 'erpFailed', perm: 'inventory.read', href: '/admin/stock#st-docs', section: 'products', tone: 'bad', icon: 'sync', badge: false, group: 'stock' },
  // follow-up 539: documents the ERP keeps refusing for now, past `erp.orders.heldAlertAfterHours` (none while that is empty)
  { id: 'erpHeldLong', perm: 'inventory.read', href: '/admin/stock#st-docs', section: 'products', tone: 'warn', icon: 'clock', badge: false, group: 'stock' },
  // follow-up 578: v5 orders kept at the switch, still waiting for a person more than a day later (ERP link page)
  { id: 'erpKeptAtSwitch', perm: 'vault.read', href: '/admin/settings/erp-link', section: 'settings', tone: 'warn', icon: 'clock', badge: false, group: 'stock' },
  { id: 'erpHold', perm: 'erp.account.read', href: '/admin/money/books', section: 'money', tone: 'bad', icon: 'alert', badge: false, group: 'urgent' },
  { id: 'booksDifferences', perm: 'books.read', href: '/admin/money/books/differences', section: 'money', tone: 'bad', icon: 'wallet', badge: false, group: 'money' },
  // follow-up 509: customers waiting for an answer (the Support badge, longest first) and chats past their timer (PR 431)
  { id: 'supportWaiting', perm: 'support.read', href: '/admin/support', section: 'support', tone: 'warn', icon: 'headset', badge: true, group: 'messages' },
  { id: 'supportLate', perm: 'support.read', href: '/admin/support?view=late', section: 'support', tone: 'bad', icon: 'clock', badge: false, group: 'messages' },
  { id: 'jobsDead', perm: 'system.read', href: '/admin/server', section: 'reports', tone: 'bad', icon: 'alert', badge: true, group: 'system' },
  { id: 'agentFixes', perm: 'health.fixes.approve', href: '/admin/reports/health/fixes', section: 'reports', tone: 'warn', icon: 'shield', badge: false, group: 'system' },
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
  // follow-up 509: an open chat whose customer waits (the team owes an answer), never a blocked person's; late = PR 431's
  // timer ran out (the inbox's Late view)
  const now = (deps.now ?? (() => new Date()))();
  const waitingWhere = { storeId, status: 'OPEN', waitingSince: { not: null }, contact: { blockedAt: null } };
  const lateWhere = { storeId, status: 'OPEN', slaDueAt: { lt: now }, contact: { blockedAt: null } };
  // follow-up 436: a booked parcel the courier has not picked up, its sticker printed, its order not handed over
  const handoverWhere = { storeId, status: { in: [...STILL_WITH_US] }, consignmentId: { not: null }, labelPrintCount: { gt: 0 }, isExchangeLeg: false, order: { archivedAt: null, handedOverAt: null } };
  const [orders, launchN, launchOld, lowN, lowOld, reviewN, reviewOld, erpN, erpOld, jobs, booksN, booksOld, hold, heldLong, keptLong, fixes, waitN, waitOld, lateN, lateOld, handN, handOld] = await Promise.all([
    orderQueueCounts(db, storeId, ['toConfirm', 'prepaid', 'awaitingAdvance', 'twoSizes', 'inReview', 'cancelRequests', 'cancelPending']),
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
    db.booksDifference.count({ where: { storeId, status: 'MISMATCH' } }),
    db.booksDifference.findFirst({ where: { storeId, status: 'MISMATCH' }, orderBy: { firstSeenAt: 'asc' }, select: { firstSeenAt: true } }),
    // v6 only (null on v5 or with no ERP link); a hold is one row, counted from when it began
    erpHoldNotice({ db, settings: deps.settings as Parameters<typeof erpHoldNotice>[0]['settings'], now: deps.now }, storeId),
    heldTooLong({ db, settings: deps.settings as Parameters<typeof heldTooLong>[0]['settings'], now: deps.now }, storeId),
    keptAtSwitchTooLong(db, storeId, now),
    // PR 420: proposals waiting on the owner (this store's fixes and the shared skills), oldest first
    waitingProposals(db, storeId, now),
    db.conversation.count({ where: waitingWhere }),
    db.conversation.findFirst({ where: waitingWhere, orderBy: { waitingSince: 'asc' }, select: { waitingSince: true } }),
    db.conversation.count({ where: lateWhere }),
    db.conversation.findFirst({ where: lateWhere, orderBy: { waitingSince: { sort: 'asc', nulls: 'last' } }, select: { waitingSince: true, slaDueAt: true } }),
    db.shipment.count({ where: handoverWhere }),
    db.shipment.findFirst({ where: handoverWhere, orderBy: { bookedAt: { sort: 'asc', nulls: 'last' } }, select: { bookedAt: true, createdAt: true } }),
  ]);
  const dead = jobs.failed.filter((r) => r.status === 'DEAD_LETTERED').map((r) => r.startedAt).sort();
  const o = (id: QueueId, view: string): QueueCount => ({ id, n: orders[view]?.n ?? 0, oldest: iso(orders[view]?.oldest) });
  return [
    o('ordersConfirm', 'toConfirm'),
    o('ordersPrepaid', 'prepaid'),
    o('ordersAwaitingAdvance', 'awaitingAdvance'),
    o('ordersTwoSizes', 'twoSizes'),
    o('ordersReview', 'inReview'),
    o('ordersCancelRequests', 'cancelRequests'),
    o('ordersCancelPending', 'cancelPending'),
    { id: 'launch', n: launchN, oldest: iso(launchOld?.createdAt) },
    { id: 'lowStock', n: lowN, oldest: iso(lowOld?.createdAt) },
    { id: 'countsReview', n: reviewN, oldest: iso(reviewOld?.updatedAt) },
    { id: 'erpFailed', n: erpN, oldest: iso(erpOld?.createdAt) },
    { id: 'erpHeldLong', n: heldLong?.count ?? 0, oldest: heldLong?.since ?? null },
    { id: 'erpKeptAtSwitch', n: keptLong.count, oldest: keptLong.since },
    { id: 'erpHold', n: hold?.onHold ? 1 : 0, oldest: hold?.onHold ? (hold.heldAt ?? null) : null },
    { id: 'booksDifferences', n: booksN, oldest: iso(booksOld?.firstSeenAt) },
    { id: 'jobsDead', n: jobs.failedCounts.dead, oldest: dead[0] ?? null },
    { id: 'agentFixes', n: fixes.n, oldest: iso(fixes.oldest) },
    { id: 'supportWaiting', n: waitN, oldest: iso(waitOld?.waitingSince) },
    { id: 'supportLate', n: lateN, oldest: iso(lateOld?.waitingSince ?? lateOld?.slaDueAt) },
    { id: 'handoverWaiting', n: handN, oldest: iso(handOld?.bookedAt ?? handOld?.createdAt) },
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
