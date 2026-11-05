// S14 · PR 534 — the grading run (@extas/customers `runGrades`): each live store whose owner switched customer grading on
// gets one `customers.grades.run` a day; the day is the run key. The run writes each person's grade and verified date on
// his profile (only what changed), for Marketing › Audiences; the screens work the grade out live. It never blocks
// anyone and never changes cash on delivery.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { runGrades } from '@extas/customers';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const GRADES_JOB = 'customers.grades.run';
export const GRADES_QUEUE = 'customers';

/** One run a day: deliveries and refusals change by the day. */
const SLOT_MS = 86_400_000;

/** One store's run. */
export async function runGradesJob(deps: JobDeps, storeId: number): Promise<{ people: number; changed: number; verified: number } | { skipped: string }> {
  const r = await runGrades({ db: deps.db, settings: deps.settings, ...(deps.now ? { now: deps.now } : {}) }, storeId);
  return r ?? { skipped: 'grading off' };
}

/** Each live store with grading on: one run a day. */
export const gradesPlanner: Planner = async (deps, now) => {
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    if (!((await deps.settings.value('customers.grades', { storeId: s.id })) as { enabled: boolean }).enabled) continue;
    const payload = { storeId: s.id };
    out.push({ queue: GRADES_QUEUE, name: GRADES_JOB, payload, key: runKey(GRADES_JOB, payload, slotOf(now.getTime(), SLOT_MS)) });
  }
  return out;
};
