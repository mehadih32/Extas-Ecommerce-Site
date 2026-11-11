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
  /** A scene, background or context reference (e.g. the owner's own sample pose/styling image, PR 539 §59). */
  'context_reference',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

/** The reference roles a real photo of the garment can carry (every role except the generated-output's own). */
export const REFERENCE_ROLES = ASSET_ROLES.filter((r) => r !== 'primary_garment') as readonly AssetRole[];

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
