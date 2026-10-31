// S21 · PR 413 — the Site health hub's judge: each line's colour and reason from the server's state files and the
// worker's heartbeat, the limits from `health.hub`, and the headline; PR 414: the saved journeys' line against their
// schedule. Sample times and values.
import { describe, expect, it } from 'vitest';
import { hubLines, hubOverall, NO_ANSWER_MS, runAsked, type HubInput, type HubLine } from './hub';

const now = new Date('2026-10-31T10:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const base: HubInput = {
  now,
  limits: { monitorStaleMinutes: 5, siteSlowMs: 2000, smokeStaleHours: 30 },
  health: { data: { problems: [], site_ms: 180 }, writtenAt: ago(1) },
  smoke: { data: { ok: true, pages: 42, failed: 0 }, writtenAt: ago(60) },
  k6: { data: { p95_ms: 41.6, rps: 900 }, writtenAt: ago(10_000) },
  worker: 'ok',
  problems: { enabled: true, urgent: 0, important: 0, canWait: 0, lastSeenAt: null },
  journeys: { data: { ok: true, journeys: 8, failed: 0, steps: 52, skipped: 0 }, writtenAt: ago(120) },
  schedule: { enabled: true, every: 'daily', hour: 4, weekday: 5, keepRuns: 30, runRequestedAt: null },
};
const line = (i: HubInput, id: HubLine['id']) => hubLines(i).find((l) => l.id === id)!;
const pick = (l: HubLine) => [l.state, l.reason];

describe('PR 413 · the Site health hub', () => {
  it('shows six lines in order; all green when every report is fresh and fine', () => {
    const lines = hubLines(base);
    expect(lines.map((l) => l.id)).toEqual(['problems', 'server', 'speed', 'audit', 'smoke', 'journeys']);
    expect(lines.map((l) => l.state)).toEqual(['ok', 'ok', 'ok', 'off', 'ok', 'ok']);
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
    expect(line(base, 'smoke').href).toBe('/admin/reports/health/smoke');
    expect(line({ ...base, smoke: { data: { ok: false, pages: 30, failed: 1, problems: ['/checkout: console error'] }, writtenAt: ago(5) } }, 'smoke')).toMatchObject({ state: 'bad', vars: { failed: 1, pages: 30, first: '/checkout: console error' } });
    expect(line({ ...base, smoke: { ...base.smoke!, writtenAt: ago(31 * 60) } }, 'smoke')).toMatchObject({ state: 'warn', reason: 'late', vars: { h: 31 } });
  });

  it('the headline is the worst line; grey only when nothing reports', () => {
    expect(hubOverall(hubLines({ ...base, worker: 'never' }))).toBe('warn');
    expect(hubOverall(hubLines({ ...base, smoke: { data: { ok: false }, writtenAt: ago(1) }, worker: 'never' }))).toBe('bad');
    expect(hubOverall(hubLines({ ...base, health: null, smoke: null, k6: null, journeys: null, problems: null, worker: 'ok' }))).toBe('off');
  });

  it('PR 423: the customer problems line from the open problems; red for an urgent one, whatever the switch', () => {
    const at = ago(3);
    const p = (o: Partial<NonNullable<HubInput['problems']>>) => line({ ...base, problems: { ...base.problems!, ...o } }, 'problems');
    expect(p({})).toMatchObject({ state: 'ok', reason: 'none', href: '/admin/reports/health/problems' });
    expect(p({ canWait: 2 })).toMatchObject({ state: 'ok', reason: 'minor', vars: { open: 2 } });
    expect(p({ important: 1, canWait: 2 })).toMatchObject({ state: 'warn', reason: 'important', vars: { n: 1, open: 3 } });
    expect(p({ urgent: 2, important: 1, lastSeenAt: at })).toMatchObject({ state: 'bad', reason: 'urgent', vars: { n: 2, open: 3 }, at: at.toISOString() });
    expect(p({ enabled: false })).toMatchObject({ state: 'off', reason: 'off' });
    expect(p({ enabled: false, urgent: 1 }).state).toBe('bad');
    expect(pick(line({ ...base, problems: null }, 'problems'))).toEqual(['off', 'notYet']);
  });

  it('PR 414: judges the saved journeys by their own schedule; "Run now" waits until a newer run', () => {
    expect(line(base, 'journeys')).toMatchObject({ state: 'ok', reason: 'ok', vars: { journeys: 8, steps: 52 } });
    expect(line(base, 'journeys').note).toBeUndefined();
    const off = { ...base.schedule, enabled: false };
    expect(pick(line({ ...base, journeys: null, schedule: off }, 'journeys'))).toEqual(['off', 'scheduleOff']);
    expect(pick(line({ ...base, journeys: null }, 'journeys'))).toEqual(['off', 'never']);
    expect(line({ ...base, journeys: { data: { ok: false, journeys: 8, failed: 1, problems: ['customer (phone) step 6 open /bag: request 500: /bag'] }, writtenAt: ago(5) } }, 'journeys')).toMatchObject({ state: 'bad', reason: 'failed', vars: { failed: 1, journeys: 8, first: 'customer (phone) step 6 open /bag: request 500: /bag' } });
    expect(line({ ...base, journeys: { data: { ok: true, journeys: 8, steps: 52, skipped: 4 }, writtenAt: ago(5) } }, 'journeys').reason).toBe('okSkipped');
    // late after two periods of the schedule: 48 hours for daily, 2 for hourly; never late while the schedule is off
    const old = { ...base.journeys!, writtenAt: ago(49 * 60) };
    expect(line({ ...base, journeys: old }, 'journeys')).toMatchObject({ state: 'warn', reason: 'late', vars: { h: 49 } });
    expect(pick(line({ ...base, journeys: { ...base.journeys!, writtenAt: ago(47 * 60) } }, 'journeys'))).toEqual(['ok', 'ok']);
    expect(pick(line({ ...base, schedule: { ...base.schedule, every: 'hourly' } }, 'journeys'))).toEqual(['ok', 'ok']);
    expect(pick(line({ ...base, journeys: { ...base.journeys!, writtenAt: ago(181) }, schedule: { ...base.schedule, every: 'hourly' } }, 'journeys'))).toEqual(['warn', 'late']);
    expect(pick(line({ ...base, journeys: old, schedule: off }, 'journeys'))).toEqual(['ok', 'ok']);
    // a press after the last run is waiting; a run after the press answers it
    const asked = { ...base.schedule, runRequestedAt: ago(30).toISOString() };
    expect(runAsked({ journeys: base.journeys, schedule: asked })).toBe(true);
    expect(line({ ...base, schedule: asked }, 'journeys').note).toEqual({ key: 'asked', vars: {} });
    expect(runAsked({ journeys: { ...base.journeys!, writtenAt: ago(10) }, schedule: asked })).toBe(false);
    expect(runAsked({ journeys: null, schedule: asked })).toBe(true);
    expect(runAsked({ journeys: null, schedule: base.schedule })).toBe(false);
  });
});

describe('PR 570 · the site audit line', () => {
  it('grey until an audit reports; red when a chosen group failed; green otherwise, saying who waits for the agents', () => {
    expect(line(base, 'audit')).toMatchObject({ state: 'off', reason: 'notYet', href: '/admin/ai/audit' });
    const failed = { ...base, audit: { data: { ok: false, chosen: 24, failedGroups: 2, problems: ['8. Bag: /bag (phone): console error'] }, writtenAt: ago(30) } };
    expect(line(failed, 'audit')).toMatchObject({ state: 'bad', reason: 'failed', vars: { failed: 2, chosen: 24, first: '8. Bag: /bag (phone): console error' } });
    expect(hubOverall(hubLines(failed))).toBe('bad');
    expect(pick(line({ ...base, audit: { data: { ok: true, chosen: 24, passedGroups: 16, agentGroups: 8 }, writtenAt: ago(30) } }, 'audit'))).toEqual(['ok', 'okAgents']);
    expect(pick(line({ ...base, audit: { data: { ok: true, chosen: 3, passedGroups: 3, agentGroups: 0 }, writtenAt: ago(30) } }, 'audit'))).toEqual(['ok', 'ok']);
  });
});
