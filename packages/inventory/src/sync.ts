// PR 194 — the ERP sync adapter's reliability layer: every call to the ERP goes through `callErp`, which tries again
// with exponential backoff when another try may help (rate limit, ERP error, timeout, network) and never when it
// cannot (a wrong key, a bad request). Attempts, pauses and the timeout are settings (`erp.sync.*`).
//
// The error surface: every sync run is an ErpSyncRun row (status, rows done and failed, the error), and the sync state
// per store and resource (ErpSyncState) keeps the cursor, the last success and the last error. The sync health panel
// (PR 205) reads exactly these two tables; `erpSyncStatus` is its first reader. Error texts carry the ERP's code and
// message, never a key (the HTTP client never puts one into a message).
import { isErpError, toErpError, type ErpCallOptions, type ErpError } from '@extas/adapters';
import { allow, setting, type Db, type InventoryDeps, type Who } from './context';
import { InventoryError } from './errors';

export interface RetryPolicy {
  maxAttempts: number;
  baseMs: number;
  maxMs: number;
  jitter: boolean;
  timeoutMs: number;
}

export async function retryPolicy(deps: InventoryDeps): Promise<RetryPolicy> {
  const [maxAttempts, baseMs, maxMs, jitter, timeoutS] = await Promise.all([
    setting(deps, null, 'erp.sync.maxAttempts'),
    setting(deps, null, 'erp.sync.backoffBaseMs'),
    setting(deps, null, 'erp.sync.backoffMaxMs'),
    setting(deps, null, 'erp.sync.backoffJitter'),
    setting(deps, null, 'erp.sync.requestTimeoutSeconds'),
  ]);
  return { maxAttempts, baseMs, maxMs, jitter, timeoutMs: timeoutS * 1000 };
}

/**
 * The pause after the n-th failed try (n ≥ 1): base × 2^(n−1), capped at the longest pause; with jitter a random point
 * in its upper half. When the ERP said when to come back (Retry-After), at least that — but never past the cap.
 */
export function backoffDelay(failedAttempt: number, p: Pick<RetryPolicy, 'baseMs' | 'maxMs' | 'jitter'>, random: () => number = Math.random, retryAfterMs: number | null = null): number {
  const capped = Math.min(p.maxMs, p.baseMs * 2 ** Math.max(0, failedAttempt - 1));
  const spread = p.jitter ? capped / 2 + random() * (capped / 2) : capped;
  const wanted = retryAfterMs == null ? spread : Math.max(spread, Math.min(retryAfterMs, p.maxMs));
  return Math.round(wanted);
}

/** An ERP call that failed after its tries. `erp` is the last failure. */
export class ErpCallFailed extends InventoryError {
  readonly erp: ErpError;
  readonly attempts: number;

  constructor(erp: ErpError, attempts: number) {
    super('ERP_ERROR', `${erp.message} (${attempts} ${attempts === 1 ? 'try' : 'tries'})`, [erp.code, ...(erp.status ? [`status ${erp.status}`] : []), ...(erp.erpCode ? [`erp ${erp.erpCode}`] : [])]);
    this.erp = erp;
    this.attempts = attempts;
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Runs `fn` with the policy's timeout, trying again with backoff while another try may help. */
export async function callErp<T>(deps: InventoryDeps, p: RetryPolicy, fn: (o: ErpCallOptions) => Promise<T>): Promise<{ value: T; attempts: number }> {
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return { value: await fn({ timeoutMs: p.timeoutMs }), attempts: attempt };
    } catch (e) {
      const err = toErpError(e);
      if (!err.retryable || attempt >= p.maxAttempts) throw new ErpCallFailed(err, attempt);
      await sleep(backoffDelay(attempt, p, random, err.retryAfterMs));
    }
  }
}

/** Longest error text kept on a run or state row. */
const MAX_ERROR = 500;

/** One line for the health panel: `CODE (status): message`. */
export function errorText(e: unknown): string {
  if (e instanceof ErpCallFailed) return `${e.erp.code}${e.erp.status ? ` ${e.erp.status}` : ''}: ${e.message.replace(/^(?:[A-Z_]+: )+/, '')}`.slice(0, MAX_ERROR);
  if (isErpError(e)) return `${e.code}${e.status ? ` ${e.status}` : ''}: ${e.message.replace(/^(?:[A-Z_]+: )+/, '')}`.slice(0, MAX_ERROR);
  if (e instanceof InventoryError) return e.message.slice(0, MAX_ERROR);
  return `INTERNAL: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`.slice(0, MAX_ERROR);
}

/** The stable code of a failure (the ERP's, else the inventory one). */
export function errorCode(e: unknown): string {
  if (e instanceof ErpCallFailed) return e.erp.code;
  if (isErpError(e)) return e.code;
  if (e instanceof InventoryError) return e.code;
  return 'INTERNAL';
}

/**
 * Run kinds: the pull (PR 195), one product's re-sync (PR 206), the full check (PR 207), the document relay (PR 199),
 * the pull of the ERP's v6 events (PR 608).
 */
export type SyncKind = 'stock.pull' | 'stock.resyncProduct' | 'stock.reconcile' | 'documents.push' | 'events.pull';
export const SYNC_KINDS: readonly SyncKind[] = ['stock.pull', 'stock.resyncProduct', 'stock.reconcile', 'documents.push', 'events.pull'];
/** Where each pull keeps its place: stock (PR 195), and the v6 returns, exchanges and claims lists (PR 608). */
export type SyncResource = 'stock' | 'events.returns' | 'events.exchanges' | 'events.claims';

export async function startRun(db: Db, storeId: number, kind: SyncKind, at: Date): Promise<string> {
  const run = await db.erpSyncRun.create({ data: { storeId, kind, status: 'RUNNING', startedAt: at }, select: { id: true } });
  return run.id;
}

export async function finishRun(db: Db, id: string, r: { ok: boolean; itemsOk: number; itemsFailed: number; error: string | null }, at: Date): Promise<void> {
  await db.erpSyncRun.update({ where: { id }, data: { status: r.ok ? 'SUCCEEDED' : 'FAILED', itemsOk: r.itemsOk, itemsFailed: r.itemsFailed, error: r.error?.slice(0, MAX_ERROR) ?? null, finishedAt: at } });
}

export async function readState(db: Db, storeId: number, resource: SyncResource) {
  return db.erpSyncState.findUnique({ where: { storeId_resource: { storeId, resource } } });
}

export async function saveState(db: Db, storeId: number, resource: SyncResource, data: { cursor?: string | null; updatedSince?: Date | null; lastSuccessAt?: Date | null; lastError?: string | null }): Promise<void> {
  await db.erpSyncState.upsert({ where: { storeId_resource: { storeId, resource } }, create: { storeId, resource, ...data }, update: data });
}

export interface ErpSyncStatus {
  states: { resource: string; cursor: boolean; updatedSince: string | null; lastSuccessAt: string | null; lastError: string | null }[];
  /** The latest run of each kind. */
  lastRuns: { kind: string; status: string; itemsOk: number; itemsFailed: number; error: string | null; startedAt: string; finishedAt: string | null }[];
  /** The latest failed run, if any. */
  lastFailure: { kind: string; error: string | null; startedAt: string } | null;
}

/**
 * The first reader of the error surface (the full health panel is PR 205). Ties on startedAt (one clock tick) are
 * broken by the id: UUIDv7, so later runs sort later.
 */
export async function erpSyncStatus(deps: InventoryDeps, who: Who): Promise<ErpSyncStatus> {
  await allow(deps, who, 'inventory.read');
  const [states, runs, failure] = await Promise.all([
    deps.db.erpSyncState.findMany({ where: { storeId: who.storeId }, orderBy: { resource: 'asc' } }),
    deps.db.erpSyncRun.findMany({ where: { storeId: who.storeId }, orderBy: [{ kind: 'asc' }, { startedAt: 'desc' }, { id: 'desc' }], distinct: ['kind'] }),
    deps.db.erpSyncRun.findFirst({ where: { storeId: who.storeId, status: 'FAILED' }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] }),
  ]);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return {
    states: states.map((s) => ({ resource: s.resource, cursor: s.cursor != null, updatedSince: iso(s.updatedSince), lastSuccessAt: iso(s.lastSuccessAt), lastError: s.lastError })),
    lastRuns: runs.map((r) => ({ kind: r.kind, status: r.status, itemsOk: r.itemsOk, itemsFailed: r.itemsFailed, error: r.error, startedAt: r.startedAt.toISOString(), finishedAt: iso(r.finishedAt) })),
    lastFailure: failure ? { kind: failure.kind, error: failure.error, startedAt: failure.startedAt.toISOString() } : null,
  };
}
