// S21 · PR 413 — the Site health hub's judge: each line's colour and reason from the server's state files and the
// worker's heartbeat, the limits from `health.hub`, and the headline. Sample times and values.
import { describe, expect, it } from 'vitest';
import { hubLines, hubOverall, NO_ANSWER_MS, type HubInput, type HubLine } from './hub';

const now = new Date('2026-10-31T10:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const base: HubInput = {
  now,
  limits: { monitorStaleMinutes: 5, siteSlowMs: 2000, smokeStaleHours: 30 },
  health: { data: { problems: [], site_ms: 180 }, writtenAt: ago(1) },
  smoke: { data: { ok: true, pages: 42, failed: 0 }, writtenAt: ago(60) },
  k6: { data: { p95_ms: 41.6, rps: 900 }, writtenAt: ago(10_000) },
  worker: 'ok',
};
const line = (i: HubInput, id: HubLine['id']) => hubLines(i).find((l) => l.id === id)!;
const pick = (l: HubLine) => [l.state, l.reason];

describe('PR 413 · the Site health hub', () => {
  it('shows five lines in order; all green when every report is fresh and fine', () => {
    const lines = hubLines(base);
    expect(lines.map((l) => l.id)).toEqual(['problems', 'server', 'speed', 'audit', 'smoke']);
    expect(lines.map((l) => l.state)).toEqual(['off', 'ok', 'ok', 'off', 'ok']);
    expect(line(base, 'speed')).toMatchObject({ vars: { ms: 180 }, note: { key: 'k6', vars: { p95: 42 } } });
    expect(line(base, 'server').href).toBe('/admin/server');
    expect(hubOverall(lines)).toBe('ok');
  });

  it('judges the server: no report, late, its problems, the worker', () => {
    expect(pick(line({ ...base, health: null }, 'server'))).toEqual(['off', 'noReport']);
    expect(pick(line({ ...base, health: null, worker: 'stale' }, 'server'))).toEqual(['bad', 'worker']);
    expect(line({ ...base, health: { ...base.health!, writtenAt: ago(9) } }, 'server')).toMatchObject({ state: 'warn', reason: 'late', vars: { min: 9 } });
    expect(line({ ...base, health: { data: { problems: ['disk / 91%', 'redis down'] }, writtenAt: ago(1) } }, 'server')).toMatchObject({ state: 'bad', reason: 'problems', vars: { n: 2, first: 'disk / 91%' } });
    expect(pick(line({ ...base, worker: 'stopped' }, 'server'))).toEqual(['bad', 'worker']);
    expect(pick(line({ ...base, worker: 'never' }, 'server'))).toEqual(['warn', 'workerNever']);
  });

  it('judges speed by the setting, and a home page that did not answer is red', () => {
    expect(line({ ...base, health: { data: { site_ms: 2400 }, writtenAt: ago(1) } }, 'speed')).toMatchObject({ state: 'warn', reason: 'slow', vars: { ms: 2400, limit: 2000 } });
    expect(pick(line({ ...base, limits: { ...base.limits, siteSlowMs: 3000 }, health: { data: { site_ms: 2400 }, writtenAt: ago(1) } }, 'speed'))).toEqual(['ok', 'ok']);
    expect(pick(line({ ...base, health: { data: { site_ms: NO_ANSWER_MS }, writtenAt: ago(1) } }, 'speed'))).toEqual(['bad', 'noAnswer']);
    expect(pick(line({ ...base, health: { data: {}, writtenAt: ago(1) } }, 'speed'))).toEqual(['off', 'noReport']);
    expect(line({ ...base, k6: null }, 'speed').note).toBeUndefined();
  });

  it('judges the smoke test: never run, failed, late', () => {
    expect(pick(line({ ...base, smoke: null }, 'smoke'))).toEqual(['off', 'never']);
    expect(line({ ...base, smoke: { data: { ok: false, pages: 30, failed: 1, problems: ['/checkout: console error'] }, writtenAt: ago(5) } }, 'smoke')).toMatchObject({ state: 'bad', vars: { failed: 1, pages: 30, first: '/checkout: console error' } });
    expect(line({ ...base, smoke: { ...base.smoke!, writtenAt: ago(31 * 60) } }, 'smoke')).toMatchObject({ state: 'warn', reason: 'late', vars: { h: 31 } });
  });

  it('the headline is the worst line; grey only when nothing reports', () => {
    expect(hubOverall(hubLines({ ...base, worker: 'never' }))).toBe('warn');
    expect(hubOverall(hubLines({ ...base, smoke: { data: { ok: false }, writtenAt: ago(1) }, worker: 'never' }))).toBe('bad');
    expect(hubOverall(hubLines({ ...base, health: null, smoke: null, k6: null, worker: 'ok' }))).toBe('off');
  });
});
