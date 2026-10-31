// S21 · PR 424 (B7.3) — "Telegram when a test fails" on Reports › Site health › Run history: the owner's switches
// (`health.runAlerts`, off as it ships; `settings.write`, audited as health.runAlerts.save) and what the server last
// told for each test. The lines themselves are sent by the server right after each smoke test and journeys run
// (run_alert in infra/deploy/smoke-lib.sh, the switches synced as run-alerts.env); it keeps each test's state in
// state/run-alerts/<tool>.json, read here through the app's read-only /state mount. Nothing here sends a message.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { RUN_TOOLS, type RunTool } from '@extas/jobs';
import { healthRunAlertsSchema, INSTALLATION, type HealthRunAlertsSettings } from '@extas/settings';
import type { AppResolver } from '../settings';

const S = MOTHER_STORE_ID;
const KEY = 'health.runAlerts';

export interface RunAlertsDeps {
  db: PrismaClient;
  resolver: AppResolver;
  /** The server's state folder; default EXTAS_STATE_DIR. */
  stateDir?: string | null;
}
export interface RunAlertsWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface RunAlertsCard {
  key: 'runAlerts';
  value: HealthRunAlertsSettings;
  version: string;
}
/** What the server last said about one test: failing now (since when) and when it last sent a line. */
export interface RunAlertState {
  failing: boolean;
  since: string | null;
  told: string | null;
}
export interface RunAlertsView {
  settings: HealthRunAlertsSettings;
  canEdit: boolean;
  told: Record<RunTool, RunAlertState | null>;
  cards: { runAlerts: RunAlertsCard };
}

export class RunAlertsError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isRunAlertsError = (e: unknown): e is RunAlertsError => e instanceof RunAlertsError;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const cardOf = (s: HealthRunAlertsSettings): RunAlertsCard => {
  const value = { enabled: s.enabled, smoke: s.smoke, journeys: s.journeys, repeatHours: s.repeatHours, recovered: s.recovered };
  return { key: 'runAlerts', value, version: versionOf(value) };
};
/** Seconds since 1970 as the server wrote them, or null. */
const when = (v: unknown): string | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null);

/** The server's state for one test, or null when it has none (never ran since the feature came, or no state folder). */
export async function readAlertState(dir: string | null, tool: RunTool): Promise<RunAlertState | null> {
  if (!dir) return null;
  try {
    const d = JSON.parse(await readFile(join(dir, 'run-alerts', `${tool}.json`), 'utf8')) as unknown;
    if (!isObj(d)) return null;
    const failing = d.failing === true;
    return { failing, since: failing ? when(d.since) : null, told: when(d.told) };
  } catch {
    return null;
  }
}

async function settingsOf(deps: RunAlertsDeps): Promise<HealthRunAlertsSettings> {
  return (await deps.resolver.value(KEY)) as HealthRunAlertsSettings;
}

/** The card and the server's last word for each test (`health.read`). */
export async function runAlertsView(deps: RunAlertsDeps, who: RunAlertsWho): Promise<RunAlertsView> {
  const held = await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [settings, ...states] = await Promise.all([settingsOf(deps), ...RUN_TOOLS.map((t) => readAlertState(dir, t))]);
  return {
    settings,
    canEdit: held.has('settings.write'),
    told: Object.fromEntries(RUN_TOOLS.map((t, i) => [t, states[i] ?? null])) as Record<RunTool, RunAlertState | null>,
    cards: { runAlerts: cardOf(settings) },
  };
}

/** The switches (`settings.write`, audited, a stale version refused). The server reads them at its next sync. */
export async function saveRunAlertsCard(deps: RunAlertsDeps, who: RunAlertsWho, input: unknown): Promise<RunAlertsView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'runAlerts') throw new RunAlertsError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (input.version !== cardOf(before).version) throw new RunAlertsError('STALE', 409);
  const ok = healthRunAlertsSchema.safeParse(input.value);
  if (!ok.success) throw new RunAlertsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (cardOf(ok.data).version !== cardOf(before).version) {
    await deps.resolver.set(KEY, ok.data, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'Reports › Site health › Run history' });
    await audit(deps.db, who.actor, { storeId: S, action: 'health.runAlerts.save', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return runAlertsView(deps, who);
}
