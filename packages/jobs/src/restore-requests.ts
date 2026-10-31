// S19 · PR 396 (CN-030) — restoring from Settings → System → Backups › Restore: staging first, typed confirmation and
// the owner's PIN for production.
//   1. "Restore to the check copy": a RestoreRequest `staging` from the server's disk, Azure Blob (the default) or
//      Google Drive — the newest backup, one picked from the list (Drive) or a minute (disk or Blob, WAL replay). The
//      server restores it into the check copy (container extas-pg-restore), never the live database, and writes back
//      which backup it used.
//   2. "Put this on the live shop": accepted only for the newest staging restore, only when it SUCCEEDED, with RESTORE
//      typed; the caller checks the owner's PIN first. It restores exactly that backup (and minute). The server checks
//      again that the check copy of the same backup passed within RESTORE_STAGING_VALID_H hours, keeps the old data
//      folder, and starts the shop again.
// One open restore at a time (also a partial unique index, migration 0063). The vault sync hands the queued ones to
// the server (`serverRestoreRequests`) and their outcome back. Nothing is ever deleted.
import type { PrismaClient } from '@extas/db/client';
import { BackupError } from './backups';
import type { FinishedRequest } from './backup-requests';

export const RESTORE_SOURCES = ['blob', 'local', 'drive'] as const;
export type RestoreSource = (typeof RESTORE_SOURCES)[number];
export type RestoreEnvironment = 'staging' | 'production';
/** The words the owner types before the live shop is replaced. */
export const RESTORE_WORD = 'RESTORE';

type Db = Pick<PrismaClient, 'restoreRequest'>;

export interface RestoreRequestView {
  id: string;
  environment: RestoreEnvironment;
  source: RestoreSource | null;
  backup: string | null;
  pointInTime: string | null;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  detail: string | null;
  stagingOfId: string | null;
  requestedById: string | null;
  approvedById: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** What the server is asked to run for one restore. */
export interface TakenRestore {
  id: string;
  kind: 'RESTORE_STAGING' | 'RESTORE_PRODUCTION';
  source: RestoreSource;
  backup: string | null;
  /** The minute to restore to (ISO, UTC); null = as late as the backup goes. */
  at: string | null;
  stagingOf: string | null;
}

/** A backup's stamp as extas-backup names it (YYYYMMDD-HHMM). */
const STAMP = /^[0-9]{8}-[0-9]{4}$/;
const OPEN = ['QUEUED', 'RUNNING'] as const;
const DETAIL_MAX = 1000;
const LIST_DEFAULT = 10;
const LIST_MAX = 100;
const HOUR_MS = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = {
  id: string;
  environment: string;
  source: string | null;
  backup: string | null;
  pointInTime: Date | null;
  status: string;
  detail: string | null;
  stagingOfId: string | null;
  requestedById: string | null;
  approvedById: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

const view = (r: Row): RestoreRequestView => ({
  id: r.id,
  environment: r.environment === 'production' ? 'production' : 'staging',
  source: (r.source as RestoreSource | null) ?? null,
  backup: r.backup,
  pointInTime: r.pointInTime?.toISOString() ?? null,
  status: r.status as RestoreRequestView['status'],
  detail: r.detail,
  stagingOfId: r.stagingOfId,
  requestedById: r.requestedById,
  approvedById: r.approvedById,
  createdAt: r.createdAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
});

async function create(db: Db, data: Parameters<Db['restoreRequest']['create']>[0]['data']): Promise<RestoreRequestView> {
  if (await db.restoreRequest.findFirst({ where: { status: { in: [...OPEN] } } })) throw new BackupError('BUSY', 'a restore is waiting or running already');
  try {
    return view((await db.restoreRequest.create({ data })) as Row);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new BackupError('BUSY', 'a restore is waiting or running already');
    throw e;
  }
}

/** Step 1: a backup into the check copy. */
export async function requestStagingRestore(
  db: Db,
  input: { source?: unknown; backup?: unknown; pointInTime?: unknown; actorId: string | null; now?: Date },
): Promise<RestoreRequestView> {
  const source = (input.source ?? 'blob') as RestoreSource;
  if (!RESTORE_SOURCES.includes(source)) throw new BackupError('INVALID_INPUT', `source: ${RESTORE_SOURCES.join(', ')}`);
  const backup = input.backup === undefined || input.backup === null || input.backup === '' ? null : String(input.backup);
  if (backup !== null && !STAMP.test(backup)) throw new BackupError('INVALID_INPUT', 'backup: a stamp like 20261031-0230');
  let pointInTime: Date | null = null;
  if (input.pointInTime !== undefined && input.pointInTime !== null && input.pointInTime !== '') {
    if (source === 'drive') throw new BackupError('INVALID_INPUT', 'pointInTime: Google Drive keeps whole nights only (no minute)');
    if (backup !== null) throw new BackupError('INVALID_INPUT', 'pointInTime: a minute or a backup, not both');
    const t = new Date(String(input.pointInTime));
    if (Number.isNaN(t.getTime())) throw new BackupError('INVALID_INPUT', 'pointInTime: a date and time');
    if (t.getTime() > (input.now ?? new Date()).getTime()) throw new BackupError('INVALID_INPUT', 'pointInTime: not in the future');
    pointInTime = t;
  }
  return create(db, { target: 'database', environment: 'staging', source, backup, pointInTime, requestedById: input.actorId });
}

/**
 * Step 2: the same backup on the live shop. The caller has checked the owner's PIN; `approvedById` is that owner.
 * Refused unless `stagingOfId` is the newest staging restore, it SUCCEEDED and RESTORE was typed.
 */
export async function requestProductionRestore(
  db: Db,
  input: { stagingOfId: unknown; confirm: unknown; actorId: string | null },
): Promise<RestoreRequestView> {
  if (input.confirm !== RESTORE_WORD) throw new BackupError('INVALID_INPUT', `confirm: type ${RESTORE_WORD}`);
  const id = typeof input.stagingOfId === 'string' && UUID.test(input.stagingOfId) ? input.stagingOfId : null;
  if (!id) throw new BackupError('INVALID_INPUT', 'stagingOfId: the staging restore it follows');
  const newest = (await db.restoreRequest.findFirst({ where: { environment: 'staging' }, orderBy: { createdAt: 'desc' } })) as Row | null;
  if (!newest || newest.id !== id) throw new BackupError('STAGING_FIRST', 'only the newest check copy can go on the live shop');
  if (newest.status !== 'SUCCEEDED' || !newest.backup) throw new BackupError('STAGING_FIRST', 'the check copy has not passed');
  return create(db, {
    target: 'database',
    environment: 'production',
    source: newest.source,
    backup: newest.backup,
    pointInTime: newest.pointInTime,
    stagingOfId: newest.id,
    confirmationTyped: true,
    requestedById: input.actorId,
    approvedById: input.actorId,
  });
}

/** The newest restores, newest first. */
export async function restoreRequests(db: Db, limit = LIST_DEFAULT): Promise<RestoreRequestView[]> {
  const rows = await db.restoreRequest.findMany({ orderBy: { createdAt: 'desc' }, take: Math.max(1, Math.min(limit, LIST_MAX)) });
  return (rows as Row[]).map(view);
}

/**
 * The server's side, every vault-sync run (beside `serverRequests`): what it finished goes back (with the backup it
 * used), a RUNNING restore older than `staleHours` is FAILED, every QUEUED one is taken.
 */
export async function serverRestoreRequests(
  db: Db,
  opts: { finished: readonly (FinishedRequest & { backup?: string })[]; now?: Date; staleHours: number },
): Promise<{ taken: TakenRestore[]; finished: number; stale: number }> {
  const now = opts.now ?? new Date();
  let finished = 0;
  for (const f of opts.finished) {
    if (!UUID.test(f.id)) continue;
    const backup = typeof f.backup === 'string' && STAMP.test(f.backup) ? f.backup : undefined;
    const r = await db.restoreRequest.updateMany({
      where: { id: f.id, status: 'RUNNING' },
      data: { status: f.ok ? 'SUCCEEDED' : 'FAILED', detail: String(f.detail ?? '').slice(0, DETAIL_MAX), finishedAt: now, ...(backup ? { backup } : {}) },
    });
    finished += r.count;
  }
  const stale = await db.restoreRequest.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - opts.staleHours * HOUR_MS) } },
    data: { status: 'FAILED', detail: 'the server did not report back', finishedAt: now },
  });
  const queued = (await db.restoreRequest.findMany({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } })) as Row[];
  const taken: TakenRestore[] = [];
  for (const q of queued) {
    const source = RESTORE_SOURCES.includes(q.source as RestoreSource) ? (q.source as RestoreSource) : null;
    const production = q.environment === 'production';
    if (!source || (production && !q.stagingOfId) || (q.backup !== null && !STAMP.test(q.backup))) {
      await db.restoreRequest.updateMany({ where: { id: q.id, status: 'QUEUED' }, data: { status: 'FAILED', detail: 'not a restore the server can run', finishedAt: now } });
      continue;
    }
    const r = await db.restoreRequest.updateMany({ where: { id: q.id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: now } });
    if (r.count) {
      taken.push({
        id: q.id,
        kind: production ? 'RESTORE_PRODUCTION' : 'RESTORE_STAGING',
        source,
        backup: q.backup,
        at: q.pointInTime?.toISOString() ?? null,
        stagingOf: q.stagingOfId,
      });
    }
  }
  return { taken, finished, stale: stale.count };
}
