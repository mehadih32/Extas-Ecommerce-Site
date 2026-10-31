// S21 · PR 413 (REP-07) — Reports › Site health: the hub. It reads what the server wrote into its state folder
// (EXTAS_STATE_DIR, mounted read-only: health.json from the health check every minute, smoke.json from the smoke test,
// k6-baseline.json from PR 10) and the background worker's heartbeat, and judges one line each (hub.ts). Seeing needs
// `health.read`; changing when a line turns yellow (`health.hub`) needs `settings.write` and is audited. Nothing here
// changes the server. A missing file is normal on a developer machine and before server setup: its line is grey.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { workerStatus } from '@extas/jobs';
import { healthHubSchema, INSTALLATION, type HealthHubSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import { hubLines, hubOverall, type HubLine, type HubLineState, type K6Baseline, type MonitorHealth, type SmokeResult, type StateFile } from './hub';

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

export interface HubView {
  overall: HubLineState;
  lines: HubLine[];
  cards: { hub: HubCard };
  /** Whether the state folder is there at all (false on a developer machine). */
  serverConnected: boolean;
}

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

/** The hub's data (`health.read`). */
export async function hubView(deps: HealthDeps, who: HealthWho): Promise<HubView> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [limits, health, smoke, k6, worker, connected] = await Promise.all([
    deps.resolver.value('health.hub'),
    stateFile<MonitorHealth>(dir, 'health.json'),
    stateFile<SmokeResult>(dir, 'smoke.json'),
    stateFile<K6Baseline>(dir, 'k6-baseline.json'),
    workerStatus({ db: deps.db, settings: deps.resolver, now: () => now }),
    dir ? stat(dir).then(() => true, () => false) : Promise.resolve(false),
  ]);
  const lines = hubLines({ now, limits, health, smoke, k6, worker: worker.state });
  return { overall: hubOverall(lines), lines, cards: { hub: cardOf(limits) }, serverConnected: connected };
}

/** Saves when a line turns yellow (`settings.write`). */
export async function saveHubCard(deps: HealthDeps, who: HealthWho, input: unknown): Promise<HubView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
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
