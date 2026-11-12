// S24 · PR 452 (C7.20, C1.6) — pure tests for `agentCapState`/`monthStart`: no database needed. This table is
// deliberately identical to PR 309's own `apps/web/src/lib/admin-ai/spend-cap.test.ts`, since the two copies of the
// formula must stay in lock-step (see jobs.ts's header comment for why `@extas/photoshoot` keeps its own copy
// rather than importing the app's).
import { describe, expect, it } from 'vitest';
import { agentCapState, monthStart } from './spendCap';

describe('agentCapState', () => {
  it('is "none" whenever there is no cap — null or 0', () => {
    expect(agentCapState(0, null)).toBe('none');
    expect(agentCapState(5000, null)).toBe('none');
    expect(agentCapState(0, 0)).toBe('none');
  });

  it('is "ok" below 80% of the cap', () => {
    expect(agentCapState(0, 10000)).toBe('ok');
    expect(agentCapState(7999, 10000)).toBe('ok');
  });

  it('is "warned" from exactly 80% of the cap, up to (not including) 100%', () => {
    expect(agentCapState(8000, 10000)).toBe('warned');
    expect(agentCapState(9999, 10000)).toBe('warned');
  });

  it('is "paused" at or over 100% of the cap', () => {
    expect(agentCapState(10000, 10000)).toBe('paused');
    expect(agentCapState(15000, 10000)).toBe('paused');
  });

  it('never uses float math — the 80% line is exact at amounts that do not divide evenly', () => {
    expect(agentCapState(8000, 10001)).toBe('ok');
    expect(agentCapState(8001, 10001)).toBe('warned');
  });
});

describe('monthStart', () => {
  it('is the first instant of the UTC calendar month the given time falls in', () => {
    expect(monthStart(new Date('2026-11-11T18:30:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(monthStart(new Date('2026-02-01T00:00:00Z')).toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('a moment just before midnight UTC on the 1st still belongs to the previous month', () => {
    expect(monthStart(new Date('2026-12-01T00:00:00Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(monthStart(new Date('2026-11-30T23:59:59.999Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});
