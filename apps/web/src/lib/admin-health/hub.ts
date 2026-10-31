// S21 · PR 413 (REP-07) — the Site health hub's judge: one status line each for customer problems, the server, speed,
// the site audit and the smoke test, from what the server wrote (its state files) and the worker's heartbeat. Pure: no
// file, no database, no clock of its own. Each line says green (ok), yellow (warn), red (bad) or grey (off: nothing
// to judge yet), with a reason the page turns into words (messages/admin-health.<lang>.json `hlt.line.<id>.<reason>`).
import type { WorkerState } from '@extas/jobs';
import type { HealthHubSettings } from '@extas/settings';

export const HUB_LINE_IDS = ['problems', 'server', 'speed', 'audit', 'smoke'] as const;
export type HubLineId = (typeof HUB_LINE_IDS)[number];
export type HubLineState = 'ok' | 'warn' | 'bad' | 'off';

export interface HubLine {
  id: HubLineId;
  state: HubLineState;
  /** The words: `hlt.line.<id>.<reason>`. */
  reason: string;
  vars: Record<string, string | number>;
  /** When what the line judges was written (ISO), or null. */
  at: string | null;
  /** The detail page, when it is built. */
  href: string | null;
  /** A second, smaller line: `hlt.note.<key>`. */
  note?: { key: string; vars: Record<string, string | number> };
}

/** A state file as the server wrote it: its content and when it was written. */
export interface StateFile<T> {
  data: T;
  writtenAt: Date;
}

/** health.json (infra/server/bin/extas-monitor, every minute). `site_ms` 99999: the home page did not answer. */
export interface MonitorHealth {
  problems?: string[];
  site_ms?: number | null;
}
/** smoke.json (infra/deploy/smoke.sh, after every deploy and every night). */
export interface SmokeResult {
  ok?: boolean;
  kind?: string;
  pages?: number;
  failed?: number;
  problems?: string[];
}
/** k6-baseline.json (infra/server/steps/12-k6.sh, PR 10): the first measurement every later one is compared with. */
export interface K6Baseline {
  p95_ms?: number;
  rps?: number;
}

export interface HubInput {
  now: Date;
  limits: HealthHubSettings;
  health: StateFile<MonitorHealth> | null;
  smoke: StateFile<SmokeResult> | null;
  k6: StateFile<K6Baseline> | null;
  worker: WorkerState;
}

/** The monitor's own mark for "the home page did not answer" (extas-monitor). */
export const NO_ANSWER_MS = 99_999;

export const SERVER_PAGE = '/admin/server';

const minutesSince = (now: Date, t: Date) => Math.max(0, Math.floor((now.getTime() - t.getTime()) / 60_000));
const iso = (f: StateFile<unknown> | null) => (f ? f.writtenAt.toISOString() : null);

function serverLine(i: HubInput): HubLine {
  const base = { id: 'server' as const, at: iso(i.health), href: SERVER_PAGE };
  const workerDown = i.worker === 'stale' || i.worker === 'stopped';
  // no health check yet (a developer machine, or before server setup): only the worker can still be judged
  if (!i.health) return workerDown ? { ...base, state: 'bad', reason: 'worker', vars: {} } : { ...base, state: 'off', reason: 'noReport', vars: {} };
  const late = minutesSince(i.now, i.health.writtenAt);
  if (late > i.limits.monitorStaleMinutes) return { ...base, state: 'warn', reason: 'late', vars: { min: late } };
  const problems = (i.health.data.problems ?? []).filter((p) => typeof p === 'string' && p.trim());
  if (problems.length) return { ...base, state: 'bad', reason: 'problems', vars: { n: problems.length, first: problems[0]!.slice(0, 160) } };
  if (workerDown) return { ...base, state: 'bad', reason: 'worker', vars: {} };
  if (i.worker === 'never') return { ...base, state: 'warn', reason: 'workerNever', vars: {} };
  return { ...base, state: 'ok', reason: 'ok', vars: {} };
}

function speedLine(i: HubInput): HubLine {
  const note = typeof i.k6?.data.p95_ms === 'number' ? { key: 'k6', vars: { p95: Math.round(i.k6.data.p95_ms) } } : undefined;
  const base = { id: 'speed' as const, at: iso(i.health), href: null, ...(note ? { note } : {}) };
  const ms = i.health?.data.site_ms;
  if (!i.health || typeof ms !== 'number') return { ...base, state: 'off', reason: 'noReport', vars: {} };
  if (minutesSince(i.now, i.health.writtenAt) > i.limits.monitorStaleMinutes) return { ...base, state: 'warn', reason: 'late', vars: { min: minutesSince(i.now, i.health.writtenAt) } };
  if (ms >= NO_ANSWER_MS) return { ...base, state: 'bad', reason: 'noAnswer', vars: {} };
  if (ms > i.limits.siteSlowMs) return { ...base, state: 'warn', reason: 'slow', vars: { ms, limit: i.limits.siteSlowMs } };
  return { ...base, state: 'ok', reason: 'ok', vars: { ms } };
}

function smokeLine(i: HubInput): HubLine {
  const base = { id: 'smoke' as const, at: iso(i.smoke), href: null };
  if (!i.smoke) return { ...base, state: 'off', reason: 'never', vars: {} };
  const s = i.smoke.data;
  if (!s.ok) return { ...base, state: 'bad', reason: 'failed', vars: { failed: s.failed ?? 0, pages: s.pages ?? 0, first: (s.problems?.[0] ?? '').slice(0, 160) } };
  const h = Math.floor(minutesSince(i.now, i.smoke.writtenAt) / 60);
  if (h > i.limits.smokeStaleHours) return { ...base, state: 'warn', reason: 'late', vars: { h } };
  return { ...base, state: 'ok', reason: 'ok', vars: { pages: s.pages ?? 0 } };
}

/** The five lines, in the hub's order. Problems (PR 423) and the site audit (PR 570) are grey until they report. */
export function hubLines(i: HubInput): HubLine[] {
  return [
    { id: 'problems', state: 'off', reason: 'notYet', vars: {}, at: null, href: null },
    serverLine(i),
    speedLine(i),
    { id: 'audit', state: 'off', reason: 'notYet', vars: {}, at: null, href: null },
    smokeLine(i),
  ];
}

/** The hub's headline: red if any line is red, then yellow, then green; grey only when nothing reports. */
export function hubOverall(lines: readonly HubLine[]): HubLineState {
  if (lines.some((l) => l.state === 'bad')) return 'bad';
  if (lines.some((l) => l.state === 'warn')) return 'warn';
  return lines.some((l) => l.state === 'ok') ? 'ok' : 'off';
}
