// S19 · PR 507 — "Back up now" and "Run the restore drill now": queued in the admin, one open request of each kind,
// taken by the server's vault sync (RUNNING), finished with the server's words, a silent one FAILED after the stale
// hours; a wrong id or a finished request is never changed again; the settings file the server reads.
import { describe, expect, it } from 'vitest';
import { backupRequests, requestBackup, serverRequests } from './backup-requests';
import { backupPart, backupSettingsPart, type PartContext, type SyncConnection } from './server-sync';

type Row = Record<string, unknown> & { id: string; kind: string; status: string; createdAt: Date; startedAt: Date | null };

function memoryDb() {
  const rows: Row[] = [];
  let n = 0;
  const match = (r: Row, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v.in as unknown[]).includes(r[k]);
      if (v && typeof v === 'object' && 'lt' in v) return r[k] instanceof Date && (r[k] as Date) < (v.lt as Date);
      return r[k] === v;
    });
  const db = {
    backupRequest: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => match(r, where)) ?? null,
      findMany: async ({ where = {}, orderBy, take }: { where?: Record<string, unknown>; orderBy?: { createdAt: 'asc' | 'desc' }; take?: number }) => {
        const out = rows.filter((r) => match(r, where)).sort((a, b) => +a.createdAt - +b.createdAt);
        if (orderBy?.createdAt === 'desc') out.reverse();
        return take ? out.slice(0, take) : out;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        n += 1;
        const r = {
          id: `0190a3c4-0000-7000-8000-${String(n).padStart(12, '0')}`,
          status: 'QUEUED',
          source: null,
          detail: null,
          requestedById: null,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date(Date.now() + n),
          ...data,
        } as unknown as Row;
        rows.push(r);
        return r;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = rows.filter((r) => match(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    },
  };
  return { db: db as never, rows };
}

describe('backup requests (PR 507)', () => {
  it('queues a backup and a drill; a second open one of the same kind is BUSY; a bad kind or source is refused', async () => {
    const { db } = memoryDb();
    const b = await requestBackup(db, { kind: 'BACKUP', actorId: 'owner' });
    expect(b).toMatchObject({ kind: 'BACKUP', status: 'QUEUED', source: null, requestedById: 'owner' });
    await expect(requestBackup(db, { kind: 'BACKUP', actorId: 'owner' })).rejects.toMatchObject({ code: 'BUSY' });
    expect(await requestBackup(db, { kind: 'RESTORE_DRILL', actorId: 'owner' })).toMatchObject({ source: 'all' });
    await expect(requestBackup(db, { kind: 'RESTORE', actorId: null })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(requestBackup(db, { kind: 'RESTORE_DRILL', source: 'production', actorId: null })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect((await backupRequests(db)).map((r) => r.kind)).toEqual(['RESTORE_DRILL', 'BACKUP']);
  });

  it('the server takes the queued ones, finishes them with its words, and a silent one fails after the stale hours', async () => {
    const { db, rows } = memoryDb();
    const b = await requestBackup(db, { kind: 'BACKUP', actorId: null });
    const d = await requestBackup(db, { kind: 'RESTORE_DRILL', source: 'blob', actorId: null });
    const t0 = new Date('2026-10-31T10:00:00Z');
    const first = await serverRequests(db, { finished: [], now: t0, staleHours: 12 });
    expect(first.taken).toEqual([
      { id: b.id, kind: 'BACKUP', source: null },
      { id: d.id, kind: 'RESTORE_DRILL', source: 'blob' },
    ]);
    expect((await serverRequests(db, { finished: [], now: t0, staleHours: 12 })).taken).toEqual([]);
    // a new one can be asked while the old one runs? no: running counts as open
    await expect(requestBackup(db, { kind: 'BACKUP', actorId: null })).rejects.toMatchObject({ code: 'BUSY' });

    const later = new Date('2026-10-31T10:20:00Z');
    const r = await serverRequests(db, { finished: [{ id: b.id, ok: true, detail: 'every copy checked' }, { id: 'not-a-uuid', ok: true, detail: 'x' }], now: later, staleHours: 12 });
    expect(r.finished).toBe(1);
    expect(rows.find((x) => x.id === b.id)).toMatchObject({ status: 'SUCCEEDED', detail: 'every copy checked', finishedAt: later });
    // a finished request is never changed again
    await serverRequests(db, { finished: [{ id: b.id, ok: false, detail: 'late' }], now: later, staleHours: 12 });
    expect(rows.find((x) => x.id === b.id)).toMatchObject({ status: 'SUCCEEDED' });

    const next = await serverRequests(db, { finished: [], now: new Date('2026-10-31T23:00:00Z'), staleHours: 12 });
    expect(next.stale).toBe(1);
    expect(rows.find((x) => x.id === d.id)).toMatchObject({ status: 'FAILED', detail: 'the server did not report back' });
  });

  it('the settings file: the registry defaults, every value from the settings when they are set', async () => {
    const ctx = (settings?: Record<string, unknown>) =>
      ({ db: null, vault: null, connections: [], secret: async () => null, ...(settings ? { settings: { value: async (k: string) => settings[k] } } : {}) }) as unknown as PartContext;
    const env = await backupSettingsPart.build(ctx());
    expect(env.split('\n').filter(Boolean)).toEqual([
      "BACKUP_TIME='02:30'",
      "BACKUP_KEEP_LOCAL_DAYS='7'",
      "BACKUP_KEEP_BLOB_DAYS='35'",
      "BACKUP_KEEP_DRIVE_DAYS='30'",
      "BACKUP_KEEP_LOCAL_WAL_DAYS='2'",
      "BACKUP_MIN_FREE_PCT='20'",
      "BACKUP_DRILL_ON='yes'",
      "BACKUP_DRILL_DAY='1'",
      "BACKUP_DRILL_TIME='03:30'",
      "BACKUP_DRILL_BLOB='yes'",
      "BACKUP_DRILL_DRIVE='yes'",
      "BACKUP_TELEGRAM_FAIL='yes'",
      "BACKUP_TELEGRAM_OK='no'",
    ]);
    const set = await backupSettingsPart.build(
      ctx({
        'backups.plan': { dailyTime: '01:15', keepLocalDays: 3, keepBlobDays: 60, keepDriveDays: 10, keepLocalWalDays: 1, minFreePct: 30 },
        'backups.drill': { enabled: false, dayOfMonth: 15, time: '04:00', blob: true, drive: false },
        'backups.alerts': { telegramOnFail: true, telegramOnSuccess: true },
      }),
    );
    expect(set).toContain("BACKUP_TIME='01:15'\n");
    expect(set).toContain("BACKUP_DRILL_ON='no'\n");
    expect(set).toContain("BACKUP_DRILL_DRIVE='no'\n");
    expect(set).toContain("BACKUP_TELEGRAM_OK='yes'\n");
  });

  it('PR 391: a LIVE Azure Blob connection and its key become the Blob remote, on its own or beside Drive', async () => {
    const blob: SyncConnection = { id: 'b', kind: 'STORAGE', provider: 'azureBlob', mode: 'LIVE', enabled: true, config: { accountName: 'shopstore', container: 'media' } };
    const drive: SyncConnection = { id: 'd', kind: 'GOOGLE_DRIVE', provider: 'googleDrive', mode: 'LIVE', enabled: true, config: { clientId: 'cid', folderId: 'fid' } };
    const keys: Record<string, string> = { 'azureBlob.accountKey': 'a2V5', 'googleDrive.clientSecret': 's', 'googleDrive.refreshToken': 't' };
    const ctx = (connections: SyncConnection[], settings: Record<string, unknown> = {}, k = keys) =>
      ({ db: null, vault: null, connections, secret: async (n: string) => k[n] ?? null, settings: { value: async (n: string) => settings[n] } }) as unknown as PartContext;
    const only = await backupPart.build(ctx([blob]));
    expect(only.split('\n').filter(Boolean)).toEqual([
      "RCLONE_CONFIG_BLOB_TYPE='azureblob'",
      "RCLONE_CONFIG_BLOB_ACCOUNT='shopstore'",
      "RCLONE_CONFIG_BLOB_KEY='a2V5'",
      "BACKUP_BLOB_CONTAINER='extas-backups'",
    ]);
    const both = await backupPart.build(ctx([{ ...blob, config: { ...blob.config, endpoint: 'https://shopstore.blob.core.windows.net' } }, drive], { 'backups.blob': { container: 'shop-backups' } }));
    expect(both).toContain("BACKUP_BLOB_CONTAINER='shop-backups'\n");
    expect(both).toContain("RCLONE_CONFIG_BLOB_ENDPOINT='https://shopstore.blob.core.windows.net'\n");
    expect(both).toContain("RCLONE_CONFIG_DRIVE_TYPE='drive'\n");
    // MOCK, switched off, no account or no key: no Blob remote, and Drive is untouched by it
    for (const c of [{ ...blob, mode: 'MOCK' }, { ...blob, enabled: false }, { ...blob, config: {} }]) expect(await backupPart.build(ctx([c]))).toBe('');
    expect(await backupPart.build(ctx([blob], {}, { ...keys, 'azureBlob.accountKey': '' }))).toBe('');
    const driveOnly = await backupPart.build(ctx([{ ...blob, mode: 'MOCK' }, drive]));
    expect(driveOnly).not.toContain('BLOB');
    expect(driveOnly).toContain("RCLONE_CONFIG_DRIVE_TYPE='drive'\n");
  });
});
