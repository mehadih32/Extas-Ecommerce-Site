// S19 · PR 391 — the backups' go-live checks: every one passes only on a fresh good copy, a LIVE connection and a
// recent passed drill of that place; a stale, failed or missing one says which.
import { describe, expect, it } from 'vitest';
import { backupGateChecks, GATE_CHECKS, type GateInput } from './backup-gate';

const now = new Date('2026-10-31T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const good = (h = 10) => ({ result: 'ok' as const, at: hoursAgo(h), detail: 'x' });

function input(over: Partial<GateInput> = {}): GateInput {
  return {
    now,
    gate: { freshHours: 36, drillDays: 35 },
    live: { blob: true, drive: true, telegram: true },
    backups: { local: good(), blob: good(), drive: good() },
    drill: {
      result: 'ok',
      at: hoursAgo(24 * 3),
      runs: [
        { from: 'local', result: 'ok', detail: 'x' },
        { from: 'blob', result: 'ok', detail: 'x' },
        { from: 'drive', result: 'ok', detail: 'x' },
      ],
    },
    ...over,
  };
}

const failing = (i: GateInput) =>
  backupGateChecks(i)
    .checks.filter((c) => !c.ok)
    .map((c) => c.key);

describe('backup go-live checks (PR 391)', () => {
  it('all good: ready, every check in order', () => {
    const r = backupGateChecks(input());
    expect(r.ready).toBe(true);
    expect(r.checks.map((c) => c.key)).toEqual([...GATE_CHECKS]);
  });

  it('a copy older than the hours, or a failed one, fails its own check only', () => {
    expect(failing(input({ backups: { local: good(), blob: good(40), drive: good() } }))).toEqual(['blobFresh']);
    expect(failing(input({ backups: { local: { result: 'fail', at: hoursAgo(1) }, blob: good(), drive: good() } }))).toEqual(['local']);
    expect(failing(input({ gate: { freshHours: 6, drillDays: 35 } }))).toEqual(['local', 'blobFresh', 'driveFresh']);
  });

  it('not connected: the place and its copy fail, even with an old good file on the server', () => {
    expect(failing(input({ live: { blob: false, drive: true, telegram: true } }))).toEqual(['blobLive', 'blobFresh']);
    expect(failing(input({ live: { blob: true, drive: true, telegram: false } }))).toEqual(['telegram']);
  });

  it('the drill: too old, a place left out or failed; a single restore test of that place also counts', () => {
    expect(failing(input({ gate: { freshHours: 36, drillDays: 2 } }))).toEqual(['drillBlob', 'drillDrive']);
    const partial = input({ drill: { result: 'fail', at: hoursAgo(5), runs: [{ from: 'blob', result: 'ok', detail: '' }, { from: 'drive', result: 'fail', detail: '' }] } });
    expect(failing(partial)).toEqual(['drillDrive']);
    expect(failing({ ...partial, restoreTest: { result: 'ok', at: hoursAgo(2), from: 'drive' } })).toEqual([]);
    expect(failing(input({ drill: null }))).toEqual(['drillBlob', 'drillDrive']);
  });

  it('nothing on the server yet (a new installation): not ready, nothing crashes', () => {
    const r = backupGateChecks({ now, gate: { freshHours: 36, drillDays: 35 }, live: { blob: false, drive: false, telegram: false }, backups: { local: null, blob: null, drive: null }, drill: null });
    expect(r.ready).toBe(false);
    expect(r.checks.every((c) => !c.ok)).toBe(true);
  });

  it('a date in the future or not a date does not count', () => {
    expect(failing(input({ backups: { local: { result: 'ok', at: 'soon' }, blob: { result: 'ok', at: '2027-01-01T00:00:00Z' }, drive: good() } }))).toEqual(['local', 'blobFresh']);
  });
});
