// S21 · PR 570 (B7.3 · Note 14/21, REP-07d / AIC-05) — AI › Checklist audit: the e-commerce checklist in the backend
// (audit-checklist.json, generated from docs/qa/ECOMMERCE-CHECKLIST.md by tools/audit-checklist.mjs) with each group's
// points and newest QA marks; the owner's runner switches (`health.audit`, off as it ships: schedule, groups, agents,
// Telegram); "Run now" (only records the press; the server's hourly check runs the audit, infra/deploy/audit.sh); and
// the last audits the server kept (state/audit.json, state/audit/*.json) with each group's result. Seeing needs
// `health.read`; the switches and "Run now" need `settings.write` (audited). Nothing here fixes or deletes anything:
// fixes go through Fixes to approve (PR 420).
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { audit as auditLog, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { healthAuditSchema, INSTALLATION, type HealthAuditSettings } from '@extas/settings';
import type { AppResolver } from '../settings';
import checklist from './audit-checklist.json';

const S = MOTHER_STORE_ID;
const KEY = 'health.audit';
const RUNS_SHOWN = 12; // hardcode-ok: how many kept audits the page lists
export const AUDIT_MARKS = ['pass', 'fail', 'ownerData', 'decision', 'notRun', 'notTestable'] as const;
export type AuditMark = (typeof AUDIT_MARKS)[number];
export const GROUP_RESULTS = ['pass', 'fail', 'agents'] as const;
export type GroupResult = (typeof GROUP_RESULTS)[number];

export interface AuditDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
  /** The server's state folder; default EXTAS_STATE_DIR. */
  stateDir?: string | null;
}
export interface AuditWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface ChecklistPoint {
  id: string;
  text: string;
  mark: AuditMark;
  where?: string;
}
export interface ChecklistGroup {
  id: string;
  title: string;
  points: ChecklistPoint[];
  counts: Record<AuditMark, number>;
}
/** One group in an audit's summary. */
export interface AuditGroupResult {
  id: string;
  status: GroupResult;
  pages: number;
  failedPages: number;
  failedSteps: number;
  problems: string[];
}
/** state/audit.json and each kept audit (infra/deploy/audit.sh). */
export interface AuditRun {
  at: string;
  kind: string;
  sha: string;
  ok: boolean;
  chosen: number;
  points: number;
  passedGroups: number;
  failedGroups: number;
  agentGroups: number;
  agentsAsked: number;
  groups: AuditGroupResult[];
  problems: string[];
}
/** The card: the groups as ticks (every group ticked = all, saved as an empty list). */
export interface AuditCard {
  key: 'audit';
  value: Omit<HealthAuditSettings, 'runRequestedAt' | 'groups'> & { groups: Record<string, boolean> };
  version: string;
}
export interface AuditView {
  settings: HealthAuditSettings;
  groups: ChecklistGroup[];
  points: number;
  /** The newest audit (null: none yet) and the ones kept before it, newest first. */
  last: AuditRun | null;
  runs: AuditRun[];
  /** A "Run now" press newer than the last audit: the server has not started it yet. */
  asked: boolean;
  canEdit: boolean;
  cards: { audit: AuditCard };
}

export class AuditError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isAuditError = (e: unknown): e is AuditError => e instanceof AuditError;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** The checklist as the admin shows it. */
export const CHECKLIST_GROUPS = checklist.groups as ChecklistGroup[];
export const CHECKLIST_IDS: ReadonlySet<string> = new Set(CHECKLIST_GROUPS.map((g) => g.id));

/** One audit summary as the server wrote it, read defensively. */
export function auditRunOf(d: unknown): AuditRun | null {
  if (!isObj(d)) return null;
  const groups = (Array.isArray(d.groups) ? d.groups : []).filter(isObj).map((g) => ({
    id: str(g.id),
    status: ((GROUP_RESULTS as readonly string[]).includes(str(g.status)) ? g.status : 'agents') as GroupResult,
    pages: num(g.pages),
    failedPages: num(g.failedPages),
    failedSteps: num(g.failedSteps),
    problems: strs(g.problems),
  }));
  return {
    at: str(d.at),
    kind: str(d.kind),
    sha: str(d.sha),
    ok: d.ok === true,
    chosen: num(d.chosen),
    points: num(d.points),
    passedGroups: num(d.passedGroups),
    failedGroups: num(d.failedGroups),
    agentGroups: num(d.agentGroups),
    agentsAsked: isObj(d.agents) ? num(d.agents.asked) : 0,
    groups,
    problems: strs(d.problems),
  };
}

async function readRun(p: string): Promise<{ run: AuditRun; at: Date } | null> {
  try {
    const [text, st] = await Promise.all([readFile(p, 'utf8'), stat(p)]);
    const run = auditRunOf(JSON.parse(text) as unknown);
    return run ? { run, at: st.mtime } : null;
  } catch {
    return null;
  }
}

async function keptRuns(dir: string | null): Promise<AuditRun[]> {
  if (!dir) return [];
  const names = await readdir(join(dir, 'audit')).then(
    (n) => n.filter((x) => /^\d{8}-\d{6}\.json$/.test(x)).sort().reverse().slice(0, RUNS_SHOWN),
    () => [] as string[],
  );
  const runs = await Promise.all(names.map((n) => readRun(join(dir, 'audit', n))));
  return runs.filter((r): r is { run: AuditRun; at: Date } => !!r).map((r) => r.run);
}

const cardOf = (s: HealthAuditSettings): AuditCard => {
  const all = !s.groups.length;
  const groups = Object.fromEntries(CHECKLIST_GROUPS.map((g) => [g.id, all || s.groups.includes(g.id)]));
  const value = { enabled: s.enabled, every: s.every, weekday: s.weekday, hour: s.hour, groups, agents: s.agents, telegram: s.telegram, keepRuns: s.keepRuns };
  return { key: 'audit', value, version: versionOf(value) };
};

async function settingsOf(deps: AuditDeps): Promise<HealthAuditSettings> {
  return (await deps.resolver.value(KEY)) as HealthAuditSettings;
}

/** The page (`health.read`). */
export async function auditView(deps: AuditDeps, who: AuditWho): Promise<AuditView> {
  const held = await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const [settings, last, runs] = await Promise.all([settingsOf(deps), dir ? readRun(join(dir, 'audit.json')) : Promise.resolve(null), keptRuns(dir)]);
  const asked = settings.runRequestedAt ? Date.parse(settings.runRequestedAt) : NaN;
  return {
    settings,
    groups: CHECKLIST_GROUPS,
    points: CHECKLIST_GROUPS.reduce((n, g) => n + g.points.length, 0),
    last: last?.run ?? null,
    runs,
    asked: Number.isFinite(asked) && (!last || asked > last.at.getTime()),
    canEdit: held.has('settings.write'),
    cards: { audit: cardOf(settings) },
  };
}

/** The runner's switches (`settings.write`, audited, a stale version refused; "Run now" is kept as it was). */
export async function saveAuditCard(deps: AuditDeps, who: AuditWho, input: unknown): Promise<AuditView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || input.key !== 'audit' || !isObj(input.value)) throw new AuditError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (input.version !== cardOf(before).version) throw new AuditError('STALE', 409);
  const ticks = input.value.groups;
  if (!isObj(ticks) || Object.entries(ticks).some(([id, on]) => !CHECKLIST_IDS.has(id) || typeof on !== 'boolean')) throw new AuditError('INVALID_INPUT', 400, ['groups']);
  // the ticked groups in the checklist's order; all ticked = all (an empty list), none ticked is refused
  const picked = CHECKLIST_GROUPS.map((g) => g.id).filter((id) => ticks[id] === true);
  if (!picked.length) throw new AuditError('INVALID_INPUT', 400, ['groups']);
  const groups = picked.length === CHECKLIST_GROUPS.length ? [] : picked;
  const ok = healthAuditSchema.safeParse({ ...input.value, groups, runRequestedAt: before.runRequestedAt });
  if (!ok.success) throw new AuditError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const value = ok.data;
  if (cardOf(value).version !== cardOf(before).version) {
    await deps.resolver.set(KEY, value, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'AI › Checklist audit' });
    await auditLog(deps.db, who.actor, { storeId: S, action: 'health.audit.save', entityType: 'Setting', entityId: KEY, before: { ...before }, after: { ...value } }, who.ctx);
  }
  return auditView(deps, who);
}

/** "Run now" (`settings.write`, audited): records the press; the server's next hourly check starts the audit. */
export async function askAuditRun(deps: AuditDeps, who: AuditWho): Promise<AuditView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  const before = await settingsOf(deps);
  const at = (deps.now?.() ?? new Date()).toISOString();
  await deps.resolver.set(KEY, { ...before, runRequestedAt: at }, INSTALLATION, { actorId: who.actor.staffUserId ?? null, reason: 'AI › Checklist audit › Run now' });
  await auditLog(deps.db, who.actor, { storeId: S, action: 'health.audit.run', entityType: 'Setting', entityId: KEY, before: { runRequestedAt: before.runRequestedAt }, after: { runRequestedAt: at } }, who.ctx);
  return auditView(deps, who);
}
