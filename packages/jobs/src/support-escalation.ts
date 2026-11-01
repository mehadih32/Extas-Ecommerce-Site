// S22 · PR 538 (Blueprint B4.14 V2 note; §59 answer 48) — the owner told on Telegram when a customer waits and nobody
// answers: every live store with `support.escalation` on gets one `support.escalate` run per minute (the slot is the run
// key). The run (packages/support `sweepEscalations`) tells the owner once per wait; safe to run twice (one row per wait,
// and one sweep of a store at a time under its lock). Without the Telegram link (tests) nothing is planned.
// This module imports `./keys`, never `./scheduler` (the scheduler imports the catalogue, which imports this).
import { sendOwnerAlert } from '@extas/adapters';
import { sweepEscalations, type EscalationSweep } from '@extas/support';
import type { JobDeps } from './context';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const SUPPORT_ESCALATE_JOB = 'support.escalate';
export const SUPPORT_QUEUE = 'support';

/** A sweep every minute: the waiting minutes are whole minutes. */
const EVERY_MS = 60_000;

/** One store's sweep. */
export async function runSupportEscalation(deps: JobDeps, storeId: number): Promise<EscalationSweep> {
  const link = deps.telegram;
  if (!link) return { waiting: 0, told: 0, capped: 0 };
  return sweepEscalations({ db: deps.db, settings: deps.settings, now: deps.now, alert: (_storeId, text) => sendOwnerAlert(link, text) }, storeId);
}

/** Each live store with telling the owner on: one run per minute. */
export const supportEscalationPlanner: Planner = async (deps, now) => {
  if (!deps.telegram) return [];
  const stores = await deps.db.store.findMany({ where: { status: { not: 'ARCHIVED' }, archivedAt: null }, select: { id: true }, orderBy: { id: 'asc' } });
  const out: Awaited<ReturnType<Planner>> = [];
  for (const s of stores) {
    if (!(await deps.settings.value('support.escalation', { storeId: s.id })).enabled) continue;
    const payload = { storeId: s.id };
    out.push({ queue: SUPPORT_QUEUE, name: SUPPORT_ESCALATE_JOB, payload, key: runKey(SUPPORT_ESCALATE_JOB, payload, slotOf(now.getTime(), EVERY_MS)) });
  }
  return out;
};
