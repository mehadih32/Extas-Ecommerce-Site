// S23 · PR 439 (Blueprint C5.2, C5.5 point 2 "Video assembly engine — reels, shorts, image posts") — turns a
// template (PR 438) plus a handful of the store's own products into an assembly PLAN: which product goes in which
// scene, in what order, with which of the template's own brand assets (logo, overlay frame, intro/outro, track) and
// what caption. The plan is pure data (`buildRenderPlan`), so it can be tested without a database or a single pixel.
//
// Honest scope, exactly as Blueprint C5.2 insists on: "Not by generating footage with a video model … template-based
// assembly from our own product photos and short clips." There is no AI video provider here, and none is mocked,
// because this is not a keyed third-party integration — it is the server's own render worker, and that worker (the
// real compositor: overlay + caption baked into pixels for an image post, real encoding for a reel/short) is not
// built yet (no video encoder is in the stack today). Until it is, every job finishes as a **preview**: its
// `outputAssetId` is simply the first featured product's own live lead photo — a real, already-existing asset, never
// a fabricated one — so the rest of the pipeline (PR 440's approval queue, PR 441's calendar, PR 442's publishing)
// can be built and tested end to end right now (CLAUDE.md rule 2: mocks for missing integrations). A later PR swaps
// this preview step for the real compositor without touching the queue, the plan or anything upstream of it.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { BRAND_ASSET_FOLDER, BRAND_ASSET_KINDS, type BrandAssetKind } from './assets';
import { allow, checkStoreId, logChange, nowOf, parse, StudioError, type Db, type StudioDeps, type Who } from './context';
import type { TemplateKind, TemplateSpec } from './templates';

const CAPTION_MAX = 2200; // Instagram's own caption limit; every platform we support fits under it.
// hardcode-ok: a list-length guard on one render job, not a business number (CN-018 is about policy, not this bound).
const PRODUCTS_MAX = 10;

export const queueRenderInput = z
  .object({
    templateId: z.uuid(),
    productIds: z.array(z.uuid()).max(PRODUCTS_MAX),
    caption: z.string().trim().max(CAPTION_MAX).optional(),
  })
  .strict();
export type QueueRenderInput = z.infer<typeof queueRenderInput>;

/** One scene of the plan: a featured product, in the order it was chosen. */
export interface RenderScene {
  productId: string;
  productName: string;
}

/** What the render engine (the future real compositor) would read off a queued job. Pure data, nothing rendered. */
export interface RenderPlan {
  kind: TemplateKind;
  aspectRatio: TemplateSpec['aspectRatio'];
  /** Only meaningful for a reel/short (Blueprint C5.5): the template's own `durationSeconds`. */
  durationSeconds?: number;
  scenes: RenderScene[];
  /** The template's own brand assets, grouped by what each one is for (never more than one per kind). */
  brandAssets: Partial<Record<BrandAssetKind, string>>;
  caption?: string;
}

/** Groups a store's brand assets by kind (`assets.ts`'s own tag convention), first match per kind wins. */
export function brandAssetsByKind(assets: readonly { id: string; tags: readonly string[] }[]): Partial<Record<BrandAssetKind, string>> {
  const out: Partial<Record<BrandAssetKind, string>> = {};
  for (const kind of BRAND_ASSET_KINDS) {
    const hit = assets.find((a) => a.tags.includes(kind));
    if (hit) out[kind] = hit.id;
  }
  return out;
}

/**
 * The assembly plan for one template + its chosen products — pure, deterministic, no I/O. `products` must already
 * be in the order the owner picked them; `brandAssets` are the ones the template's own spec points at (`assets.ts`).
 */
export function buildRenderPlan(template: { kind: TemplateKind; spec: TemplateSpec }, products: readonly RenderScene[], brandAssets: readonly { id: string; tags: readonly string[] }[], caption?: string): RenderPlan {
  return {
    kind: template.kind,
    aspectRatio: template.spec.aspectRatio,
    ...(template.kind === 'reel' || template.kind === 'short' ? { durationSeconds: template.spec.durationSeconds } : {}),
    scenes: products.map((p) => ({ productId: p.productId, productName: p.productName })),
    brandAssets: brandAssetsByKind(brandAssets),
    caption: caption?.trim() || undefined,
  };
}

export interface SocialRenderJobRow {
  id: string;
  templateId: string | null;
  kind: TemplateKind | null;
  productIds: string[];
  caption: string | null;
  plan: RenderPlan | null;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  outputAssetId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobInput {
  productIds?: string[];
  caption?: string | null;
  plan?: RenderPlan;
}

type JobRow = {
  id: string;
  templateId: string | null;
  input: Prisma.JsonValue;
  status: string;
  outputAssetId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowOf(j: JobRow): SocialRenderJobRow {
  const input = (j.input ?? {}) as JobInput;
  return {
    id: j.id,
    templateId: j.templateId,
    kind: input.plan?.kind ?? null,
    productIds: input.productIds ?? [],
    caption: input.caption ?? null,
    plan: input.plan ?? null,
    status: j.status as SocialRenderJobRow['status'],
    outputAssetId: j.outputAssetId,
    error: j.error,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
  };
}

/** The store's render jobs (`studio.read`), newest first. */
export async function studioRenderJobs(deps: StudioDeps, who: Who): Promise<SocialRenderJobRow[]> {
  await allow(deps, who, 'studio.read');
  const rows = await deps.db.socialRenderJob.findMany({ where: { storeId: who.storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(rowOf);
}

/**
 * Queues a video/image assembly job (`studio.generate`, which Blueprint C5 notes "may spend on AI captions once the
 * owner turns that on" — this PR's caption is always the owner's own words; `studio.ai.captions` is wired by a later
 * PR). Checks the template exists and is not archived, and that every product named is actually in this store;
 * refuses an empty product list outright (`NO_PRODUCTS`). Nothing is rendered yet — that is `runSocialRenderJob`.
 */
export async function queueSocialRender(deps: StudioDeps, who: Who, input: unknown): Promise<SocialRenderJobRow> {
  await allow(deps, who, 'studio.generate');
  checkStoreId(who.storeId);
  const d = parse(queueRenderInput, input, 'render job');
  if (!d.productIds.length) throw new StudioError('NO_PRODUCTS', 'pick at least one product to feature', ['productIds']);
  const template = await deps.db.studioTemplate.findFirst({ where: { id: d.templateId, storeId: who.storeId } });
  if (!template) throw new StudioError('NOT_FOUND', 'no such template', ['templateId']);
  if (template.archivedAt) throw new StudioError('TEMPLATE_ARCHIVED', 'restore the template before using it', ['templateId']);
  const products = await deps.db.product.findMany({ where: { storeId: who.storeId, id: { in: d.productIds } }, select: { id: true, nameEn: true } });
  const byId = new Map(products.map((p) => [p.id, p.nameEn]));
  const missing = d.productIds.filter((id) => !byId.has(id));
  if (missing.length) throw new StudioError('NOT_FOUND', 'a product in this job is not in this store', missing);
  const spec = template.spec as TemplateSpec;
  const brandAssets = spec.brandAssetIds.length ? await deps.db.mediaAsset.findMany({ where: { storeId: who.storeId, id: { in: spec.brandAssetIds }, folder: BRAND_ASSET_FOLDER }, select: { id: true, tags: true } }) : [];
  const plan = buildRenderPlan({ kind: template.kind as TemplateKind, spec }, d.productIds.map((id) => ({ productId: id, productName: byId.get(id)! })), brandAssets, d.caption);
  const made = await deps.db.socialRenderJob.create({
    data: { storeId: who.storeId, templateId: template.id, input: { productIds: d.productIds, caption: d.caption ?? null, plan } as unknown as Prisma.InputJsonValue, status: 'QUEUED' },
  });
  await logChange(deps.db, who, { action: 'studio.render.queue', entityType: 'SocialRenderJob', entityId: made.id, before: null, after: { templateId: template.id, productIds: d.productIds } });
  return rowOf(made);
}

/** The first chosen product (in plan order) with a live photo on its gallery; `null` when none has one yet. */
async function firstLiveCoverAsset(db: Db, storeId: number, productIds: readonly string[]): Promise<string | null> {
  for (const productId of productIds) {
    const m = await db.productMedia.findFirst({ where: { storeId, productId, archivedAt: null }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] });
    if (m) return m.assetId;
  }
  return null;
}

/**
 * Runs a queued job (`studio.generate`). Today this is the preview step described at the top of this file: the
 * output is the first featured product's own live lead photo. `WRONG_STATE` (the same code PR 440–442 use for a
 * post) refuses to run anything but a `QUEUED` job, so a finished job is never silently redone.
 */
export async function runSocialRenderJob(deps: StudioDeps, who: Who, jobId: string): Promise<SocialRenderJobRow> {
  await allow(deps, who, 'studio.generate');
  const job = await deps.db.socialRenderJob.findFirst({ where: { id: jobId, storeId: who.storeId } });
  if (!job) throw new StudioError('NOT_FOUND', 'no such render job', ['jobId']);
  if (job.status !== 'QUEUED') throw new StudioError('WRONG_STATE', 'only a queued job can be run', ['status']);
  await deps.db.socialRenderJob.update({ where: { id: job.id }, data: { status: 'RUNNING', startedAt: nowOf(deps) } });
  const input = (job.input ?? {}) as JobInput;
  const productIds = input.plan?.scenes.map((s) => s.productId) ?? input.productIds ?? [];
  const outputAssetId = await firstLiveCoverAsset(deps.db, who.storeId, productIds);
  const finishedAt = nowOf(deps);
  const after = outputAssetId
    ? await deps.db.socialRenderJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', outputAssetId, finishedAt } })
    : await deps.db.socialRenderJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'none of this job’s products has a live photo yet', finishedAt } });
  await logChange(deps.db, who, { action: 'studio.render.run', entityType: 'SocialRenderJob', entityId: job.id, before: { status: job.status }, after: { status: after.status, outputAssetId: after.outputAssetId } });
  return rowOf(after);
}
