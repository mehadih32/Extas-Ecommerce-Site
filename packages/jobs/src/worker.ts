// PR 6 — the worker process's engine (BullMQ on the Redis queue store, PR 6 server setup: no eviction, AOF on the data
// disk). One call, `startWorker`, runs everything a worker does until `stop()`:
// - a BullMQ Worker per queue (`jobs.concurrency` jobs at once, a job lock of `jobs.lockSeconds` renewed while the job
//   runs; a job whose worker died is taken over by a live worker after the lock runs out — "stalled" — and run again);
// - each job's attempt goes through `runAttempt` (runs.ts): a JobRun row per attempt, the run-level idempotency guard,
//   and on failure a throw so the queue tries again after `retryDelayMs` (the same wait the row shows), up to
//   `jobs.retry.maxAttempts`; after the last try the job stays in the queue's failed set (the dead letter) and its row
//   is DEAD_LETTERED;
// - the heartbeat every `jobs.heartbeat.everySeconds` (heartbeat.ts), also written to a small file the container's
//   health check reads;
// - the leader lock (leader.ts), renewed every third of `jobs.leader.lockSeconds`; only the leader plans jobs
//   (scheduler.ts) every `jobs.scheduler.tickSeconds` while `jobs.scheduler.enabled` is on, and closes RUNNING rows of
//   workers that stopped beating (runs.ts `closeLostRuns`).
// Settings are read when the worker starts and again on every tick, so a changed interval applies without a restart
// (the queue options — concurrency, lock — apply at the next start).
import { writeFile } from 'node:fs/promises';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { retryDelayMs, retryPolicyOf, type RetryPolicy } from './backoff';
import { JOBS, type JobDefinition } from './catalogue';
import { errorLine, nowOf, type JobDeps } from './context';
import { beat, markStopped, newWorkerIdentity, type WorkerIdentity } from './heartbeat';
import { LeaderLock } from './leader';
import { closeLostRuns, ensureScheduledJob, recordQueueFailure, runAttempt } from './runs';
import { dueRuns, timetable, type PlannedJob } from './scheduler';

export interface WorkerOptions {
  deps: JobDeps;
  /** The Redis queue store (REDIS_QUEUE_URL on the server). */
  redisUrl: string;
  /** The commit and the blue/green colour the worker runs as (shown on the Server page). */
  version?: string | null;
  color?: string | null;
  /** A file the container's health check reads: the last heartbeat time and how old it may be. */
  healthFile?: string | null;
  /** Queue name prefix (tests use their own, so they never touch real queues). */
  prefix?: string;
  /** Extra planners the leader runs on every tick (PR 196: waiting ERP webhook events). */
  planners?: Planner[];
  /** The jobs this worker runs (default: every job in the catalogue). Tests pass their own. */
  jobs?: ReadonlyMap<string, JobDefinition<unknown>>;
  log?: (line: string) => void;
}

/** Something the leader asks on every tick for jobs to put on the queue (each with its own id: added once). */
export type Planner = (deps: JobDeps, now: Date) => Promise<Omit<PlannedJob, 'nextAt'>[]>;

export interface RunningWorker {
  identity: WorkerIdentity;
  isLeader(): boolean;
  /** Plans and enqueues now (the leader's tick), for tests and the first tick. */
  tick(): Promise<number>;
  /** Puts one job on its queue (tests, and the planners). */
  enqueue(job: Omit<PlannedJob, 'nextAt'>): Promise<void>;
  stop(): Promise<void>;
  /**
   * Test seam only (never called by the app): stops at once like a killed process — no clean-up, the leader lock and
   * running jobs' locks are left to run out, the heartbeat row is not marked stopped.
   */
  kill(): Promise<void>;
}

/** Queue job options for one run: its id is the run key, so planning the same run twice adds it once. */
function jobOptions(key: string, policy: RetryPolicy, keepCompleted: number, keepFailed: number) {
  return {
    jobId: key,
    attempts: policy.maxAttempts,
    backoff: { type: 'extas' },
    removeOnComplete: { count: keepCompleted },
    removeOnFail: { count: keepFailed },
  };
}

export async function startWorker(opts: WorkerOptions): Promise<RunningWorker> {
  const { deps } = opts;
  const log = opts.log ?? ((line: string) => console.log(`[worker] ${line}`));
  const prefix = opts.prefix ?? 'extas';
  const read = async () => {
    const s = deps.settings;
    const [concurrency, lockS, everyS, staleS, leaderS, tickS, enabled, keepCompleted, keepFailed, policy] = await Promise.all([
      s.value('jobs.concurrency'),
      s.value('jobs.lockSeconds'),
      s.value('jobs.heartbeat.everySeconds'),
      s.value('jobs.heartbeat.staleSeconds'),
      s.value('jobs.leader.lockSeconds'),
      s.value('jobs.scheduler.tickSeconds'),
      s.value('jobs.scheduler.enabled'),
      s.value('jobs.queue.keepCompleted'),
      s.value('jobs.queue.keepFailed'),
      retryPolicyOf(s),
    ]);
    return { concurrency, lockS, everyS, staleS, leaderS, tickS, enabled, keepCompleted, keepFailed, policy };
  };
  let cfg = await read();

  const catalogue = opts.jobs ?? JOBS;
  const jobDefinition = (key: string) => catalogue.get(key) ?? null;
  const QUEUES = [...new Set([...catalogue.values()].map((d) => d.queue))];
  const identity = newWorkerIdentity({ version: opts.version, color: opts.color, queues: QUEUES, now: nowOf(deps) });
  const connection = new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (e) => log(`redis: ${errorLine(e)}`));
  const leader = new LeaderLock(connection, identity.workerKey, cfg.leaderS * 1000, `${prefix}:jobs:leader`);
  const queues = new Map(QUEUES.map((q) => [q, new Queue(q, { connection, prefix })]));
  for (const def of catalogue.values()) await ensureScheduledJob(deps.db, def);

  let active = 0;
  let stopping = false;
  const writeHealth = async (at: Date) => {
    if (!opts.healthFile) return;
    await writeFile(opts.healthFile, JSON.stringify({ at: at.getTime(), staleMs: cfg.staleS * 1000, workerKey: identity.workerKey })).catch(() => {});
  };
  const doBeat = async () => {
    const at = nowOf(deps);
    try {
      await beat(deps.db, identity, { isLeader: leader.isLeader, activeJobs: active }, at);
      await writeHealth(at);
    } catch (e) {
      log(`heartbeat failed: ${errorLine(e)}`);
    }
  };
  // The first beat comes before any job is taken, so a RUNNING row always has a live worker behind it.
  await doBeat();

  const processor = async (job: Job) => {
    const def = jobDefinition(job.name);
    if (!def) throw new UnrecoverableError(`no job called "${job.name}"`);
    active++;
    try {
      const r = await runAttempt(deps, {
        def,
        payload: job.data,
        idempotencyKey: job.id ?? `${job.name}/${job.timestamp}`,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 1,
        policy: cfg.policy,
        workerKey: identity.workerKey,
        queueJobId: job.id ?? null,
        staleSeconds: cfg.staleS,
      });
      if (r.kind === 'failed') throw new Error(r.error);
      return { kind: r.kind, runId: r.runId };
    } finally {
      active--;
    }
  };

  const workers = QUEUES.map((q) => {
    const w = new Worker(q, processor, {
      connection,
      prefix,
      concurrency: cfg.concurrency,
      lockDuration: cfg.lockS * 1000,
      stalledInterval: cfg.lockS * 1000,
      // A job may be taken over from a dead worker as often as it may be tried; then it is a dead letter.
      maxStalledCount: cfg.policy.maxAttempts,
      settings: { backoffStrategy: (attemptsMade: number) => retryDelayMs(attemptsMade, cfg.policy) },
    });
    w.on('failed', (job, err) => {
      if (!job) return;
      // A job the queue gave up on without our function finishing it (stalled too often): one DEAD_LETTERED row.
      if (/stalled/i.test(err?.message ?? '')) {
        const def = jobDefinition(job.name);
        if (!def) return;
        let storeId: number | null = null;
        try {
          storeId = def.storeOf(def.parse(job.data));
        } catch {
          storeId = null;
        }
        void recordQueueFailure(deps, {
          def,
          idempotencyKey: job.id ?? job.name,
          storeId,
          payload: job.data,
          attempt: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 1,
          workerKey: identity.workerKey,
          queueJobId: job.id ?? null,
          error: `STALLED: ${err.message}`,
        }).catch((e) => log(`recording a stalled job failed: ${errorLine(e)}`));
      }
    });
    w.on('error', (e) => log(`queue ${q}: ${errorLine(e)}`));
    return w;
  });

  const enqueue = async (j: Omit<PlannedJob, 'nextAt'>) => {
    const q = queues.get(j.queue);
    if (!q) throw new Error(`no queue "${j.queue}"`);
    await q.add(j.name, j.payload, jobOptions(j.key, cfg.policy, cfg.keepCompleted, cfg.keepFailed));
  };

  const planned = new Map<string, number>();
  const tick = async (): Promise<number> => {
    if (!(await leader.acquireOrRenew())) return 0;
    cfg = await read();
    leader.setTtl(cfg.leaderS * 1000);
    if (!cfg.enabled) return 0;
    const now = nowOf(deps);
    let n = 0;
    try {
      const due = dueRuns(await timetable(deps), now.getTime(), planned, jobDefinition);
      for (const j of due) {
        await enqueue(j);
        await deps.db.scheduledJob.updateMany({ where: { key: j.name }, data: { nextRunAt: j.nextAt } });
        n++;
      }
      for (const p of opts.planners ?? []) {
        for (const j of await p(deps, now)) {
          await enqueue(j);
          n++;
        }
      }
      const lost = await closeLostRuns(deps, cfg.staleS);
      if (lost) log(`closed ${lost} run(s) of a stopped worker`);
    } catch (e) {
      log(`scheduler tick failed: ${errorLine(e)}`);
    }
    return n;
  };

  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, fn: () => Promise<unknown>) => {
    let busy = false;
    const t = setInterval(() => {
      if (busy || stopping) return;
      busy = true;
      fn().finally(() => {
        busy = false;
      });
    }, ms);
    t.unref();
    timers.push(t);
  };
  every(cfg.everyS * 1000, doBeat);
  every(Math.max(1000, Math.floor((cfg.leaderS * 1000) / 3)), async () => {
    const was = leader.isLeader;
    const now = await leader.acquireOrRenew();
    if (now !== was) log(now ? 'leading the scheduler' : 'no longer leading the scheduler');
  });
  every(cfg.tickS * 1000, tick);
  log(`started ${identity.workerKey} on ${QUEUES.join(', ')}`);

  return {
    identity,
    isLeader: () => leader.isLeader,
    tick,
    enqueue,
    async stop() {
      if (stopping) return;
      stopping = true;
      for (const t of timers) clearInterval(t);
      await leader.release();
      // Running jobs finish first (the container's stop grace period bounds it).
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all([...queues.values()].map((q) => q.close()));
      await markStopped(deps.db, identity.workerKey, nowOf(deps)).catch(() => {});
      await connection.quit().catch(() => {});
      log('stopped');
    },
    async kill() {
      stopping = true;
      for (const t of timers) clearInterval(t);
      connection.disconnect();
      await Promise.all(workers.map((w) => w.close(true).catch(() => {})));
    },
  };
}
