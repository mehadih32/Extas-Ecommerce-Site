// S15 · PR 322 (Blueprint C10.4 "new lessons become versioned skills only after a sandbox test (PR 322) and an
// approval (PR 420)"; B6.6's own "sandbox limits" idea applied here to a skill rather than a site audit; the
// demo's own AIC-04a "Skill sandbox" screen, `97y-adm2-ai.js`, `syn: "sandbox test skill real data copy"`) — AI ›
// Skills › Sandbox at `/admin/ai/skills/sandbox`: pick any skill (whatever its approval status — the Blueprint's
// own line is explicit that this runs *before* approval, not after) and a 7- or 30-day order window, then "Run in
// sandbox". Matches the demo's own three guarantees word for word: it reads a real, read-only copy of recent
// order data; nothing is written to that data, no message is sent, and no money moves.
//
// Honest about the one thing a sandbox test cannot yet prove: **no skill-execution engine exists in this codebase
// (PR 304–321 already say so of every other S15 write path)**, so nothing here can truly know which of the real
// orders a skill's own instructions would act on — the demo's own number here is a fabricated percentage with no
// real skill behind it. Rather than carrying that fabrication into production code (CLAUDE.md rule 1, and every
// other S15 module's own refusal to invent a figure it cannot back), `runSkillSandbox` proves exactly what it
// honestly can:
//   1. `ordersRead` — the real count of the store's own orders placed in the chosen window, read straight from
//      `Order` with no write of any kind to that table (the "real data, read-only copy" guarantee).
//   2. `passed` — a real, if modest, readiness check: the version under test has real, non-placeholder-sized
//      content (`SKILL_CONTENT_MAX`, `fixes.ts`'s own guard) and the read above completed without error. This is
//      the honest floor of "ready to go in front of the owner for approval", not a claim the skill's own logic is
//      correct — no engine exists yet to check that.
//   3. `estimatedCostMinor` — a real number only when the skill's own agent has at least one Cost Book job
//      (`JOB_CATALOG`, PR 312): that job's own recommended model and usage shape become the per-run cost,
//      multiplied by `ordersRead` and priced into the store's currency with the exact same `pricerFor` PR
//      315/316 already use — so this number can never silently disagree with the Cost Book's own math. When the
//      agent has no catalogued job, or no exchange rate has been typed yet, `estimatedCostMinor` stays `null`
//      with `costNote` saying exactly why, never a guessed number.
// Every run is written once, append-only, to `AiSandboxRun` (already in the full S00 schema, `@stage S15 · PR
// 322, 579, 580` — shared with the curriculum exam and model-qualification sandboxes those later PRs add) and
// mirrored onto the tested version's own `AiSkillVersion.sandboxResult` column (its own header comment: "a skill
// version: sandbox result, approval, one-click rollback") so the owner's approval screen can show the version's
// last sandbox result without a second query.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import type { AppResolver } from '../settings';
import { pricerFor } from '../exchange-rate';
import { isAiAgentKey, type AiAgentKey } from './agents';
import { estimateMicrosFor, JOB_CATALOG, microsToUsdMinor, modelOf } from './cost-book';
import { AiError } from './errors';
import { SKILL_CONTENT_MAX } from '../admin-health/fixes';

const DAY = 86_400_000;

/** The demo's own two choices (AIC-04a) — never a free-typed number of days. */
export const SANDBOX_DATA_WINDOWS = [7, 30] as const;
export type SandboxDataWindow = (typeof SANDBOX_DATA_WINDOWS)[number];

export function isSandboxDataWindow(v: number): v is SandboxDataWindow {
  return (SANDBOX_DATA_WINDOWS as readonly number[]).includes(v);
}

type Db = PrismaClient;

export interface SkillSandboxDeps {
  db: Db;
  resolver: Pick<AppResolver, 'value'>;
  now?: () => Date;
}

export interface SandboxRunInput {
  storeId: number;
  skillId: string;
  dataWindowDays: SandboxDataWindow;
}

/** Why `estimatedCostMinor` is null — never silently, so the owner's screen can say exactly what to do next. */
export type SandboxCostNote = 'NO_AGENT_JOB' | 'NO_EXCHANGE_RATE' | null;

export interface SandboxRunResult {
  id: string;
  skillId: string;
  skillName: string;
  skillKey: string;
  /** The version actually tested — always the newest version row, whatever the skill's own approval status, so a
   * draft can be sandboxed before anyone decides on it. */
  version: number;
  dataWindowDays: SandboxDataWindow;
  ordersRead: number;
  estimatedCostMinor: number | null;
  costNote: SandboxCostNote;
  passed: boolean;
  createdAt: Date;
}

/**
 * Runs a skill's newest version against a real, read-only window of the store's own orders (`ai.skills.write`,
 * checked by the caller — the same permission that already governs this skill's own management). Writes exactly
 * two rows: one append-only `AiSandboxRun` log entry, and the tested `AiSkillVersion`'s own `sandboxResult` —
 * never anything on `Order` itself, matching the demo's own "nothing is written, sent or charged" guarantee.
 */
export async function runSkillSandbox(deps: SkillSandboxDeps, who: { actor: Actor; ctx?: RequestContext }, input: SandboxRunInput): Promise<SandboxRunResult> {
  if (!isSandboxDataWindow(input.dataWindowDays)) throw new AiError(422, 'INVALID_INPUT', ['dataWindowDays']);
  const skill = await deps.db.aiSkill.findUnique({ where: { id: input.skillId } });
  if (!skill || skill.archivedAt) throw new AiError(404, 'NOT_FOUND', ['skillId']);
  const latest = await deps.db.aiSkillVersion.findFirst({ where: { skillId: skill.id }, orderBy: { version: 'desc' } });
  if (!latest) throw new AiError(409, 'NO_VERSION', ['skillId']);

  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - input.dataWindowDays * DAY);
  const ordersRead = await deps.db.order.count({ where: { storeId: input.storeId, placedAt: { gte: since } } });

  const agentKey: AiAgentKey | null = skill.sourceRef && isAiAgentKey(skill.sourceRef) ? skill.sourceRef : null;
  const agentJob = agentKey ? JOB_CATALOG.find((j) => j.agentKey === agentKey) : undefined;
  let estimatedCostMinor: number | null = null;
  let costNote: SandboxCostNote = null;
  if (!agentJob) {
    costNote = 'NO_AGENT_JOB';
  } else {
    const model = modelOf(agentJob.recommendedModelKey);
    const perRunMicros = estimateMicrosFor(agentJob.usage, model);
    const usdMinor = microsToUsdMinor(perRunMicros * Math.max(ordersRead, 0));
    const [timeZone, price] = await Promise.all([deps.resolver.value('store.timeZone', { storeId: input.storeId }), pricerFor(deps.db, deps.resolver, input.storeId)]);
    const priced = price(usdMinor, 'USD', ymdIn(now, timeZone as string));
    if (!priced) costNote = 'NO_EXCHANGE_RATE';
    else estimatedCostMinor = priced.storeMinor;
  }

  const passed = latest.content.trim().length > 0 && latest.content.length <= SKILL_CONTENT_MAX;
  const resultJson = { version: latest.version, dataWindowDays: input.dataWindowDays, ordersRead, estimatedCostMinor, costNote } as Prisma.InputJsonValue;

  const run = await deps.db.$transaction(async (tx) => {
    const row = await tx.aiSandboxRun.create({
      data: { kind: 'skill', agentKey, skillKey: skill.key, input: { skillId: skill.id, version: latest.version, dataWindowDays: input.dataWindowDays } as Prisma.InputJsonValue, result: resultJson, score: null, passed },
    });
    await tx.aiSkillVersion.update({ where: { id: latest.id }, data: { sandboxResult: resultJson } });
    return row;
  });

  await audit(
    deps.db,
    who.actor,
    { action: 'ai.skill.sandbox', entityType: 'AiSkill', entityId: skill.id, after: { runId: run.id, version: latest.version, dataWindowDays: input.dataWindowDays, ordersRead, passed } },
    who.ctx ?? {},
  );

  return { id: run.id, skillId: skill.id, skillName: skill.name, skillKey: skill.key, version: latest.version, dataWindowDays: input.dataWindowDays, ordersRead, estimatedCostMinor, costNote, passed, createdAt: run.createdAt };
}

export interface SandboxRunRow {
  id: string;
  version: number;
  dataWindowDays: number;
  ordersRead: number;
  estimatedCostMinor: number | null;
  costNote: SandboxCostNote;
  passed: boolean;
  createdAt: Date;
}

/** The newest-first run history for one skill (`ai.read`), so a run made last session is still visible after a
 * refresh — `AiSandboxRun` is append-only (CLAUDE.md rule 3), so nothing here is ever lost or overwritten. */
export async function sandboxHistory(deps: Pick<SkillSandboxDeps, 'db'>, skillKey: string, limit = 10 /* hardcode-ok: a display row count, not a business number — every run stays in the database either way */): Promise<SandboxRunRow[]> {
  const rows = await deps.db.aiSandboxRun.findMany({ where: { kind: 'skill', skillKey }, orderBy: { createdAt: 'desc' }, take: limit });
  return rows.map((r) => {
    const result = (r.result ?? {}) as { version?: number; dataWindowDays?: number; ordersRead?: number; estimatedCostMinor?: number | null; costNote?: SandboxCostNote };
    return {
      id: r.id,
      version: result.version ?? 0,
      dataWindowDays: result.dataWindowDays ?? 0,
      ordersRead: result.ordersRead ?? 0,
      estimatedCostMinor: result.estimatedCostMinor ?? null,
      costNote: result.costNote ?? null,
      passed: r.passed,
      createdAt: r.createdAt,
    };
  });
}
