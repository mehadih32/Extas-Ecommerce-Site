// S24 · PR 458 (Blueprint C7.5 step 10 "the owner sees generated vs original side by side and approves, rejects
// or regenerates", C7.16 "Review and approval UI — side by side, with reasons on rejection") — Marketing ›
// Photoshoot review queue at /admin/marketing/photoshoot/review (the list of jobs waiting on a human) and its
// own decision page at /admin/marketing/photoshoot/review/[jobId] (the side-by-side, with approve/reject).
// Seeing either page needs `photoshoot.read`; deciding needs `photoshoot.approve` (the API re-checks it, same
// as `recordImageEdit`'s `photoshoot.write` in PR 457). Hidden from the menu by `stages.closedShown.S24` until
// the whole stage is finished and gated (PR 652's mechanism) — but these addresses work once you have them.
//
// "Regenerate" (C7.5 step 10's third choice, C7.16's own "Regenerate any single image") is deliberately NOT
// here: `JOB_TRANSITIONS` has no `REVIEW_REQUIRED -> QUEUED` edge yet, only the existing `FAILED -> QUEUED` retry
// (PR 452) — wiring a genuine regenerate-from-review action is a later PR's own honest scope, the same shape
// every prior S24 piece left for its own unbuilt neighbour.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { imageSources, type ImageSource } from '@extas/media';
import { decideOutputReview, getJob, getOutputsForJob, isPhotoshootError, listReviewQueue, type JobRow, type OutputRow, type PhotoshootDeps, type Who } from '@extas/photoshoot';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';

const S = MOTHER_STORE_ID;

export function photoshootDeps(deps: AdminDeps): PhotoshootDeps {
  return { db: deps.db, settings: deps.resolver };
}

export interface ReviewProduct {
  id: string;
  nameEn: string;
  nameBn: string | null;
}

export interface ReviewQueueItem {
  job: JobRow;
  output: OutputRow;
  product: ReviewProduct | null;
  thumbnail: ImageSource | null;
}

export interface ReviewQueueView {
  items: ReviewQueueItem[];
}

/** The queue page's own load: every job waiting on the owner, newest-waiting last, each with its product name
 * and the generated candidate's own thumbnail. */
export async function loadReviewQueueView(deps: AdminDeps, who: Who): Promise<ReviewQueueView> {
  const queue = await listReviewQueue(photoshootDeps(deps), who);
  if (!queue.length) return { items: [] };
  const productIds = [...new Set(queue.map((r) => r.job.productId))];
  const assetIds = [...new Set(queue.map((r) => r.output.assetId))];
  const [products, images] = await Promise.all([
    deps.db.product.findMany({ where: { id: { in: productIds }, storeId: who.storeId }, select: { id: true, nameEn: true, nameBn: true } }),
    imageSources({ db: deps.db, settings: deps.resolver }, who.storeId, assetIds),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  return {
    items: queue.map((r) => ({
      job: r.job,
      output: r.output,
      product: productById.get(r.job.productId) ?? null,
      thumbnail: images.get(r.output.assetId) ?? null,
    })),
  };
}

export interface ReviewDetailView {
  /** Null when the job was not found in this store (a bad link, or an id from another store). */
  job: JobRow | null;
  /** The one `PENDING` output still waiting on a decision — null once it is already decided, or on a job that
   * never reached review (the detail page then shows "nothing to decide" rather than a broken form). */
  output: OutputRow | null;
  product: ReviewProduct | null;
  /** The real original — the job's own first input asset — for the side-by-side (C7.5 step 10). */
  originalImage: ImageSource | null;
  generatedImage: ImageSource | null;
}

/** The decision page's own load: the job, its still-pending output (if any), the product it is for, and both
 * halves of the side-by-side comparison. */
export async function loadReviewDetailView(deps: AdminDeps, who: Who, jobId: string): Promise<ReviewDetailView> {
  let job: JobRow;
  try {
    job = await getJob(photoshootDeps(deps), who, jobId);
  } catch (e) {
    if (isPhotoshootError(e) && e.code === 'NOT_FOUND') return { job: null, output: null, product: null, originalImage: null, generatedImage: null };
    throw e;
  }
  const outputs = await getOutputsForJob(photoshootDeps(deps), who, jobId);
  const output = outputs.find((o) => o.reviewStatus === 'PENDING') ?? null;
  const originalAssetId = job.inputAssetIds[0] ?? null;
  const assetIds = [originalAssetId, output?.assetId ?? null].filter((x): x is string => Boolean(x));
  const [product, images] = await Promise.all([
    deps.db.product.findFirst({ where: { id: job.productId, storeId: who.storeId }, select: { id: true, nameEn: true, nameBn: true } }),
    assetIds.length ? imageSources({ db: deps.db, settings: deps.resolver }, who.storeId, assetIds) : Promise.resolve(new Map<string, ImageSource>()),
  ]);
  return {
    job,
    output,
    product,
    originalImage: originalAssetId ? (images.get(originalAssetId) ?? null) : null,
    generatedImage: output ? (images.get(output.assetId) ?? null) : null,
  };
}

/** The one URL a plain `<img>` shows for an `ImageSource` — the largest JPEG rendition, or the largest of
 * whatever is ready, the same pick PR 457's editor page already makes for its own preview. */
export function previewUrl(image: ImageSource | null): string | null {
  if (!image) return null;
  const jpegs = image.variants.filter((v) => v.format === 'jpeg');
  const pool = jpegs.length ? jpegs : image.variants;
  if (!pool.length) return null;
  return pool.reduce((a, b) => (b.width > a.width ? b : a)).url;
}

const answer = (e: unknown): Response => (isPhotoshootError(e) ? fail(e.status, e.code, e.details) : errorResponse(e));

/**
 * /api/admin/marketing/photoshoot-review — POST {outputId, decision: 'approve'|'reject', reason?}
 * (`photoshoot.approve`): the owner's own review decision on one `PENDING` output, through `decideOutputReview`.
 * No GET: both pages load with `loadReviewQueueView`/`loadReviewDetailView`.
 */
export async function photoshootReviewHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const b = await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: 'photoshoot.approve', storeId: S });
  if (g instanceof Response) return g;
  const who: Who = { actor: g.actor, storeId: S, ctx: g.ctx };
  const outputId = typeof b.outputId === 'string' ? b.outputId : '';
  if (!outputId) return fail(422, 'INVALID_INPUT', ['outputId']);
  try {
    const result = await decideOutputReview(photoshootDeps(deps!), who, outputId, { decision: b.decision, reason: b.reason });
    return json({ ok: true, output: result.output, job: result.job });
  } catch (e) {
    return answer(e);
  }
}
