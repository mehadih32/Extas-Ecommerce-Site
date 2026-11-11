// S15 · PR 316 (Blueprint C2.5 "the free-form cost calculator") — beside the per-job table, a calculator the owner
// drives in his own words: he describes a piece of work ("10 blog posts, about 1,200 words each, 3 images each",
// "20 reels this month", "1,000 support conversations", "product descriptions for 300 new SKUs") and gets a cost
// before committing. The admin form turns that into one or more structured lines (an existing Cost Book job, how
// many runs, and optionally how much bigger/smaller than the job's own usual run) — a composite question like the
// blog-posts-with-images example becomes two lines (the writing job and the image job), each priced and totalled
// together; a single-job question is simply a plan with one line.
//
// Reuses the Cost Book's own cost model (`jobOf`/`modelOf`/`estimateMicrosFor`/`alternativesFor`/`microsToUsdMinor`,
// PR 312) rather than a second one, so the calculator's number for a job can never disagree with that job's own row
// in the book. `calculateLine`/`calculatePlan` are pure (no DB, no Prisma) so they can be unit-tested directly and
// reused by any future caller — the DB-aware `planView`/`savePlan` below are the only functions that touch Prisma.
//
// C2.5's "reachable from Telegram" stays its own, later PR: no inbound Telegram command handling exists anywhere in
// this codebase yet (the Telegram adapter, PR 392, is outbound-only — it sends alerts, it never receives a message),
// and building that webhook/intent layer is a separate, reusable piece of infrastructure other AI 360 features would
// also need (PR 317's approval queue, for one), not something to grow inside this PR. `AiCostPlan.createdVia` is
// already shaped for it ('admin' here; a future PR adds 'telegram') so no column needs to change when it arrives.
//
// "Save as plan" (C2.5) persists the estimate onto `AiCostPlan` (already in the S00 schema, tagged for this PR) so a
// later PR can compare it against the real cost once a job actually runs (`actualMicros`, still unwritten — no job
// dispatcher exists yet, the same honest gap PR 306/307/308/309/312/313/315 already note of this whole stage).
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { Prisma, type PrismaClient } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import type { AppResolver } from '../settings';
import { pricerFor, type Pricer } from '../exchange-rate';
import { alternativesFor, estimateMicrosFor, isModelKey, jobOf, microsToUsdMinor, modelOf, type JobUsage } from './cost-book';
import { AiError } from './errors';

/** How many alternative models each line shows (Blueprint C2.5: "the same total on 2–3 alternative models side by
 * side" — narrower than the book's own row, which shows up to 4, because here it is read beside a single number,
 * not a whole table). */
const CALC_ALTERNATIVES = 3; // hardcode-ok: a display row count, not a charge, limit or threshold

export interface CalculatorLineInput {
  jobTypeKey: string;
  /** How many runs (e.g. 10 posts, 20 reels, 1,000 conversations). Must be a positive whole number. */
  quantity: number;
  /** How much bigger or smaller than the job's own usual run (e.g. a longer article) — default 1 (unchanged). */
  scale?: number;
  /** A model to price this line on; default (and null) is the job's own recommended model. */
  modelKey?: string | null;
}

export interface CalculatorAlternative {
  modelKey: string;
  displayName: string;
  totalUsdMinor: number;
  totalStoreMinor: number | null;
}

export interface CalculatorLineResult {
  jobTypeKey: string;
  nameEn: string;
  nameBn: string;
  modelKey: string;
  isRecommended: boolean;
  quantity: number;
  scale: number;
  perRunUsdMinor: number;
  totalUsdMinor: number;
  totalUsdMicros: bigint;
  totalStoreMinor: number | null;
  alternatives: CalculatorAlternative[];
}

export interface CalculatorPlan {
  lines: CalculatorLineResult[];
  totalUsdMinor: number;
  totalUsdMicros: bigint;
  totalStoreMinor: number | null;
  /** C2.5's "a one-line recommendation" — only for a single-line plan not already on its job's own recommended
   * model, where that recommendation is genuinely cheaper; a composite plan stays silent rather than guessing
   * which of its lines to flag. */
  recommendationNote: string | null;
}

/** The job's own usage, scaled (text: tokens; image: image count; video: seconds) — the same shape `estimateMicrosFor`
 * already prices, just bigger or smaller than the job's usual run. */
function scaledUsage(usage: JobUsage, scale: number): JobUsage {
  if (scale === 1) return usage;
  if (usage.kind === 'text') return { kind: 'text', inputTokens: Math.round(usage.inputTokens * scale), outputTokens: Math.round(usage.outputTokens * scale) };
  if (usage.kind === 'image') return { kind: 'image', images: Math.round(usage.images * scale) };
  return { kind: 'video', seconds: Math.round(usage.seconds * scale) };
}

/** One line's own cost, and its alternatives — pure, given the store's own pricer and the day priced on. Throws for
 * a caller bug (an unknown job, an unknown or wrong-kind model, a non-positive quantity or scale) — never for "no
 * exchange rate yet", which `calculatePlan`'s caller sees honestly as a null `totalStoreMinor`, same as every other
 * Cost Book figure before the owner has typed a rate. */
export function calculateLine(input: CalculatorLineInput, pricer: Pricer, day: string): CalculatorLineResult {
  if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) throw new AiError(422, 'INVALID_QUANTITY', ['quantity']);
  const scale = input.scale ?? 1;
  if (!(scale > 0) || !Number.isFinite(scale)) throw new AiError(422, 'INVALID_SCALE', ['scale']);
  const job = jobOf(input.jobTypeKey); // throws AiError 404 UNKNOWN_JOB
  const usage = scaledUsage(job.usage, scale);
  const modelKey = input.modelKey ?? job.recommendedModelKey;
  if (!isModelKey(modelKey)) throw new AiError(422, 'UNKNOWN_MODEL', ['modelKey']);
  const model = modelOf(modelKey);
  if (model.kind !== usage.kind) throw new AiError(422, 'WRONG_KIND', ['modelKey']);

  const perRunMicros = estimateMicrosFor(usage, model);
  const totalUsdMicros = BigInt(perRunMicros) * BigInt(input.quantity);
  const perRunUsdMinor = microsToUsdMinor(perRunMicros);
  const totalUsdMinor = microsToUsdMinor(perRunMicros * input.quantity);
  const priced = pricer(totalUsdMinor, 'USD', day);

  const alternatives: CalculatorAlternative[] = alternativesFor(usage, modelKey, CALC_ALTERNATIVES).map((m) => {
    const altTotalUsdMinor = microsToUsdMinor(estimateMicrosFor(usage, m) * input.quantity);
    const altPriced = pricer(altTotalUsdMinor, 'USD', day);
    return { modelKey: m.modelKey, displayName: m.displayName, totalUsdMinor: altTotalUsdMinor, totalStoreMinor: altPriced?.storeMinor ?? null };
  });

  return {
    jobTypeKey: job.key,
    nameEn: job.nameEn,
    nameBn: job.nameBn,
    modelKey,
    isRecommended: modelKey === job.recommendedModelKey,
    quantity: input.quantity,
    scale,
    perRunUsdMinor,
    totalUsdMinor,
    totalUsdMicros,
    totalStoreMinor: priced?.storeMinor ?? null,
    alternatives,
  };
}

/** The whole plan: every line priced and totalled, plus the one-line recommendation C2.5 asks for. */
export function calculatePlan(lines: readonly CalculatorLineInput[], pricer: Pricer, day: string): CalculatorPlan {
  if (lines.length === 0) throw new AiError(422, 'EMPTY_PLAN', ['lines']);
  const results = lines.map((l) => calculateLine(l, pricer, day));
  const totalUsdMinor = results.reduce((s, r) => s + r.totalUsdMinor, 0);
  const totalUsdMicros = results.reduce((s, r) => s + r.totalUsdMicros, 0n);
  const everyHasStore = results.every((r) => r.totalStoreMinor !== null);
  const totalStoreMinor = everyHasStore ? results.reduce((s, r) => s + (r.totalStoreMinor ?? 0), 0) : null;

  let recommendationNote: string | null = null;
  if (results.length === 1) {
    const r = results[0]!;
    if (!r.isRecommended) {
      const job = jobOf(r.jobTypeKey);
      const recModel = modelOf(job.recommendedModelKey);
      const usage = scaledUsage(job.usage, r.scale);
      const recTotalUsdMinor = microsToUsdMinor(estimateMicrosFor(usage, recModel) * r.quantity);
      if (recTotalUsdMinor < r.totalUsdMinor && r.totalUsdMinor > 0) {
        const pct = Math.round((1 - recTotalUsdMinor / r.totalUsdMinor) * 100);
        if (pct > 0) recommendationNote = `${job.nameEn} does not need ${modelOf(r.modelKey).displayName} — ${recModel.displayName} saves about ${pct}% (Claude's own recommended model for this job).`;
      }
    }
  }

  return { lines: results, totalUsdMinor, totalUsdMicros, totalStoreMinor, recommendationNote };
}

// ---------------------------------------------------------------------------------------------------------------
// DB-aware wrappers (resolve the store's own pricer/day; "Save as plan" persists onto AiCostPlan).
// ---------------------------------------------------------------------------------------------------------------

export interface CalculatorDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  now?: () => Date;
}

/** Computes a plan from the store's own currency/rate and today's day — the pure `calculatePlan` with its DB inputs
 * resolved. Never writes anything; `savePlan` below does that, only when the owner asks for it. */
export async function planView(deps: CalculatorDeps, storeId: number, lines: readonly CalculatorLineInput[]): Promise<CalculatorPlan> {
  const now = deps.now?.() ?? new Date();
  const timeZone = await deps.resolver.value('store.timeZone', { storeId });
  const pricer = await pricerFor(deps.db, deps.resolver, storeId);
  return calculatePlan(lines, pricer, ymdIn(now, timeZone));
}

export interface SavePlanInput {
  description: string;
  lines: readonly CalculatorLineInput[];
}

/** C2.5's "Save as plan": keeps the estimate (and, for a single-job plan, which job it was for) so a later report
 * can read it back without recomputing, and so a future job dispatcher can compare its own real cost against it. */
export async function savePlan(deps: CalculatorDeps, who: { actor: Actor; ctx?: RequestContext }, storeId: number, input: SavePlanInput): Promise<{ id: string; plan: CalculatorPlan }> {
  const description = input.description.trim();
  if (!description) throw new AiError(422, 'INVALID_INPUT', ['description']);
  const plan = await planView(deps, storeId, input.lines);
  const row = await deps.db.aiCostPlan.create({
    data: {
      storeId,
      description,
      jobTypeKey: plan.lines.length === 1 ? plan.lines[0]!.jobTypeKey : null,
      inputs: { lines: input.lines.map((l) => ({ jobTypeKey: l.jobTypeKey, quantity: l.quantity, scale: l.scale ?? 1, modelKey: l.modelKey ?? null })) } as Prisma.InputJsonValue,
      estimateMicros: plan.totalUsdMicros,
      alternatives: plan.lines.map((l) => ({ jobTypeKey: l.jobTypeKey, modelKey: l.modelKey, alternatives: l.alternatives })) as unknown as Prisma.InputJsonValue,
      savedAsPlan: true,
      createdVia: 'admin',
      createdById: who.actor.staffUserId,
    },
  });
  await audit(deps.db, who.actor, { action: 'ai.calculator.plan', entityType: 'AiCostPlan', entityId: row.id, before: null, after: { description, estimateMicros: plan.totalUsdMicros.toString() } }, who.ctx ?? {});
  return { id: row.id, plan };
}
