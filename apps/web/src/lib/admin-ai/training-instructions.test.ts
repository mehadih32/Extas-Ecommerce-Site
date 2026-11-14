// S28 · PR 713 — the pure parts of AI Center › Training: which rows are in force at a moment, how a set is hashed and what counts as a
// version. Every value is made up.
import { describe, expect, it } from 'vitest';
import { activeAt, stateOf, validScope, versionTimes } from './training-instructions';

const d = (s: string) => new Date(`2026-11-0${s}T10:00:00.000Z`);
const row = (id: string, agentKey: string, kind: string, input: string, created: string, archived: string | null = null) => ({ id, agentKey, kind, input, createdById: null, createdAt: d(created), archivedAt: archived ? d(archived) : null });

const rows = [row('a', 'all', 'instruction', 'Be warm', '1', '4'), row('b', 'doot', 'instruction', 'Bengali first', '2'), row('c', 'all', 'forbidden', 'Politics', '3'), row('e', 'all', 'instruction', 'Be brief', '4')];

describe('training rows', () => {
  it('the set at a moment is the rows made by then and not yet archived', () => {
    expect(activeAt(rows, d('1')).map((r) => r.id)).toEqual(['a']);
    expect(activeAt(rows, d('3')).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(activeAt(rows, d('4')).map((r) => r.id)).toEqual(['b', 'c', 'e']);
    expect(activeAt(rows, null).map((r) => r.id)).toEqual(['b', 'c', 'e']);
  });
  it('puts "all" first, groups by agent, and the version changes with the rows', () => {
    const s = stateOf(activeAt(rows, d('3')));
    expect(s.agents).toEqual([{ key: 'all', lines: ['Be warm'] }, { key: 'doot', lines: ['Bengali first'] }]);
    expect(s.forbidden).toEqual(['Politics']);
    expect(s.version).not.toBe(stateOf(activeAt(rows, d('1'))).version);
    expect(s.version).toBe(stateOf([...activeAt(rows, d('3'))].reverse()).version);
  });
  it('a version is every moment a row was made or archived, oldest first, a shared moment once', () => {
    expect(versionTimes(rows).map((x) => x.toISOString().slice(8, 10))).toEqual(['01', '02', '03', '04']);
  });
  it('knows "all" and the seven agents, nothing else', () => {
    expect(validScope('all')).toBe(true);
    expect(validScope('doot')).toBe(true);
    expect(validScope('nobody')).toBe(false);
    expect(validScope(3)).toBe(false);
  });
});
