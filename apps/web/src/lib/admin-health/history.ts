// S21 · PR 419 (B7.3) — Reports › Site health › Run history: every smoke test and saved-journeys run, kept in
// SiteAuditRun with what passed and failed and one finding per failure (packages/jobs run-history.ts). The server keeps
// each run right after it ends (run-history-cli.ts); this page also catches up from the run files the server still
// holds (state/smoke-runs/, state/journeys/), so a run is in the history even if that import did not happen. A run is
// kept once (its source key). One run's page compares it with the run of the same tool before it: what is new, what
// is still failing, what was fixed since. Seeing needs `health.read`. Nothing here deletes a run.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { FINDING_SEVERITIES, journeysRunInput, keepRun, RUN_TOOLS, smokeRunInput, type FindingSeverity, type RunInput, type RunTool } from '@extas/jobs';

export const HISTORY_PAGE_SIZE = 25;
export const HISTORY_RESULTS = ['all', 'failed'] as const;
export type HistoryResult = (typeof HISTORY_RESULTS)[number];
export type HistoryTool = RunTool | 'all';

export interface HistoryDeps {
  db: PrismaClient;
  now?: () => Date;
  /** The server's state folder; default EXTAS_STATE_DIR. */
  stateDir?: string | null;
}
export interface HistoryWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface HistoryRow {
  id: string;
  tool: RunTool;
  kind: string;
  /** When it ran, as the server wrote it (the shop's time zone). */
  at: string;
  startedAt: string;
  sha: string;
  ok: boolean;
  passed: number;
  failed: number;
  findings: number;
}
export interface HistoryView {
  tool: HistoryTool;
  result: HistoryResult;
  page: number;
  pages: number;
  total: number;
  rows: HistoryRow[];
  /** All runs kept, and the failed ones of the last 7 days. */
  kept: number;
  failedWeek: number;
  /** The newest run of each tool. */
  latest: Record<RunTool, HistoryRow | null>;
  /** Runs this view kept from the server's files (0 when the server had already kept them). */
  caughtUp: number;
}

export interface HistoryFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  page: string | null;
  device: string | null;
  reproduce: string | null;
  suggestedFix: string | null;
  fixStatus: string;
  /** Not in the run before (of the same tool). */
  isNew: boolean;
}
export interface HistoryRunView {
  run: HistoryRow & { summary: Record<string, unknown> };
  findings: HistoryFinding[];
  previous: HistoryRow | null;
  /** The previous run's findings that this run no longer has. */
  fixedSince: Pick<HistoryFinding, 'severity' | 'title' | 'page' | 'device' | 'reproduce'>[];
}

export class HistoryError extends Error {
  constructor(
    readonly code: 'NOT_FOUND',
    readonly status: number,
  ) {
    super(code);
  }
}
export const isHistoryError = (e: unknown): e is HistoryError => e instanceof HistoryError;

const S = MOTHER_STORE_ID;
const DAY = 86_400_000;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const toolOf = (trigger: string): RunTool => (trigger.startsWith('journeys:') ? 'journeys' : 'smoke');
const SEV_ORDER: Record<string, number> = Object.fromEntries(FINDING_SEVERITIES.map((s, i) => [s, i]));
const asSeverity = (s: string): FindingSeverity => ((FINDING_SEVERITIES as readonly string[]).includes(s) ? (s as FindingSeverity) : 'IMPORTANT');
/** The same failure in two runs: the page, the screen and how to repeat it (or its words, when there is no step). */
export const findingKey = (f: { page: string | null; device: string | null; reproduce: string | null; title: string }) => `${f.page ?? ''}|${f.device ?? ''}|${f.reproduce ?? f.title}`;

async function readJson(p: string): Promise<{ data: unknown; at: Date } | null> {
  try {
    const [text, st] = await Promise.all([readFile(p, 'utf8'), stat(p)]);
    return { data: JSON.parse(text) as unknown, at: st.mtime };
  } catch {
    return null;
  }
}

/** The runs the server's files still hold: the newest smoke run of each kind and the kept journeys summaries. */
export async function keptFiles(dir: string | null): Promise<RunInput[]> {
  if (!dir) return [];
  const out: RunInput[] = [];
  for (const slot of ['deploy', 'scheduled']) {
    const result = await readJson(join(dir, 'smoke-runs', slot, 'result.json'));
    if (!result) continue;
    const rows = await readJson(join(dir, 'smoke-runs', slot, 'rows.json'));
    const input = smokeRunInput(result.data, rows?.data ?? null, result.at);
    if (input) out.push(input);
  }
  const folder = join(dir, 'journeys');
  const names = await readdir(folder).then((n) => n.filter((x) => /^[\w.-]+\.json$/.test(x)), () => [] as string[]);
  for (const name of names) {
    const f = await readJson(join(folder, name));
    const input = f ? journeysRunInput(f.data, f.at) : null;
    if (input) out.push(input);
  }
  return out;
}

/** Keeps the runs the history does not have yet (one query for what it has). */
export async function catchUp(db: PrismaClient, inputs: RunInput[]): Promise<number> {
  if (!inputs.length) return 0;
  const have = new Set((await db.siteAuditRun.findMany({ where: { storeId: S, sourceKey: { in: inputs.map((i) => i.sourceKey) } }, select: { sourceKey: true } })).map((r) => r.sourceKey));
  let kept = 0;
  for (const input of inputs) if (!have.has(input.sourceKey) && (await keepRun(db, input, S)) === 'kept') kept += 1;
  return kept;
}

type RunRecord = { id: string; trigger: string; status: string; passed: number; failed: number; summary: unknown; startedAt: Date; _count: { findings: number } };
const rowOf = (r: RunRecord): HistoryRow => {
  const s = isObj(r.summary) ? r.summary : {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return { id: r.id, tool: toolOf(r.trigger), kind: str(s.kind) || r.trigger.split(':')[1] || '', at: str(s.at), startedAt: r.startedAt.toISOString(), sha: str(s.sha), ok: r.status === 'SUCCEEDED', passed: r.passed, failed: r.failed, findings: r._count.findings };
};
const RUN_SELECT = { id: true, trigger: true, status: true, passed: true, failed: true, summary: true, startedAt: true, _count: { select: { findings: true } } } as const;

/** The list (`health.read`), newest first, by tool and result, a page at a time. */
export async function historyView(deps: HistoryDeps, who: HistoryWho, opts: { tool?: string | null; result?: string | null; page?: string | number | null } = {}): Promise<HistoryView> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  const now = deps.now?.() ?? new Date();
  const dir = deps.stateDir === undefined ? process.env.EXTAS_STATE_DIR || null : deps.stateDir;
  const caughtUp = await catchUp(deps.db, await keptFiles(dir));
  const tool: HistoryTool = (RUN_TOOLS as readonly string[]).includes(String(opts.tool)) ? (opts.tool as RunTool) : 'all';
  const result: HistoryResult = opts.result === 'failed' ? 'failed' : 'all';
  const where = { storeId: S, ...(tool === 'all' ? {} : { trigger: { startsWith: `${tool}:` } }), ...(result === 'failed' ? { status: 'FAILED' as const } : {}) };
  const total = await deps.db.siteAuditRun.count({ where });
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(opts.page)) || 1));
  const [rows, kept, failedWeek, ...latest] = await Promise.all([
    deps.db.siteAuditRun.findMany({ where, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * HISTORY_PAGE_SIZE, take: HISTORY_PAGE_SIZE, select: RUN_SELECT }),
    deps.db.siteAuditRun.count({ where: { storeId: S } }),
    deps.db.siteAuditRun.count({ where: { storeId: S, status: 'FAILED', startedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    ...RUN_TOOLS.map((t) => deps.db.siteAuditRun.findFirst({ where: { storeId: S, trigger: { startsWith: `${t}:` } }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }], select: RUN_SELECT })),
  ]);
  return {
    tool,
    result,
    page,
    pages,
    total,
    rows: rows.map(rowOf),
    kept,
    failedWeek,
    latest: Object.fromEntries(RUN_TOOLS.map((t, i) => [t, latest[i] ? rowOf(latest[i]!) : null])) as Record<RunTool, HistoryRow | null>,
    caughtUp,
  };
}

/** One run with its findings, compared with the run of the same tool before it (`health.read`). */
export async function historyRunView(deps: HistoryDeps, who: HistoryWho, id: string): Promise<HistoryRunView> {
  await requirePermission(deps.db, who.actor, 'health.read', { storeId: S });
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HistoryError('NOT_FOUND', 404);
  const run = await deps.db.siteAuditRun.findFirst({ where: { id, storeId: S }, select: RUN_SELECT });
  if (!run) throw new HistoryError('NOT_FOUND', 404);
  const tool = toolOf(run.trigger);
  const prev = await deps.db.siteAuditRun.findFirst({
    where: { storeId: S, trigger: { startsWith: `${tool}:` }, OR: [{ startedAt: { lt: run.startedAt } }, { startedAt: run.startedAt, id: { lt: run.id } }] },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    select: RUN_SELECT,
  });
  const fields = { id: true, severity: true, title: true, page: true, device: true, reproduce: true, suggestedFix: true, fixStatus: true } as const;
  const [mine, before] = await Promise.all([
    deps.db.siteAuditFinding.findMany({ where: { runId: run.id, storeId: S }, select: fields, orderBy: { id: 'asc' } }),
    prev ? deps.db.siteAuditFinding.findMany({ where: { runId: prev.id, storeId: S }, select: fields, orderBy: { id: 'asc' } }) : Promise.resolve([]),
  ]);
  const beforeKeys = new Set(before.map(findingKey));
  const mineKeys = new Set(mine.map(findingKey));
  const findings = mine
    .map((f) => ({ ...f, severity: asSeverity(f.severity), isNew: !!prev && !beforeKeys.has(findingKey(f)) }))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || Number(b.isNew) - Number(a.isNew));
  const fixedSince = before.filter((f) => !mineKeys.has(findingKey(f))).map((f) => ({ severity: asSeverity(f.severity), title: f.title, page: f.page, device: f.device, reproduce: f.reproduce }));
  return { run: { ...rowOf(run), summary: isObj(run.summary) ? run.summary : {} }, findings, previous: prev ? rowOf(prev) : null, fixedSince };
}
