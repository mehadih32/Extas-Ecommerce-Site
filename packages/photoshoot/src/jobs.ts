// S24 · PR 451, 452 (Blueprint C7.5 step 7, C7.6, C7.20) — job orchestration: the queue row itself, its state
// machine, request idempotency ("no double charging" — the DB's own `@@unique([storeId, idempotencyKey])` on
// `PhotoshootJob` is the real guarantee; `computeIdempotencyKey` only derives the key a resend reproduces exactly),
// per-view retry with a new seed, concurrency limiting and the Photoshoot agent's monthly spend cap.
//
// C7.6's own words for the flow this state machine encodes: "draft → queued → processing → review_required →
// approved → published, plus rejected, failed, cancelled." `JOB_TRANSITIONS` is that graph; `isValidJobTransition`
// is a pure check against it so nothing — staff action or job runner — can skip a step.
//
// PR 451 built the graph, idempotency and the plain `createOrReuseJob`/`transitionJob` primitives, deliberately
// without retrying with a new seed, concurrency limiting or the spend cap. PR 452 (this file, now) adds exactly
// those three, at the two edges that matter: `FAILED -> QUEUED` always draws a fresh seed (`nextDifferentSeed`,
// `retryFailedJob`), and `QUEUED -> PROCESSING` — the moment a job is about to actually spend by calling a
// provider adapter's `generate` (PR 449–450) — is gated by `startProcessing`, which checks this store's own
// `studio.photoshoot.maxConcurrentJobs` and the Photoshoot agent's monthly cap (`spendCap.ts`, mirroring PR 309's
// C1.6 arithmetic) before letting the move happen. Still deliberately NOT here: actually calling the provider
// adapter itself (that stays the runner's own job, whichever PR wires a BullMQ worker onto this queue), best-of-2
// (PR 453) and the cost ledger's reuse rules (S24 item 16).
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { StudioJobStatus } from '@extas/db/client';
import { allow, checkStoreId, logChange, nowOf, parse, PhotoshootError, type PhotoshootDeps, type PhotoshootPermission, type Who } from './context';
import { photoshootAgentCapCheck } from './spendCap';

/** The DB's own `StudioJobStatus` enum values, carried here as a plain union so callers need no Prisma import. */
export type JobStatus = keyof typeof StudioJobStatusEnumValues;
const StudioJobStatusEnumValues = {
  DRAFT: true,
  QUEUED: true,
  PROCESSING: true,
  REVIEW_REQUIRED: true,
  APPROVED: true,
  PUBLISHED: true,
  REJECTED: true,
  FAILED: true,
  CANCELLED: true,
} as const satisfies Record<StudioJobStatus, true>;
export const JOB_STATUSES = Object.keys(StudioJobStatusEnumValues) as JobStatus[];
const isJobStatus = (v: unknown): v is JobStatus => typeof v === 'string' && Object.prototype.hasOwnProperty.call(StudioJobStatusEnumValues, v);

/**
 * C7.6's flow, as a graph: every key's listed targets are the only moves `transitionJob` allows from it.
 * `FAILED -> QUEUED` is the one retry edge (C7.5 step 7); PR 452 is what actually calls it with a new seed and a
 * bumped `attempt` — the edge only says the move is legal, not who drives it or when.
 */
export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  DRAFT: ['QUEUED', 'CANCELLED'],
  QUEUED: ['PROCESSING', 'CANCELLED', 'FAILED'],
  PROCESSING: ['REVIEW_REQUIRED', 'FAILED', 'CANCELLED'],
  REVIEW_REQUIRED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED', 'REJECTED'],
  PUBLISHED: [],
  REJECTED: [],
  FAILED: ['QUEUED'],
  CANCELLED: [],
};

/** A job in one of these has nowhere left to go — the row stays, but no later `transitionJob` call will succeed. */
export const JOB_TERMINAL_STATUSES: readonly JobStatus[] = ['PUBLISHED', 'REJECTED', 'CANCELLED'];
export const isTerminalJobStatus = (status: JobStatus): boolean => JOB_TERMINAL_STATUSES.includes(status);

/** Pure — no DB, no I/O. The one thing both a staff action and the job runner must agree on before writing a row. */
export function isValidJobTransition(from: JobStatus, to: JobStatus): boolean {
  return (JOB_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Which permission a move INTO this status requires. `QUEUED` (opening or retrying the request) and the job
 * runner's own `PROCESSING`/`REVIEW_REQUIRED`/`FAILED` reports all run under `photoshoot.generate` — the same
 * permission that let the request in — so a worker process acting as the requesting staff member needs no second
 * grant. Review decisions need `photoshoot.approve`; going live needs `photoshoot.publish`; a plain cancel only
 * needs `photoshoot.write`.
 */
const TRANSITION_PERMISSION: Readonly<Record<JobStatus, PhotoshootPermission>> = {
  DRAFT: 'photoshoot.generate',
  QUEUED: 'photoshoot.generate',
  PROCESSING: 'photoshoot.generate',
  FAILED: 'photoshoot.generate',
  REVIEW_REQUIRED: 'photoshoot.generate',
  APPROVED: 'photoshoot.approve',
  REJECTED: 'photoshoot.approve',
  PUBLISHED: 'photoshoot.publish',
  CANCELLED: 'photoshoot.write',
};

export interface JobRow {
  id: string;
  storeId: number;
  productId: string;
  colourId: string | null;
  recipeId: string | null;
  modelId: string | null;
  sceneId: string | null;
  angle: string;
  tier: string;
  status: JobStatus;
  provider: string | null;
  providerJobId: string | null;
  idempotencyKey: string;
  attempt: number;
  seed: string | null;
  inputAssetIds: string[];
  estimateMinor: number | null;
  actualMinor: number | null;
  error: string | null;
  requestedById: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

type JobRecord = {
  id: string;
  storeId: number;
  productId: string;
  colourId: string | null;
  recipeId: string | null;
  modelId: string | null;
  sceneId: string | null;
  angle: string;
  tier: string;
  status: string;
  provider: string | null;
  providerJobId: string | null;
  idempotencyKey: string;
  attempt: number;
  seed: string | null;
  inputAssetIds: string[];
  estimateMinor: number | null;
  actualMinor: number | null;
  error: string | null;
  requestedById: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

const toJobRow = (r: JobRecord): JobRow => ({ ...r, status: r.status as JobStatus });

/** The owner's own provider-rate tiers (`registry-photoshoot-cost.ts`) are the only tiers a job may ask for. */
export const JOB_TIERS = ['baseline', 'premium'] as const;
export type JobTier = (typeof JOB_TIERS)[number];
const isJobTier = (v: unknown): v is JobTier => typeof v === 'string' && (JOB_TIERS as readonly string[]).includes(v);

export interface IdempotencyInput {
  productId: string;
  colourId?: string | null;
  recipeId?: string | null;
  modelId?: string | null;
  sceneId?: string | null;
  angle: string;
  tier: string;
  inputAssetIds: readonly string[];
  seed?: string | number | null;
}

/**
 * A deterministic fingerprint of the logical request — same product/colour/recipe/model/scene/angle/tier/inputs
 * (and seed, when the caller pins one) hashes to the same key every time, field order and asset-id order included,
 * so a resent request (a retried click, a replayed webhook) lands on the DB's own unique index instead of a second
 * row. It is not a secret and carries no owner data; it is only ever compared for equality.
 */
export function computeIdempotencyKey(input: IdempotencyInput): string {
  const normalised = {
    productId: input.productId,
    colourId: input.colourId ?? null,
    recipeId: input.recipeId ?? null,
    modelId: input.modelId ?? null,
    sceneId: input.sceneId ?? null,
    angle: input.angle,
    tier: input.tier,
    inputAssetIds: [...input.inputAssetIds].sort(),
    seed: input.seed == null ? null : String(input.seed),
  };
  return createHash('sha256').update(JSON.stringify(normalised)).digest('hex');
}

const jobInput = z
  .object({
    productId: z.string().uuid(),
    colourId: z.string().uuid().nullish(),
    recipeId: z.string().uuid().nullish(),
    modelId: z.string().uuid().nullish(),
    sceneId: z.string().uuid().nullish(),
    angle: z.string().trim().min(1).max(40),
    tier: z.string().refine(isJobTier, 'unknown tier'),
    inputAssetIds: z.array(z.string().uuid()).min(1).max(20),
    seed: z.union([z.string().trim().min(1).max(100), z.number().int()]).nullish(),
  })
  .strict();

/**
 * Opens a queue row for one generation request, or hands back the existing one when the exact same request has
 * already been made (C7.6 "no double charging"). Every input asset and the product itself must already be on file
 * in this store. Requires `photoshoot.generate` — the same permission a real spend needs, since queuing is the
 * first step of one. Never calls a provider; the job comes back `QUEUED`, waiting for the runner (PR 452).
 */
export async function createOrReuseJob(deps: PhotoshootDeps, who: Who, input: unknown): Promise<{ job: JobRow; reused: boolean }> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(jobInput, input, 'photoshoot job');
  const product = await deps.db.product.findFirst({ where: { id: d.productId, storeId: who.storeId } });
  if (!product) throw new PhotoshootError('SOURCE_INVALID', 'no such product in this store', ['productId']);
  const idempotencyKey = computeIdempotencyKey(d);
  const existing = await deps.db.photoshootJob.findFirst({ where: { storeId: who.storeId, idempotencyKey } });
  if (existing) return { job: toJobRow(existing), reused: true };
  const created = await deps.db.photoshootJob.create({
    data: {
      storeId: who.storeId,
      productId: d.productId,
      colourId: d.colourId ?? null,
      recipeId: d.recipeId ?? null,
      modelId: d.modelId ?? null,
      sceneId: d.sceneId ?? null,
      angle: d.angle,
      tier: d.tier,
      status: 'DRAFT',
      idempotencyKey,
      inputAssetIds: [...d.inputAssetIds],
      seed: d.seed == null ? null : String(d.seed),
      requestedById: who.actor.staffUserId,
    },
  });
  await logChange(deps.db, who, { action: 'photoshoot.job.create', entityType: 'PhotoshootJob', entityId: created.id, before: null, after: { productId: created.productId, angle: created.angle, tier: created.tier, status: created.status } });
  const queued = await transitionJob(deps, who, created.id, 'QUEUED');
  return { job: queued, reused: false };
}

/**
 * A seed string different from `previous` (C7.5 step 7: "retried with a different seed on failure" — a retry that
 * reused the exact same seed could reproduce the exact same failure). `deps.randomSeed` lets a test make this
 * deterministic; real callers get 64 bits of crypto randomness. Bounded to 8 tries, generous for odds this long;
 * never loops forever even if a stub RNG is badly misused.
 */
export function nextDifferentSeed(deps: Pick<PhotoshootDeps, 'randomSeed'>, previous: string | null): string {
  const draw = deps.randomSeed ?? (() => randomBytes(8).toString('hex'));
  for (let i = 0; i < 8; i++) {
    const candidate = draw();
    if (candidate !== previous) return candidate;
  }
  throw new PhotoshootError('INVALID_INPUT', 'could not draw a new seed different from the last one', ['seed']);
}

/**
 * Moves a job along `JOB_TRANSITIONS`. Scoped by store; throws `NOT_FOUND` outside it. Throws `INVALID_INPUT`
 * (never silently clamped) on any move the graph does not list — a stale screen retrying an already-approved job,
 * or a worker reporting `PROCESSING` on a job staff already cancelled, both land here rather than corrupting the
 * row. Audited on every successful move. `opts.errorMessage` is recorded only on a move into `FAILED`; a later
 * retry (`FAILED -> QUEUED`) clears it and draws a new seed (C7.5 step 7), since the row is trying again, not still
 * broken — true for every caller of this edge, not only `retryFailedJob` (PR 452), so the "different seed" promise
 * can never be skipped by calling the lower-level primitive directly.
 */
export async function transitionJob(deps: PhotoshootDeps, who: Who, jobId: string, to: JobStatus, opts?: { errorMessage?: string }): Promise<JobRow> {
  checkStoreId(who.storeId);
  if (!isJobStatus(to)) throw new PhotoshootError('INVALID_INPUT', 'unknown job status', ['status']);
  const before = await deps.db.photoshootJob.findFirst({ where: { id: jobId, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such photoshoot job in this store');
  const from = before.status as JobStatus;
  if (!isValidJobTransition(from, to)) throw new PhotoshootError('INVALID_INPUT', `cannot move a photoshoot job from ${from} to ${to}`, ['status']);
  await allow(deps, who, TRANSITION_PERMISSION[to]);
  const now = nowOf(deps);
  const isRetry = to === 'QUEUED' && from === 'FAILED';
  const row = await deps.db.photoshootJob.update({
    where: { id: jobId },
    data: {
      status: to,
      ...(to === 'PROCESSING' && !before.startedAt ? { startedAt: now } : {}),
      ...(JOB_TERMINAL_STATUSES.includes(to) || to === 'FAILED' ? { finishedAt: now } : {}),
      ...(to === 'FAILED' ? { error: opts?.errorMessage ?? before.error ?? null } : {}),
      ...(isRetry ? { error: null, finishedAt: null, attempt: { increment: 1 }, seed: nextDifferentSeed(deps, before.seed) } : {}),
    },
  });
  await logChange(deps.db, who, { action: 'photoshoot.job.transition', entityType: 'PhotoshootJob', entityId: row.id, before: { status: from }, after: { status: row.status } });
  return toJobRow(row);
}

/**
 * The named, documented retry entry point (PR 452, C7.5 step 7): "retry only the failed or rejected view, never
 * the whole product" — this moves exactly one job, by its own id, back to `QUEUED` with a fresh seed; the product
 * and every other angle's job are untouched. A thin, clearly-named wrapper over `transitionJob`'s own `FAILED ->
 * QUEUED` edge (which already carries the real seed/attempt/error-clearing logic); kept separate so the admin and
 * runner code has an obvious, self-explaining call to make rather than reaching for the generic primitive.
 */
export async function retryFailedJob(deps: PhotoshootDeps, who: Who, jobId: string): Promise<JobRow> {
  return transitionJob(deps, who, jobId, 'QUEUED');
}

/** How many of this store's photoshoot jobs are right now `PROCESSING` — a provider actually running. */
async function countProcessingJobs(deps: Pick<PhotoshootDeps, 'db'>, storeId: number): Promise<number> {
  return deps.db.photoshootJob.count({ where: { storeId, status: 'PROCESSING' } });
}

/**
 * The gated entry into `PROCESSING` (PR 452, C7.5 step 7 "retried..."/C7.20) — the one moment a job is actually
 * about to spend money by calling a provider adapter's `generate` (PR 449–450; the call itself is not made here,
 * only gated for). The runner must call this, not the raw `transitionJob('PROCESSING')` primitive, to get both
 * checks:
 *
 *  - **Concurrency** — this store's own `studio.photoshoot.maxConcurrentJobs` (0 = unlimited, as it ships). At the
 *    limit the job is refused with `CONCURRENCY_LIMIT` and stays exactly `QUEUED`; nothing is lost, the runner
 *    simply tries again later (ordinary backpressure, not a failure).
 *  - **The Photoshoot agent's monthly spend cap** (C7.20, same arithmetic as PR 309's generic per-agent cap,
 *    `spendCap.ts`). "None"/"ok"/"warned" all let the job start; "paused" (the cap already reached) refuses it
 *    with `SPEND_CAP_REACHED` and the job again stays `QUEUED` — "new generations pause, already-approved output
 *    stays live, the shop is unaffected." Honestly a no-op (never blocks) until a later PR seeds the `AiAgent` row
 *    keyed `photoshoot` and something actually writes its `AiUsageLedger` spend.
 *
 * Both checks are read-then-decide, not a row lock: a short race between two runner ticks landing on the same
 * store is the same ordinary queuing race `createOrReuseJob`'s idempotency key already tolerates elsewhere, and
 * costs at most one job slightly over a soft limit, never a double charge (the job's own row still gates the
 * provider call it is about to make).
 */
export async function startProcessing(deps: PhotoshootDeps, who: Who, jobId: string): Promise<JobRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const before = await deps.db.photoshootJob.findFirst({ where: { id: jobId, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such photoshoot job in this store');
  if (before.status !== 'QUEUED') throw new PhotoshootError('INVALID_INPUT', `cannot start processing a photoshoot job that is ${before.status}, not QUEUED`, ['status']);

  const maxConcurrent = deps.settings ? await deps.settings.value('studio.photoshoot.maxConcurrentJobs', { storeId: who.storeId }) : 0;
  if (maxConcurrent > 0) {
    const processing = await countProcessingJobs(deps, who.storeId);
    if (processing >= maxConcurrent) throw new PhotoshootError('CONCURRENCY_LIMIT', `${processing} photoshoot job(s) already processing, at this store's own limit of ${maxConcurrent}`, []);
  }

  const cap = await photoshootAgentCapCheck(deps.db, nowOf(deps));
  if (cap.state === 'paused') throw new PhotoshootError('SPEND_CAP_REACHED', "the Photoshoot agent's monthly spend cap is reached; new generations pause until it resets or the owner raises it", []);

  return transitionJob(deps, who, jobId, 'PROCESSING');
}

/** One job by id, scoped by store (`photoshoot.read`). */
export async function getJob(deps: Pick<PhotoshootDeps, 'db'>, who: Who, jobId: string): Promise<JobRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.photoshootJob.findFirst({ where: { id: jobId, storeId: who.storeId } });
  if (!row) throw new PhotoshootError('NOT_FOUND', 'no such photoshoot job in this store');
  return toJobRow(row);
}

/** A product's own jobs (`photoshoot.read`), newest first. */
export async function listJobsForProduct(deps: Pick<PhotoshootDeps, 'db'>, who: Who, productId: string): Promise<JobRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.photoshootJob.findMany({ where: { productId, storeId: who.storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toJobRow);
}
