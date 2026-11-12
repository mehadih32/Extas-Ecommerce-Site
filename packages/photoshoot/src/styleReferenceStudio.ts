// S24 · PR 539 (Blueprint C7, V2 18–19 Oct addition, §59 answer 59) — the owner's own sample pose/styling
// reference, and the AI pose/video asset-library reuse rule that goes with it.
//
// Blueprint verbatim (C7, V2 note): "models may be brought in from outside or created in the backend, and when
// the owner supplies a sample pose or styling image the generated photograph follows it … Every AI pose set or
// video is kept in an asset library and reused for the same template + product + colours, never paid for twice."
//
// Two separate, honestly-scoped pieces, investigated before writing anything (the same discipline PR 467/477/479
// already followed):
//
//   1. The sample pose/styling reference itself needs no new role or chokepoint — PR 444's own fixed taxonomy
//      already has `context_reference` ("a scene, background or context reference", `roles.ts`, with this exact
//      PR already named in its own doc comment) and PR 444's own `tagReferenceRole` already lets the owner tag
//      any real, on-file photo with it. What was missing is only the PLAN: whether a generation should actually
//      follow a supplied reference, and the honest refusal to pretend it will when the asset pointed at is not a
//      usable one (archived, itself AI-generated, or tagged some other role) — "never invent," applied to an
//      optional input rather than a required one for the first time in this package. `planStyleReferenceUsage`
//      below is pure, fed by the caller's own fact, the same shape every other engine's own `plan*` function in
//      this package already takes. No provider call exists anywhere in this package yet to literally make a
//      generation "follow" a reference image (every engine before this one is equally honest that no job
//      runner/provider adapter calls it yet) — that wiring is a later PR's own job, the same gap PR 460's
//      recommendation note and PR 468's cost book already left for their own first reader.
//
//   2. "Every AI pose set or video is kept in an asset library and reused … never paid for twice" is a REUSE rule
//      cross-cutting every engine that might ever use a style reference (on-model try-on, ghost mannequin, a
//      later video engine) — not a new engine of its own. `styleReferenceLibraryTag` and
//      `findExistingStyleReferenceRender` below let any of those engines' own recorder opt into this reuse (by
//      adding the one tag to its own existing `recordGeneratedAsset` call, the same "free label, purely
//      informational" shape `tags` already documents) without this module inventing a second recording
//      chokepoint. Keyed by template + product + colours, verbatim.
//
// Deliberately NOT here: wiring any engine's own recorder to actually add the library tag (no caller does yet,
// the same honest gap left by PR 460/468's own first version); a video asset kind (no video pipeline exists
// anywhere in this package yet — S25's own scope); a new AssetRole (`context_reference` already fits).
import { allow, checkStoreId, type PhotoshootDeps, type Who } from './context';
import type { AssetRow } from './assets';

/** The one existing C7.6 role a sample pose/styling reference is tagged with — PR 444's own `context_reference`,
 * kept exactly for this (its own doc comment in `roles.ts` already named this PR). Never a new role. */
export const STYLE_REFERENCE_ROLE = 'context_reference' as const;

/** The one fact this module needs about a candidate style/pose reference — the caller's own (an admin screen or
 * job orchestrator that already has the asset row), never queried here. `assetId: null` means the owner supplied
 * none — always allowed, since a sample pose/styling image is optional (Blueprint: "when the owner supplies
 * one"), never required. */
export interface StyleReferenceCandidate {
  assetId: string | null;
  isOriginal: boolean;
  archivedAt: Date | null;
  role: string | null;
}

/** True only for a real, non-archived, original photo actually tagged `context_reference` — never an AI-generated
 * image (a style/pose reference is always the owner's own real photo, the same "owner supplies" wording C7's own
 * note uses for every other source photo in this package) and never a photo tagged for some other job. */
export function isUsableStyleReference(c: Pick<StyleReferenceCandidate, 'isOriginal' | 'archivedAt' | 'role'> | null): boolean {
  return !!c && c.isOriginal && !c.archivedAt && c.role === STYLE_REFERENCE_ROLE;
}

export const STYLE_REFERENCE_STATUSES = ['none', 'ready', 'ignored_not_usable'] as const;
export type StyleReferenceStatus = (typeof STYLE_REFERENCE_STATUSES)[number];

export interface StyleReferencePlan {
  status: StyleReferenceStatus;
  /** The asset pointed at, whatever its status — `null` only when `status` is `'none'`. */
  assetId: string | null;
}

/**
 * Whether a generation should follow a supplied style/pose reference — pure, no database, the same shape as
 * `planCoupleComposition`/`planSetTryOnAngles`, but for an OPTIONAL input rather than a required one:
 *   - no candidate (or no `assetId`) at all → `'none'`, nothing to say, this is the ordinary default path;
 *   - a usable one on file → `'ready'`, the generation is meant to follow it;
 *   - one named but not usable (archived, AI-generated, or carrying some other role) → `'ignored_not_usable'`,
 *     named plainly rather than silently guessed at or silently applied anyway.
 */
export function planStyleReferenceUsage(candidate: StyleReferenceCandidate | null): StyleReferencePlan {
  if (!candidate || !candidate.assetId) return { status: 'none', assetId: null };
  if (!isUsableStyleReference(candidate)) return { status: 'ignored_not_usable', assetId: candidate.assetId };
  return { status: 'ready', assetId: candidate.assetId };
}

/** Plain words for a plan's own status — `null` for `'none'`, since an unsupplied reference needs no message at
 * all (C7's own "optional" wording; the same "nothing to say" choice `coupleCompositionMissingMemberRequests`
 * makes once a member is no longer missing). */
export function styleReferenceStatusMessage(plan: StyleReferencePlan): string | null {
  if (plan.status === 'none') return null;
  if (plan.status === 'ready') return 'A real, on-file style/pose reference is attached — the generated photograph is meant to follow it, once a provider call is wired to actually use it.';
  return 'The photo pointed at as a style/pose reference is not usable (it must be a real, non-archived, original photo tagged as the context reference) — it is ignored rather than silently guessed at or applied anyway.';
}

// ---------------------------------------------------------------------------------------------------------------
// The AI pose/video asset-library reuse rule — "kept in an asset library and reused for the same template +
// product + colours, never paid for twice" (Blueprint, verbatim).

/** A deterministic, round-trippable tag for one template + product + colourway combination — the same
 * `free label, purely informational` shape every other S24 engine's own composite tag already sets
 * (`coupleCompositionMemberTag`, `setTryOnComponentTag`). None of the three parts may itself contain a colon,
 * the same constraint those sibling tag functions already rely on without stating it as a runtime check (a
 * template key, a product id and a colour key are all short slugs, never free text, in every caller this
 * package already has). */
export function styleReferenceLibraryTag(templateKey: string, productId: string, colourKey: string): string {
  return `style_ref_lib:${templateKey}:${productId}:${colourKey}`;
}

export interface StyleReferenceLibraryLookup {
  templateKey: string;
  productId: string;
  colourKey: string;
}

/**
 * The most recent, non-archived AI pose/video output already on file for exactly this template + product +
 * colours (`photoshoot.read`) — what a later job orchestrator checks before queuing a new generation, so the
 * same pose set or video is never paid for twice (the Blueprint's own words), the same shape as
 * `findExistingCoupleCompositionOutput`/`findExistingSceneLibraryEntry`. Deliberately not scoped to one asset
 * ROLE — a reused pose set may come out of any engine this package has (on-model try-on, ghost mannequin, a
 * later video engine), never a role of its own. Null when none exists yet.
 */
export async function findExistingStyleReferenceRender(deps: Pick<PhotoshootDeps, 'db'>, who: Who, input: StyleReferenceLibraryLookup): Promise<AssetRow | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const tag = styleReferenceLibraryTag(input.templateKey, input.productId, input.colourKey);
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, isAiGenerated: true, archivedAt: null, tags: { has: tag } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags };
}
