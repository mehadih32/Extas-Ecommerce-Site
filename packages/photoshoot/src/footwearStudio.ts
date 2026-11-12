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
import type { AssetRole } from './roles';

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
