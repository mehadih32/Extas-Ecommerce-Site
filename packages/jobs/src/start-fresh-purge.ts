// S28 · PR 706 — Start fresh, the server's purge. The site (apps/web lib/start-fresh.ts) clears what it may delete itself and
// leaves a run PARTIAL; this job finishes it: the database function `extas_start_fresh_purge` (migration 0277) removes the
// orders, customers, chats, coupon uses and analytics of that store made up to the moment the run began, with everything
// that hangs on them, in one transaction. It runs only for a run the owner made (PIN, typed words, fresh backup), once;
// the function itself refuses any other run. Customer problems, products, settings, staff and rules are never touched.
// The work is written to the audit log in the owner's name. This is the owner's one-time act, not a retention rule.
// This module imports `./keys`, never `./scheduler`.
import { Prisma, type PrismaClient } from '@extas/db/client';
import { runKey, slotOf } from './keys';
import type { Planner } from './worker';

export const START_FRESH_PURGE_JOB = 'startFresh.purge';
export const START_FRESH_QUEUE = 'startfresh';
const MINUTE = 60_000;
/** How often a waiting purge is looked for. */
export const START_FRESH_EVERY_MINUTES = 5; // hardcode-ok: a polling interval of an internal sweep

export interface PurgeAnswer {
  status: 'done' | 'nothing-waiting';
  runId?: string;
  removed?: Record<string, number>;
  total?: number;
}

/** Finishes the one waiting run of a store. Safe to run twice: a run that is DONE is not waiting any more. */
export async function runStartFreshPurge(db: PrismaClient, storeId: number): Promise<PurgeAnswer> {
  const run = await db.startFreshRun.findFirst({ where: { storeId, status: 'PARTIAL', purgedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!run) return { status: 'nothing-waiting' };
  const rows = await db.$queryRaw<{ r: Record<string, number> }[]>(Prisma.sql`SELECT extas_start_fresh_purge(${run.id}::uuid) AS r`);
  const removed = rows[0]?.r ?? {};
  const total = Object.values(removed).reduce((n, v) => n + Number(v), 0);
  await db.auditLog.create({
    data: { storeId, actorType: run.requestedById ? 'STAFF' : 'SYSTEM', actorId: run.requestedById, action: 'startFresh.purge', entityType: 'StartFreshRun', entityId: run.id, after: { removed, total } as Prisma.InputJsonValue, source: 'worker' },
  });
  return { status: 'done', runId: run.id, removed, total };
}

/** Each store with a run that waits for its purge. */
export const startFreshPlanner: Planner = async (deps, now) => {
  const runs = await deps.db.startFreshRun.findMany({ where: { status: 'PARTIAL', purgedAt: null }, select: { storeId: true }, distinct: ['storeId'] });
  return runs.map((r) => {
    const payload = { storeId: r.storeId };
    return { queue: START_FRESH_QUEUE, name: START_FRESH_PURGE_JOB, payload, key: runKey(START_FRESH_PURGE_JOB, payload, slotOf(now.getTime(), START_FRESH_EVERY_MINUTES * MINUTE)) };
  });
};

