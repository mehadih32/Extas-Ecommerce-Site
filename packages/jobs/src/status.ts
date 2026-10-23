// PR 6 — what the admin Server page shows about the background worker (read-only; the page never talks to Redis):
// - the verdict: `ok` (a heartbeat newer than `jobs.heartbeat.staleSeconds`), `stale` (the newest one is older),
//   `stopped` (every worker stopped cleanly and none beats) or `never` (no worker has started on this installation);
// - the workers that beat lately, which one holds the scheduler lock, and how many jobs each runs;
// - the failed jobs from the last `jobs.serverPage.failedHours`: only runs whose newest attempt failed (a job that
//   succeeded on a later try is not listed), newest first, at most `jobs.serverPage.failedLimit`, each with its reason,
//   its try count and when it is tried again (or that it was given up: a dead letter).
import { nowOf, type JobDeps } from './context';

export type WorkerState = 'ok' | 'stale' | 'stopped' | 'never';

export interface WorkerRow {
  workerKey: string;
  hostname: string;
  version: string | null;
  color: string | null;
  isLeader: boolean;
  activeJobs: number;
  startedAt: string;
  beatAt: string;
  stoppedAt: string | null;
  fresh: boolean;
}

export interface FailedJobRow {
  runId: string;
  jobKey: string;
  storeId: number | null;
  status: 'FAILED' | 'DEAD_LETTERED';
  attempt: number;
  maxAttempts: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  nextAttemptAt: string | null;
}

export interface WorkerStatus {
  checkedAt: string;
  state: WorkerState;
  staleAfterSeconds: number;
  /** The newest heartbeat of any worker, or null. */
  lastBeatAt: string | null;
  workers: WorkerRow[];
  leader: WorkerRow | null;
  running: number;
  failed: FailedJobRow[];
  /** Failed runs (newest attempt failed) in the window, by kind: still being tried, and given up. */
  failedCounts: { retrying: number; dead: number };
  failedHours: number;
}

export async function workerStatus(deps: Pick<JobDeps, 'db' | 'settings' | 'now'>): Promise<WorkerStatus> {
  const now = nowOf(deps);
  const [staleS, hours, limit] = await Promise.all([
    deps.settings.value('jobs.heartbeat.staleSeconds'),
    deps.settings.value('jobs.serverPage.failedHours'),
    deps.settings.value('jobs.serverPage.failedLimit'),
  ]);
  const freshFrom = now.getTime() - staleS * 1000;
  // Recent workers: anything that beat inside the failed-jobs window (older rows are history only).
  const since = new Date(now.getTime() - hours * 3_600_000);
  const beats = await deps.db.workerHeartbeat.findMany({ where: { beatAt: { gte: since } }, orderBy: { beatAt: 'desc' }, take: 50 });
  const newest = beats[0] ?? (await deps.db.workerHeartbeat.findFirst({ orderBy: { beatAt: 'desc' } }));
  const workers: WorkerRow[] = beats.map((w) => ({
    workerKey: w.workerKey,
    hostname: w.hostname,
    version: w.version,
    color: w.color,
    isLeader: w.isLeader && !w.stoppedAt && w.beatAt.getTime() >= freshFrom,
    activeJobs: w.stoppedAt ? 0 : w.activeJobs,
    startedAt: w.startedAt.toISOString(),
    beatAt: w.beatAt.toISOString(),
    stoppedAt: w.stoppedAt?.toISOString() ?? null,
    fresh: !w.stoppedAt && w.beatAt.getTime() >= freshFrom,
  }));
  const anyFresh = workers.some((w) => w.fresh);
  const state: WorkerState = !newest ? 'never' : anyFresh ? 'ok' : beats.length && beats.every((w) => w.stoppedAt) ? 'stopped' : 'stale';

  const [running, failed] = await Promise.all([deps.db.jobRun.count({ where: { status: 'RUNNING' } }), failedJobs(deps.db, since, limit)]);
  return {
    checkedAt: now.toISOString(),
    state,
    staleAfterSeconds: staleS,
    lastBeatAt: newest?.beatAt.toISOString() ?? null,
    workers,
    leader: workers.find((w) => w.isLeader) ?? null,
    running,
    failed: failed.rows,
    failedCounts: failed.counts,
    failedHours: hours,
  };
}

/** Runs whose newest attempt failed, newest first. */
async function failedJobs(db: JobDeps['db'], since: Date, limit: number): Promise<{ rows: FailedJobRow[]; counts: { retrying: number; dead: number } }> {
  // Candidates: failed attempts in the window (a bounded read), then every attempt of those runs to find the newest.
  const failedRows = await db.jobRun.findMany({
    where: { status: { in: ['FAILED', 'DEAD_LETTERED'] }, startedAt: { gte: since } },
    orderBy: { startedAt: 'desc' },
    take: limit * 10,
    select: { idempotencyKey: true },
  });
  const keys = [...new Set(failedRows.map((r) => r.idempotencyKey))];
  if (!keys.length) return { rows: [], counts: { retrying: 0, dead: 0 } };
  const all = await db.jobRun.findMany({ where: { idempotencyKey: { in: keys } }, orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }] });
  const newest = new Map<string, (typeof all)[number]>();
  const settled = new Set<string>();
  for (const r of all) {
    if (r.status === 'SUCCEEDED') settled.add(r.idempotencyKey);
    if (r.status === 'SKIPPED') continue;
    if (!newest.has(r.idempotencyKey)) newest.set(r.idempotencyKey, r);
  }
  const open = [...newest.values()].filter((r) => !settled.has(r.idempotencyKey) && (r.status === 'FAILED' || r.status === 'DEAD_LETTERED'));
  open.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const counts = { retrying: open.filter((r) => r.status === 'FAILED').length, dead: open.filter((r) => r.status === 'DEAD_LETTERED').length };
  const rows = open.slice(0, limit).map((r) => ({
    runId: r.id,
    jobKey: r.jobKey,
    storeId: r.storeId,
    status: r.status as FailedJobRow['status'],
    attempt: r.attempt,
    maxAttempts: r.maxAttempts,
    error: r.error,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    nextAttemptAt: r.status === 'FAILED' ? (r.nextAttemptAt?.toISOString() ?? null) : null,
  }));
  return { rows, counts };
}
