// S14 · PR 296 — the points run (@extas/customers `runPoints`): each live store whose owner switched points on with a
// rule that gives something gets one `customers.points.run` per hour; the hour is the run key. The run itself gives
// each delivered order its points once (the entry's key is the order), so a second run gives nothing more.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { earns, runPoints } from '@extas/customers';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const POINTS_JOB = 'customers.points.run';
export const POINTS_QUEUE = 'customers';

/** One run an hour: points wait for the exchange window in days, so the hour is never what a customer notices. */
const SLOT_MS = 3_600_000;

/** One store's run. */
export async function runPointsJob(deps: JobDeps, storeId: number): Promise<{ given: number; points: number } | { skipped: string }> {
  const r = await runPoints({ db: deps.db, settings: deps.settings, ...(deps.now ? { now: deps.now } : {}) }, storeId);
  return r ?? { skipped: 'points off' };
}

/** Each live store with points on: one run per hour. */
export const pointsPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    if (!earns(await deps.settings.value('customers.points', { storeId: s.id }))) continue;
    const payload = { storeId: s.id };
    out.push({ queue: POINTS_QUEUE, name: POINTS_JOB, payload, key: runKey(POINTS_JOB, payload, slotOf(now.getTime(), SLOT_MS)) });
  }
  return out;
};
