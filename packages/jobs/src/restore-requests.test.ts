// S19 · PR 396 — restores from the admin: staging first from any copy; production only for the newest staging restore
// that passed, with RESTORE typed, the same backup and minute; one open restore at a time; the server's side.
import { describe, expect, it } from 'vitest';
import { requestProductionRestore, requestStagingRestore, restoreRequests, serverRestoreRequests } from './restore-requests';

type Row = Record<string, unknown> & { id: string; status: string; createdAt: Date };

function memoryDb() {
  const rows: Row[] = [];
  let n = 0;
  const match = (r: Row, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v.in as unknown[]).includes(r[k]);
      if (v && typeof v === 'object' && 'lt' in v) return r[k] instanceof Date && (r[k] as Date) < (v.lt as Date);
      return r[k] === v;
    });
  const sorted = (where: Record<string, unknown>, desc: boolean) => {
    const out = rows.filter((r) => match(r, where)).sort((a, b) => +a.createdAt - +b.createdAt);
    return desc ? out.reverse() : out;
  };
  const db = {
    restoreRequest: {
      findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { createdAt: 'asc' | 'desc' } }) =>
        sorted(where, orderBy?.createdAt === 'desc')[0] ?? null,
      findMany: async ({ where = {}, orderBy, take }: { where?: Record<string, unknown>; orderBy?: { createdAt: 'asc' | 'desc' }; take?: number }) => {
        const out = sorted(where, orderBy?.createdAt === 'desc');
        return take ? out.slice(0, take) : out;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        n += 1;
        const r = {
          id: `0190a3c4-0000-7000-8000-${String(n).padStart(12, '0')}`,
          status: 'QUEUED',
          source: null,
          backup: null,
          pointInTime: null,
          detail: null,
          stagingOfId: null,
          requestedById: null,
          approvedById: null,
          confirmationTyped: false,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date(Date.UTC(2026, 9, 31) + n * 1000),
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

const done = (rows: Row[], id: string, status = 'SUCCEEDED', backup = '20261031-0230') => Object.assign(rows.find((r) => r.id === id)!, { status, backup });

describe('restore requests (PR 396)', () => {
  it('staging: Blob by default, a backup or a minute, checked; one open restore at a time', async () => {
    const { db, rows } = memoryDb();
    const s = await requestStagingRestore(db, { actorId: 'owner' });
    expect(s).toMatchObject({ environment: 'staging', source: 'blob', backup: null, status: 'QUEUED', requestedById: 'owner' });
    await expect(requestStagingRestore(db, { source: 'drive', actorId: 'owner' })).rejects.toMatchObject({ code: 'BUSY' });
    done(rows, s.id);
    expect(await requestStagingRestore(db, { source: 'drive', backup: '20261030-0230', actorId: null })).toMatchObject({ source: 'drive', backup: '20261030-0230' });
    for (const bad of [
      { source: 'ftp' },
      { backup: '../etc' },
      { source: 'drive', pointInTime: '2026-10-30T10:00:00Z' },
      { backup: '20261030-0230', pointInTime: '2026-10-30T10:00:00Z' },
      { pointInTime: 'yesterday' },
      { pointInTime: '2030-01-01T00:00:00Z' },
    ]) {
      await expect(requestStagingRestore(db, { ...bad, actorId: null, now: new Date('2026-10-31T12:00:00Z') })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('production: only the newest staging restore that passed, RESTORE typed, the same backup and minute', async () => {
    const { db, rows } = memoryDb();
    const s1 = await requestStagingRestore(db, { source: 'local', pointInTime: '2026-10-31T01:15:00Z', actorId: 'owner', now: new Date('2026-10-31T12:00:00Z') });
    await expect(requestProductionRestore(db, { stagingOfId: s1.id, confirm: 'RESTORE', actorId: 'owner' })).rejects.toMatchObject({ code: 'STAGING_FIRST' });
    done(rows, s1.id, 'FAILED');
    await expect(requestProductionRestore(db, { stagingOfId: s1.id, confirm: 'RESTORE', actorId: 'owner' })).rejects.toMatchObject({ code: 'STAGING_FIRST' });
    done(rows, s1.id);
    await expect(requestProductionRestore(db, { stagingOfId: s1.id, confirm: 'restore', actorId: 'owner' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const p = await requestProductionRestore(db, { stagingOfId: s1.id, confirm: 'RESTORE', actorId: 'owner' });
    expect(p).toMatchObject({ environment: 'production', source: 'local', backup: '20261031-0230', stagingOfId: s1.id, approvedById: 'owner' });
    expect(p.pointInTime).toBe('2026-10-31T01:15:00.000Z');
    expect(rows.find((r) => r.id === p.id)?.confirmationTyped).toBe(true);
    // a newer staging restore makes the older one unusable for production
    done(rows, p.id, 'FAILED');
    const s2 = await requestStagingRestore(db, { actorId: 'owner' });
    done(rows, s2.id);
    await expect(requestProductionRestore(db, { stagingOfId: s1.id, confirm: 'RESTORE', actorId: 'owner' })).rejects.toMatchObject({ code: 'STAGING_FIRST' });
    expect((await restoreRequests(db)).map((r) => r.id)).toEqual([s2.id, p.id, s1.id]);
  });

  it('the server: takes the queued with what to run, hands back the outcome and the backup used, fails a stale one', async () => {
    const { db, rows } = memoryDb();
    const now = new Date('2026-10-31T12:00:00Z');
    const s = await requestStagingRestore(db, { source: 'blob', actorId: null });
    const first = await serverRestoreRequests(db, { finished: [], now, staleHours: 12 });
    expect(first.taken).toEqual([{ id: s.id, kind: 'RESTORE_STAGING', source: 'blob', backup: null, at: null, stagingOf: null }]);
    const back = await serverRestoreRequests(db, { finished: [{ id: s.id, ok: true, detail: 'base 20261031-0230, 80 tables', backup: '20261031-0230' }], now, staleHours: 12 });
    expect(back.finished).toBe(1);
    expect(rows[0]).toMatchObject({ status: 'SUCCEEDED', backup: '20261031-0230' });
    const p = await requestProductionRestore(db, { stagingOfId: s.id, confirm: 'RESTORE', actorId: 'owner' });
    expect((await serverRestoreRequests(db, { finished: [], now, staleHours: 12 })).taken).toEqual([
      { id: p.id, kind: 'RESTORE_PRODUCTION', source: 'blob', backup: '20261031-0230', at: null, stagingOf: s.id },
    ]);
    const later = await serverRestoreRequests(db, { finished: [{ id: 'not-an-id', ok: true, detail: '' }], now: new Date('2026-11-01T01:00:00Z'), staleHours: 12 });
    expect(later.stale).toBe(1);
    expect(rows.find((r) => r.id === p.id)).toMatchObject({ status: 'FAILED', detail: 'the server did not report back' });
  });

  it('a queued row the server cannot run is failed, never handed over', async () => {
    const { db, rows } = memoryDb();
    rows.push({ id: '0190a3c4-0000-7000-8000-00000000abcd', environment: 'production', source: 'blob', backup: null, stagingOfId: null, status: 'QUEUED', pointInTime: null, createdAt: new Date() });
    const r = await serverRestoreRequests(db, { finished: [], staleHours: 12 });
    expect(r.taken).toEqual([]);
    expect(rows[0]).toMatchObject({ status: 'FAILED', detail: 'not a restore the server can run' });
  });
});
