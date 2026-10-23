// PR 6 — what the leader puts on the queue. The timetable comes from the jobs' own settings (`inventorySchedule`:
// the stock pull every `erp.sync.stockPollMinutes` per store with an ERP, the cart-hold expiry every
// `inventory.reservation.sweepSeconds`, the ERP document relay every `erp.push.relaySeconds`, the low-stock check every
// `inventory.lowStock.sweepMinutes`, the reconcile every `inventory.reconcile.everyHours`). Time is cut into slots of
// each job's interval; a job runs once per slot. A run's identity — its idempotency key and its queue job id — is the
// job, its store and its slot, so the same slot planned twice (a restart, two leaders for a moment) is one run.
import { inventorySchedule, type InventoryJob } from '@extas/inventory';
import { jobDefinition, type JobDefinition } from './catalogue';
import type { JobDeps } from './context';

export interface PlannedJob {
  queue: string;
  name: string;
  payload: Record<string, unknown>;
  /** The queue job id and the run's idempotency key (the same string). */
  key: string;
  /** When the next slot of this job starts. */
  nextAt: Date;
}

export interface TimetableEntry {
  everyMs: number;
  jobs: { name: string; payload: Record<string, unknown> }[];
}

/** The slot number of `now` for an interval (slots are counted from the epoch, so every worker agrees). */
export const slotOf = (nowMs: number, everyMs: number): number => Math.floor(nowMs / everyMs);

/** A job and its store: `job/store` (`-` = every store). */
export function seriesKey(name: string, payload: Record<string, unknown>): string {
  return `${name}/${typeof payload.storeId === 'number' ? String(payload.storeId) : '-'}`;
}

/** A scheduled run's identity: `job/store/slot`. Safe as a queue job id (the queue refuses ids with a colon). */
export function runKey(name: string, payload: Record<string, unknown>, slot: number): string {
  return `${seriesKey(name, payload)}/${slot}`;
}

function payloadOf(job: InventoryJob): Record<string, unknown> {
  const { name: _name, ...rest } = job;
  return rest;
}

/** Every scheduled job with its interval, from settings. */
export async function timetable(deps: JobDeps): Promise<TimetableEntry[]> {
  const plan = await inventorySchedule(deps.inventory);
  return plan
    .filter((e) => Number.isFinite(e.everyMs) && e.everyMs > 0)
    .map((e) => ({ everyMs: e.everyMs, jobs: e.jobs.map((j) => ({ name: j.name, payload: payloadOf(j) })) }));
}

/**
 * The runs due now that were not planned yet in their slot. `planned` remembers, per job and store, the last slot this
 * leader planned (the caller keeps it between ticks); a fresh leader plans the current slot once, which the queue and
 * the run-level idempotency turn into nothing when an earlier leader already did it.
 */
export function dueRuns(
  entries: TimetableEntry[],
  nowMs: number,
  planned: Map<string, number>,
  /** The jobs this worker knows (default: the catalogue); a job it does not know is not planned. */
  lookup: (key: string) => Pick<JobDefinition<unknown>, 'queue'> | null = jobDefinition,
): PlannedJob[] {
  const out: PlannedJob[] = [];
  for (const e of entries) {
    const slot = slotOf(nowMs, e.everyMs);
    for (const j of e.jobs) {
      const def = lookup(j.name);
      if (!def) continue;
      const id = seriesKey(j.name, j.payload);
      if (planned.get(id) === slot) continue;
      planned.set(id, slot);
      out.push({ queue: def.queue, name: j.name, payload: j.payload, key: runKey(j.name, j.payload, slot), nextAt: new Date((slot + 1) * e.everyMs) });
    }
  }
  return out;
}
