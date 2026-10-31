// PR 6 — one attempt of a job, recorded as a JobRun row. Every attempt of one run carries the run's idempotency key
// (the job, its store and its time slot, or the event it handles), and the key is what makes a retry safe:
//
// 1. Claim (one short transaction, serialised per job by locking its ScheduledJob row): when an attempt of this key
//    already SUCCEEDED, this attempt is recorded as SKIPPED and the job's function is never called — the queue may
//    deliver a job twice (a worker stopped after the work but before the queue heard back), the side effect happens
//    once. When another attempt of the key is RUNNING on a live worker, this one is SKIPPED too (never two at once).
//    A RUNNING attempt whose worker stopped (no heartbeat for `jobs.heartbeat.staleSeconds`, or marked stopped) is
//    closed as FAILED with WORKER_LOST, and this attempt goes ahead.
// 2. Run the function. Inside it, each domain keeps its own idempotency (stock movements, ERP documents), so work an
//    earlier attempt finished before it was cut off is not done again.
// 3. Close the row once: SUCCEEDED with a short summary; or FAILED with the reason and the next attempt time
//    (backoff.ts); or DEAD_LETTERED when this was the last try. Rows are never deleted.
import type { Prisma } from '@extas/db/client';
import { retryDelayMs, type RetryPolicy } from './backoff';
import type { JobDefinition, JobOutcome } from './catalogue';
import { errorLine, nowOf, type JobDeps } from './context';

export interface AttemptInput {
  def: JobDefinition<unknown>;
  payload: unknown;
  idempotencyKey: string;
  /** This attempt's number as the queue counts it (1 = first try) and how many tries the queue allows. */
  attempt: number;
  maxAttempts: number;
  policy: RetryPolicy;
  workerKey: string;
  queueJobId?: string | null;
  /** How old a worker's heartbeat may be before its RUNNING attempts count as lost. */
  staleSeconds: number;
  /**
   * R1 ops review (M10): the longest one attempt may run (`jobs.attemptTimeoutSeconds`; 0 = no limit). A job that never
   * returns (a courier, payment or ERP call with no socket timeout) used to hold one of the worker's slots for good while
   * its lock and the heartbeat stayed fresh; now the attempt fails with TIMED_OUT and the normal retry runs.
   */
  timeoutSeconds?: number;
}

/** The outcome of `run`, or a TIMED_OUT failure once `seconds` passed (0 or less: no limit). Never throws. */
export async function withDeadline(run: () => Promise<JobOutcome>, seconds: number | undefined): Promise<JobOutcome> {
  const attempt = run().catch((e: unknown): JobOutcome => ({ ok: false, error: errorLine(e), stats: {} }));
  if (!seconds || seconds <= 0) return attempt;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<JobOutcome>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, error: `TIMED_OUT: the job did not finish within ${seconds} seconds (jobs.attemptTimeoutSeconds); it is tried again`, stats: {} }),
      seconds * 1000,
    );
  });
  try {
    return await Promise.race([attempt, late]);
  } finally {
    clearTimeout(timer);
  }
}

export type AttemptResult =
  | { kind: 'succeeded'; runId: string; stats: Record<string, unknown> }
  | { kind: 'skipped'; runId: string; reason: 'ALREADY_DONE' | 'RUNNING_ELSEWHERE' }
  | { kind: 'failed'; runId: string; error: string; final: boolean; nextAttemptAt: Date | null };

const TX = { maxWait: 10_000, timeout: 30_000 } as const;

/** Makes sure the job has its ScheduledJob row (JobRun.jobKey points at it). Idempotent. */
export async function ensureScheduledJob(db: JobDeps['db'] | Prisma.TransactionClient, def: Pick<JobDefinition<unknown>, 'key' | 'queue'>, scheduleSettingKey: string | null = null): Promise<void> {
  await db.scheduledJob.upsert({
    where: { key: def.key },
    create: { key: def.key, queue: def.queue, scheduleSettingKey, enabled: true },
    update: {},
  });
}

/** Workers whose heartbeat is fresh and that did not stop. */
async function liveWorkers(tx: Prisma.TransactionClient, keys: string[], now: Date, staleSeconds: number): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await tx.workerHeartbeat.findMany({
    where: { workerKey: { in: keys }, stoppedAt: null, beatAt: { gte: new Date(now.getTime() - staleSeconds * 1000) } },
    select: { workerKey: true },
  });
  return new Set(rows.map((r) => r.workerKey));
}

type Claim = { go: true; runId: string; attempt: number } | { go: false; runId: string; reason: 'ALREADY_DONE' | 'RUNNING_ELSEWHERE' };

async function claim(deps: JobDeps, input: AttemptInput, storeId: number | null): Promise<Claim> {
  const now = nowOf(deps);
  await ensureScheduledJob(deps.db, input.def);
  return deps.db.$transaction(async (tx) => {
    // One claim at a time per job: two workers can never both decide "not done yet" for the same key.
    await tx.$queryRaw`SELECT "id" FROM "ScheduledJob" WHERE "key" = ${input.def.key} FOR UPDATE`;
    const earlier = await tx.jobRun.findMany({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true, workerKey: true, queueJobId: true },
      orderBy: { startedAt: 'asc' },
    });
    const base = {
      storeId,
      jobKey: input.def.key,
      queue: input.def.queue,
      idempotencyKey: input.idempotencyKey,
      queueJobId: input.queueJobId ?? null,
      payload: (input.payload ?? null) as Prisma.InputJsonValue,
      maxAttempts: input.maxAttempts,
      workerKey: input.workerKey,
      startedAt: now,
    };
    const tries = earlier.filter((r) => r.status !== 'SKIPPED').length;
    const attempt = Math.max(input.attempt, tries + 1);
    const done = earlier.find((r) => r.status === 'SUCCEEDED');
    const skip = async (reason: 'ALREADY_DONE' | 'RUNNING_ELSEWHERE', sameAs: string) => {
      const row = await tx.jobRun.create({ data: { ...base, status: 'SKIPPED', attempt, finishedAt: now, stats: { reason, sameAs } }, select: { id: true } });
      return { go: false as const, runId: row.id, reason };
    };
    if (done) return skip('ALREADY_DONE', done.id);
    const running = earlier.filter((r) => r.status === 'RUNNING');
    if (running.length) {
      const alive = await liveWorkers(tx, running.map((r) => r.workerKey ?? '').filter(Boolean), now, input.staleSeconds);
      // The same queue job running again means the queue took it from a worker that lost it (stalled, killed): that
      // attempt is over, whatever its heartbeat says. Another queue job of the same run on a live worker is busy.
      const busy = running.find((r) => r.queueJobId !== (input.queueJobId ?? null) && r.workerKey && alive.has(r.workerKey) && r.workerKey !== input.workerKey);
      if (busy) return skip('RUNNING_ELSEWHERE', busy.id);
      await tx.jobRun.updateMany({
        where: { id: { in: running.map((r) => r.id) }, status: 'RUNNING' },
        data: { status: 'FAILED', finishedAt: now, error: 'WORKER_LOST: the worker stopped in the middle of this job; it was run again' },
      });
    }
    const row = await tx.jobRun.create({ data: { ...base, status: 'RUNNING', attempt }, select: { id: true } });
    return { go: true as const, runId: row.id, attempt };
  }, TX);
}

/** Runs one attempt of a job and records it. Never throws for the job's own failure: the result says what happened. */
export async function runAttempt(deps: JobDeps, input: AttemptInput): Promise<AttemptResult> {
  const payload = input.def.parse(input.payload);
  const storeId = input.def.storeOf(payload);
  const c = await claim(deps, { ...input, payload }, storeId);
  if (!c.go) return { kind: 'skipped', runId: c.runId, reason: c.reason };

  const outcome = await withDeadline(() => input.def.run(deps, payload), input.timeoutSeconds);
  const now = nowOf(deps);
  // The row is closed only while it is still RUNNING: when this worker was given up as lost meanwhile (its row says
  // WORKER_LOST and another attempt took over), a late finish never rewrites that history.
  const open = { id: c.runId, status: 'RUNNING' as const };
  if (outcome.ok) {
    await deps.db.jobRun.updateMany({ where: open, data: { status: 'SUCCEEDED', finishedAt: now, stats: outcome.stats as Prisma.InputJsonValue, nextAttemptAt: null, error: null } });
    await deps.db.scheduledJob.update({ where: { key: input.def.key }, data: { lastRunAt: now } });
    return { kind: 'succeeded', runId: c.runId, stats: outcome.stats };
  }
  const final = input.attempt >= input.maxAttempts;
  const nextAttemptAt = final ? null : new Date(now.getTime() + retryDelayMs(input.attempt, input.policy));
  const error = errorLine(outcome.error);
  await deps.db.jobRun.updateMany({
    where: open,
    data: { status: final ? 'DEAD_LETTERED' : 'FAILED', finishedAt: now, stats: outcome.stats as Prisma.InputJsonValue, nextAttemptAt, error },
  });
  return { kind: 'failed', runId: c.runId, error, final, nextAttemptAt };
}

/**
 * A job the queue gave up on without our function running (it stalled more often than allowed, or its payload was
 * not readable): one DEAD_LETTERED row with the reason, so the Server page shows it.
 */
export async function recordQueueFailure(
  deps: JobDeps,
  input: { def: Pick<JobDefinition<unknown>, 'key' | 'queue'>; idempotencyKey: string; storeId: number | null; payload: unknown; attempt: number; maxAttempts: number; workerKey: string; queueJobId: string | null; error: string },
): Promise<string> {
  const now = nowOf(deps);
  await ensureScheduledJob(deps.db, input.def);
  const row = await deps.db.jobRun.create({
    data: {
      storeId: input.storeId,
      jobKey: input.def.key,
      queue: input.def.queue,
      idempotencyKey: input.idempotencyKey,
      queueJobId: input.queueJobId,
      payload: (input.payload ?? null) as Prisma.InputJsonValue,
      maxAttempts: input.maxAttempts,
      attempt: input.attempt,
      workerKey: input.workerKey,
      status: 'DEAD_LETTERED',
      startedAt: now,
      finishedAt: now,
      error: errorLine(input.error),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Closes RUNNING attempts whose worker is gone (no heartbeat for `staleSeconds`, or stopped): FAILED with WORKER_LOST.
 * The queue runs them again on a live worker; this only keeps the history honest. Returns how many were closed.
 */
export async function closeLostRuns(deps: JobDeps, staleSeconds: number): Promise<number> {
  const now = nowOf(deps);
  const running = await deps.db.jobRun.findMany({ where: { status: 'RUNNING' }, select: { id: true, workerKey: true } });
  if (!running.length) return 0;
  const keys = [...new Set(running.map((r) => r.workerKey).filter((k): k is string => Boolean(k)))];
  const alive = new Set(
    (await deps.db.workerHeartbeat.findMany({ where: { workerKey: { in: keys }, stoppedAt: null, beatAt: { gte: new Date(now.getTime() - staleSeconds * 1000) } }, select: { workerKey: true } })).map((w) => w.workerKey),
  );
  const lost = running.filter((r) => !r.workerKey || !alive.has(r.workerKey)).map((r) => r.id);
  if (!lost.length) return 0;
  const r = await deps.db.jobRun.updateMany({
    where: { id: { in: lost }, status: 'RUNNING' },
    data: { status: 'FAILED', finishedAt: now, error: 'WORKER_LOST: the worker stopped in the middle of this job; it runs again' },
  });
  return r.count;
}
