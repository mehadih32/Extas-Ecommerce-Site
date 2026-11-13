// S15 · PR 324 (Blueprint C1.4 "the AI-off principle: AI is additive, the shop runs without it"; AIC-01 Control room,
// demo 97y-adm2-ai.js's "AI-off test" card) — reads the result of `tools/ai-off-guard.mjs`, a deterministic static
// scan of the real source tree (the same method as the hardcode guard, PR 494), never a live runtime test.
//
// The demo's own card fabricates "7/7 passed" the moment the button is pressed — invented, against CLAUDE.md rule 1
// ("nothing hardcoded" / nothing invented). This file never does that: it only ever reads back the real,
// already-computed `docs/reports/ai-off-guard.json`, committed by the tool after an actual scan of the code, and
// shows it honestly — with no "Run" action, since the deployed app carries no source to scan (apps/web/Dockerfile's
// `run` stage is `.next/standalone` + `.next/static` + `public` only; CI's `--check` step is what proves the
// committed report still matches the code on every change). On a fresh installation, or before a deploy has copied
// docs/ yet, this honestly returns `null` — the page then shows "not available", never a guessed number.
//
// The docs folder this reads is the server's own deployed copy (`EXTAS_DOCS_DIR`, filled by every deploy,
// infra/deploy/docs-sync.sh) or, in development and CI, the repository's own `docs/` — the exact resolution
// `admin-shell/guide.ts`'s `guideDir` already uses for the admin guide panel (PR 594, CN-011/CN-014).
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export interface AiOffCheckResult {
  id: string;
  nameEn: string;
  nameBn: string;
  fallbackEn: string;
  fallbackBn: string;
  /** PR 506: true when this check proves a step of the ordinary customer journey has no AI job on its path at all
   * (not merely a fallback for one) — the master switch (PR 305), the spend cap (PR 309) and this proof are the
   * three safety pillars `docs/agents/AGENT-PROTOCOL.md` names. */
  journey: boolean;
  pass: boolean;
  jobKeys: readonly string[];
  reasons: readonly string[];
}

export interface AiOffGuardReport {
  at: string;
  n: number;
  ok: number;
  totalJobCount: number;
  coveredJobCount: number;
  /** PR 506: how many of `checks` are `journey: true`, and how many of those passed — never derived in the UI from
   * the full list, since the scan itself is the only honest source of this count. */
  journeyN: number;
  journeyOk: number;
  checks: readonly AiOffCheckResult[];
}

const REPORT_REL = ['reports', 'ai-off-guard.json'] as const;

/** The folder that holds `docs/` on this runtime: the deployed copy first, else the repository's own (same roots as
 * `guideDir`). `turbopackIgnore` keeps the whole repository out of the server bundle, same reason as `guideDir`. */
export function aiOffGuardReportFile(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): string | null {
  const roots = [env.EXTAS_DOCS_DIR, cwd, join(/*turbopackIgnore: true*/ cwd, '..'), join(/*turbopackIgnore: true*/ cwd, '..', '..')].filter((x): x is string => Boolean(x));
  for (const r of roots) {
    const file = resolve(/*turbopackIgnore: true*/ r, 'docs', ...REPORT_REL);
    if (existsSync(file)) return file;
  }
  return null;
}

function isAiOffGuardReport(value: unknown): value is AiOffGuardReport {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.at === 'string' && typeof r.n === 'number' && typeof r.ok === 'number' && typeof r.totalJobCount === 'number' && typeof r.coveredJobCount === 'number' && typeof r.journeyN === 'number' && typeof r.journeyOk === 'number' && Array.isArray(r.checks);
}

/** Honest absence (`null`), never an invented report: no file yet (a fresh installation, or docs not deployed yet)
 * and a file that fails to parse both read the same way — nothing here guesses at a pass count. */
export async function readAiOffGuardReport(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): Promise<AiOffGuardReport | null> {
  const file = aiOffGuardReportFile(env, cwd);
  if (!file) return null;
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return isAiOffGuardReport(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
