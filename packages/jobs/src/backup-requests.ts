// S19 · PR 507 (CN-030) — "Back up now" and "Run the restore drill now" from Settings → System → Backups. The admin
// writes a QUEUED BackupRequest; the server's vault sync (infra/server/bin/extas-vault-sync, every few minutes, through
// server-sync-cli.ts) takes the queued ones (RUNNING), starts each on the server (extas-backup request) and, on a
// later run, hands back what the server wrote (SUCCEEDED or FAILED with the server's own words). One open request of
// each kind at a time (also a partial unique index, migration 0062); a request the server never reported is FAILED
// after `staleHours`. A drill restores into a throw-away copy, never the live database. Nothing is ever deleted.
import type { PrismaClient } from '@extas/db/client';
import { BackupError } from './backups';

export type BackupRequestKind = 'BACKUP' | 'RESTORE_DRILL';
/** Where a drill restores from: `all` (the server's disk and every copy the drill settings name) or one of them. */
export const DRILL_SOURCES = ['all', 'local', 'blob', 'drive'] as const;
export type DrillSource = (typeof DRILL_SOURCES)[number];

type Db = Pick<PrismaClient, 'backupRequest'>;

export interface BackupRequestView {
  id: string;
  kind: BackupRequestKind;
  source: string | null;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  detail: string | null;
  requestedById: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** What the server hands back for one request it ran (state/requests/<id>.json). */
export interface FinishedRequest {
  id: string;
  ok: boolean;
  detail: string;
}

/** What the server is asked to run: the request, its kind and (a drill) its source. */
export interface TakenRequest {
  id: string;
  kind: BackupRequestKind;
  source: DrillSource | null;
}

const OPEN = ['QUEUED', 'RUNNING'] as const;
const DETAIL_MAX = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const view = (r: {
  id: string;
  kind: string;
  source: string | null;
  status: string;
  detail: string | null;
  requestedById: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): BackupRequestView => ({
  id: r.id,
  kind: r.kind as BackupRequestKind,
  source: r.source,
  status: r.status as BackupRequestView['status'],
  detail: r.detail,
  requestedById: r.requestedById,
  createdAt: r.createdAt.toISOString(),
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
});

/** Queues a backup or a drill for the server; one open request of each kind. */
export async function requestBackup(
  db: Db,
  input: { kind: unknown; source?: unknown; actorId: string | null },
): Promise<BackupRequestView> {
  const kind = input.kind === 'BACKUP' || input.kind === 'RESTORE_DRILL' ? input.kind : null;
  if (!kind) throw new BackupError('INVALID_INPUT', 'kind: BACKUP or RESTORE_DRILL');
  let source: DrillSource | null = null;
  if (kind === 'RESTORE_DRILL') {
    const s = input.source ?? 'all';
    if (!DRILL_SOURCES.includes(s as DrillSource)) throw new BackupError('INVALID_INPUT', `source: ${DRILL_SOURCES.join(', ')}`);
    source = s as DrillSource;
  }
  const open = await db.backupRequest.findFirst({ where: { kind, status: { in: [...OPEN] } } });
  if (open) throw new BackupError('BUSY', 'one is waiting or running already');
  try {
    return view(await db.backupRequest.create({ data: { kind, source, requestedById: input.actorId } }));
  } catch (e) {
    // the partial unique index: two at the same moment, the second is refused
    if ((e as { code?: string }).code === 'P2002') throw new BackupError('BUSY', 'one is waiting or running already');
    throw e;
  }
}

/** How many requests the page shows when the caller names no number. */
const LIST_DEFAULT = 20;

/** The newest requests, newest first. */
export async function backupRequests(db: Db, limit = LIST_DEFAULT): Promise<BackupRequestView[]> {
  const rows = await db.backupRequest.findMany({ orderBy: { createdAt: 'desc' }, take: Math.max(1, Math.min(limit, 100)) });
  return rows.map(view);
}

/**
 * The server's side, every vault-sync run: first what it finished (SUCCEEDED or FAILED with its words), then a RUNNING
 * request older than `staleHours` that was never reported is FAILED, then every QUEUED one is taken (RUNNING).
 */
export async function serverRequests(
  db: Db,
  opts: { finished: readonly FinishedRequest[]; now?: Date; staleHours: number },
): Promise<{ taken: TakenRequest[]; finished: number; stale: number }> {
  const now = opts.now ?? new Date();
  let finished = 0;
  for (const f of opts.finished) {
    if (!UUID.test(f.id)) continue;
    const r = await db.backupRequest.updateMany({
      where: { id: f.id, status: 'RUNNING' },
      data: { status: f.ok ? 'SUCCEEDED' : 'FAILED', detail: String(f.detail ?? '').slice(0, DETAIL_MAX), finishedAt: now },
    });
    finished += r.count;
  }
  const stale = await db.backupRequest.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(now.getTime() - opts.staleHours * 3600_000) } },
    data: { status: 'FAILED', detail: 'the server did not report back', finishedAt: now },
  });
  const queued = await db.backupRequest.findMany({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
  const taken: TakenRequest[] = [];
  for (const q of queued) {
    const r = await db.backupRequest.updateMany({ where: { id: q.id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: now } });
    if (r.count) taken.push({ id: q.id, kind: q.kind as BackupRequestKind, source: (q.source as DrillSource | null) ?? null });
  }
  return { taken, finished, stale: stale.count };
}
