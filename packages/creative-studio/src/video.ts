// S25 · PR 482 (Blueprint C8.1, C8.2) — the image-to-video engine, part 1: the provider adapter's contract (see
// `@extas/adapters`'s `video/index.ts`) and a VideoJob's request/estimate step. The clip's first frame is the
// product's own live, primary photo — never an uploaded or arbitrary asset id — so a job can never move from a still
// nobody has approved for sale. While `studio.video.enabled` is off (CN-018: off by default, the owner's own switch)
// every request is refused with `OFF`.
//
// S25 · PR 483 (Blueprint C8.2) — part 2: job orchestration. A requested job sits `DRAFT`; `queueVideoJob` moves it
// to `QUEUED` (`marketing.studio.write`); `runVideoJob` picks up a `QUEUED` job, calls the provider once and lands
// on `REVIEW_REQUIRED` (a person reviews before it is ever published — PR 484 adds best-of-2 and that review/approve
// step) or `FAILED`. `retryVideoJob` moves a `FAILED` job back to `QUEUED` with one more attempt, up to
// `MAX_ATTEMPTS` (`CAP_REACHED` past that — the same honest "no more automatic tries" shape PR 309's spend cap uses
// for money, here for attempts). Every move is `WRONG_STATE` from anywhere else, so a finished or running job is
// never silently redone.
import { z } from 'zod';
import type { PrismaClient } from '@extas/db/client';
import { audit } from '@extas/auth';
// The video subpath only (not the package's full barrel): this file's barrel re-export reaches Client Components
// (MotionLibrary.tsx and VideoJobs.tsx import @extas/creative-studio), so pulling in adapters/storage's Node-only
// Azure/S3 SDKs here would break the client bundle.
import type { VideoAspect, VideoClipResult, VideoEstimate, VideoProvider } from '@extas/adapters/video';
import { VIDEO_ASPECTS } from '@extas/adapters/video';
import { StudioError } from './errors';
import type { StudioDeps, Who } from './context';

/** A technical bound on retries, not a business number (CN-018 is about policy, not this guard). */
export const MAX_ATTEMPTS = 3;

/** Blueprint C8.1: clips run 4–8 seconds. */
export const VIDEO_DURATION_MIN = 4;
export const VIDEO_DURATION_MAX = 8;

export const requestVideoJobInput = z
  .object({
    productId: z.string().uuid(),
    /** A motion-library action (PR 481); optional — the owner may ask for a plain move with no named action yet. */
    actionId: z.string().uuid().nullish(),
    aspect: z.enum(VIDEO_ASPECTS),
    durationSec: z.number().int().min(VIDEO_DURATION_MIN).max(VIDEO_DURATION_MAX),
  })
  .strict();
export type RequestVideoJobInput = z.infer<typeof requestVideoJobInput>;

export interface VideoJobView {
  id: string;
  productId: string | null;
  sourceAssetId: string;
  actionId: string | null;
  aspect: VideoAspect | null;
  durationSec: number | null;
  status: string;
  provider: string | null;
  attempt: number;
  estimateMinor: number | null;
  outputAssetId: string | null;
  createdAt: string;
  updatedAt: string;
}

type Row = {
  id: string;
  productId: string | null;
  sourceAssetId: string;
  actionId: string | null;
  aspect: string | null;
  durationSec: number | null;
  status: string;
  provider: string | null;
  attempt: number;
  estimateMinor: number | null;
  outputAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function view(r: Row): VideoJobView {
  return {
    id: r.id,
    productId: r.productId,
    sourceAssetId: r.sourceAssetId,
    actionId: r.actionId,
    aspect: (r.aspect as VideoAspect) ?? null,
    durationSec: r.durationSec,
    status: r.status,
    provider: r.provider,
    attempt: r.attempt,
    estimateMinor: r.estimateMinor,
    outputAssetId: r.outputAssetId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** The product's own live, primary photo (the only still a clip may move from); `null` when it has none yet. */
export async function primaryProductAsset(db: PrismaClient, storeId: number, productId: string): Promise<string | null> {
  const m = await db.productMedia.findFirst({
    where: { storeId, productId, archivedAt: null, asset: { kind: 'IMAGE', archivedAt: null } },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    select: { assetId: true },
  });
  return m?.assetId ?? null;
}

/** A stable key for one request: the same inputs, asked again, return the same job rather than a duplicate (idempotent). */
function idempotencyKeyOf(d: RequestVideoJobInput): string {
  return `${d.productId}:${d.actionId ?? 'none'}:${d.aspect}:${d.durationSec}`;
}

/** Every video job of the store, newest first (`marketing.studio.read`, checked by the caller). */
export async function listVideoJobs(deps: StudioDeps, storeId: number): Promise<VideoJobView[]> {
  const rows = await deps.db.videoJob.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(view);
}

/**
 * The clip's cost before anything is requested (Blueprint C8.2: "every clip is priced in the AI Cost Book before it
 * runs"). `costMinor` is `null`, never a guess, while the owner has not set `studio.video.costPerSecondMinor` yet.
 */
export async function estimateVideoJob(deps: StudioDeps, provider: VideoProvider, storeId: number, input: unknown): Promise<VideoEstimate> {
  const ok = requestVideoJobInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'a clip needs its product, aspect and duration', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (!deps.settings) throw new StudioError('OFF', 'the video engine is off');
  const video = await deps.settings.value('studio.video', { storeId });
  return provider.estimate({ durationSec: ok.data.durationSec, aspect: ok.data.aspect, ratePerSecondMinor: video.costPerSecondMinor });
}

/**
 * Requests a clip job (`marketing.studio.write`, checked by the caller). Refuses while `studio.video.enabled` is off
 * (`OFF`), when the product has no live primary photo yet (`SOURCE_INVALID`), or when `actionId` names no motion
 * action of this store (`NOT_FOUND`). The same request asked twice returns the same `DRAFT` job (idempotent) rather
 * than a duplicate. Nothing is generated here — the job sits `DRAFT` with its estimate until PR 483 runs it.
 */
export async function requestVideoJob(deps: StudioDeps, who: Who, provider: VideoProvider, input: unknown): Promise<VideoJobView> {
  const ok = requestVideoJobInput.safeParse(input);
  if (!ok.success) throw new StudioError('INVALID_INPUT', 'a clip needs its product, aspect and duration', [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const d = ok.data;
  if (!deps.settings) throw new StudioError('OFF', 'the video engine is off');
  const video = await deps.settings.value('studio.video', { storeId: who.storeId });
  if (!video.enabled) throw new StudioError('OFF', 'the video engine is off — turn it on in Settings first');

  const product = await deps.db.product.findFirst({ where: { id: d.productId, storeId: who.storeId }, select: { id: true } });
  if (!product) throw new StudioError('NOT_FOUND', 'no such product', ['productId']);

  if (d.actionId) {
    const action = await deps.db.motionAction.findFirst({ where: { id: d.actionId, storeId: who.storeId, archivedAt: null } });
    if (!action) throw new StudioError('NOT_FOUND', 'no such motion action (or it is archived)', ['actionId']);
  }

  const sourceAssetId = await primaryProductAsset(deps.db, who.storeId, d.productId);
  if (!sourceAssetId) throw new StudioError('SOURCE_INVALID', 'this product has no live photo to move from yet', ['productId']);

  const idempotencyKey = idempotencyKeyOf(d);
  const existing = await deps.db.videoJob.findFirst({ where: { storeId: who.storeId, idempotencyKey } });
  if (existing) return view(existing);

  const estimate = await provider.estimate({ durationSec: d.durationSec, aspect: d.aspect, ratePerSecondMinor: video.costPerSecondMinor });
  const row = await deps.db.videoJob.create({
    data: {
      storeId: who.storeId,
      productId: d.productId,
      sourceAssetId,
      actionId: d.actionId ?? null,
      aspect: d.aspect,
      durationSec: d.durationSec,
      provider: 'mockVideoProvider',
      idempotencyKey,
      status: 'DRAFT',
      estimateMinor: estimate.costMinor,
      attempt: 1,
    },
  });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.video.request', entityType: 'VideoJob', entityId: row.id, after: { productId: d.productId, aspect: d.aspect, durationSec: d.durationSec, estimateMinor: estimate.costMinor } }, who.ctx);
  return view(row);
}

async function findOwnJob(db: PrismaClient, storeId: number, jobId: string) {
  const job = await db.videoJob.findFirst({ where: { id: jobId, storeId } });
  if (!job) throw new StudioError('NOT_FOUND', 'no such video job', ['jobId']);
  return job;
}

/** Moves a requested job from `DRAFT` to `QUEUED` (`marketing.studio.write`, checked by the caller). */
export async function queueVideoJob(deps: StudioDeps, who: Who, jobId: string): Promise<VideoJobView> {
  const job = await findOwnJob(deps.db, who.storeId, jobId);
  if (job.status !== 'DRAFT') throw new StudioError('WRONG_STATE', 'only a waiting clip can be queued', ['status']);
  const row = await deps.db.videoJob.update({ where: { id: job.id }, data: { status: 'QUEUED' } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.video.queue', entityType: 'VideoJob', entityId: job.id, before: { status: job.status }, after: { status: row.status } }, who.ctx);
  return view(row);
}

/**
 * Runs one `QUEUED` job (`marketing.studio.write`, checked by the caller): calls the provider's `createClip` once
 * and lands on `REVIEW_REQUIRED` (a person reviews before anything is published — PR 484) or `FAILED`. Never throws
 * past a provider refusal; the job's own status carries the outcome, the audit log carries the reason.
 */
export async function runVideoJob(deps: StudioDeps, who: Who, provider: VideoProvider, jobId: string): Promise<VideoJobView> {
  const job = await findOwnJob(deps.db, who.storeId, jobId);
  if (job.status !== 'QUEUED') throw new StudioError('WRONG_STATE', 'only a queued clip can be run', ['status']);
  await deps.db.videoJob.update({ where: { id: job.id }, data: { status: 'PROCESSING' } });

  let result: VideoClipResult | null = null;
  let failure: string | null = null;
  try {
    result = await provider.createClip({ sourceAssetId: job.sourceAssetId, durationSec: job.durationSec ?? VIDEO_DURATION_MIN, aspect: (job.aspect as VideoAspect) ?? '9:16' });
  } catch (e) {
    failure = e instanceof Error ? e.message : 'the video provider refused this clip';
  }

  const row =
    result && result.status === 'SUCCEEDED'
      ? await deps.db.videoJob.update({ where: { id: job.id }, data: { status: 'REVIEW_REQUIRED', providerJobId: result.providerJobId, outputAssetId: result.outputAssetId ?? null, actualMinor: job.estimateMinor } })
      : await deps.db.videoJob.update({ where: { id: job.id }, data: { status: 'FAILED', providerJobId: result?.providerJobId ?? job.providerJobId } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.video.run', entityType: 'VideoJob', entityId: job.id, before: { status: job.status, attempt: job.attempt }, after: { status: row.status, reason: failure ?? (result?.status === 'FAILED' ? 'the provider could not finish this clip' : undefined) } }, who.ctx);
  return view(row);
}

/**
 * Moves a `FAILED` job back to `QUEUED` with one more attempt (`marketing.studio.write`). Refuses with `CAP_REACHED`
 * once `attempt` has already reached `MAX_ATTEMPTS` — nothing retries itself forever.
 */
export async function retryVideoJob(deps: StudioDeps, who: Who, jobId: string): Promise<VideoJobView> {
  const job = await findOwnJob(deps.db, who.storeId, jobId);
  if (job.status !== 'FAILED') throw new StudioError('WRONG_STATE', 'only a failed clip can be retried', ['status']);
  if (job.attempt >= MAX_ATTEMPTS) throw new StudioError('CAP_REACHED', 'this clip has already been tried its limit of times', ['attempt']);
  const row = await deps.db.videoJob.update({ where: { id: job.id }, data: { status: 'QUEUED', attempt: job.attempt + 1 } });
  await audit(deps.db, who.actor, { storeId: who.storeId, action: 'studio.video.retry', entityType: 'VideoJob', entityId: job.id, before: { status: job.status, attempt: job.attempt }, after: { status: row.status, attempt: row.attempt } }, who.ctx);
  return view(row);
}
