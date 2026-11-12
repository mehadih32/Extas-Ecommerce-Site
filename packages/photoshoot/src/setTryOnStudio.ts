// S24 · PR 477 (Blueprint C7.13 "Top-bottom sets and tracksuits — the owner's core winter business", C7.22 item
// 34) — the set try-on engine, part 1: the component vocabulary and the "never invent" plan for the two-garment
// on-model render.
//
// "New product type: Set — a parent with a top component and a bottom component, each its own SKU, joined by a
// colourway link so the set's colour stays matched." Investigated before writing anything (the same discipline
// PR 467's download-watermark confirmation and PR 469's category-recipe framework already followed, and the same
// discipline CLAUDE.md asks for before touching anything a single owner already owns): this exact shape is NOT a
// gap. `packages/db`'s own schema already has it — `Combo` with `type: TOP_BOTTOM` (`packages/combos`'s own
// `FIXED_COMBO_TYPES`/`photo-layout.ts` already read this exact enum value) is two `ComboItem` rows, each its own
// real `productId` (its own SKU), ordered by `position` (0 = top, 1 = bottom) — a parent combo with a top
// component and a bottom component, each its own SKU. C7.13's own very next sentence confirms it is meant this
// way: "Links to the existing combo engine: a tracksuit sold as a set is one sellable unit, and the same images
// serve the combo page." Inventing a second, parallel "Set" product type on `Product` itself — a shared,
// single-owner schema file (CLAUDE.md rule: shared files have one owner; `@extas/photoshoot` is not that owner) —
// would duplicate what `TOP_BOTTOM` already is, so this module never touches the schema: `isSetTryOnCombo`/
// `setTryOnComponentProductIds` below read a `TOP_BOTTOM` combo's own two items as "the set," pure and fed by the
// caller's own facts (the same "never query the database itself" discipline every other `plan*` function in this
// package already follows). The "colourway link" itself is each `ComboItem`'s own `allowedColourIds` — already
// real, already built (PR 89/95) — never a second mechanism invented here.
//
// The two-pass try-on itself (C7.13 verbatim): "The try-on engine runs two passes on the same model image — upper
// body, then lower body — producing one photograph of the model wearing the whole set." Both passes land on ONE
// finished photo, never two — `planSetTryOnAngles` below treats an angle as ready only once BOTH components have
// a real, on-file garment reference, generalising the single-garment "never invent" hard rule
// `planGhostMannequinViews`'s own back-view check already enforces (PR 446) to a set's own two garments at once.
//
// Angles (C7.13 verbatim): "front, three-quarter, back, plus a motion/walking frame." The set's own "back" angle
// carries the same hard rule a single garment's back view already does (`roles.ts`'s own `hasBackReference`): it
// is never produced unless BOTH the top and the bottom already have a real `back_reference` on file — a set photo
// cannot show one piece honestly and invent the other (C7.13: "the model must be wearing the complete set in one
// image").
//
// No new `AssetRole`: the top and the bottom are each an ordinary garment already covered by the existing
// `primary_garment`/`front_reference`/`back_reference` roles — C7.12's own `polo_tee_shirt_panjabi` and
// `trouser_denim_chino` recipe rows (`recipes.ts`) already name exactly this vocabulary for a tracksuit's own top
// and bottom. A set is two ALREADY-COVERED garments worn together, not a new kind of photographic subject the way
// a worn accessory (PR 471) or a reflective surface (PR 473) is, so — unlike those two PRs — this one adds no row
// to `ASSET_ROLES`/`roles.ts`.
//
// Detail points for this family (C7.13 verbatim): "hood and drawcord, cuff and hem rib, zip pull and puller
// branding, side stripe or tape, pocket, ankle rib, waistband drawcord, and fleece inside texture (a real macro)."
// Filed into Detail Finder's existing, generic machinery (`detailRegions.ts`'s own new `top_bottom_set` garment
// type) instead of rebuilt — the same "don't rebuild, point at the real thing" choice PR 465/471 already made for
// footwear and the worn-accessory families. Named `top_bottom_set`, never the bare `set`, because `set`/`combo`
// already names a different, broader commerce concept throughout this codebase (`ComboType`, `comboId`,
// `comboGiftSetStudio.ts`'s own `combo`/`gift_set` kinds) — this checklist is deliberately scoped to exactly the
// TOP_BOTTOM two-garment family C7.13 names, never confused with a 3-piece gift set or a colour pair.
//
// Part 1's own honest scope: the component vocabulary, the angle list, the "Set product type" mapping onto a
// `TOP_BOTTOM` combo's own two items (pure, no schema change), the "never invent" angle plan (mirroring
// `planGhostMannequinViews`'s own shape, generalised to two garments at once), and the Detail Finder checklist
// wiring. Deliberately NOT here (Part 2, PR 478): recording the finished set-try-on image itself through PR 444's
// `recordGeneratedAsset` chokepoint, and C7.13's own "the system says plainly … and asks" for the missing
// component or angle.
import { hasBackReference } from './roles';

/** The two garments C7.13's own "Set" product type joins — never more, never fewer: C7.13 names only a top
 * component and a bottom component. */
export const SET_TRY_ON_COMPONENTS = ['top', 'bottom'] as const;
export type SetTryOnComponent = (typeof SET_TRY_ON_COMPONENTS)[number];
export const isSetTryOnComponent = (v: unknown): v is SetTryOnComponent => typeof v === 'string' && (SET_TRY_ON_COMPONENTS as readonly string[]).includes(v);

/** C7.13's own angle list, verbatim and in order: "Angles: front, three-quarter, back, plus a motion/walking
 * frame." */
export const SET_TRY_ON_ANGLES = ['front', 'three_quarter', 'back', 'motion_walking'] as const;
export type SetTryOnAngle = (typeof SET_TRY_ON_ANGLES)[number];
export const isSetTryOnAngle = (v: unknown): v is SetTryOnAngle => typeof v === 'string' && (SET_TRY_ON_ANGLES as readonly string[]).includes(v);

// ---------------------------------------------------------------------------------------------------------------
// "New product type: Set" — reusing the existing TOP_BOTTOM combo, never a second schema concept.

/** The one Combo-shaped fact this module ever reads to recognise a set — the caller's own facts (an admin screen
 * or job orchestrator already has the combo and its items loaded), never a database query this module runs
 * itself. `comboType` is deliberately `string`, not `packages/combos`'s own `ComboType` enum: `@extas/photoshoot`
 * must not depend on `@extas/combos` (the same package-boundary discipline `styleAbTest.ts` already draws against
 * `apps/web`), so the one value this module actually compares against (`'TOP_BOTTOM'`) is named here as its own
 * literal, the same choice `registry-photoshoot-recipes.ts` already made for `@extas/settings`'s own cross-package
 * key list. `itemProductIds` is every `ComboItem.productId` of that combo, in `position` order (0 = top, 1 =
 * bottom) — `null` for an item slot the owner has not yet filled in with a real product (a category- or
 * fixed-variant-only slot), which is never a set's own top or bottom. */
export interface SetTryOnComboFacts {
  comboType: string;
  itemProductIds: readonly (string | null)[];
}

/** True only when a combo is genuinely C7.13's own two-piece top/bottom set: `Combo.type === 'TOP_BOTTOM'`, with
 * exactly two items, each a real product (its own SKU) — never a colour pair, a fixed 3-piece set or a
 * build-your-own combo, which this module has nothing to say about. */
export const isSetTryOnCombo = (combo: SetTryOnComboFacts): boolean => combo.comboType === 'TOP_BOTTOM' && combo.itemProductIds.length === 2 && combo.itemProductIds.every((id): id is string => !!id);

/** The set's own top and bottom product ids, read straight off a `TOP_BOTTOM` combo's own two items (position 0 =
 * top, position 1 = bottom, the same order `packages/combos`'s own `photo-layout.ts` already assumes for this
 * combo type) — `null` when the combo is not genuinely a two-piece top/bottom set yet. Pure: never invents a
 * component from a combo this engine does not recognise as a real set. */
export function setTryOnComponentProductIds(combo: SetTryOnComboFacts): { topProductId: string; bottomProductId: string } | null {
  if (!isSetTryOnCombo(combo)) return null;
  const [topProductId, bottomProductId] = combo.itemProductIds as [string, string];
  return { topProductId, bottomProductId };
}

// ---------------------------------------------------------------------------------------------------------------
// The "never invent" angle plan — pure, no database. The caller (a job orchestrator that already has each
// component's own real reference assets loaded) supplies both components' own asset lists; this module never
// queries the database itself for the plan, the same discipline every other engine's own `plan*` function in this
// package already follows.

export interface SetTryOnComponentAsset {
  role: string | null;
  isOriginal: boolean;
  archivedAt?: Date | string | null;
}

/** One component's own real, on-file reference photos — `top`/`bottom` are each exactly one product's own asset
 * list, never mixed together (C7.13's own two SKUs stay two separate real garments throughout). */
export interface SetTryOnComponents {
  top: readonly SetTryOnComponentAsset[];
  bottom: readonly SetTryOnComponentAsset[];
}

/** The ad hoc "what's missing" reason per angle, named per component so a caller can tell the owner exactly which
 * half of the set still needs a photo — never the formal `PhotoshootErrorCode` union: this is a plan a caller
 * reads, not a thrown refusal (the same shape `WornAccessoryMissingViewReason`/`FootwearMissingAngleReason`
 * already set, generalised here to two components instead of one). */
export const SET_TRY_ON_MISSING_REASONS = ['NO_TOP_REFERENCE', 'NO_BOTTOM_REFERENCE', 'NO_TOP_BACK_REFERENCE', 'NO_BOTTOM_BACK_REFERENCE'] as const;
export type SetTryOnMissingReason = (typeof SET_TRY_ON_MISSING_REASONS)[number];

export interface SetTryOnAnglePlanItem {
  angle: SetTryOnAngle;
  ready: boolean;
  /** Every reason this angle is not ready yet — both components can be missing their own reference at once, and
   * this engine names each one, never only the first: C7.13's own "the model must be wearing the complete set in
   * one image" makes a half answer as dishonest as none. Empty exactly when `ready` is true. */
  reasons: readonly SetTryOnMissingReason[];
}

const hasFrontLikeReference = (assets: readonly SetTryOnComponentAsset[]): boolean => assets.some((a) => a.isOriginal && !a.archivedAt && (a.role === 'primary_garment' || a.role === 'front_reference'));

/**
 * Which of the wanted set-try-on angles the engine can produce from both components' own real, on-file reference
 * photos — pure, no database, the same shape as `planGhostMannequinViews` (PR 446) and `planFootwearAngles` (PR
 * 465), generalised from one garment to the set's own two. `front`/`three_quarter`/`motion_walking` each need a
 * real flat-lay (`primary_garment` or `front_reference`) on BOTH components; `back` needs a real, non-archived
 * `back_reference` on BOTH (`roles.ts`'s own `hasBackReference`, C7.6's hard rule: never invent a back view from
 * a front-only reference — applied here to each half of the set in turn). Call this before queuing any job;
 * Part 2's own recorder (PR 478) refuses exactly what this plan marks `ready: false`.
 */
export function planSetTryOnAngles(components: SetTryOnComponents, wanted: readonly SetTryOnAngle[] = SET_TRY_ON_ANGLES): SetTryOnAnglePlanItem[] {
  const topHasFront = hasFrontLikeReference(components.top);
  const bottomHasFront = hasFrontLikeReference(components.bottom);
  const topHasBack = hasBackReference(components.top);
  const bottomHasBack = hasBackReference(components.bottom);

  return wanted.map((angle) => {
    const reasons: SetTryOnMissingReason[] = [];
    if (angle === 'back') {
      if (!topHasBack) reasons.push('NO_TOP_BACK_REFERENCE');
      if (!bottomHasBack) reasons.push('NO_BOTTOM_BACK_REFERENCE');
    } else {
      if (!topHasFront) reasons.push('NO_TOP_REFERENCE');
      if (!bottomHasFront) reasons.push('NO_BOTTOM_REFERENCE');
    }
    return { angle, ready: reasons.length === 0, reasons };
  });
}

/** Just the angles still missing at least one component's own real reference, off `planSetTryOnAngles` — the
 * primitive Part 2's own "ask for the missing component/angle" message will be built from. */
export function missingSetTryOnAngles(components: SetTryOnComponents, wanted: readonly SetTryOnAngle[] = SET_TRY_ON_ANGLES): SetTryOnAngle[] {
  return planSetTryOnAngles(components, wanted)
    .filter((p) => !p.ready)
    .map((p) => p.angle);
}
