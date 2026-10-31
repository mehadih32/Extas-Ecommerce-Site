// S21 · PR 413 (REP-07) — the Site health hub's judge: one status line each for customer problems, the server, speed,
// the site audit and the smoke test, from what the server wrote (its state files) and the worker's heartbeat. Pure: no
// file, no database, no clock of its own. Each line says green (ok), yellow (warn), red (bad) or grey (off: nothing
// to judge yet), with a reason the page turns into words (messages/admin-health.<lang>.json `hlt.line.<id>.<reason>`).
// PR 414: a sixth line, the saved browser journeys (journeys.json from infra/deploy/journeys.sh), judged against their
// own schedule (`health.journeys`). PR 423: the customer problems line from the open problems (Customer problems).
import type { WorkerState } from '@extas/jobs';
import type { HealthHubSettings, HealthJourneysSettings } from '@extas/settings';

export const HUB_LINE_IDS = ['problems', 'server', 'speed', 'audit', 'smoke', 'journeys'] as const;
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

/** journeys.json and each run in journeys/ (infra/deploy/journeys.sh, PR 414): one run's summary. */
export interface JourneysResult {
  ok?: boolean;
  kind?: string;
  /** Journeys × screens that ran, and how many of them failed. */
  journeys?: number;
  failed?: number;
  steps?: number;
  skipped?: number;
  problems?: string[];
  /** PR 416: the UI checks that ran (none: off) and how many findings they had. */
  ui?: { kinds?: string[]; issues?: number } | null;
}

export interface HubInput {
  now: Date;
  limits: HealthHubSettings;
  health: StateFile<MonitorHealth> | null;
  smoke: StateFile<SmokeResult> | null;
  k6: StateFile<K6Baseline> | null;
  worker: WorkerState;
  /** PR 423: the open customer problems by severity, and whether the recorder is on (null: not read). */
  problems: OpenProblems | null;
  /** PR 414: the last journeys run and their schedule. */
  journeys: StateFile<JourneysResult> | null;
  schedule: HealthJourneysSettings;
}

/** PR 423: the open customer problems (lib/admin-problems/service.ts `openProblemCounts`). */
export interface OpenProblems {
  enabled: boolean;
  urgent: number;
  important: number;
  canWait: number;
  lastSeenAt: Date | null;
}

export const PROBLEMS_PAGE = '/admin/reports/health/problems';

/** The hours between two scheduled journey runs; a run older than two of them is late. */
export const JOURNEY_PERIOD_HOURS: Record<HealthJourneysSettings['every'], number> = { hourly: 1, daily: 24, weekly: 168 };

/** The monitor's own mark for "the home page did not answer" (extas-monitor). */
export const NO_ANSWER_MS = 99_999;

export const SERVER_PAGE = '/admin/server';
/** PR 417: the speed line opens Reports › Site health › Speed. */
export const SPEED_PAGE = '/admin/reports/health/speed';

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
  const base = { id: 'speed' as const, at: iso(i.health), href: SPEED_PAGE, ...(note ? { note } : {}) };
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

/** True while a "Run now" press is newer than the last run (the server has not started it yet). */
export function runAsked(i: Pick<HubInput, 'journeys' | 'schedule'>): boolean {
  const asked = i.schedule.runRequestedAt ? Date.parse(i.schedule.runRequestedAt) : NaN;
  return Number.isFinite(asked) && (!i.journeys || asked > i.journeys.writtenAt.getTime());
}

function journeysLine(i: HubInput): HubLine {
  const note = runAsked(i) ? { note: { key: 'asked', vars: {} } } : {};
  const base = { id: 'journeys' as const, at: iso(i.journeys), href: null, ...note };
  if (!i.journeys) return { ...base, state: 'off', reason: i.schedule.enabled ? 'never' : 'scheduleOff', vars: {} };
  const r = i.journeys.data;
  if (!r.ok) return { ...base, state: 'bad', reason: 'failed', vars: { failed: r.failed ?? 0, journeys: r.journeys ?? 0, first: (r.problems?.[0] ?? '').slice(0, 160) } };
  const h = Math.floor(minutesSince(i.now, i.journeys.writtenAt) / 60);
  if (i.schedule.enabled && h > 2 * JOURNEY_PERIOD_HOURS[i.schedule.every]) return { ...base, state: 'warn', reason: 'late', vars: { h } };
  return { ...base, state: 'ok', reason: r.skipped ? 'okSkipped' : 'ok', vars: { journeys: r.journeys ?? 0, steps: r.steps ?? 0, skipped: r.skipped ?? 0 } };
}

function problemsLine(i: HubInput): HubLine {
  const p = i.problems;
  const base = { id: 'problems' as const, at: p?.lastSeenAt ? p.lastSeenAt.toISOString() : null, href: PROBLEMS_PAGE };
  if (!p) return { ...base, state: 'off', reason: 'notYet', vars: {} };
  const open = p.urgent + p.important + p.canWait;
  if (p.urgent) return { ...base, state: 'bad', reason: 'urgent', vars: { n: p.urgent, open } };
  if (p.important) return { ...base, state: 'warn', reason: 'important', vars: { n: p.important, open } };
  if (!p.enabled) return { ...base, state: 'off', reason: 'off', vars: { open } };
  return { ...base, state: 'ok', reason: open ? 'minor' : 'none', vars: { open } };
}

/** The six lines, in the hub's order. The site audit (PR 570) is grey until it reports. */
export function hubLines(i: HubInput): HubLine[] {
  return [
    problemsLine(i),
    serverLine(i),
    speedLine(i),
    { id: 'audit', state: 'off', reason: 'notYet', vars: {}, at: null, href: null },
    smokeLine(i),
    journeysLine(i),
  ];
}

/** The hub's headline: red if any line is red, then yellow, then green; grey only when nothing reports. */
export function hubOverall(lines: readonly HubLine[]): HubLineState {
  if (lines.some((l) => l.state === 'bad')) return 'bad';
  if (lines.some((l) => l.state === 'warn')) return 'warn';
  return lines.some((l) => l.state === 'ok') ? 'ok' : 'off';
}
