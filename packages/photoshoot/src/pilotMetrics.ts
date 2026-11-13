// S24 · PR 462 (Blueprint C7.19 "Headline metric: cost per APPROVED image, not per generated image, plus
// first-pass approval rate, retries per approved image, processing time, failure rate and review time. Scale
// only on the numbers.") — the pilot's own numbers, read off the real rows PR 451–459 already write
// (`PhotoshootJob`, `PhotoshootOutput`, the `CostEntry` ledger via `PhotoshootJob.actualMinor`), and snapshotted
// into `StudioPilotRun` — a model the S00 schema skeleton scaffolded for exactly this PR ("@stage S24 · PR 462 —
// pilot metrics: cost per approved image, first-pass rate, retries, review time."), so no migration.
//
// `aggregatePilotMetrics` is pure (no DB) — one period's jobs and their outputs in, every C7.19 number out — so it
// is unit-tested directly with plain arrays; `computePilotMetrics` only fetches that period's rows and calls it;
// `recordPilotRun` additionally snapshots the result as one `StudioPilotRun` row (append-only, C7.19's own "put the
// results in front of the owner"). Never an invented number (CN-018): every rate/average comes back `null`, not
// 0 or a guess, when its own denominator is empty — an owner with no pilot run yet sees "not enough data", never a
// fabricated 0%.
import { z } from 'zod';
import { allow, checkStoreId, logChange, parse, type PhotoshootDeps, type Who } from './context';
import { isPhotoshootProvider, type PhotoshootProviderKey } from './costLedger';
import type { JobStatus } from './jobs';
import type { OutputReviewStatus } from './outputs';

/** Jobs that ran to some real conclusion — never still in flight (`DRAFT`/`QUEUED`/`PROCESSING`) and never a plain
 * owner cancel (cancelling is not the pipeline failing). The denominator `failureRatePercent` is a share of. */
const TERMINAL_RUN_STATUSES: readonly JobStatus[] = ['FAILED', 'REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'PUBLISHED'];

/** The only fields the pure aggregator reads off a job row. */
export interface PilotJobRow {
  id: string;
  status: JobStatus;
  attempt: number;
  actualMinor: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/** The only fields the pure aggregator reads off an output row. */
export interface PilotOutputRow {
  jobId: string;
  reviewStatus: OutputReviewStatus;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface PilotMetrics {
  /** Every candidate a `PROCESSING` run produced in the period — C7.19's own "not per generated image" contrast. */
  generatedImages: number;
  /** Candidates the owner actually approved (`PhotoshootOutput.reviewStatus === 'APPROVED'`). */
  approvedImages: number;
  /** C7.19's headline: real spend on approved jobs ÷ approved images. `null` with no approved image yet — never 0. */
  costPerApprovedMinor: number | null;
  /** Of the approved jobs, the share that needed no retry at all (`attempt === 1`), as a whole percent. */
  firstPassApprovalRatePercent: number | null;
  /** Mean `attempt − 1` over the approved jobs — 0 means every approved image won on its first try. */
  retriesPerApprovedImage: number | null;
  /** Mean wall-clock time a job spent `PROCESSING` (`finishedAt − startedAt`), over every job with both set. */
  avgProcessingTimeMs: number | null;
  /** Share of jobs that ran to some conclusion (see `TERMINAL_RUN_STATUSES`) that ended `FAILED`, whole percent. */
  failureRatePercent: number | null;
  /** Mean time a `PENDING` output waited for the owner's decision (`reviewedAt − createdAt`). */
  avgReviewTimeMs: number | null;
  /** How many jobs and how many of them reached a real conclusion — context for reading the rates above. */
  jobCount: number;
  terminalJobCount: number;
}

const avg = (xs: readonly number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((100 * num) / den) : null);

/** C7.19's every named number, from one period's rows alone — pure, no DB. */
export function aggregatePilotMetrics(jobs: readonly PilotJobRow[], outputs: readonly PilotOutputRow[]): PilotMetrics {
  const approvedOutputs = outputs.filter((o) => o.reviewStatus === 'APPROVED');
  const approvedJobIds = new Set(approvedOutputs.map((o) => o.jobId));
  const approvedJobs = jobs.filter((j) => approvedJobIds.has(j.id));
  const approvedImages = approvedOutputs.length;

  // A job with no recorded spend (the free practice provider, or an old-style caller that named no provider at
  // all — costLedger.ts's own `recordGenerationCostEntry` writes nothing then) genuinely cost nothing, same
  // honest "0, not skipped" reading `estimateGenerationCostMinor` already gives the free provider.
  const approvedSpendMinor = approvedJobs.reduce((sum, j) => sum + (j.actualMinor ?? 0), 0);
  const costPerApprovedMinor = approvedImages > 0 ? Math.round(approvedSpendMinor / approvedImages) : null;

  const firstPassApprovalRatePercent = pct(approvedJobs.filter((j) => j.attempt === 1).length, approvedImages);
  const retriesPerApprovedImage = approvedImages > 0 ? Math.round((approvedJobs.reduce((sum, j) => sum + (j.attempt - 1), 0) / approvedImages) * 100) / 100 : null;

  const timed = jobs.filter((j): j is PilotJobRow & { startedAt: Date; finishedAt: Date } => !!j.startedAt && !!j.finishedAt);
  const avgProcessingTimeMs = avg(timed.map((j) => j.finishedAt.getTime() - j.startedAt.getTime()));

  const terminalJobs = jobs.filter((j) => TERMINAL_RUN_STATUSES.includes(j.status));
  const failureRatePercent = pct(terminalJobs.filter((j) => j.status === 'FAILED').length, terminalJobs.length);

  const reviewed = outputs.filter((o): o is PilotOutputRow & { reviewedAt: Date } => !!o.reviewedAt);
  const avgReviewTimeMs = avg(reviewed.map((o) => o.reviewedAt.getTime() - o.createdAt.getTime()));

  return {
    generatedImages: outputs.length,
    approvedImages,
    costPerApprovedMinor,
    firstPassApprovalRatePercent,
    retriesPerApprovedImage,
    avgProcessingTimeMs,
    failureRatePercent,
    avgReviewTimeMs,
    jobCount: jobs.length,
    terminalJobCount: terminalJobs.length,
  };
}

const pilotPeriodInput = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    provider: z.string().refine(isPhotoshootProvider, 'unknown provider').nullish(),
  })
  .strict()
  .refine((d) => d.periodStart < d.periodEnd, { message: 'periodStart must be before periodEnd', path: ['periodEnd'] });

export interface PilotPeriodInput {
  periodStart: Date;
  periodEnd: Date;
  provider?: PhotoshootProviderKey | null;
}

/** One period's `PilotMetrics` (`photoshoot.read`), optionally narrowed to one provider — C7.19's own "20–30
 * products through two providers" is read as two separate calls, one per provider, never averaged together. */
export async function computePilotMetrics(deps: Pick<PhotoshootDeps, 'db'>, who: Who, input: unknown): Promise<PilotMetrics> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const d = parse(pilotPeriodInput, input, 'pilot period');
  const jobs = await deps.db.photoshootJob.findMany({
    where: { storeId: who.storeId, createdAt: { gte: d.periodStart, lt: d.periodEnd }, ...(d.provider ? { provider: d.provider } : {}) },
    select: { id: true, status: true, attempt: true, actualMinor: true, startedAt: true, finishedAt: true },
  });
  if (!jobs.length) return aggregatePilotMetrics([], []);
  const outputs = await deps.db.photoshootOutput.findMany({
    where: { storeId: who.storeId, jobId: { in: jobs.map((j) => j.id) } },
    select: { jobId: true, reviewStatus: true, reviewedAt: true, createdAt: true },
  });
  return aggregatePilotMetrics(
    jobs.map((j) => ({ ...j, status: j.status as JobStatus })),
    outputs.map((o) => ({ ...o, reviewStatus: o.reviewStatus as OutputReviewStatus })),
  );
}

export interface PilotRunRow {
  id: string;
  storeId: number;
  periodStart: Date;
  periodEnd: Date;
  provider: string | null;
  generatedImages: number;
  approvedImages: number;
  costPerApprovedMinor: number | null;
  metrics: Omit<PilotMetrics, 'generatedImages' | 'approvedImages' | 'costPerApprovedMinor'>;
  createdAt: Date;
}

const toPilotRunRow = (r: { id: string; storeId: number; periodStart: Date; periodEnd: Date; provider: string | null; generatedImages: number; approvedImages: number; costPerApprovedMinor: number | null; metrics: unknown; createdAt: Date }): PilotRunRow => ({
  ...r,
  metrics: r.metrics as PilotRunRow['metrics'],
});

/**
 * Computes the period's `PilotMetrics` and snapshots it as one `StudioPilotRun` row (`photoshoot.write` — this
 * writes, `computePilotMetrics` on its own only reads) — C7.19's "put the results in front of the owner". The
 * three numbers the schema itself names a column for (`generatedImages`/`approvedImages`/`costPerApprovedMinor`)
 * get their own columns; the rest of C7.19's list (first-pass rate, retries, processing time, failure rate,
 * review time, the raw job/terminal counts) lives in the row's own `metrics` JSON. Append-only: running the same
 * period twice simply adds a second row, side by side — nothing is ever overwritten, so a re-run after fixing a
 * setting never hides what the owner already saw.
 */
export async function recordPilotRun(deps: PhotoshootDeps, who: Who, input: unknown): Promise<PilotRunRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(pilotPeriodInput, input, 'pilot period');
  const m = await computePilotMetrics(deps, who, input);
  const { generatedImages, approvedImages, costPerApprovedMinor, ...metrics } = m;
  const row = await deps.db.studioPilotRun.create({
    data: { storeId: who.storeId, periodStart: d.periodStart, periodEnd: d.periodEnd, provider: d.provider ?? null, generatedImages, approvedImages, costPerApprovedMinor, metrics },
  });
  await logChange(deps.db, who, { action: 'photoshoot.pilot.record', entityType: 'StudioPilotRun', entityId: row.id, before: null, after: { periodStart: d.periodStart, periodEnd: d.periodEnd, provider: d.provider ?? null, generatedImages, approvedImages, costPerApprovedMinor } });
  return toPilotRunRow(row);
}

/** Past pilot snapshots (`photoshoot.read`), newest first. */
export async function listPilotRuns(deps: Pick<PhotoshootDeps, 'db'>, who: Who): Promise<PilotRunRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.studioPilotRun.findMany({ where: { storeId: who.storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toPilotRunRow);
}
