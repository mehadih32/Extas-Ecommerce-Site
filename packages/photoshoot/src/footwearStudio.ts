// S24 · PR 465 (Blueprint C7.12, C7.22 item 22) — footwear / product-only studio, part 1. Footwear is the first of
// C7.12's three product-family engines built here that is neither on-model (PR 449+) nor ghost mannequin (PR 446):
// "Product-only studio" — a multi-angle set assembled straight from the owner's own photos (background cleaned,
// shadow and scale made consistent), never a human model and never a mannequin removal. Footwear's own recipe
// (C7.12's table): 6 angles — three-quarter, side, top, back, sole, detail — each with its own detail points
// (sole pattern, stitching, logo, eyelets).
//
// The engine's one hard rule, verbatim (C7.12): "Turntable-style angle set where enough reference exists; the
// system says plainly when it does not and asks for the missing angle rather than inventing it." This is a
// SIMPLER "never invent" shape than the ghost-mannequin engine's own (PR 446): ghost mannequin derives a view from
// a *different* real photo (mannequin removal on the flat-lay); product-only has nothing to derive from at all —
// each of the 6 angles can only ever come from a real, on-file reference photo of that exact angle. So "ready"
// here means just that: a real, non-archived reference asset tagged with the angle's own role.
//
// This module is deliberately footwear-only, never a general "product-only studio" framework: C7.22 explicitly
// splits the general category-recipe framework (the 13 recipes) into its own later PR (469–470) — building that
// generically here would pre-empt and likely duplicate that PR's own work. The same narrow-engine shape PR 446
// already set for ghost mannequin (front/back only, not every garment view anyone could imagine). Perfume,
// wallets, belts, watches-laid-flat, sunglasses-folded and bags-standing — C7.12's other product-only families —
// are explicitly NOT wired here: reflective/transparent goods (perfume, watch glass, sunglass lenses) get their
// own honest, never-generated handling in PR 473 ("these are not generated… the pipeline keeps the owner's real
// photo, replaces and cleans the background…"); the rest wait for the worn-accessory engine (PR 471–472) and the
// recipe framework (PR 469–470). Detail re-projection for watches/sunglasses/bags (C7.12's "mandatory for these
// families") is a different, later piece entirely (PR 454's own mechanism, reused by PR 471–472) — nothing here.
//
// Part 1's own honest scope (this PR): the angle vocabulary, the three new reference roles the engine needs that
// no garment ever needed (`three_quarter_reference`/`top_reference`/`sole_reference` — `side_reference`,
// `back_reference` and `detail_reference` already existed and are reused as is), and the "never invent" plan,
// pure and database-free, mirroring `planGhostMannequinViews`'s own shape (PR 446). Footwear's own detail-point
// checklist (sole pattern, stitching, logo, eyelets) is filed into the Detail Finder's own existing, generic
// machinery (PR 463/464's `detailRegions.ts`) rather than rebuilt here — those four points are exactly what Detail
// Finder already models (a fixed per-type checklist of named regions on a real or finished image, with the
// owner's own confirm/rename/add/remove and, once confirmed, a recorded focus-crop image), so footwear is simply
// registered as one more Detail Finder type; see `detailRegions.ts`'s own `footwear` entry. Deliberately NOT here
// (Part 2, PR 466): recording the finished per-angle studio image itself, and the plain-language "ask for the
// missing angle" message C7.12 asks for.
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import type { AssetRole } from './roles';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** C7.12's own six footwear angles, in the blueprint's own order. */
export const FOOTWEAR_ANGLES = ['three_quarter', 'side', 'top', 'back', 'sole', 'detail'] as const;
export type FootwearAngle = (typeof FOOTWEAR_ANGLES)[number];

const FOOTWEAR_ANGLE_ROLE: Record<FootwearAngle, AssetRole> = {
  three_quarter: 'three_quarter_reference',
  side: 'side_reference',
  top: 'top_reference',
  back: 'back_reference',
  sole: 'sole_reference',
  detail: 'detail_reference',
};

/** The real reference role a given footwear angle is filed under — the same roles a real reference photo carries
 * (three of the six already existed for garments; `three_quarter_reference`/`top_reference`/`sole_reference` are
 * new in this PR). */
export const footwearAngleRole = (angle: FootwearAngle): AssetRole => FOOTWEAR_ANGLE_ROLE[angle];

/** The ad hoc "what's missing" reason per angle — the same shape as `GhostMannequinPlanItem`'s own `reason`
 * (PR 446), never the formal `PhotoshootErrorCode` union: this is a plan a caller reads, not a thrown refusal. */
export const FOOTWEAR_MISSING_ANGLE_REASONS = ['NO_THREE_QUARTER_REFERENCE', 'NO_SIDE_REFERENCE', 'NO_TOP_REFERENCE', 'NO_BACK_REFERENCE', 'NO_SOLE_REFERENCE', 'NO_DETAIL_REFERENCE'] as const;
export type FootwearMissingAngleReason = (typeof FOOTWEAR_MISSING_ANGLE_REASONS)[number];

const FOOTWEAR_ANGLE_REASON: Record<FootwearAngle, FootwearMissingAngleReason> = {
  three_quarter: 'NO_THREE_QUARTER_REFERENCE',
  side: 'NO_SIDE_REFERENCE',
  top: 'NO_TOP_REFERENCE',
  back: 'NO_BACK_REFERENCE',
  sole: 'NO_SOLE_REFERENCE',
  detail: 'NO_DETAIL_REFERENCE',
};

export interface FootwearStudioAsset {
  role: string | null;
  isOriginal: boolean;
  archivedAt?: Date | string | null;
}

export interface FootwearAnglePlanItem {
  angle: FootwearAngle;
  ready: boolean;
  /** Set only when `ready` is false — which exact reference photo is missing before this angle can be produced. */
  reason?: FootwearMissingAngleReason;
}

/**
 * Which of the wanted footwear angles the product-only studio engine can produce from a product's real, on-file
 * reference photos — pure, no database. Each angle needs its OWN real, non-archived reference asset (C7.12's hard
 * rule: "the system says plainly when it does not [have enough reference] and asks for the missing angle rather
 * than inventing it" — unlike ghost mannequin, nothing here is ever derived from a different angle). Call this
 * before queuing any job; PR 466's own recorder refuses exactly what this plan marks `ready: false`.
 */
export function planFootwearAngles(assets: readonly FootwearStudioAsset[], wanted: readonly FootwearAngle[] = FOOTWEAR_ANGLES): FootwearAnglePlanItem[] {
  const hasRole = (role: AssetRole) => assets.some((a) => a.isOriginal && a.role === role && !a.archivedAt);
  return wanted.map((angle) => {
    const role = footwearAngleRole(angle);
    return hasRole(role) ? { angle, ready: true } : { angle, ready: false, reason: FOOTWEAR_ANGLE_REASON[angle] };
  });
}

/** Just the angles still missing a real reference photo, off `planFootwearAngles` — the primitive PR 466's own
 * "ask for the missing angle" message is built from. */
export function missingFootwearAngles(assets: readonly FootwearStudioAsset[], wanted: readonly FootwearAngle[] = FOOTWEAR_ANGLES): FootwearAngle[] {
  return planFootwearAngles(assets, wanted)
    .filter((p) => !p.ready)
    .map((p) => p.angle);
}

// ---------------------------------------------------------------------------------------------------------------
// S24 · PR 466 (Blueprint C7.12, C7.22 item 23) — footwear / product-only studio, part 2: the two pieces Part 1
// (PR 465) left out on purpose — recording the finished per-angle studio image itself, and C7.12's own
// plain-language "ask for the missing angle."

/** The free tag every footwear product-only studio output carries, so later steps (and the admin) can find them
 * among a product's other generated assets — the same pattern `GHOST_MANNEQUIN_TAG` and `DETAIL_FOCUS_CROP_TAG`
 * already set. */
export const FOOTWEAR_STUDIO_TAG = 'footwear_product_only_studio';

const recordOutputInput = z
  .object({
    sourceAssetId: z.string().uuid(),
    angle: z.enum(FOOTWEAR_ANGLES),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();
export type RecordFootwearStudioOutputInput = z.input<typeof recordOutputInput>;

export interface FootwearStudioOutput extends AssetRow {
  angle: FootwearAngle;
}

/**
 * Records a finished product-only studio render (`photoshoot.generate`) — C7.12's own "a multi-angle set from the
 * owner's photos … on the standard background, with consistent shadow and scale." Refuses unless the named
 * `sourceAssetId` is itself a real, non-archived reference photo tagged with THIS angle's own role — the C7.12
 * hard rule actually enforced for every one of the six angles (not only "back", the way PR 446's own ghost-mannequin
 * engine enforces it for just one): nothing here is ever produced from a different angle's photo, because
 * product-only has nothing else to derive from. Filed through PR 444's `recordGeneratedAsset` chokepoint, so the
 * same originals-immutable / generated-kept-separate guarantee carries through for free.
 */
export async function recordFootwearStudioOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<FootwearStudioOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'footwear studio output');

  const source = await deps.db.mediaAsset.findFirst({ where: { id: d.sourceAssetId, storeId: who.storeId } });
  const wantRole = footwearAngleRole(d.angle);
  if (!source || !source.isOriginal || source.role !== wantRole || source.archivedAt) {
    throw new PhotoshootError('NO_FOOTWEAR_REFERENCE', `a ${d.angle} studio image is never generated without a real, on-file ${wantRole} reference`, ['sourceAssetId']);
  }

  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: d.sourceAssetId,
    role: wantRole,
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [FOOTWEAR_STUDIO_TAG],
  });
  return { ...row, angle: d.angle };
}

/**
 * The most recent, non-archived footwear studio output already on file for this source photo and angle
 * (`photoshoot.read`) — what a later job orchestrator checks before queuing a new render, so the same reference
 * photo is never paid for twice (C7.6 "reuse approved outputs unless the source … changed"). Null when none
 * exists yet.
 */
export async function findExistingFootwearStudioOutput(deps: Pick<PhotoshootDeps, 'db'>, who: Who, sourceAssetId: string, angle: FootwearAngle): Promise<FootwearStudioOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, sourceAssetId, role: footwearAngleRole(angle), isAiGenerated: true, archivedAt: null, tags: { has: FOOTWEAR_STUDIO_TAG } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, angle };
}

/** A plain label for each angle, for the "ask for the missing angle" message below — never the raw snake_case
 * identifier. */
const FOOTWEAR_ANGLE_LABEL: Record<FootwearAngle, string> = {
  three_quarter: 'three-quarter',
  side: 'side',
  top: 'top',
  back: 'back',
  sole: 'sole',
  detail: 'detail',
};

export interface FootwearMissingAngleRequest {
  angle: FootwearAngle;
  /** C7.12's own plain words: "the system says plainly when it does not [have enough reference] and asks for
   * the missing angle rather than inventing it." */
  message: string;
}

/** C7.12's own honest ask, built straight from the angle's own name — never a separate label table to keep in
 * step with `FOOTWEAR_ANGLE_LABEL` by hand. The same shape as `detailFinderClarityMessage` (PR 464), one level up
 * (a missing angle, not a missing checklist point within one). */
export function footwearMissingAngleMessage(angle: FootwearAngle): string {
  const label = FOOTWEAR_ANGLE_LABEL[angle];
  return `There is no real ${label} photo of this product yet — please add one ${label} photo before the product-only studio can produce that angle.`;
}

/**
 * Pure, no database: every wanted angle that still has no real reference photo on file, paired with C7.12's own
 * ask — recomputed fresh from the real references on file every time, the same "part of the normal upload flow,
 * not an error" shape `detailFinderClarityRequests` (PR 464) already set for Detail Finder's own checklist
 * points, one level up: a missing ANGLE here, not a missing checklist point within an already-present one.
 */
export function footwearMissingAngleRequests(assets: readonly FootwearStudioAsset[], wanted: readonly FootwearAngle[] = FOOTWEAR_ANGLES): FootwearMissingAngleRequest[] {
  return missingFootwearAngles(assets, wanted).map((angle) => ({ angle, message: footwearMissingAngleMessage(angle) }));
}
