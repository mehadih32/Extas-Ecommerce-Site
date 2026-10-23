// PR 6 — every job the worker knows, by its key (the queue job's name and the ScheduledJob / JobRun `jobKey`). A job
// is a small JSON payload and a function; the function does the work and is itself safe to run twice (each domain
// keeps its own idempotency: stock movements by the ERP's state, ERP documents by their Idempotency-Key, holds by
// their row state). The worker adds the run-level guard on top (runs.ts): an attempt whose run already succeeded is
// skipped and never calls the function again.
//
// The inventory jobs (S09) were shaped for this worker from the start (`@extas/inventory` jobs.ts): the stock pull,
// the cart-hold expiry, the ERP document relay (the outbox), the low-stock check, the reconcile with the ERP and the
// default locations. A later stage adds its job here with its key, queue and function.
import { INVENTORY_QUEUE, runInventoryJob, type InventoryJob } from '@extas/inventory';
import type { JobDeps } from './context';

/** What a job's function reports: ok with a short summary, or a failure with its reason (the job is tried again). */
export type JobOutcome = { ok: true; stats: Record<string, unknown> } | { ok: false; error: string; stats: Record<string, unknown> };

export interface JobDefinition<P = unknown> {
  key: string;
  queue: string;
  /** Checks the payload read back from the queue; throws on a payload that is not this job's. */
  parse(payload: unknown): P;
  /** The store a run belongs to (null = every store / the installation). */
  storeOf(payload: P): number | null;
  run(deps: JobDeps, payload: P): Promise<JobOutcome>;
}

/** A job's result, made small for the JobRun row: numbers, words and flags stay; lists become their length. */
export function compactStats(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result as Record<string, unknown>)) {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 200);
    else if (Array.isArray(v)) out[k] = v.length;
    else if (typeof v === 'object') {
      const inner = Object.entries(v as Record<string, unknown>).filter(([, x]) => x === null || ['number', 'string', 'boolean'].includes(typeof x));
      if (inner.length) out[k] = Object.fromEntries(inner.map(([ik, x]) => [ik, typeof x === 'string' ? x.slice(0, 200) : x]));
    }
  }
  return out;
}

/** A job result that says it failed (`status: 'failed'`, with an error) becomes a failed outcome, so it is retried. */
export function outcomeOf(result: unknown): JobOutcome {
  const stats = compactStats(result);
  const r = (result ?? {}) as { status?: unknown; error?: unknown };
  if (r.status === 'failed') {
    const err = r.error as { code?: string; text?: string } | string | null | undefined;
    const text = typeof err === 'string' ? err : err?.text ?? err?.code ?? 'the job reported a failure';
    return { ok: false, error: text, stats };
  }
  return { ok: true, stats };
}

const INVENTORY_JOBS = [
  'inventory.erp.pullStock',
  'inventory.locations.ensureDefaults',
  'inventory.reservations.release',
  'inventory.erp.pushDocuments',
  'inventory.lowStock.evaluate',
  'inventory.erp.reconcile',
] as const satisfies readonly InventoryJob['name'][];

function inventoryJob(name: InventoryJob['name']): JobDefinition<InventoryJob> {
  return {
    key: name,
    queue: INVENTORY_QUEUE,
    parse(payload) {
      const p = (payload ?? {}) as Record<string, unknown>;
      const storeId = p.storeId;
      if (storeId !== undefined && (!Number.isInteger(storeId) || (storeId as number) < 1)) throw new Error(`${name}: storeId must be a positive integer`);
      const needsStore = name === 'inventory.erp.pullStock' || name === 'inventory.erp.reconcile';
      if (needsStore && storeId === undefined) throw new Error(`${name}: storeId is required`);
      return { ...p, name } as InventoryJob;
    },
    storeOf: (p) => ('storeId' in p && typeof p.storeId === 'number' ? p.storeId : null),
    run: async (deps, p) => outcomeOf(await runInventoryJob(deps.inventory, p)),
  };
}

const definitions: JobDefinition<never>[] = [...INVENTORY_JOBS.map((n) => inventoryJob(n) as unknown as JobDefinition<never>)];

/** Every job by key. */
export const JOBS: ReadonlyMap<string, JobDefinition<unknown>> = new Map(definitions.map((d) => [d.key, d as unknown as JobDefinition<unknown>]));

/** Every queue the worker listens on. */
export const QUEUES: readonly string[] = [...new Set(definitions.map((d) => d.queue))];

export function jobDefinition(key: string): JobDefinition<unknown> | null {
  return JOBS.get(key) ?? null;
}
