// S24 · PR 444 (Blueprint C7.6) — the image role taxonomy that `MediaAsset.role` holds for every photo the studio
// touches. A reference photo tells the pipeline what it is looking at; a generated photo tells the gallery how to
// show it. The taxonomy is a fixed vocabulary of the data model (like `MediaKind`), not an owner setting — nothing
// here is a price, a policy or a number the owner would ever be asked to pick.
export const ASSET_ROLES = [
  /** The garment itself, the photo the whole job is built from. */
  'primary_garment',
  /** A real front-on reference photo of the garment. */
  'front_reference',
  /** A real side reference photo of the garment. */
  'side_reference',
  /** A real back reference photo of the garment. C7.6 hard rule: without this, a back view is never generated. */
  'back_reference',
  /** A close-up reference of a logo, print, embroidery or label (fed to detail re-projection, PR 454). */
  'detail_reference',
  /** S24 · PR 465: a real three-quarter reference photo — the product-only studio engine's own hero angle
   * (C7.12's footwear recipe: "3/4, side, top, back, sole, detail"; `side_reference`/`back_reference`/
   * `detail_reference` above already cover three of those six angles, reused as is). */
  'three_quarter_reference',
  /** S24 · PR 465: a real top-down reference photo (the product-only studio engine's own "top" angle). */
  'top_reference',
  /** S24 · PR 465: a real sole/underside reference photo (the product-only studio engine's own "sole" angle —
   * footwear's one angle no garment reference role ever needed). */
  'sole_reference',
  /** A scene, background or context reference (e.g. the owner's own sample pose/styling image, PR 539 §59). */
  'context_reference',
  /** S24 · PR 471: a real reference photo of a worn accessory actually worn or carried — a cap on a head,
   * sunglasses on a face, a watch on a wrist, a bag carried (C7.12's "on-head"/"on-face"/"on-wrist"/"carried on
   * model" column) — the worn-accessory engine's own `worn` view. The engine's own `flat` view (laid flat,
   * folded or standing, C7.12's "product-only" column) reuses `front_reference` rather than adding a second new
   * role, the same "reuse what already fits" choice PR 465 already made for three of footwear's own six angles. */
  'worn_reference',
  /** S24 · PR 473: a real, unedited phone photo of a reflective or transparent surface — a perfume bottle, a
   * watch glass, a sunglass lens (C7.12's own "Reflective and transparent goods — honest handling": "these are
   * not generated … the pipeline keeps the owner's real photo"). The only role `reflectiveTransparentStudio.ts`'s
   * own "never invent" gate ever accepts as a source — a genuinely new photographic need, the same reasoning that
   * justified `worn_reference` above rather than reusing `front_reference` for it. */
  'reflective_reference',
  /** S24 · PR 475 (C7.22 item 32): a finished image showing several pieces of a combo or gift set composed
   * together in one staged frame. Never a reference for anything else — no family's own recipe or engine is ever
   * built FROM a combo composition the way a footwear angle or a worn-accessory view can be — so this is the one
   * other role, besides `primary_garment`, that `REFERENCE_ROLES` below excludes. It is also never one product's
   * own view: unlike every reference role above, a row carrying it may trace back (`sourceAssetId`) to only ONE
   * of its several real pieces (`comboGiftSetStudio.ts`'s own documented limit of PR 444's single-source model),
   * with the rest of the group recorded as tags, never pretended to be a second role on the same row. */
  'combo_gift_set_composition',
  /** S24 · PR 476 (C7.22 item 33): a finished demo frame approved by the owner for one named scene (one of
   * `sceneLibrary.ts`'s own four presets, or a custom occasion scene the suggester, PR 480, will mint later) —
   * proof the scene's own look was actually shown and approved before being saved to the library, never on the
   * strength of a description alone. Unlike `combo_gift_set_composition`, this role IS meant to be a reference
   * for further generation (C7.13's own "re-rendered into a seasonal scene without a new shoot" — the saved
   * scene's own look is reused on a later, different garment set), so `REFERENCE_ROLES` below does NOT exclude
   * it. */
  'scene_library_demo',
  /** S24 · PR 478 (C7.22 item 35): a finished two-garment set try-on render — one photograph of a model wearing
   * BOTH the top and the bottom component of a `TOP_BOTTOM` combo (`setTryOnStudio.ts`), for one of C7.13's own
   * four angles. The same reasoning as `combo_gift_set_composition` above: it traces back (`sourceAssetId`) to
   * only ONE of its two real components (the top, PR 444's single-source model), with the other recorded as a
   * tag, never pretended to be a second role on the same row — and, like that role, it is never meant to be a
   * reference for further generation (no later engine is ever built FROM a finished set photo the way a footwear
   * angle or a worn-accessory view can be), so `REFERENCE_ROLES` below excludes it too. */
  'set_try_on',
  /** S24 · PR 479 (C7.22 item 36, "Unisex / couple shots"): a finished composed scene showing a male and a
   * female model each wearing the same garment/set — built by composing TWO already, separately generated
   * on-model renders (never a reference any further generation is built from, the same reasoning that gave
   * `combo_gift_set_composition` and `set_try_on` their own roles rather than reusing one member's own role). Its
   * own `sourceAssetId` traces back (transitively, through the male member's own generated row) to the real,
   * original garment photo the male render itself traces to — PR 444's single-source model, never widened — with
   * the female member's own render recorded as a tag, never pretended to be a second role on the same row. */
  'couple_composition',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/** The reference roles a real photo of the garment can carry — every role except `primary_garment` (the garment's
 * own plain photo, not a reference to anything), PR 475's own `combo_gift_set_composition`, PR 478's own
 * `set_try_on` and PR 479's own `couple_composition` (all always a finished, multi-component output, never a
 * reference any further generation is built from). */
export const REFERENCE_ROLES = ASSET_ROLES.filter((r) => r !== 'primary_garment' && r !== 'combo_gift_set_composition' && r !== 'set_try_on' && r !== 'couple_composition') as readonly AssetRole[];

export const isAssetRole = (v: unknown): v is AssetRole => typeof v === 'string' && (ASSET_ROLES as readonly string[]).includes(v);

/**
 * C7.6 hard rule: never invent a back view from a front-only reference. True only when a real, non-archived
 * `back_reference` asset is on file for the product — the only thing that may ever justify generating one.
 */
export function hasBackReference(assets: readonly { role: string | null; isOriginal: boolean; archivedAt?: Date | string | null }[]): boolean {
  return assets.some((a) => a.isOriginal && a.role === 'back_reference' && !a.archivedAt);
}

/** The roles a product's reference set is missing, for PR 448's recommendation ("please take one more photo"). */
export function missingReferenceRoles(present: readonly (string | null)[], wanted: readonly AssetRole[] = ['front_reference', 'back_reference', 'detail_reference']): AssetRole[] {
  const have = new Set(present);
  return wanted.filter((r) => !have.has(r));
}
