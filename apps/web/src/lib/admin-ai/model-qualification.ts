// S15 · PR 580 (Blueprint C2.4; AIC-0x "Model picks · free models" — demo 89b-admin-agents.js's own `za_qual`,
// `za_jobCard`, `za_modelsTab`) — AI › Model picks at `/admin/ai/models` (`ai.read`; off by default behind
// `ai.modelAutoSuggest.enabled`, `ai.control`): for every Cost Book job (PR 312's own `JOB_CATALOG`), a suggested
// model with its reason. Free models (PR 580's own two rows in `MODEL_CATALOG`, `isFree: true`) sit in the exact
// same candidate pool as every paid model — never assumed good enough on sight, never excluded on sight either —
// and are scored the same way: the cheapest candidate that clears the job's own quality bar is suggested, so cost
// only ever falls when quality holds, never by lowering the bar.
//
// Honest about the one thing this cannot yet measure: **no live model-grading harness exists in this codebase**
// (no job dispatcher calls a real model and checks its answer — `cost-book.ts`'s own "actual vs estimate" says so
// of spend, and the same honesty applies to quality). Rather than carrying the demo's own fabricated, randomised
// scores into production (CLAUDE.md rule 1; `zs_simTag('Scores simulated')` in the demo), `scoreOf` reads a fixed,
// documented, structural rubric — the exact same small/mid/large tier judgement `cost-book.ts` already uses to
// pick each job's own recommended model (`SMALL_NOTE`/`MID_NOTE`/`LARGE_NOTE`), turned into one number per tier.
// It is a starting point, not a live measurement, and the quality column says so; once real per-run outcomes
// exist (a future PR, the same "actual" pattern as PR 313), they can replace it without changing this module's own
// shape. What "Re-test now" proves honestly today: every unblocked candidate was actually scored against *today's*
// catalogue, today's data-routing policy and the job's own quality bar, written once to `AiModelQualification`
// (append-only history in `AiSandboxRun`, `kind: 'model_qualification'`, the same table the skill sandbox and the
// curriculum exam already share) — so "not tested yet" never becomes a number this screen made up, and "tested 3
// days ago" is always a real date of a real, logged run.
//
// Data-class routing (PR 310/311, Blueprint A5.2 Locked): a free candidate is blocked for a job whose agent's own
// data class does not allow a free route (personal/business — `agentDataClass`, same policy `data-classes.ts`
// already enforces for the per-agent model pick), exactly the generalisation that file's own header comment
// already promises ("once PR 312 records a model as genuinely paid, routing it only ever gets less restrictive,
// never more" — the mirror image for a model recorded as genuinely *free*). A blocked candidate is never suggested
// and never counted as "the best" when the quality bar is computed.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { INSTALLATION } from '@extas/settings';
import type { AppResolver } from '../settings';
import { isAiAgentKey, type AiAgentKey } from './agents';
import {
  DEFAULT_QUALITY_BAR_PERCENT,
  JOB_CATALOG,
  MODEL_CATALOG,
  QUALITY_BAR_OPTIONS,
  isModelKey,
  isQualityBarPercent,
  ensureCostBookSeeded,
  estimateMicrosFor,
  jobOf,
  microsToUsdMinor,
  modelOf,
  monthlyMicrosFor,
  setJobSelectedModel,
  type JobCatalogEntry,
  type ModelCatalogEntry,
  type QualityBarPercent,
} from './cost-book';
import { agentDataClass } from './data-classes';
import { AiError, isAiError } from './errors';

// ---------------------------------------------------------------------------------------------------------------
// The quality rubric (pure math — no DB).
// ---------------------------------------------------------------------------------------------------------------

const TIER_RANK: Record<ModelCatalogEntry['tier'], number> = { small: 0, mid: 1, large: 2 };

/** A job's own required tier is the tier of its own recommended model — Claude's existing, already-reviewed
 * difficulty judgement (`cost-book.ts`'s own `SMALL_NOTE`/`MID_NOTE`/`LARGE_NOTE`), never a second, independent
 * guess at how hard the job is. */
export function requiredTierOf(job: JobCatalogEntry): ModelCatalogEntry['tier'] {
  return modelOf(job.recommendedModelKey).tier;
}

/** One candidate's score (0–100) for one specific job: how its own tier compares with what the job actually
 * needs, not a flat per-model number — the same structural rubric `cost-book.ts`'s own recommendation notes
 * already state in words. A model at or above the job's own required tier does the job well; one tier short
 * is noticeably weaker; two tiers short is not a real option. Deterministic and documented, not a live
 * measurement (see the header comment) — two candidates of the same tier, on the same job, always score the
 * same until a real per-run outcome exists. */
export function scoreOf(job: JobCatalogEntry, model: ModelCatalogEntry): number {
  const diff = TIER_RANK[model.tier] - TIER_RANK[requiredTierOf(job)];
  if (diff > 0) return 97; // hardcode-ok: a documented structural rubric, not the owner's own number
  if (diff === 0) return 95; // hardcode-ok: a documented structural rubric, not the owner's own number
  if (diff === -1) return 70; // hardcode-ok: a documented structural rubric, not the owner's own number
  return 45; // hardcode-ok: a documented structural rubric, not the owner's own number
}

/** True when a candidate may not even be considered for this job (Blueprint A5.2 Locked, generalised to any
 * genuinely free model, not only an OpenRouter pick — see the header comment). */
export function isBlockedForJob(job: JobCatalogEntry, model: ModelCatalogEntry): boolean {
  if (!model.isFree) return false;
  const dataClass = agentDataClass(job.agentKey ?? 'gyani');
  return dataClass !== 'publicDraft';
}

export interface ScoredCandidate {
  modelKey: string;
  providerName: string;
  displayName: string;
  isFree: boolean;
  tier: ModelCatalogEntry['tier'];
  score: number;
  blocked: boolean;
  /** `null` once blocked — a blocked candidate is never "tested", there is nothing to test. */
  passed: boolean | null;
  costPer100RunsUsdMinor: number;
  perMonthUsdMinor: number;
}

/** Every candidate model of the job's own kind, scored and marked blocked/passed — pure math, the bar already
 * resolved (DB-read, passed in). `null` quality values belong to `JobModelSuggestion` below (the "not tested yet"
 * honesty), not here: this function always returns the deterministic score, because the score itself needs no
 * measurement, only the owner's act of "testing" (persisting it) does. */
export function scoreCandidates(job: JobCatalogEntry, barPercent: QualityBarPercent): { candidates: ScoredCandidate[]; best: number; bar: number } {
  const pool = MODEL_CATALOG.filter((m) => m.kind === job.usage.kind);
  const unblocked = pool.filter((m) => !isBlockedForJob(job, m));
  const best = unblocked.reduce((max, m) => Math.max(max, scoreOf(job, m)), 0);
  const bar = Math.round((best * barPercent) / 100);
  const candidates: ScoredCandidate[] = pool.map((m) => {
    const blocked = isBlockedForJob(job, m);
    const score = scoreOf(job, m);
    const perRunMicros = estimateMicrosFor(job.usage, m);
    return {
      modelKey: m.modelKey,
      providerName: m.providerName,
      displayName: m.displayName,
      isFree: m.isFree ?? false,
      tier: m.tier,
      score,
      blocked,
      passed: blocked ? null : score >= bar,
      costPer100RunsUsdMinor: microsToUsdMinor(perRunMicros * 100),
      perMonthUsdMinor: microsToUsdMinor(monthlyMicrosFor(perRunMicros, job.typicalRunsPerDay)),
    };
  });
  return { candidates, best, bar };
}

/** The cheapest candidate that actually passed a real, persisted test (`testedModelKeys`) — `null` when nothing
 * has been tested yet, or nothing tested passes, so the screen can say exactly that rather than guess. */
export function pickSuggestion(candidates: readonly ScoredCandidate[], testedModelKeys: ReadonlySet<string>): ScoredCandidate | null {
  const passing = candidates.filter((c) => c.passed === true && testedModelKeys.has(c.modelKey));
  if (passing.length === 0) return null;
  return [...passing].sort((a, b) => a.costPer100RunsUsdMinor - b.costPer100RunsUsdMinor || b.score - a.score)[0]!;
}

// ---------------------------------------------------------------------------------------------------------------
// DB: the feature switch, the per-job quality bar, qualification runs, and the assembled screen.
// ---------------------------------------------------------------------------------------------------------------

export interface ModelQualDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value' | 'set'>;
  now?: () => Date;
}

/** `ai.modelAutoSuggest.enabled` — off on every installation until the owner turns it on (CLAUDE.md rule: every AI
 * feature in this PR ships off; this never touches the master switch `ai.enabled` or any per-agent switch). */
export async function isModelAutoSuggestEnabled(deps: Pick<ModelQualDeps, 'resolver'>, storeId: number): Promise<boolean> {
  return deps.resolver.value('ai.modelAutoSuggest.enabled', { storeId });
}

/** A no-op when it already is what was asked, so a double tap writes once (the same shape as `setMasterEnabled`). */
export async function setModelAutoSuggestEnabled(deps: Pick<ModelQualDeps, 'resolver'>, who: { actor: Actor; ctx?: RequestContext }, enabled: boolean, storeId: number): Promise<void> {
  const current = await deps.resolver.value('ai.modelAutoSuggest.enabled', { storeId });
  if (current === enabled) return;
  await deps.resolver.set('ai.modelAutoSuggest.enabled', enabled, INSTALLATION, {
    actorId: who.actor.staffUserId ?? null,
    reason: enabled ? 'AI › Model picks: auto-suggest turned on' : 'AI › Model picks: auto-suggest turned off',
  });
}

function barOf(raw: unknown): QualityBarPercent {
  const n = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).barPercent : null;
  return typeof n === 'number' && isQualityBarPercent(n) ? n : DEFAULT_QUALITY_BAR_PERCENT;
}

/** One job's own quality bar, 90/95/98% of the best unblocked candidate's score (Blueprint C2.4) — never a
 * free-typed number (CLAUDE.md rule 1), and refused for a job with no real quality difference to protect against
 * (`ai.control`, audited, a no-op on a double tap). */
export async function setJobQualityBar(deps: Pick<ModelQualDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, jobKey: string, barPercent: number): Promise<void> {
  const job = jobOf(jobKey);
  if (!isQualityBarPercent(barPercent)) throw new AiError(422, 'INVALID_BAR', ['barPercent']);
  await ensureCostBookSeeded(deps.db);
  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiJobType.findUnique({ where: { key: job.key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const before = barOf(row.qualityBar);
    if (before === barPercent) return;
    await tx.aiJobType.update({ where: { key: job.key }, data: { qualityBar: { barPercent } } });
    await audit(tx, who.actor, { action: 'ai.modelSuggest.bar', entityType: 'AiJobType', entityId: row.id, before: { barPercent: before }, after: { barPercent } }, who.ctx ?? {});
  });
}

export interface JobModelSuggestion {
  key: string;
  nameEn: string;
  nameBn: string;
  section: JobCatalogEntry['section'];
  agentKey: AiAgentKey;
  selectedModelKey: string;
  barPercent: QualityBarPercent;
  bar: number;
  best: number;
  candidates: ScoredCandidate[];
  testedAt: string | null;
  /** `null` while untested, or once tested, while nothing tested passes. */
  suggested: ScoredCandidate | null;
  /** True once the current pick already IS the cheapest tested-and-passing candidate. */
  isOptimal: boolean;
  /** Minor units of USD saved per month if `suggested` were accepted — 0 when there is nothing to suggest. */
  monthlySavingUsdMinor: number;
}

interface TestedState {
  testedModelKeys: Set<string>;
  testedAt: Date | null;
}

/** One job's own tested candidates and the most recent test date — straight off `AiModelQualification`, joined to
 * `AiModel` for the model key (the table itself keys by `modelId`). Honestly empty for a job no one has re-tested
 * since it was last seeded or changed. */
async function testedMapFor(db: Pick<PrismaClient, 'aiModelQualification' | 'aiModel'>, jobKeys: readonly string[]): Promise<Map<string, TestedState>> {
  const rows = await db.aiModelQualification.findMany({ where: { jobTypeKey: { in: [...jobKeys] } } });
  const models = await db.aiModel.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.modelId))] } } });
  const modelKeyById = new Map(models.map((m) => [m.id, m.modelKey]));
  const out = new Map<string, TestedState>(jobKeys.map((key) => [key, { testedModelKeys: new Set<string>(), testedAt: null }]));
  for (const r of rows) {
    const modelKey = modelKeyById.get(r.modelId);
    if (!modelKey) continue;
    const bucket = out.get(r.jobTypeKey)!;
    bucket.testedModelKeys.add(modelKey);
    if (!bucket.testedAt || r.testedAt > bucket.testedAt) bucket.testedAt = r.testedAt;
  }
  return out;
}

/** The assembled Model picks screen (`ai.read`): every job's own suggestion, honestly "not tested yet" until the
 * owner (or an `ai.control` agent) presses Re-test — never a number nobody actually computed and stored. */
export async function modelSuggestionsView(deps: ModelQualDeps, storeId: number): Promise<{ enabled: boolean; jobs: JobModelSuggestion[]; freeModelCount: number; betterPicksWaiting: number; monthlySavingUsdMinor: number }> {
  const enabled = await isModelAutoSuggestEnabled(deps, storeId);
  const freeModelCount = MODEL_CATALOG.filter((m) => m.isFree).length;
  if (!enabled) return { enabled, jobs: [], freeModelCount, betterPicksWaiting: 0, monthlySavingUsdMinor: 0 };

  await ensureCostBookSeeded(deps.db);
  const rows = await deps.db.aiJobType.findMany({ where: { archivedAt: null } });
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const tested = await testedMapFor(deps.db, JOB_CATALOG.map((j) => j.key));
  const models = await deps.db.aiModel.findMany({ where: { archivedAt: null } });
  const modelById = new Map(models.map((m) => [m.id, m]));

  let betterPicksWaiting = 0;
  let monthlySavingUsdMinor = 0;
  const jobs: JobModelSuggestion[] = JOB_CATALOG.map((j) => {
    const row = rowByKey.get(j.key);
    const barPercent = barOf(row?.qualityBar);
    const { candidates, best, bar } = scoreCandidates(j, barPercent);
    const t = tested.get(j.key)!;
    const suggested = pickSuggestion(candidates, t.testedModelKeys);
    const selectedModel = row?.selectedModelId ? modelById.get(row.selectedModelId) : null;
    const selectedModelKey = selectedModel ? selectedModel.modelKey : j.recommendedModelKey;
    const current = candidates.find((c) => c.modelKey === selectedModelKey) ?? candidates[0]!;
    const isOptimal = !suggested || suggested.modelKey === selectedModelKey;
    const saving = suggested && !isOptimal ? Math.max(0, Math.round(((current.costPer100RunsUsdMinor - suggested.costPer100RunsUsdMinor) * j.typicalRunsPerDay * 30) / 100)) : 0;
    if (!isOptimal) betterPicksWaiting += 1;
    monthlySavingUsdMinor += saving;
    return {
      key: j.key,
      nameEn: j.nameEn,
      nameBn: j.nameBn,
      section: j.section,
      agentKey: (isAiAgentKey(j.agentKey ?? '') ? j.agentKey : 'gyani') as AiAgentKey,
      selectedModelKey,
      barPercent,
      bar,
      best,
      candidates,
      testedAt: t.testedAt ? t.testedAt.toISOString() : null,
      suggested,
      isOptimal,
      monthlySavingUsdMinor: saving,
    };
  });
  return { enabled, jobs, freeModelCount, betterPicksWaiting, monthlySavingUsdMinor };
}

/**
 * "Re-test now" (`ai.control`): scores every unblocked candidate of one job against today's catalogue, routing
 * policy and quality bar, and persists each one — `AiModelQualification` (the current reading, upserted so a
 * second test overwrites the first rather than growing forever) and one append-only `AiSandboxRun` row (the
 * history, shared with the skill sandbox and the curriculum exam). Refused while the feature is off, so nothing
 * is ever computed or stored behind the owner's back.
 */
export async function runModelQualification(deps: Pick<ModelQualDeps, 'db' | 'resolver' | 'now'>, who: { actor: Actor; ctx?: RequestContext }, jobKey: string, storeId: number): Promise<void> {
  if (!(await isModelAutoSuggestEnabled(deps, storeId))) throw new AiError(422, 'FEATURE_OFF', []);
  const job = jobOf(jobKey);
  await ensureCostBookSeeded(deps.db);
  const now = deps.now?.() ?? new Date();
  const row = await deps.db.aiJobType.findUnique({ where: { key: job.key } });
  if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
  const barPercent = barOf(row.qualityBar);
  const { candidates, best, bar } = scoreCandidates(job, barPercent);
  const unblocked = candidates.filter((c) => !c.blocked);
  const models = await deps.db.aiModel.findMany({ where: { archivedAt: null, modelKey: { in: unblocked.map((c) => c.modelKey) } } });
  const modelIdByKey = new Map(models.map((m) => [m.modelKey, m.id]));

  for (const c of unblocked) {
    const modelId = modelIdByKey.get(c.modelKey);
    if (!modelId) continue;
    await deps.db.aiModelQualification.upsert({
      where: { jobTypeKey_modelId: { jobTypeKey: job.key, modelId } },
      create: { jobTypeKey: job.key, modelId, qualityScore: c.score, passed: Boolean(c.passed), costPer100RunsMicros: BigInt(c.costPer100RunsUsdMinor * 10_000), testedAt: now },
      update: { qualityScore: c.score, passed: Boolean(c.passed), costPer100RunsMicros: BigInt(c.costPer100RunsUsdMinor * 10_000), testedAt: now },
    });
  }
  await deps.db.aiSandboxRun.create({
    data: {
      kind: 'model_qualification',
      agentKey: job.agentKey,
      input: { jobKey: job.key, barPercent },
      result: { best, bar, candidates: unblocked.map((c) => ({ modelKey: c.modelKey, score: c.score, passed: c.passed, costPer100RunsUsdMinor: c.costPer100RunsUsdMinor })) },
      score: best > 0 ? bar / best : null,
      passed: unblocked.some((c) => c.passed === true),
    },
  });
  await audit(deps.db, who.actor, { action: 'ai.modelSuggest.retest', entityType: 'AiJobType', entityId: row.id, before: null, after: { testedCandidates: unblocked.length } }, who.ctx ?? {});
}

/** Re-tests every Cost Book job in turn (the "Re-test all" button) — one call per job, same guards and audit
 * trail as a single re-test, never a second, bulk-only code path to drift out of step with it. */
export async function runModelQualificationAll(deps: Pick<ModelQualDeps, 'db' | 'resolver' | 'now'>, who: { actor: Actor; ctx?: RequestContext }, storeId: number): Promise<{ tested: number }> {
  for (const j of JOB_CATALOG) await runModelQualification(deps, who, j.key, storeId);
  return { tested: JOB_CATALOG.length };
}

/** "Accept" (`ai.control`): applies one job's own suggested model — a thin wrapper over PR 312's own
 * `setJobSelectedModel`, so the Cost Book and this screen can never disagree about what "the owner's pick" means.
 * A no-op (and no error) when the job has nothing to suggest, or already uses it. */
export async function acceptSuggestion(deps: Pick<ModelQualDeps, 'db' | 'resolver' | 'now'>, who: { actor: Actor; ctx?: RequestContext }, jobKey: string, storeId: number): Promise<{ accepted: boolean }> {
  jobOf(jobKey); // throws AiError(404, 'UNKNOWN_JOB') for an unknown key, same as every other job-keyed write
  const view = await modelSuggestionsView(deps, storeId);
  const job = view.jobs.find((j) => j.key === jobKey);
  if (!job || !job.suggested || job.isOptimal) return { accepted: false };
  await setJobSelectedModel(deps, who, jobKey, job.suggested.modelKey);
  return { accepted: true };
}

/** "Accept all N suggestions" — every job whose suggestion is not already the current pick, one combined pass. */
export async function acceptAllSuggestions(deps: Pick<ModelQualDeps, 'db' | 'resolver' | 'now'>, who: { actor: Actor; ctx?: RequestContext }, storeId: number): Promise<{ accepted: number }> {
  const view = await modelSuggestionsView(deps, storeId);
  let accepted = 0;
  for (const j of view.jobs) {
    if (!j.suggested || j.isOptimal) continue;
    await setJobSelectedModel(deps, who, j.key, j.suggested.modelKey);
    accepted += 1;
  }
  return { accepted };
}

export { isAiError, isModelKey, QUALITY_BAR_OPTIONS };
