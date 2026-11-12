// S24 · PR 453 (Blueprint C7.5 step 9 "automatic quality scoring", C7.7 "best-of-2, not best-of-4") — the one
// place a generated candidate's score decides whether a human ever sees it. C7.5 step 9's own six dimensions:
// "garment shape integrity, print legibility, colour difference vs the original, hand/finger artefacts, edge
// quality, seam continuity. Anything below threshold never reaches a human."
//
// Convention this module fixes (no CV/scoring model is wired yet — exactly PR 450's honest scope for the provider
// adapters — a later PR fills in the real scorer): every one of the six fields is a plain 0 (worst) – 1 (best)
// number toward the concern its own name describes. `colourDifference` and `handFingerArtefacts` read, in the
// blueprint's own prose, as something a real measurer would report the other way round (a delta-E distance, a
// defect count) — the caller that eventually wires a real scorer inverts its raw measurement into this "how good"
// shape before ever calling `recordScoredOutputs`, the same way PR 450's adapters normalise a provider's own raw
// status strings before this package ever sees them. Keeping one direction for all six lets them combine with a
// plain, honest mean instead of a six-way sign convention nobody remembers correctly six months on.
//
// Best-of-2 (C7.7: "generate candidates across two providers, score them automatically, show the owner the best"):
// `recordScoredOutputs` takes every candidate a job's PROCESSING run produced (1 for a single-pass/baseline tier,
// up to 2 for best-of-2/premium — never enforced against the job's own `tier` here, since nothing yet calls a real
// provider to know how many it actually ran), scores each, and keeps exactly ONE — the highest-scoring — for the
// human review queue. The other candidate (when there are two) is recorded too, honestly, as `NOT_SELECTED`: it
// cost money and the owner should be able to see it was tried, but it was never shown. When even the best
// candidate is below the owner's own `studio.photoshoot.qualityThresholdPercent` cut-off (0, as it ships, never
// rejects anything — CN-018), NOTHING reaches the review queue — the job itself moves to `FAILED` instead of
// `REVIEW_REQUIRED`, which (PR 452) is exactly the state `retryFailedJob` already knows how to retry, with a fresh
// seed, on the owner's or the runner's own next attempt.
import { z } from 'zod';
import { allow, checkStoreId, logChange, nowOf, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { transitionJob, type JobRow, type JobStatus } from './jobs';

/** C7.5 step 9's own six dimensions, each 0 (worst) – 1 (best) toward the concern named — see the file header for
 * the direction convention `colourDifference`/`handFingerArtefacts` take. */
export const QUALITY_METRIC_KEYS = ['garmentShapeIntegrity', 'printLegibility', 'colourDifference', 'handFingerArtefacts', 'edgeQuality', 'seamContinuity'] as const;
export type QualityMetricKey = (typeof QUALITY_METRIC_KEYS)[number];
export type QualityScores = Record<QualityMetricKey, number>;

const unitScore = z.number().min(0).max(1);
export const qualityScoresSchema = z
  .object({
    garmentShapeIntegrity: unitScore,
    printLegibility: unitScore,
    colourDifference: unitScore,
    handFingerArtefacts: unitScore,
    edgeQuality: unitScore,
    seamContinuity: unitScore,
  })
  .strict();

/** The plain, unweighted mean of the six dimensions, as a whole percent (0–100, rounded once) — never a float
 * compared against the owner's own whole-percent threshold setting. */
export function combinedScorePercent(scores: QualityScores): number {
  const sum = QUALITY_METRIC_KEYS.reduce((acc, k) => acc + scores[k], 0);
  return Math.round((sum / QUALITY_METRIC_KEYS.length) * 100);
}

/** C7.5 step 9: "anything below threshold never reaches a human." `thresholdPercent` 0 (as it ships) always passes. */
export function passesQualityThreshold(scores: QualityScores, thresholdPercent: number): boolean {
  return combinedScorePercent(scores) >= thresholdPercent;
}

export interface ScoredCandidate {
  index: number;
  scores: QualityScores;
}

/** The single best-scoring candidate — C7.7 "show the owner the best." A tie keeps the lowest index, so the
 * choice is deterministic and reproducible from the same scores every time. Throws on an empty list: there is
 * nothing to pick a best of. */
export function pickBestCandidate<T extends ScoredCandidate>(candidates: readonly T[]): T {
  if (!candidates.length) throw new PhotoshootError('INVALID_INPUT', 'cannot pick the best of zero candidates', ['candidates']);
  return candidates.reduce((best, c) => (combinedScorePercent(c.scores) > combinedScorePercent(best.scores) ? c : best));
}

/** `PhotoshootOutput.reviewStatus`'s fixed vocabulary: `PENDING` (the best-of-2 winner, awaiting the owner,
 * C7.6's mandatory review queue) · `NOT_SELECTED` (a candidate that scored fine but lost the comparison, never
 * shown — recorded only so the owner can see it was tried) · `AUTO_REJECTED` (even the best candidate was below
 * the quality cut-off — the whole job fails instead, C7.5 step 9) · `APPROVED`/`REJECTED` (the owner's own
 * decision on a `PENDING` row — PR 458's review UI, not written by anything in this file). */
export const OUTPUT_REVIEW_STATUSES = ['PENDING', 'NOT_SELECTED', 'AUTO_REJECTED', 'APPROVED', 'REJECTED'] as const;
export type OutputReviewStatus = (typeof OUTPUT_REVIEW_STATUSES)[number];

export interface OutputRow {
  id: string;
  storeId: number;
  jobId: string;
  assetId: string;
  candidateIndex: number;
  scores: QualityScores;
  passedThreshold: boolean;
  reviewStatus: OutputReviewStatus;
  rejectReason: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

type OutputRecord = {
  id: string;
  storeId: number;
  jobId: string;
  assetId: string;
  candidateIndex: number;
  scores: unknown;
  passedThreshold: boolean;
  reviewStatus: string;
  rejectReason: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
};

const toOutputRow = (r: OutputRecord): OutputRow => ({ ...r, scores: r.scores as QualityScores, reviewStatus: r.reviewStatus as OutputReviewStatus });

const recordScoredOutputsInput = z
  .object({
    candidates: z
      .array(
        z
          .object({
            assetId: z.string().uuid(),
            scores: qualityScoresSchema,
          })
          .strict(),
      )
      .min(1)
      .max(2), // "Best-of-2, not best-of-4" (C7.7) — this PR's own ceiling, not a store setting
  })
  .strict();

export interface RecordScoredOutputsResult {
  outputs: OutputRow[];
  winnerIndex: number;
  job: JobRow;
}

/**
 * The runner's own report of what a provider generated for one `PROCESSING` job (C7.5 step 9, C7.7). Scopes by
 * store, requires the job to be `PROCESSING` right now (the same precondition that makes a second, duplicate
 * report harmless: the job has already moved on by the time it would arrive, so it fails this check rather than
 * recording a second batch of outputs) and that every candidate's `assetId` is this store's own AI-generated
 * image (never an original — C7.6's immutability guarantee stays one-way). Reads the store's own
 * `studio.photoshoot.qualityThresholdPercent` (0 = never rejects, as it ships), scores every candidate, and keeps
 * exactly one for review — see the file header for the full decision. The one candidate chosen for review becomes
 * `PENDING`; every other recorded candidate becomes `NOT_SELECTED`. Moves the job itself to `REVIEW_REQUIRED` when
 * the winner clears the threshold, or to `FAILED` (eligible for PR 452's `retryFailedJob`, a fresh seed and all)
 * when it does not.
 */
export async function recordScoredOutputs(deps: PhotoshootDeps, who: Who, jobId: string, input: unknown): Promise<RecordScoredOutputsResult> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordScoredOutputsInput, input, 'scored outputs');

  const job = await deps.db.photoshootJob.findFirst({ where: { id: jobId, storeId: who.storeId } });
  if (!job) throw new PhotoshootError('NOT_FOUND', 'no such photoshoot job in this store');
  if (job.status !== 'PROCESSING') throw new PhotoshootError('INVALID_INPUT', `cannot record outputs for a photoshoot job that is ${job.status}, not PROCESSING`, ['status']);

  const assetIds = d.candidates.map((c) => c.assetId);
  const assets = await deps.db.mediaAsset.findMany({ where: { id: { in: assetIds }, storeId: who.storeId } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const assetId of assetIds) {
    const a = byId.get(assetId);
    if (!a) throw new PhotoshootError('SOURCE_INVALID', 'a candidate asset was not found in this store', ['candidates', 'assetId']);
    if (!a.isAiGenerated) throw new PhotoshootError('SOURCE_INVALID', 'a candidate output must itself be an AI-generated image, never an original', ['candidates', 'assetId']);
  }

  const thresholdPercent = deps.settings ? await deps.settings.value('studio.photoshoot.qualityThresholdPercent', { storeId: who.storeId }) : 0;
  const scored: ScoredCandidate[] = d.candidates.map((c, index) => ({ index, scores: c.scores }));
  const winner = pickBestCandidate(scored);
  const winnerPassed = passesQualityThreshold(winner.scores, thresholdPercent);

  const created = await deps.db.$transaction(
    d.candidates.map((c, index) =>
      deps.db.photoshootOutput.create({
        data: {
          storeId: who.storeId,
          jobId: job.id,
          assetId: c.assetId,
          candidateIndex: index,
          scores: c.scores,
          passedThreshold: passesQualityThreshold(c.scores, thresholdPercent),
          reviewStatus: index === winner.index ? (winnerPassed ? 'PENDING' : 'AUTO_REJECTED') : 'NOT_SELECTED',
        },
      }),
    ),
  );
  await logChange(deps.db, who, {
    action: 'photoshoot.output.record',
    entityType: 'PhotoshootJob',
    entityId: job.id,
    before: null,
    after: { candidates: d.candidates.length, winnerIndex: winner.index, winnerScorePercent: combinedScorePercent(winner.scores), thresholdPercent, winnerPassed },
  });

  const updatedJob = winnerPassed
    ? await transitionJob(deps, who, job.id, 'REVIEW_REQUIRED')
    : await transitionJob(deps, who, job.id, 'FAILED', { errorMessage: `every candidate was below the quality cut-off (best scored ${combinedScorePercent(winner.scores)}%, the cut-off is ${thresholdPercent}%)` });

  return { outputs: created.map(toOutputRow), winnerIndex: winner.index, job: updatedJob };
}

/** A job's own outputs (`photoshoot.read`), in candidate order. */
export async function getOutputsForJob(deps: Pick<PhotoshootDeps, 'db'>, who: Who, jobId: string): Promise<OutputRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.photoshootOutput.findMany({ where: { jobId, storeId: who.storeId }, orderBy: { candidateIndex: 'asc' } });
  return rows.map(toOutputRow);
}

// --- PR 458 (Blueprint C7.5 step 10, C7.16 "Review and approval UI with side-by-side and reasons") ---------------
//
// Everything above this point is PR 453's own automatic scoring; nothing in it ever writes `APPROVED`/`REJECTED`.
// This is the one place the owner's own review decision — on the single `PENDING` output a job carries once it
// reaches `REVIEW_REQUIRED` — is ever recorded, growing this file in place rather than duplicating it (the same
// pattern PR 452 used on `jobs.ts`, PR 456 on `finishing.ts`).

const toJobRowLocal = (r: { status: string } & Omit<JobRow, 'status'>): JobRow => ({ ...r, status: r.status as JobStatus });

export const decideOutputReviewInput = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((d) => d.decision !== 'reject' || Boolean(d.reason), { message: 'a rejection needs a reason', path: ['reason'] });

export interface DecideReviewResult {
  output: OutputRow;
  job: JobRow;
}

/**
 * The owner's own decision on a `PENDING` output (C7.5 step 10: "the owner sees generated vs original side by
 * side and approves, rejects..."; C7.16: "with reasons on rejection"). Requires `photoshoot.approve` — the same
 * permission `transitionJob` already requires for the job's own `APPROVED`/`REJECTED` edges, called right after
 * so the output row and its job always move together, never one without the other. Refuses a decision on
 * anything that is not `PENDING`: `NOT_SELECTED`/`AUTO_REJECTED` were never shown to a human to decide on, and an
 * already-`APPROVED`/`REJECTED` row has already been decided — never a silent overwrite of a past decision. A
 * rejection with no reason is refused outright by the input schema itself, before any row is touched.
 *
 * Deliberately NOT here: "regenerate" (C7.16's separate third choice at review time) — `JOB_TRANSITIONS` has no
 * `REVIEW_REQUIRED -> QUEUED` edge yet, only the existing `FAILED -> QUEUED` retry (PR 452); wiring a genuine
 * regenerate-from-review action is a later PR's own honest scope, the same shape every prior S24 piece left for
 * its own unbuilt neighbour.
 */
export async function decideOutputReview(deps: PhotoshootDeps, who: Who, outputId: string, input: unknown): Promise<DecideReviewResult> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.approve');
  const d = parse(decideOutputReviewInput, input, 'review decision');

  const output = await deps.db.photoshootOutput.findFirst({ where: { id: outputId, storeId: who.storeId } });
  if (!output) throw new PhotoshootError('NOT_FOUND', 'no such photoshoot output in this store');
  if (output.reviewStatus !== 'PENDING') throw new PhotoshootError('INVALID_INPUT', `this output is ${output.reviewStatus}, not awaiting review`, ['reviewStatus']);

  const nextStatus: OutputReviewStatus = d.decision === 'approve' ? 'APPROVED' : 'REJECTED';
  const updated = await deps.db.photoshootOutput.update({
    where: { id: output.id },
    data: {
      reviewStatus: nextStatus,
      rejectReason: d.decision === 'reject' ? (d.reason ?? null) : null,
      reviewedById: who.actor.staffUserId ?? null,
      reviewedAt: nowOf(deps),
    },
  });
  await logChange(deps.db, who, {
    action: 'photoshoot.output.review',
    entityType: 'PhotoshootOutput',
    entityId: output.id,
    before: { reviewStatus: output.reviewStatus },
    after: { reviewStatus: nextStatus, rejectReason: updated.rejectReason },
  });

  const job = await transitionJob(deps, who, output.jobId, nextStatus);
  return { output: toOutputRow(updated), job };
}

export interface ReviewQueueRow {
  job: JobRow;
  output: OutputRow;
}

/**
 * The review queue (`photoshoot.read`): every job waiting on a human (`REVIEW_REQUIRED`) with the one `PENDING`
 * output it carries, oldest-waiting first. `recordScoredOutputs` guarantees a job reaches `REVIEW_REQUIRED` with
 * exactly one `PENDING` output, so this never needs to choose among several; a job missing its output row (should
 * never happen) is simply left out rather than shown broken.
 */
export async function listReviewQueue(deps: Pick<PhotoshootDeps, 'db'>, who: Who): Promise<ReviewQueueRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const jobs = await deps.db.photoshootJob.findMany({ where: { storeId: who.storeId, status: 'REVIEW_REQUIRED' }, orderBy: { createdAt: 'asc' } });
  if (!jobs.length) return [];
  const outputs = await deps.db.photoshootOutput.findMany({ where: { storeId: who.storeId, jobId: { in: jobs.map((j) => j.id) }, reviewStatus: 'PENDING' } });
  const outputByJob = new Map(outputs.map((o) => [o.jobId, o]));
  const rows: ReviewQueueRow[] = [];
  for (const j of jobs) {
    const o = outputByJob.get(j.id);
    if (o) rows.push({ job: toJobRowLocal(j), output: toOutputRow(o) });
  }
  return rows;
}
