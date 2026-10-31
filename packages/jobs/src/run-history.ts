// S21 · PR 419 (B7.3) — run history: every smoke test and every saved-journeys run kept in SiteAuditRun with what
// passed and failed, and one SiteAuditFinding per failure (severity, page, screen, how to repeat it; the suggested fix
// and whether one was applied stay empty until the approval gate, PR 420, and the audit runner, PR 570). Old runs are
// kept for comparison; nothing here deletes a run.
// - `smokeRunInput` reads a run of tools/smoke.mjs (result.json and rows.json, as infra/deploy/smoke.sh keeps them);
// - `journeysRunInput` reads a run of tools/journeys.mjs (its result.json with every journey's steps, or the summary
//   state/journeys/<time>.json keeps; then its problem lines are the findings);
// - `keepRun` writes one run once: `sourceKey` (tool, when, kind, version) is unique per store, so the server's import
//   after each run (run-history-cli.ts) and the admin's catch-up from the kept files never keep it twice.
// Only what the tools wrote is kept: paths, screens, step names and the problem lines. No page text, no password.
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';

export const RUN_TOOLS = ['smoke', 'journeys'] as const;
export type RunTool = (typeof RUN_TOOLS)[number];
export const FINDING_SEVERITIES = ['URGENT', 'IMPORTANT', 'CAN_WAIT'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
/** A run keeps at most this many findings (a run where everything broke says so in its first ones). */
export const MAX_FINDINGS = 200;

export interface FindingInput {
  page: string | null;
  device: string | null;
  severity: FindingSeverity;
  title: string;
  reproduce: string | null;
}
export interface RunInput {
  tool: RunTool;
  sourceKey: string;
  kind: string;
  at: string;
  sha: string;
  ok: boolean;
  passed: number;
  failed: number;
  startedAt: Date;
  summary: Record<string, unknown>;
  findings: FindingInput[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
const lines = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, n).map((x) => x.slice(0, 300)) : []);

/** The run's name: the same for the full result and its kept summary, so a run is kept once. */
export const runSourceKey = (tool: RunTool, at: string, kind: string, sha: string) => `${tool}:${at}|${kind}|${sha}`.slice(0, 300);

/** A problem line without the path it starts with ("/x: answered 500" → "answered 500"). */
const withoutPath = (line: string, path: string) => (line.startsWith(`${path}: `) ? line.slice(path.length + 2) : line);
/** The shop's money pages: a failure there stops orders. */
const MONEY_PATH = /^\/(bag|cart|checkout)(\/|$|\?)/;
/** Only UI findings (PR 416, "UI <KIND>: …"): the page works, it looks wrong. */
const onlyUi = (problems: string[]) => problems.length > 0 && problems.every((p) => /(^|: )UI [A-Z-]+:/.test(p));

export function smokeSeverity(path: string, status: number, problems: string[]): FindingSeverity {
  if (MONEY_PATH.test(path) || status >= 500) return 'URGENT';
  if (onlyUi(problems)) return 'CAN_WAIT';
  return 'IMPORTANT';
}

export function journeySeverity(journey: string, problems: string[]): FindingSeverity {
  if (onlyUi(problems)) return 'CAN_WAIT';
  return journey === 'customer' ? 'URGENT' : 'IMPORTANT';
}

/** A run that wrote no rows: each problem line is one finding (the first one decides nothing about the others). */
function lineFindings(problems: string[], severity: FindingSeverity): FindingInput[] {
  return problems.map((p) => {
    const m = /^(\/\S*): /.exec(p);
    return { page: m ? m[1]! : null, device: /\((phone|desktop)\)$/.exec(p)?.[1] ?? null, severity, title: p, reproduce: null };
  });
}

/** A journeys problem line as tools/journeys.mjs `summarise` writes it: "<journey> (<screen>) step <n> <what>: <problem>". */
const JOURNEY_LINE = /^(\S+) \(([^)]+)\) step (\d+) (.+?): (.+)$/;
const stepPage = (what: string) => /(^|\s)(\/\S*)/.exec(what)?.[2] ?? null;

function journeyLineFindings(problems: string[]): FindingInput[] {
  return problems.map((p) => {
    const m = JOURNEY_LINE.exec(p);
    if (!m) return { page: null, device: null, severity: 'IMPORTANT', title: p, reproduce: null };
    const [, journey, screen, n, what, problem] = m as unknown as [string, string, string, string, string, string];
    return { page: stepPage(what), device: screen, severity: journeySeverity(journey, [problem]), title: problem, reproduce: `${journey} · ${screen} · step ${n}: ${what}` };
  });
}

/**
 * A smoke test run: result.json (+ rows.json from PR 418 on). One finding per failed page × screen; without rows, one
 * per problem line. `writtenAt` is when the server wrote it.
 */
export function smokeRunInput(result: unknown, rowsFile: unknown, writtenAt: Date): RunInput | null {
  if (!isObj(result) || typeof result.at !== 'string') return null;
  const at = str(result.at, 80);
  const kind = str(result.kind, 40) || 'run';
  const sha = str(result.sha, 40);
  const pages = int(result.pages);
  const failed = int(result.failed);
  const problems = lines(result.problems, MAX_FINDINGS);
  const rows = isObj(rowsFile) && Array.isArray(rowsFile.rows) ? rowsFile.rows.filter(isObj) : null;
  const findings: FindingInput[] = rows
    ? rows
        .filter((r) => r.ok !== true && typeof r.path === 'string')
        .map((r) => {
          const path = str(r.path, 500);
          const screen = str(r.screen, 20) || null;
          const probs = lines(r.problems, 10);
          return { page: path, device: screen, severity: smokeSeverity(path, int(r.status), probs), title: withoutPath(probs[0] ?? 'failed', path), reproduce: `open ${path}${screen ? ` · ${screen}` : ''}` };
        })
    : lineFindings(problems, 'IMPORTANT');
  // the run's own problems that no page carries (the database guards, a run that did not finish)
  const ok = result.ok === true;
  if (!ok && rows && !findings.length && problems.length) findings.push(...lineFindings(problems.slice(0, 5), 'URGENT'));
  return {
    tool: 'smoke',
    sourceKey: runSourceKey('smoke', at, kind, sha),
    kind,
    at,
    sha,
    ok,
    passed: Math.max(0, pages - failed),
    failed,
    startedAt: writtenAt,
    summary: { tool: 'smoke', kind, at, sha, total: pages, rolledBack: result.rolledBack === true, problems: problems.slice(0, 5), hasRows: !!rows },
    findings: findings.slice(0, MAX_FINDINGS),
  };
}

/**
 * A saved-journeys run: the full result (rows with steps) or the kept summary (problem lines only). One finding per
 * failed step; a step's UI findings (PR 416) are in its problems.
 */
export function journeysRunInput(file: unknown, writtenAt: Date): RunInput | null {
  if (!isObj(file) || typeof file.at !== 'string') return null;
  const at = str(file.at, 80);
  const kind = str(file.kind, 40) || 'run';
  const sha = str(file.sha, 40);
  const total = int(file.journeys);
  const failed = int(file.failed);
  const problems = lines(file.problems, MAX_FINDINGS);
  const rows = Array.isArray(file.rows) ? file.rows.filter(isObj) : null;
  const findings: FindingInput[] = rows
    ? rows.flatMap((r) => {
        const journey = str(r.journey, 40);
        const screen = str(r.screen, 20) || null;
        const steps = Array.isArray(r.steps) ? r.steps.filter(isObj) : [];
        return steps
          .filter((s) => s.ok === false)
          .map((s) => {
            const probs = lines(s.problems, 10);
            return {
              // the step's own page when it names one ("open /checkout")
              page: stepPage(str(s.what, 200)),
              device: screen,
              severity: journeySeverity(journey, probs),
              title: probs[0] ?? 'failed',
              reproduce: `${journey}${screen ? ` · ${screen}` : ''} · step ${int(s.n)}: ${str(s.what, 200)}`,
            };
          });
      })
    : journeyLineFindings(problems);
  const ok = file.ok === true;
  if (!ok && !findings.length && problems.length) findings.push(...lineFindings(problems.slice(0, 5), 'URGENT'));
  const ui = isObj(file.ui) && Array.isArray(file.ui.kinds) ? { kinds: lines(file.ui.kinds, 4), issues: int(file.ui.issues) } : null;
  return {
    tool: 'journeys',
    sourceKey: runSourceKey('journeys', at, kind, sha),
    kind,
    at,
    sha,
    ok,
    passed: Math.max(0, total - failed),
    failed,
    startedAt: writtenAt,
    summary: { tool: 'journeys', kind, at, sha, total, steps: int(file.steps), skipped: int(file.skipped), ui, problems: problems.slice(0, 5), hasRows: !!rows },
    findings: findings.slice(0, MAX_FINDINGS),
  };
}

const isUniqueViolation = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'P2002';

/** Keeps one run with its findings, once ("kept"), or says it was kept before ("known"). */
export async function keepRun(db: PrismaClient, input: RunInput, storeId: number = MOTHER_STORE_ID): Promise<'kept' | 'known'> {
  if (await db.siteAuditRun.findUnique({ where: { storeId_sourceKey: { storeId, sourceKey: input.sourceKey } }, select: { id: true } })) return 'known';
  try {
    await db.$transaction(async (tx) => {
      const run = await tx.siteAuditRun.create({
        data: {
          storeId,
          sourceKey: input.sourceKey,
          trigger: `${input.tool}:${input.kind}`.slice(0, 80),
          status: input.ok ? 'SUCCEEDED' : 'FAILED',
          passed: input.passed,
          failed: input.failed,
          summary: input.summary as object,
          startedAt: input.startedAt,
          finishedAt: input.startedAt,
        },
        select: { id: true },
      });
      if (input.findings.length)
        await tx.siteAuditFinding.createMany({
          data: input.findings.map((f) => ({ storeId, runId: run.id, page: f.page, device: f.device, severity: f.severity, title: f.title, reproduce: f.reproduce, fixStatus: 'none' })),
        });
    });
    return 'kept';
  } catch (e) {
    // two imports of the same run at once: the other one kept it
    if (isUniqueViolation(e)) return 'known';
    throw e;
  }
}
