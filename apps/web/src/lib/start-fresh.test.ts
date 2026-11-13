// S28 · PR 706 — the pure parts of Start fresh: the backup gate (a backup counts only when it SUCCEEDED and is recent
// enough) and the kind table (every kind the screen words has a clear rule: cleared by the site only where no
// append-only table sits below it, everything else handed to the server's purge).
import { describe, expect, it } from 'vitest';
import type { BackupRequestView } from '@extas/jobs';
import { backupGate, KINDS, START_FRESH_WORDS } from './start-fresh';

const NOW = new Date('2026-11-13T12:00:00.000Z');
const b = (over: Partial<BackupRequestView>): BackupRequestView => ({ id: 'a', kind: 'BACKUP', source: null, status: 'SUCCEEDED', detail: null, requestedById: null, createdAt: '2026-11-13T11:00:00.000Z', startedAt: null, finishedAt: '2026-11-13T11:30:00.000Z', ...over });

describe('Start fresh: the backup gate', () => {
  it('passes with a recent SUCCEEDED backup and names it', () => {
    const g = backupGate([b({ id: 'x' })], NOW, 60);
    expect(g).toMatchObject({ ok: true, backupId: 'x', open: false });
  });
  it('refuses a backup older than the limit, a failed one, a drill and none', () => {
    expect(backupGate([b({ finishedAt: '2026-11-13T10:00:00.000Z' })], NOW, 60).ok).toBe(false);
    expect(backupGate([b({ status: 'FAILED' })], NOW, 60).ok).toBe(false);
    expect(backupGate([b({ kind: 'RESTORE_DRILL' })], NOW, 60).ok).toBe(false);
    expect(backupGate([], NOW, 60).ok).toBe(false);
  });
  it('takes the newest finished backup and says when one is still running', () => {
    const g = backupGate([b({ id: 'old', finishedAt: '2026-11-13T09:00:00.000Z' }), b({ id: 'new' }), b({ id: 'run', status: 'RUNNING', finishedAt: null })], NOW, 60);
    expect(g).toMatchObject({ ok: true, backupId: 'new', open: true });
  });
});

describe('Start fresh: the kinds', () => {
  it('has the words and every kind once, each with a clear rule where the site clears it', () => {
    expect(START_FRESH_WORDS).toBe('START FRESH');
    const ids = KINDS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of KINDS) expect(k.how === 'CLEARED' ? typeof k.clear : 'undefined').toBe(k.how === 'CLEARED' ? 'function' : 'undefined');
  });
});
