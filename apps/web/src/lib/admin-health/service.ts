// S21 · PR 413 (REP-07) — Reports › Site health: the hub. It reads what the server wrote into its state folder
// (EXTAS_STATE_DIR, mounted read-only: health.json from the health check every minute, smoke.json from the smoke test,
// k6-baseline.json from PR 10) and the background worker's heartbeat, and judges one line each (hub.ts). Seeing needs
// `health.read`; changing when a line turns yellow (`health.hub`) needs `settings.write` and is audited. Nothing here
// changes the server. A missing file is normal on a developer machine and before server setup: its line is grey.
// PR 414: the saved browser journeys — their last run (journeys.json), the runs kept for comparison (journeys/*.json,
// newest first), their schedule (`health.journeys`, `settings.write`, audited) and "Run now" (`settings.write`,
// audited): it only records the press; the server's hourly check starts the run (infra/deploy/journeys.sh).
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { workerStatus } from '@extas/jobs';
import { healthHubSchema, healthJourneysSchema, INSTALLATION, type HealthHubSettings, type HealthJourneysSettings } from '@extas/settings';
import { openProblemCounts } from '../admin-problems/service';
import type { AppResolver } from '../settings';
import { hubLines, hubOverall, runAsked, type HubLine, type HubLineState, type JourneysResult, type K6Baseline, type MonitorHealth, type SmokeResult, type StateFile } from './hub';

export interface HealthDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
  /** The server's state folder; default EXTAS_STATE_DIR. */
  stateDir?: string | null;
}
export interface HealthWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface HubCard {
  key: 'hub';
  value: HealthHubSettings;
  version: string;
}

/** The journeys' schedule as its card shows it ("Run now" is its own button, never part of the card). */
export type JourneysCardValue = Omit<HealthJourneysSettings, 'runRequestedAt'>;
export interface JourneysCard {
  key: 'journeys';
  value: JourneysCardValue;
  version: string;
}

/** One kept journeys run, newest first. */
export interface JourneyRun {
  at: string;
  ok: boolean;
  kind: string;
  journeys: number;
  failed: number;
  steps: number;
  skipped: number;
  first: string;
}

export interface HubView {
  overall: HubLineState;
  lines: HubLine[];
  cards: { hub: HubCard; journeys: JourneysCard };
  /** Whether the state folder is there at all (false on a developer machine). */
  serverConnected: boolean;
  /** PR 414: the kept journeys runs, newest first (at most RUNS_SHOWN). */
  runs: JourneyRun[];
  /** PR 414: "Run now" was pressed and the server has not started it yet. */
  runAsked: boolean;
}

/** How many kept runs the page lists. */
export const RUNS_SHOWN = 10;

export class HealthPageError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isHealthPageError = (e: unknown): e is HealthPageError => e instanceof HealthPageError;

const S = MOTHER_STORE_ID;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** One state file with when it was written, or null (missing, unreadable or not JSON). */
async function stateFile<T>(dir: string | null, name: string): Promise<StateFile<T> | null> {
  if (!dir) return null;
  try {
    const p = join(dir, name);
    const [text, st] = await Promise.all([readFile(p, 'utf8'), stat(p)]);
    const data = JSON.parse(text) as unknown;
    return isObj(data) ? { data: data as T, writtenAt: st.mtime } : null;
  } catch {
    return null;
  }
}

const cardOf = (v: HealthHubSettings): HubCard => ({ key: 'hub', value: v, version: versionOf(v) });
const journeysValue = ({ runRequestedAt: _asked, ...v }: HealthJourneysSettings): JourneysCardValue => v;
const journeysCardOf = (v: HealthJourneysSettings): JourneysCard => {
  const value = journeysValue(v);
  return { key: 'journeys', value, version: versionOf(value) };
};
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** The kept runs (journeys/<stamp>.json), newest first by when the server wrote them. */
async function keptRuns(dir: string | null): Promise<JourneyRun[]> {
  if (!dir) return [];
  const folder = join(dir, 'journeys');
  const names = await readdir(folder).then((n) => n.filter((x) => /^[\w.-]+\.json$/.test(x)), () => [] as string[]);
  const files = await Promise.all(names.map((n) => stateFile<JourneysResult>(folder, n)));
  return files
    .filter((f): f is StateFile<JourneysResult> => f !== null)
    .sort((a, b) => b.writtenAt.getTime() - a.writtenAt.getTime())
    .slice(0, RUNS_SHOWN)
    .map((f) => ({
      at: f.writtenAt.toISOString(),
      ok: f.data.ok === true,
      kind: typeof f.data.kind === 'string' ? f.data.kind.slice(0, 20) : '',
      journeys: num(f.data.journeys),
      failed: num(f.data.failed),
      steps: num(f.data.steps),
      skipped: num(f.data.skipped),
      first: typeof f.data.problems?.[0] === 'string' ? f.data.problems[0].slice(0, 160) : '',
    }));
}

/** The hub's data (`health.read`). */
export async function hubView(deps: HealthDeps, who: HealthWho): Promise<HubView> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [limits, schedule, health, smoke, k6, journeys, runs, worker, connected, problems] = await Promise.all([
    deps.resolver.value('health.hub'),
    deps.resolver.value('health.journeys'),
    stateFile<MonitorHealth>(dir, 'health.json'),
    stateFile<SmokeResult>(dir, 'smoke.json'),
    stateFile<K6Baseline>(dir, 'k6-baseline.json'),
    stateFile<JourneysResult>(dir, 'journeys.json'),
    keptRuns(dir),
    workerStatus({ db: deps.db, settings: deps.resolver, now: () => now }),
    dir ? stat(dir).then(() => true, () => false) : Promise.resolve(false),
    openProblemCounts(deps),
  ]);
  const lines = hubLines({ now, limits, health, smoke, k6, worker: worker.state, journeys, schedule, problems });
  return {
    overall: hubOverall(lines),
    lines,
    cards: { hub: cardOf(limits), journeys: journeysCardOf(schedule) },
    serverConnected: connected,
    runs,
    runAsked: runAsked({ journeys, schedule }),
  };
}

/** Saves when a line turns yellow, or (PR 414) when the journeys run (`settings.write`). */
export async function saveHubCard(deps: HealthDeps, who: HealthWho, input: unknown): Promise<HubView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (isObj(input) && input.key === 'journeys') return saveJourneysCard(deps, who, input);
  if (!isObj(input) || input.key !== 'hub') throw new HealthPageError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('health.hub');
  if (input.version !== versionOf(before)) throw new HealthPageError('STALE', 409);
  const ok = healthHubSchema.safeParse(input.value);
  if (!ok.success) throw new HealthPageError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const changed = (Object.keys(ok.data) as (keyof HealthHubSettings)[]).filter((k) => ok.data[k] !== before[k]);
  if (changed.length) {
    await deps.resolver.set('health.hub', ok.data, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.hub.save', entityType: 'Setting', entityId: 'health.hub', before: { ...before }, after: { ...ok.data, changed } }, who.ctx);
  }
  return hubView(deps, who);
}

const issuesOf = (e: { issues: { path: PropertyKey[] }[] }) => [...new Set(e.issues.map((i) => String(i.path[0] ?? 'value')))];

/** PR 414: the journeys' schedule; the last "Run now" press is kept as it was. */
async function saveJourneysCard(deps: HealthDeps, who: HealthWho, input: Record<string, unknown>): Promise<HubView> {
  const before = await deps.resolver.value('health.journeys');
  if (input.version !== versionOf(journeysValue(before))) throw new HealthPageError('STALE', 409);
  const value = isObj(input.value) ? input.value : null;
  if (value && 'runRequestedAt' in value) throw new HealthPageError('INVALID_INPUT', 400, ['runRequestedAt']);
  const ok = healthJourneysSchema.safeParse({ ...value, runRequestedAt: before.runRequestedAt });
  if (!ok.success) throw new HealthPageError('INVALID_INPUT', 400, issuesOf(ok.error));
  const changed = (Object.keys(ok.data) as (keyof HealthJourneysSettings)[]).filter((k) => ok.data[k] !== before[k]);
  if (changed.length) {
    await deps.resolver.set('health.journeys', ok.data, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.journeys.save', entityType: 'Setting', entityId: 'health.journeys', before: { ...before }, after: { ...ok.data, changed } }, who.ctx);
  }
  return hubView(deps, who);
}

/**
 * PR 414: "Run now" (`settings.write`, audited). Records the press in `health.journeys.runRequestedAt`; the server's
 * hourly check (infra/deploy/journeys.sh) starts one run when the press is newer than its last run. A press while one
 * is still waiting changes nothing.
 */
export async function askJourneysRun(deps: HealthDeps, who: HealthWho, input: unknown): Promise<HubView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.action !== 'run') throw new HealthPageError('INVALID_INPUT', 400, ['action']);
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [schedule, journeys] = await Promise.all([deps.resolver.value('health.journeys'), stateFile<JourneysResult>(dir, 'journeys.json')]);
  if (!runAsked({ journeys, schedule })) {
    const at = (deps.now?.() ?? new Date()).toISOString();
    await deps.resolver.set('health.journeys', { ...schedule, runRequestedAt: at }, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health · Run now' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.journeys.run', entityType: 'Setting', entityId: 'health.journeys', before: { runRequestedAt: schedule.runRequestedAt }, after: { runRequestedAt: at } }, who.ctx);
  }
  return hubView(deps, who);
}
