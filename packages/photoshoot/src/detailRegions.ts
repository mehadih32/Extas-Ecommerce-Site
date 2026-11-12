// S24 · PR 454 (Blueprint C7.5 step 8, C7.6) — "Detail re-projection — this is what makes it look real." Logos,
// prints, embroidery and text are exactly where on-model generation fails. After generation, the original
// high-resolution texture of the print/logo region is warped and composited back over the generated garment, so
// the print stays exactly as it is in real life instead of being re-imagined into mush ("the single biggest
// fidelity lever in the whole module").
//
// `DetailRegion` (packages/db/prisma/schema.prisma) already exists for exactly this, shared with two later PRs
// (463, 464's "detail finder" — a different use of the same bbox shape, on a finished image rather than a real
// reference) — no migration here. This module owns the C7.5 step 8 side of it: locating a region on a REAL
// reference photo (never on a generated image — the warp needs true pixels, the same one-way rule C7.6 already
// enforces for every original); the owner's own approval of it (nothing is ever warped from a region nobody has
// confirmed is actually the logo/print — the same "mandatory review" standing rule, applied one step earlier
// than C7.6's own output queue); and recording the finished, re-projected composite as its own new asset through
// PR 444's `recordGeneratedAsset` chokepoint.
//
// No warp/composite algorithm is wired yet — exactly PR 450's and PR 453's own honest scope for their own unbuilt
// pieces (no provider adapter, no CV scorer): `detectedBy` stays 'manual' until a later PR adds an automatic
// detector, and the actual pixel warp is the job runner's own work once it exists. This module only ever
// (a) records/approves a detected region on a real photo, (b) decides whether a job has anything real to
// re-project from, and (c) files a job runner's finished composite under the one recorder every generated asset
// already goes through.
import { z } from 'zod';
import { allow, checkStoreId, logChange, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { isAssetRole, type AssetRole } from './roles';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** The fixed vocabulary of what a detail region can be — C7.5 step 8's own words ("logos, prints, embroidery and
 * text"), plus the garment's own woven-in label. A data-model vocabulary, like the asset roles, never an owner
 * setting. */
export const DETAIL_REGION_KINDS = ['logo', 'print', 'embroidery', 'text', 'label'] as const;
export type DetailRegionKind = (typeof DETAIL_REGION_KINDS)[number];

/** `detectedBy`'s fixed vocabulary. 'auto' is a later PR's own detector — nothing in this module ever writes it. */
export const DETAIL_REGION_DETECTED_BY = ['manual', 'auto'] as const;
export type DetailRegionDetectedBy = (typeof DETAIL_REGION_DETECTED_BY)[number];

/** The free tag every detail re-projection output carries, so later steps (and the admin) can find them. */
export const DETAIL_REPROJECTION_TAG = 'detail_reprojection';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The bounding box, normalised 0–1 against the image's own width/height so it survives any later resize. */
export const bboxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  })
  .strict()
  .refine((b) => b.x + b.width <= 1 && b.y + b.height <= 1, { message: 'the box runs off the edge of the image' });
export type DetailRegionBBox = z.infer<typeof bboxSchema>;

export interface DetailRegionRow {
  id: string;
  storeId: number;
  productId: string;
  assetId: string;
  kind: DetailRegionKind;
  bbox: DetailRegionBBox;
  detectedBy: DetailRegionDetectedBy;
  approved: boolean;
  createdAt: Date;
}

type DetailRegionRecord = {
  id: string;
  storeId: number;
  productId: string;
  assetId: string;
  kind: string;
  bbox: unknown;
  detectedBy: string;
  approved: boolean;
  createdAt: Date;
};

const toRow = (r: DetailRegionRecord): DetailRegionRow => ({ ...r, kind: r.kind as DetailRegionKind, bbox: r.bbox as DetailRegionBBox, detectedBy: r.detectedBy as DetailRegionDetectedBy });

const recordRegionInput = z
  .object({
    productId: z.string().uuid(),
    assetId: z.string().uuid(),
    kind: z.enum(DETAIL_REGION_KINDS),
    bbox: bboxSchema,
    detectedBy: z.enum(DETAIL_REGION_DETECTED_BY).default('manual'),
  })
  .strict();
export type RecordDetailRegionInput = z.input<typeof recordRegionInput>;

/**
 * Marks where a logo/print/embroidery/text region sits on a real reference photo (`photoshoot.write`) — the first
 * half of C7.5 step 8. Refuses an asset that is not this store's own or not a real, original photo (never on a
 * generated image: the warp needs true pixels, the same one-way rule PR 444 already enforces for every original).
 * Starts `approved: false` — nothing is trusted for compositing until `approveDetailRegion` says so.
 */
export async function recordDetailRegion(deps: PhotoshootDeps, who: Who, input: unknown): Promise<DetailRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(recordRegionInput, input, 'detail region');
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId } });
  if (!asset) throw new PhotoshootError('SOURCE_INVALID', 'the photo was not found in this store', ['assetId']);
  if (!asset.isOriginal) throw new PhotoshootError('SOURCE_INVALID', 'a detail region is only ever marked on a real, original photo — never on a generated one', ['assetId']);
  const row = await deps.db.detailRegion.create({ data: { storeId: who.storeId, productId: d.productId, assetId: d.assetId, kind: d.kind, bbox: d.bbox, detectedBy: d.detectedBy, approved: false } });
  await logChange(deps.db, who, { action: 'photoshoot.detailRegion.record', entityType: 'DetailRegion', entityId: row.id, before: null, after: { productId: d.productId, assetId: d.assetId, kind: d.kind } });
  return toRow(row);
}

/**
 * The owner's own confirmation that a detected region really is the logo/print it claims to be (`photoshoot.approve`)
 * — nothing is ever warped from a region nobody has looked at, the same "mandatory review" standing rule applied
 * one step earlier than C7.6's own output queue.
 */
export async function approveDetailRegion(deps: PhotoshootDeps, who: Who, regionId: string): Promise<DetailRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.approve');
  const before = await deps.db.detailRegion.findFirst({ where: { id: regionId, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such detail region in this store');
  const row = await deps.db.detailRegion.update({ where: { id: regionId }, data: { approved: true } });
  await logChange(deps.db, who, { action: 'photoshoot.detailRegion.approve', entityType: 'DetailRegion', entityId: row.id, before: { approved: before.approved }, after: { approved: true } });
  return toRow(row);
}

/** Every detail region on file for a product (`photoshoot.read`), newest first. */
export async function listDetailRegionsForProduct(deps: Pick<PhotoshootDeps, 'db'>, who: Who, productId: string): Promise<DetailRegionRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.detailRegion.findMany({ where: { productId, storeId: who.storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toRow);
}

export interface DetailReprojectionPlan {
  ready: boolean;
  /** The approved regions this plan would re-project, as given. Empty when `ready` is false. */
  regions: DetailRegionRow[];
  /** Set only when `ready` is false — C7.5 step 8 has nothing real to warp from yet. */
  reason?: 'NO_APPROVED_DETAIL_REGION';
}

/**
 * Whether a product has anything real to re-project from — pure, no database. Mirrors the ghost-mannequin
 * engine's own "never invent" shape (PR 446): an unapproved or missing region means the generated image is left
 * exactly as the on-model step produced it, never warped from a guess. Call this before a job runner spends
 * anything on the actual warp.
 */
export function planDetailReprojection(regions: readonly DetailRegionRow[]): DetailReprojectionPlan {
  const approved = regions.filter((r) => r.approved);
  if (!approved.length) return { ready: false, regions: [], reason: 'NO_APPROVED_DETAIL_REGION' };
  return { ready: true, regions: approved };
}

const recordOutputInput = z
  .object({
    candidateAssetId: z.string().uuid(),
    regionId: z.string().uuid(),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();
export type RecordDetailReprojectionOutputInput = z.input<typeof recordOutputInput>;

export interface DetailReprojectionOutput extends AssetRow {
  candidateAssetId: string;
  regionId: string;
}

/**
 * Records a finished re-projection (`photoshoot.generate`) — C7.5 step 8's own composite, warping the real
 * region's high-resolution texture back over the generated candidate named by `candidateAssetId`. Refuses unless
 * the named region is this store's own and `approved` (the plan's own gate, enforced again here so a caller can
 * never skip straight to recording), and unless the candidate is itself an AI-generated image (never an original
 * — the thing being enhanced is always an on-model render, C7.5 step 7's own output). Filed through PR 444's
 * `recordGeneratedAsset`, tracing back to the real reference photo the region lives on (never to the candidate it
 * enhances — a generated image must always trace to a real one, C7.5) and carrying the candidate's own id as a
 * second tag (no schema change needed for this one-way "built from" note — see `reprojectedCandidateId`), so a
 * reviewer can always find which on-model render this refines.
 */
export async function recordDetailReprojectionOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<DetailReprojectionOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'detail re-projection output');

  const region = await deps.db.detailRegion.findFirst({ where: { id: d.regionId, storeId: who.storeId } });
  if (!region) throw new PhotoshootError('NOT_FOUND', 'no such detail region in this store');
  if (!region.approved) throw new PhotoshootError('SOURCE_INVALID', 'a detail region must be approved before anything is warped from it', ['regionId']);

  const candidate = await deps.db.mediaAsset.findFirst({ where: { id: d.candidateAssetId, storeId: who.storeId } });
  if (!candidate) throw new PhotoshootError('SOURCE_INVALID', 'the candidate image was not found in this store', ['candidateAssetId']);
  if (!candidate.isAiGenerated) throw new PhotoshootError('SOURCE_INVALID', 'detail re-projection only ever enhances a generated candidate, never an original', ['candidateAssetId']);

  const role: AssetRole = isAssetRole(candidate.role) ? candidate.role : 'primary_garment';
  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: region.assetId,
    role,
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [DETAIL_REPROJECTION_TAG, d.candidateAssetId],
  });
  return { ...row, candidateAssetId: d.candidateAssetId, regionId: d.regionId };
}

/** The candidate id a re-projected output's own tags name it as built from, or null when the tags carry none —
 * the round-trip reader for the "built from" note `recordDetailReprojectionOutput` writes. */
export function reprojectedCandidateId(tags: readonly string[]): string | null {
  return tags.find((t) => UUID_RE.test(t)) ?? null;
}
