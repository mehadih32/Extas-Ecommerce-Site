// PR 845 (lane E4) — Settings › ERP connection: the "Sync status" table and the "Activity log" the prototype draws
// (docs/demo/admin-proto-v5/js/m-settings.js renderErp). Everything is read from what the server already writes: the stock sync
// cursor (ErpSyncState), the sync runs (ErpSyncRun), the documents sent to the ERP (ErpPush) and the ERP's events (ErpEvent).
// `shapeSyncBoard` is pure (the tests feed it rows); `loadSyncBoard` only reads. Nothing here calls the ERP.
import type { PrismaClient } from '@extas/db/client';

export type SyncKind = 'order' | 'stock' | 'bill' | 'return' | 'product' | 'price' | 'payment' | 'health';

export interface PushRow {
  documentType: string;
  status: string;
  sentAt: Date | null;
  updatedAt: Date;
  referenceId: string;
  lastError: string | null;
}
export interface EventRow {
  type: string;
  status: string;
  receivedAt: Date;
  error: string | null;
}
export interface RunRow {
  kind: string;
  status: string;
  itemsOk: number;
  itemsFailed: number;
  error: string | null;
  startedAt: Date;
}
export interface StateRow {
  resource: string;
  lastSuccessAt: Date | null;
}

export interface SyncStream {
  key: 'product' | 'stock' | 'price' | 'return' | 'order' | 'bill' | 'payment';
  dir: 'in' | 'out';
  kind: SyncKind;
  lastAt: string | null;
  /** When the next run is due, if the server runs it on a clock (stock); null = on an event. */
  nextAt: string | null;
  /** The count the Items column shows, and what it counts. */
  items: { what: 'sizes' | 'sentToday' | 'waiting' | 'none'; n: number };
  /** Runs or documents that failed in the last 24 hours. */
  failed24: number;
}

export interface SyncLogRow {
  at: string;
  kind: SyncKind;
  ok: boolean;
  /** Where the row came from, and the raw name the screen turns into words (a document type, an event type or a run kind). */
  src: 'push' | 'event' | 'run';
  name: string;
  ref: string | null;
  status: string;
  detail: string | null;
}

export interface SyncBoard {
  streams: SyncStream[];
  log: SyncLogRow[];
}

const DAY = 86_400_000;
const FAILED_PUSH = new Set(['FAILED', 'DEAD']);

export function pushKind(documentType: string): SyncKind {
  if (documentType.startsWith('order.')) return 'order';
  if (documentType.startsWith('shipment.')) return 'bill';
  if (documentType.startsWith('payment.')) return 'payment';
  if (documentType.startsWith('return.')) return 'return';
  return 'health';
}
export function eventKind(type: string): SyncKind {
  if (type.startsWith('return.')) return 'return';
  if (type.startsWith('payment.')) return 'payment';
  if (type.startsWith('shipment.') || type.startsWith('delivery.')) return 'bill';
  if (type.startsWith('price.')) return 'price';
  if (type.startsWith('stock.')) return 'stock';
  return 'health';
}
export function runKind(kind: string): SyncKind {
  if (kind.startsWith('stock')) return 'stock';
  if (kind.startsWith('variant') || kind.startsWith('product')) return 'product';
  if (kind.startsWith('documents')) return 'order';
  return 'health';
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const newest = (...xs: (Date | null | undefined)[]) => xs.filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

/** The streams and the newest log rows from the rows the server wrote. `pollMinutes` is the stock poll setting. */
export function shapeSyncBoard(i: { pushes: PushRow[]; events: EventRow[]; runs: RunRow[]; states: StateRow[]; now: Date; pollMinutes: number; logSize: number }): SyncBoard {
  const nowMs = i.now.getTime();
  const within = (d: Date) => nowMs - d.getTime() < DAY;
  const stateAt = (r: string) => i.states.find((s) => s.resource === r)?.lastSuccessAt ?? null;
  const lastRun = (k: SyncKind) => i.runs.find((r) => runKind(r.kind) === k && r.status === 'SUCCEEDED');
  const pushes = (k: SyncKind) => i.pushes.filter((p) => pushKind(p.documentType) === k);
  const failedPush = (k: SyncKind) => pushes(k).filter((p) => FAILED_PUSH.has(p.status) && within(p.updatedAt)).length;
  const failedRun = (k: SyncKind) => i.runs.filter((r) => runKind(r.kind) === k && r.status === 'FAILED' && within(r.startedAt)).length;
  const eventsOf = (k: SyncKind) => i.events.filter((e) => eventKind(e.type) === k);
  const failedEvent = (k: SyncKind) => eventsOf(k).filter((e) => e.status === 'FAILED' && within(e.receivedAt)).length;
  const sentLast = (k: SyncKind) => newest(...pushes(k).map((p) => p.sentAt));
  const sentToday = (k: SyncKind) => pushes(k).filter((p) => p.status === 'SENT' && p.sentAt && within(p.sentAt)).length;
  const waiting = (k: SyncKind) => pushes(k).filter((p) => ['PENDING', 'HELD', 'FAILED'].includes(p.status)).length;

  const stockAt = newest(stateAt('stock'), lastRun('stock')?.startedAt);
  const productAt = newest(stateAt('variants'), stateAt('products'), lastRun('product')?.startedAt);
  const streams: SyncStream[] = [
    { key: 'product', dir: 'in', kind: 'product', lastAt: iso(productAt), nextAt: null, items: { what: 'none', n: 0 }, failed24: failedRun('product') },
    { key: 'stock', dir: 'in', kind: 'stock', lastAt: iso(stockAt), nextAt: stockAt && i.pollMinutes > 0 ? new Date(stockAt.getTime() + i.pollMinutes * 60_000).toISOString() : null, items: { what: 'sizes', n: lastRun('stock')?.itemsOk ?? 0 }, failed24: failedRun('stock') },
    { key: 'price', dir: 'in', kind: 'price', lastAt: iso(newest(...eventsOf('price').map((e) => e.receivedAt))), nextAt: null, items: { what: 'none', n: 0 }, failed24: failedEvent('price') },
    { key: 'return', dir: 'in', kind: 'return', lastAt: iso(newest(...eventsOf('return').map((e) => e.receivedAt))), nextAt: null, items: { what: 'waiting', n: waiting('return') }, failed24: failedEvent('return') + failedPush('return') },
    { key: 'order', dir: 'out', kind: 'order', lastAt: iso(sentLast('order')), nextAt: null, items: { what: 'sentToday', n: sentToday('order') }, failed24: failedPush('order') },
    { key: 'bill', dir: 'out', kind: 'bill', lastAt: iso(sentLast('bill')), nextAt: null, items: { what: 'sentToday', n: sentToday('bill') }, failed24: failedPush('bill') },
    { key: 'payment', dir: 'out', kind: 'payment', lastAt: iso(sentLast('payment')), nextAt: null, items: { what: 'sentToday', n: sentToday('payment') }, failed24: failedPush('payment') },
  ];

  const log: SyncLogRow[] = [
    ...i.pushes.map((p): SyncLogRow => ({ at: (p.sentAt ?? p.updatedAt).toISOString(), kind: pushKind(p.documentType), ok: !FAILED_PUSH.has(p.status), src: 'push', name: p.documentType, ref: p.referenceId.slice(0, 8), status: p.status, detail: p.lastError })),
    ...i.events.map((e): SyncLogRow => ({ at: e.receivedAt.toISOString(), kind: eventKind(e.type), ok: e.status !== 'FAILED', src: 'event', name: e.type, ref: null, status: e.status, detail: e.error })),
    ...i.runs.map((r): SyncLogRow => ({ at: r.startedAt.toISOString(), kind: runKind(r.kind), ok: r.status !== 'FAILED', src: 'run', name: r.kind, ref: null, status: r.status, detail: r.error ?? (r.itemsOk || r.itemsFailed ? `${r.itemsOk}/${r.itemsOk + r.itemsFailed}` : null) })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, i.logSize);
  return { streams, log };
}

/** Reads the rows (newest first, a bounded number of each) and shapes them. */
export async function loadSyncBoard(db: PrismaClient, storeId: number, now: Date, pollMinutes: number, logSize: number): Promise<SyncBoard> {
  const take = Math.max(logSize * 4, 100); // hardcode-ok: how many rows of each table are read to fill the table, not a business number
  const [pushes, events, runs, states] = await Promise.all([
    db.erpPush.findMany({ where: { storeId }, orderBy: { updatedAt: 'desc' }, take, select: { documentType: true, status: true, sentAt: true, updatedAt: true, referenceId: true, lastError: true } }),
    db.erpEvent.findMany({ where: { storeId }, orderBy: { receivedAt: 'desc' }, take, select: { type: true, status: true, receivedAt: true, error: true } }),
    db.erpSyncRun.findMany({ where: { storeId }, orderBy: { startedAt: 'desc' }, take, select: { kind: true, status: true, itemsOk: true, itemsFailed: true, error: true, startedAt: true } }),
    db.erpSyncState.findMany({ where: { storeId }, select: { resource: true, lastSuccessAt: true } }),
  ]);
  return shapeSyncBoard({ pushes: pushes as PushRow[], events: events as EventRow[], runs: runs as RunRow[], states, now, pollMinutes, logSize });
}
