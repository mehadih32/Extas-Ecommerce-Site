// PR 6 — each worker process says it is alive every `jobs.heartbeat.everySeconds`: one WorkerHeartbeat row per process
// (its key is hostname:pid:random), with whether it holds the scheduler lock and how many jobs it is running. A worker
// that stops cleanly marks its row stopped; one that dies just stops beating. The Server page reads these rows
// (status.ts); RUNNING attempts of a worker that stopped beating are closed as WORKER_LOST (runs.ts).
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { JobDeps } from './context';

export interface WorkerIdentity {
  workerKey: string;
  hostname: string;
  version: string | null;
  color: string | null;
  queues: string[];
  startedAt: Date;
}

export function newWorkerIdentity(opts: { version?: string | null; color?: string | null; queues: readonly string[]; now?: Date }): WorkerIdentity {
  const host = hostname();
  return {
    workerKey: `${host}:${process.pid}:${randomBytes(4).toString('hex')}`,
    hostname: host,
    version: opts.version || null,
    color: opts.color || null,
    queues: [...opts.queues],
    startedAt: opts.now ?? new Date(),
  };
}

export async function beat(db: JobDeps['db'], id: WorkerIdentity, state: { isLeader: boolean; activeJobs: number }, at: Date): Promise<void> {
  await db.workerHeartbeat.upsert({
    where: { workerKey: id.workerKey },
    create: { workerKey: id.workerKey, hostname: id.hostname, version: id.version, color: id.color, queues: id.queues, startedAt: id.startedAt, beatAt: at, isLeader: state.isLeader, activeJobs: state.activeJobs },
    update: { beatAt: at, isLeader: state.isLeader, activeJobs: state.activeJobs, stoppedAt: null },
  });
}

export async function markStopped(db: JobDeps['db'], workerKey: string, at: Date): Promise<void> {
  await db.workerHeartbeat.updateMany({ where: { workerKey }, data: { stoppedAt: at, isLeader: false, activeJobs: 0 } });
}
