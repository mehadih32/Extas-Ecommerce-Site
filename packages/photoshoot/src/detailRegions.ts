// S24 · PR 454 (Blueprint C7.5 step 8, C7.6) — "Detail re-projection — this is what makes it look real." Logos,
// prints, embroidery and text are exactly where on-model generation fails. After generation, the original
// high-resolution texture of the print/logo region is warped and composited back over the generated garment, so
// the print stays exactly as it is in real life instead of being re-imagined into mush ("the single biggest
// fidelity lever in the whole module").
//
// `DetailRegion` (packages/db/prisma/schema.prisma) already exists for exactly this, shared with two later PRs
// (463 and 464, below — "Detail Finder," a different use of the same bbox shape, on a finished image rather than
// a real reference) — no migration here. This module owns the C7.5 step 8 side of it: locating a region on a REAL
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

// ---------------------------------------------------------------------------------------------------------------
// S24 · PR 463 (Blueprint C7.10 "Detail Finder") — the owner's own point: a polo has side tapes, a side vent,
// collar tape, embroidery, print under the placket; these small details are what make a garment look premium, and
// they must be shown. This is a different use of `DetailRegion`'s own bbox shape from the rest of this file: the
// region sits on a FINISHED image (the ghost-mannequin or on-model render — C7.10 is explicit that focus crops
// "are produced from the ghost and on-model renders too, not only from the flat-lay") rather than on a real
// original, so `recordDetailRegion`'s own one-way "never on a generated image" rule above does not apply here.
// `kind` is namespaced `finder:<category>:<point>` so a Detail Finder row can never be confused with one of
// `recordDetailRegion`'s own logo/print/embroidery/text/label rows sharing the same column and bbox shape.
//
// Part 1's own honest scope: the fixed per-garment checklist (C7.10's own list), and the owner's four actions on a
// proposed region — confirm, rename, add, remove. No automatic scanner is wired yet (no CV provider exists for
// this — the same honest gap `detectedBy: 'manual'` already names above for PR 454's own regions): nothing here
// ever calls out to find a region on a real photo; `proposeDetailFocusRegion` is the primitive a later job
// runner's own scanner will call. Also not here (Part 2, PR 464): the focus-crop image itself, and C7.10's own
// "the collar tape is not readable — please take one closer photo" readability gate.

/** C7.10's own fixed garment types — a narrow, Detail-Finder-only vocabulary, never the general category/recipe
 * framework PR 469–470 build later for shot planning; this list exists only to drive the checklist below.
 * `footwear` (S24 · PR 465) is not a garment, but C7.12's own footwear recipe names exactly this shape of
 * checklist ("detail points: sole pattern, stitching, logo, eyelets") for its own "detail" angle, so it is
 * registered here rather than rebuilt — Detail Finder's `propose`/`confirm`/`rename`/`remove`/crop machinery below
 * is already generic over the type name. */
export const DETAIL_FINDER_GARMENT_TYPES = ['polo', 'shirt', 'denim_chino', 'hoodie', 'panjabi', 'footwear'] as const;
export type DetailFinderGarmentType = (typeof DETAIL_FINDER_GARMENT_TYPES)[number];

/** C7.10's own checklist of likely detail points per garment type — a fixed data-model vocabulary, never an owner
 * setting. `label` here (denim/chino's woven label) is a different value from `DETAIL_REGION_KINDS`'s own
 * `'label'` above: the `finder:` namespace below keeps the two from ever colliding in storage. `footwear`'s own
 * four points are C7.12's recipe table, verbatim. */
export const DETAIL_FINDER_CHECKLIST: Record<DetailFinderGarmentType, readonly string[]> = {
  polo: ['side_tape', 'side_vent', 'collar_tape', 'placket_and_buttons', 'cuff', 'chest_logo'],
  shirt: ['collar', 'cuff', 'button', 'pocket', 'yoke', 'stitch_density'],
  denim_chino: ['rivets', 'back_pocket_stitching', 'label', 'zip_and_hardware', 'selvedge'],
  hoodie: ['drawcord_tips', 'kangaroo_pocket', 'rib', 'zip_pull'],
  panjabi: ['neck_embroidery', 'button_placket', 'side_slit'],
  footwear: ['sole_pattern', 'stitching', 'logo', 'eyelets'],
};

export const DETAIL_FINDER_KIND_PREFIX = 'finder:';

/** True only for a checklist point this garment type actually lists — refuses a point that belongs to a
 * different garment type, or one nobody listed at all. */
export function isDetailFinderPoint(garmentType: DetailFinderGarmentType, point: string): boolean {
  return (DETAIL_FINDER_CHECKLIST[garmentType] as readonly string[]).includes(point);
}

/** Builds the namespaced `kind` a Detail Finder region is stored under. */
export function detailFinderKind(garmentType: DetailFinderGarmentType, point: string): string {
  return `${DETAIL_FINDER_KIND_PREFIX}${garmentType}:${point}`;
}

/** Reads a stored `kind` back into its garment type and checklist point, or `null` when it is not one of this
 * PR's own rows (a PR 454 logo/print/embroidery/text/label region, or anything malformed). */
export function parseDetailFinderKind(kind: string): { garmentType: DetailFinderGarmentType; point: string } | null {
  if (!kind.startsWith(DETAIL_FINDER_KIND_PREFIX)) return null;
  const rest = kind.slice(DETAIL_FINDER_KIND_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return null;
  const garmentType = rest.slice(0, sep);
  const point = rest.slice(sep + 1);
  if (!(DETAIL_FINDER_GARMENT_TYPES as readonly string[]).includes(garmentType)) return null;
  if (!point) return null;
  return { garmentType: garmentType as DetailFinderGarmentType, point };
}

export interface DetailFocusRegionRow {
  id: string;
  storeId: number;
  productId: string;
  assetId: string;
  garmentType: DetailFinderGarmentType;
  point: string;
  bbox: DetailRegionBBox;
  detectedBy: DetailRegionDetectedBy;
  approved: boolean;
  rejectedAt: Date | null;
  createdAt: Date;
}

function toFocusRow(r: DetailRegionRecord & { rejectedAt: Date | null }): DetailFocusRegionRow {
  const parsed = parseDetailFinderKind(r.kind);
  if (!parsed) throw new PhotoshootError('SOURCE_INVALID', 'this detail region is not one of the Detail Finder’s own rows', ['kind']);
  return { id: r.id, storeId: r.storeId, productId: r.productId, assetId: r.assetId, garmentType: parsed.garmentType, point: parsed.point, bbox: r.bbox as DetailRegionBBox, detectedBy: r.detectedBy as DetailRegionDetectedBy, approved: r.approved, rejectedAt: r.rejectedAt, createdAt: r.createdAt };
}

const focusPointInput = z
  .object({
    productId: z.string().uuid(),
    assetId: z.string().uuid(),
    garmentType: z.enum(DETAIL_FINDER_GARMENT_TYPES),
    point: z.string().min(1),
    bbox: bboxSchema,
  })
  .strict()
  .refine((d) => isDetailFinderPoint(d.garmentType, d.point), { message: 'not one of this garment type’s own checklist points', path: ['point'] });
export type ProposeDetailFocusRegionInput = z.input<typeof focusPointInput>;

/**
 * Records a system-proposed focus region (`photoshoot.generate`) — the half of C7.10 that would be called by a
 * future automatic scanner (not built here, the same honest gap PR 454 already left for its own `detectedBy`).
 * Deliberately does NOT require `asset.isOriginal`: C7.10 names the ghost-mannequin and on-model renders as valid
 * sources too, never only the flat-lay. Refuses only an asset outside this store, or a checklist point this
 * garment type never listed. Starts unapproved and unrejected — nothing becomes a focus crop until the owner
 * confirms it (`confirmDetailFocusRegion`).
 */
export async function proposeDetailFocusRegion(deps: PhotoshootDeps, who: Who, input: unknown): Promise<DetailFocusRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(focusPointInput, input, 'detail focus region');
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId } });
  if (!asset) throw new PhotoshootError('SOURCE_INVALID', 'the photo was not found in this store', ['assetId']);
  const kind = detailFinderKind(d.garmentType, d.point);
  const row = await deps.db.detailRegion.create({ data: { storeId: who.storeId, productId: d.productId, assetId: d.assetId, kind, bbox: d.bbox, detectedBy: 'auto', approved: false, rejectedAt: null } });
  await logChange(deps.db, who, { action: 'photoshoot.detailFocusRegion.propose', entityType: 'DetailRegion', entityId: row.id, before: null, after: { productId: d.productId, assetId: d.assetId, kind } });
  return toFocusRow(row);
}

/**
 * The owner's own "add" (`photoshoot.write`) — a region the scanner missed, typed in by hand. Unlike a proposal,
 * the owner's own addition starts already `approved: true`: there is no one else to confirm it against.
 */
export async function addDetailFocusRegion(deps: PhotoshootDeps, who: Who, input: unknown): Promise<DetailFocusRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(focusPointInput, input, 'detail focus region');
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId } });
  if (!asset) throw new PhotoshootError('SOURCE_INVALID', 'the photo was not found in this store', ['assetId']);
  const kind = detailFinderKind(d.garmentType, d.point);
  const row = await deps.db.detailRegion.create({ data: { storeId: who.storeId, productId: d.productId, assetId: d.assetId, kind, bbox: d.bbox, detectedBy: 'manual', approved: true, rejectedAt: null } });
  await logChange(deps.db, who, { action: 'photoshoot.detailFocusRegion.add', entityType: 'DetailRegion', entityId: row.id, before: null, after: { productId: d.productId, assetId: d.assetId, kind } });
  return toFocusRow(row);
}

async function loadFocusRegion(deps: Pick<PhotoshootDeps, 'db'>, who: Who, regionId: string) {
  const row = await deps.db.detailRegion.findFirst({ where: { id: regionId, storeId: who.storeId } });
  if (!row) throw new PhotoshootError('NOT_FOUND', 'no such detail region in this store');
  if (!parseDetailFinderKind(row.kind)) throw new PhotoshootError('SOURCE_INVALID', 'this detail region is not one of the Detail Finder’s own rows', ['kind']);
  return row;
}

/**
 * The owner's own "confirm" (`photoshoot.approve`) — C7.10's own review of what the (future) scanner proposed.
 * Refuses a region that was already removed: a removed proposal is re-added, never resurrected.
 */
export async function confirmDetailFocusRegion(deps: PhotoshootDeps, who: Who, regionId: string): Promise<DetailFocusRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.approve');
  const before = await loadFocusRegion(deps, who, regionId);
  if (before.rejectedAt) throw new PhotoshootError('SOURCE_INVALID', 'a removed focus region cannot be confirmed — add it again instead', ['regionId']);
  const row = await deps.db.detailRegion.update({ where: { id: regionId }, data: { approved: true } });
  await logChange(deps.db, who, { action: 'photoshoot.detailFocusRegion.confirm', entityType: 'DetailRegion', entityId: row.id, before: { approved: before.approved }, after: { approved: true } });
  return toFocusRow(row);
}

const renameInput = z.object({ point: z.string().min(1) }).strict();

/**
 * The owner's own "rename" (`photoshoot.write`) — relabels a proposed or confirmed region to a different
 * checklist point of the SAME garment type (garment type itself never changes: it is a fact about the product,
 * not the region). Refuses a point the garment type never listed, and a removed region.
 */
export async function renameDetailFocusRegion(deps: PhotoshootDeps, who: Who, regionId: string, input: unknown): Promise<DetailFocusRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const before = await loadFocusRegion(deps, who, regionId);
  if (before.rejectedAt) throw new PhotoshootError('SOURCE_INVALID', 'a removed focus region cannot be renamed — add it again instead', ['regionId']);
  const parsed = parseDetailFinderKind(before.kind);
  if (!parsed) throw new PhotoshootError('SOURCE_INVALID', 'this detail region is not one of the Detail Finder’s own rows', ['kind']);
  const d = parse(renameInput, input, 'rename');
  if (!isDetailFinderPoint(parsed.garmentType, d.point)) throw new PhotoshootError('INVALID_INPUT', 'not one of this garment type’s own checklist points', ['point']);
  const kind = detailFinderKind(parsed.garmentType, d.point);
  const row = await deps.db.detailRegion.update({ where: { id: regionId }, data: { kind } });
  await logChange(deps.db, who, { action: 'photoshoot.detailFocusRegion.rename', entityType: 'DetailRegion', entityId: row.id, before: { kind: before.kind }, after: { kind } });
  return toFocusRow(row);
}

/**
 * The owner's own "remove" (`photoshoot.write`) — a wrongly proposed region the owner does not want. Never a
 * delete (CLAUDE.md): the row stays on file with `rejectedAt` set, so a later read of the same product never
 * shows it as still pending. Refuses a region already removed, or already confirmed (confirm a region and the
 * owner's own decision about it is final the same way every other review decision here is — undo it by not
 * producing a focus crop later, not by un-reviewing the region).
 */
export async function removeDetailFocusRegion(deps: PhotoshootDeps, who: Who, regionId: string): Promise<DetailFocusRegionRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const before = await loadFocusRegion(deps, who, regionId);
  if (before.rejectedAt) throw new PhotoshootError('SOURCE_INVALID', 'this focus region was already removed', ['regionId']);
  if (before.approved) throw new PhotoshootError('SOURCE_INVALID', 'a confirmed focus region cannot be removed', ['regionId']);
  const now = new Date();
  const row = await deps.db.detailRegion.update({ where: { id: regionId }, data: { rejectedAt: now } });
  await logChange(deps.db, who, { action: 'photoshoot.detailFocusRegion.remove', entityType: 'DetailRegion', entityId: row.id, before: { rejectedAt: null }, after: { rejectedAt: now.toISOString() } });
  return toFocusRow(row);
}

/** Every Detail Finder focus region on file for a product (`photoshoot.read`), newest first — never a PR 454
 * logo/print/embroidery/text/label row, which this filters out by its own `kind` namespace. */
export async function listDetailFocusRegionsForProduct(deps: Pick<PhotoshootDeps, 'db'>, who: Who, productId: string): Promise<DetailFocusRegionRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.detailRegion.findMany({ where: { productId, storeId: who.storeId, kind: { startsWith: DETAIL_FINDER_KIND_PREFIX } }, orderBy: { createdAt: 'desc' } });
  return rows.map(toFocusRow);
}

export type DetailFinderPointStatus = 'missing' | 'proposed' | 'confirmed' | 'rejected_only';

/**
 * Pure, no database: per checklist point of one garment type, where its own regions stand — 'missing' (nobody has
 * proposed or added anything for it yet), 'rejected_only' (every region on file for it was removed), 'proposed'
 * (something is on file but nobody has confirmed it), or 'confirmed' (at least one confirmed, un-removed region —
 * ready for Part 2's own focus crop). Sets up Part 2 (the crop image itself, and C7.10's "ask for a closer photo"
 * when a point stays 'missing') without doing either of those — this PR's own honest scope.
 */
export function detailFinderCoverage(garmentType: DetailFinderGarmentType, regions: readonly DetailFocusRegionRow[]): Record<string, DetailFinderPointStatus> {
  const result = {} as Record<string, DetailFinderPointStatus>;
  for (const point of DETAIL_FINDER_CHECKLIST[garmentType]) {
    const own = regions.filter((r) => r.garmentType === garmentType && r.point === point);
    if (!own.length) result[point] = 'missing';
    else if (own.some((r) => r.approved && !r.rejectedAt)) result[point] = 'confirmed';
    else if (own.every((r) => r.rejectedAt)) result[point] = 'rejected_only';
    else result[point] = 'proposed';
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// S24 · PR 464 (Blueprint C7.10, Part 2) — the two pieces Part 1 (PR 463) left out on purpose: the focus crop
// itself ("each confirmed region becomes a focused close-up image in the gallery"), and the readability gate
// ("if the system cannot see a detail clearly, it asks … this back-and-forth is part of the normal upload flow,
// not an error").

/** The tag every focus-crop output carries, so later steps (and the admin gallery) can find them among a
 * product's other generated assets, the same way `DETAIL_REPROJECTION_TAG` marks PR 454's own output. */
export const DETAIL_FOCUS_CROP_TAG = 'detail_focus_crop';

/** The region id a focus-crop output's own tags name it as built from — the round-trip reader for the "built
 * from" note `recordDetailFocusCropOutput` writes, the same shape as `reprojectedCandidateId` above. */
export function detailFocusCropRegionId(tags: readonly string[]): string | null {
  return tags.find((t) => UUID_RE.test(t)) ?? null;
}

const cropOutputInput = z
  .object({
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
export type RecordDetailFocusCropOutputInput = z.input<typeof cropOutputInput>;

export interface DetailFocusCropOutput extends AssetRow {
  regionId: string;
}

/**
 * Records a finished focus-crop image (`photoshoot.generate`) — C7.10's own "each confirmed region becomes a
 * focused close-up image in the gallery." Refuses a region that is not one of this PR's own Detail Finder rows,
 * or is not yet confirmed (unapproved or removed — the same "mandatory review" standing rule applied here too:
 * nothing is cropped from a region nobody has looked at). Filed through PR 444's `recordGeneratedAsset`
 * chokepoint, which only ever accepts a REAL original as `sourceAssetId` (C7.6's own global rule) — when the
 * region sits on a generated render (C7.10's own "ghost and on-model renders too"), this walks one step back to
 * that render's own real original (guaranteed to exist, by the same chokepoint having already enforced it when
 * the render itself was recorded) rather than the render directly, and carries the region's own id in `tags`
 * (`detailFocusCropRegionId` reads it back) so a reviewer can always find which exact region, and which exact
 * base image (flat-lay or render), a given focus crop was cut from.
 */
export async function recordDetailFocusCropOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<DetailFocusCropOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(cropOutputInput, input, 'detail focus crop output');

  const region = await loadFocusRegion(deps, who, d.regionId);
  if (region.rejectedAt) throw new PhotoshootError('SOURCE_INVALID', 'a removed focus region cannot have a crop produced from it', ['regionId']);
  if (!region.approved) throw new PhotoshootError('SOURCE_INVALID', 'a focus region must be confirmed before a crop is produced from it', ['regionId']);

  const base = await deps.db.mediaAsset.findFirst({ where: { id: region.assetId, storeId: who.storeId } });
  if (!base) throw new PhotoshootError('SOURCE_INVALID', 'the region’s own photo was not found in this store', ['regionId']);
  const originalId = base.isOriginal ? base.id : base.sourceAssetId;
  if (!originalId) throw new PhotoshootError('SOURCE_INVALID', 'the region’s own photo has no real original to trace back to', ['regionId']);

  const role: AssetRole = isAssetRole(base.role) ? base.role : 'primary_garment';
  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: originalId,
    role,
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [DETAIL_FOCUS_CROP_TAG, d.regionId],
  });
  return { ...row, regionId: d.regionId };
}

export interface DetailFinderClarityRequest {
  point: string;
  /** C7.10's own back-and-forth wording, verbatim in shape: "part of the normal upload flow, not an error." */
  message: string;
}

/** C7.10's own exact phrasing ("The collar tape is not readable in these photos — please take one closer photo
 * of the collar tape"), built from the checklist point's own name — never a separate label table to keep in
 * step with `DETAIL_FINDER_CHECKLIST` by hand. */
export function detailFinderClarityMessage(point: string): string {
  const label = point.replace(/_/g, ' ');
  return `The ${label} is not readable in these photos — please take one closer photo of the ${label}.`;
}

/**
 * Pure, no database: every checklist point of one garment type that still has nothing good to show for it —
 * nobody has proposed or added anything at all ('missing'), or every region anyone did propose was removed
 * ('rejected_only') — paired with C7.10's own ask. Deliberately silent on a 'proposed' point (something is on
 * file, just not yet reviewed — not a reason to ask for a new photo) and on a 'confirmed' one (nothing to ask
 * for). This is the whole of C7.10's "the system … asks" for now: no upload handling, no stored request, no
 * resolve step — recomputed fresh from the real regions on file every time, the same "part of the normal
 * upload flow, not an error" the owner's own words ask for, with no new state to go stale.
 */
export function detailFinderClarityRequests(garmentType: DetailFinderGarmentType, regions: readonly DetailFocusRegionRow[]): DetailFinderClarityRequest[] {
  const coverage = detailFinderCoverage(garmentType, regions);
  return Object.entries(coverage)
    .filter(([, status]) => status === 'missing' || status === 'rejected_only')
    .map(([point]) => ({ point, message: detailFinderClarityMessage(point) }));
}
