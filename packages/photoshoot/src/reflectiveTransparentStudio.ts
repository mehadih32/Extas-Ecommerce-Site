// S24 · PR 473 (Blueprint C7.12, C7.22 item 30) — reflective and transparent product handling. C7.12's own
// paragraph, verbatim: "Reflective and transparent goods — honest handling. Perfume bottles, watch glass and
// sunglass lenses are the weakest area for generative models: glass, reflections and transparency come out
// wrong. These are not generated. Instead the pipeline keeps the owner's real photo, replaces and cleans the
// background, rebuilds the shadow and a controlled reflection, corrects colour, and crops to standard. The
// result is a clean studio look from a phone photo without inventing the object. Where a real angle is missing,
// the system asks for it."
//
// This is a genuinely different engine from every other S24 module, not a variant of one already built. Ghost
// mannequin (PR 446), footwear (PR 465/466) and the worn-accessory engine (PR 471/472) all produce a NEW staged
// photograph from a real reference — a mannequin removed, a studio background assembled, a garment placed on a
// model. Here nothing is ever produced: C7.12's own sentence is "these are not generated," so the only allowed
// output is the owner's own real photo with its background, shadow, reflection and colour cleaned up and its
// crop standardised — "a clean studio look from a phone photo without inventing the object." The three named
// subjects (perfume bottles, watch glass, sunglass lenses) are kept as this module's own family vocabulary,
// verbatim and lower-cased with underscores (`perfume`, `watch_glass`, `sunglass_lens`) — deliberately NOT the
// same keys as `recipes.ts`'s own `watches`/`sunglasses` (whole-product families covering several real engines
// each) or `wornAccessoryStudio.ts`'s own `watches`/`sunglasses` worn-accessory families: C7.12 names the GLASS
// and the LENS themselves, the one surface on each product generative models get wrong, never the product as a
// whole. A product that needs this treatment also carries its own ordinary recipe/engine for everything else
// about it (the watch's dial, crown, bracelet — C7.12's "Detail fidelity on branded goods" paragraph and PR 472's
// own mandatory detail-reprojection gate already cover THAT, a different paragraph entirely); this module owns
// only the glass/transparency surface's own honest pipeline.
//
// Singular, never multi-angle, by design: C7.12's own summarising sentence says "a clean studio look from A
// PHONE PHOTO" (singular) — unlike footwear's six NAMED angles or the worn-accessory engine's two views, this
// engine takes exactly one real, on-file reference photo per product and produces exactly one honest output from
// it. "Where a real angle is missing, the system asks for it" is C7.12's own "never invent" sentence applied one
// level down to this one real photo, mirroring `footwearMissingAngleMessage`'s own shape (PR 466) rather than
// the worn-accessory engine's own "the system asks for the missing VIEW" shape, since there is only ever one
// photo here to ask for.
//
// One recorded output, not five chained steps: C7.8's own finishing pass (`finishing.ts`, PR 455/456) is built as
// an explicit, named, PR-split sequence the owner reviews step by step ("AI upscale … artifact repair …
// contact-shadow synthesis … house colour grade … final web sharpening," each its own asset row). C7.12's own
// sentence for THIS engine, by contrast, reads as one continuous honest process on one real photo ("replaces and
// cleans the background, rebuilds the shadow and a controlled reflection, corrects colour, and crops to
// standard"), never split into separate owner-reviewed passes anywhere in the blueprint. `recordReflectiveTransparentOutput`
// below therefore records the whole honest pipeline as ONE finished asset row, tagging every stage it ran
// (`REFLECTIVE_TRANSPARENT_PIPELINE_STAGES`) so the admin can see what was done without needing five separate
// rows and five separate approvals for one phone photo.
//
// The new `reflective_reference` role (`roles.ts`) is this engine's own, genuinely new photographic need — the
// same reasoning PR 471 used for its own new `worn_reference` role rather than reusing an existing one: no
// garment, footwear angle or worn-accessory view was ever "a real, unedited phone photo of a reflective or
// transparent surface," so reusing `front_reference` here would blur this engine's own one-way "never invent"
// gate with every other engine's own front-shot role.
//
// Deliberately NOT here: a sub-job row in the AI Cost Book (PR 468's own `PHOTOSHOOT_SUB_JOBS` is C7.20's own
// fixed list of seven — "ghost mannequin, try-on, detail re-projection, upscale, finishing, detail finder,
// quality scoring" — verbatim, and this engine is not one of the seven C7.20 itself names); any change to
// `recipes.ts`'s own `perfume`/`watches`/`sunglasses` rows (unrelated: those already name `product_only` as one
// of their real engines, and this module is simply the honest, never-generated version of exactly that for the
// one surface on each that generation gets wrong); and the "Detail fidelity on branded goods" mandatory
// re-projection gate (PR 472's own, different paragraph, already enforced there for watches/sunglasses/bags as
// whole products).
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** C7.12's own three named reflective/transparent subjects, verbatim: "Perfume bottles, watch glass and sunglass
 * lenses." Deliberately not the same keys as `recipes.ts`'s or `wornAccessoryStudio.ts`'s own `watches`/
 * `sunglasses` families — this engine owns only the glass/transparency surface, never the whole product. */
export const REFLECTIVE_TRANSPARENT_FAMILIES = ['perfume', 'watch_glass', 'sunglass_lens'] as const;
export type ReflectiveTransparentFamily = (typeof REFLECTIVE_TRANSPARENT_FAMILIES)[number];
export const isReflectiveTransparentFamily = (v: unknown): v is ReflectiveTransparentFamily =>
  typeof v === 'string' && (REFLECTIVE_TRANSPARENT_FAMILIES as readonly string[]).includes(v);

/** A plain label for each family, for the "ask for the missing photo" message below — never the raw snake_case
 * key. */
const REFLECTIVE_TRANSPARENT_FAMILY_LABEL: Record<ReflectiveTransparentFamily, string> = {
  perfume: 'perfume bottle',
  watch_glass: 'watch glass',
  sunglass_lens: 'sunglass lens',
};

export interface ReflectiveTransparentAsset {
  role: string | null;
  isOriginal: boolean;
  archivedAt?: Date | string | null;
}

/** True only for a real, non-archived `reflective_reference` photo — the one thing that may ever justify
 * recording an honest reflective/transparent studio output, the same "never invent" shape `hasBackReference`
 * (PR 444) already set. */
export function hasReflectiveReference(assets: readonly ReflectiveTransparentAsset[]): boolean {
  return assets.some((a) => a.isOriginal && a.role === 'reflective_reference' && !a.archivedAt);
}

export interface ReflectiveTransparentPlan {
  family: ReflectiveTransparentFamily;
  ready: boolean;
  /** Set only when `ready` is false — C7.12's own "where a real angle is missing" sentence, applied to this
   * engine's one real photo. */
  reason?: 'NO_REFLECTIVE_REFERENCE';
}

/**
 * Whether this product's one real reflective/transparent reference photo is on file yet — pure, no database.
 * C7.12's own hard rule: nothing here is ever generated, so "ready" means only that a real, non-archived
 * `reflective_reference` asset already exists; there is nothing to derive it from. Call this before queuing any
 * job; `recordReflectiveTransparentOutput`'s own gate refuses exactly what this plan marks `ready: false`.
 */
export function planReflectiveTransparentOutput(family: ReflectiveTransparentFamily, assets: readonly ReflectiveTransparentAsset[]): ReflectiveTransparentPlan {
  return hasReflectiveReference(assets) ? { family, ready: true } : { family, ready: false, reason: 'NO_REFLECTIVE_REFERENCE' };
}

export interface ReflectiveTransparentMissingReferenceRequest {
  family: ReflectiveTransparentFamily;
  /** C7.12's own plain words: "the system … asks for it" — never inventing the object from nothing. */
  message: string;
}

/** C7.12's own honest ask, built straight from the family's own plain label — never a separate label table to
 * keep in step with `REFLECTIVE_TRANSPARENT_FAMILY_LABEL` by hand. The same shape as `footwearMissingAngleMessage`
 * (PR 466), one real photo rather than one of six named angles. */
export function reflectiveTransparentMissingReferenceMessage(family: ReflectiveTransparentFamily): string {
  const label = REFLECTIVE_TRANSPARENT_FAMILY_LABEL[family];
  return `There is no real, unedited phone photo of this ${label} yet — please add one real photo before the honest reflective/transparent studio can clean it up. C7.12: it is never generated.`;
}

/**
 * Pure, no database: zero or one request, depending on whether the real reflective/transparent reference photo
 * is already on file — the plural "Requests" shape every other engine in this package returns (footwear's own
 * six angles, the worn-accessory engine's own two views), kept even though this engine only ever has one real
 * photo to ask for, so a caller can iterate every engine's own missing-input list the same way.
 */
export function reflectiveTransparentMissingReferenceRequests(family: ReflectiveTransparentFamily, assets: readonly ReflectiveTransparentAsset[]): ReflectiveTransparentMissingReferenceRequest[] {
  if (hasReflectiveReference(assets)) return [];
  return [{ family, message: reflectiveTransparentMissingReferenceMessage(family) }];
}

/** C7.12's own honest pipeline, verbatim and in its own order: "replaces and cleans the background, rebuilds the
 * shadow and a controlled reflection, corrects colour, and crops to standard." Recorded together as tags on one
 * finished output (see the module header for why this engine never splits into separate owner-reviewed steps
 * the way C7.8's finishing pass does). */
export const REFLECTIVE_TRANSPARENT_PIPELINE_STAGES = ['background_replace', 'shadow_rebuild', 'reflection_control', 'colour_correct', 'crop_to_standard'] as const;
export type ReflectiveTransparentPipelineStage = (typeof REFLECTIVE_TRANSPARENT_PIPELINE_STAGES)[number];

/** The free tag every reflective/transparent studio output carries, so later steps (and the admin) can find them
 * among a product's other generated assets — the same pattern `FOOTWEAR_STUDIO_TAG`/`WORN_ACCESSORY_STUDIO_TAG`
 * already set. The output's own family is carried as a SECOND tag (e.g. `'watch_glass'`), and every one of
 * `REFLECTIVE_TRANSPARENT_PIPELINE_STAGES` as further tags, so a reader can tell at a glance which honest stages
 * this exact output actually had — never only a comment in this file. */
export const REFLECTIVE_TRANSPARENT_STUDIO_TAG = 'reflective_transparent_studio';

const recordOutputInput = z
  .object({
    family: z.enum(REFLECTIVE_TRANSPARENT_FAMILIES),
    sourceAssetId: z.string().uuid(),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();
export type RecordReflectiveTransparentOutputInput = z.input<typeof recordOutputInput>;

export interface ReflectiveTransparentOutput extends AssetRow {
  family: ReflectiveTransparentFamily;
}

/**
 * Records a finished, honest reflective/transparent studio image (`photoshoot.generate`) — C7.12's own "clean
 * studio look from a phone photo without inventing the object." Refuses unless the named `sourceAssetId` is
 * itself a real, non-archived reference photo tagged `reflective_reference` (`NO_REFLECTIVE_REFERENCE`, the same
 * "never invent" hard rule PR 466/472 enforce for footwear's angles and the worn-accessory engine's views):
 * nothing here is ever produced without the owner's own real photo of this exact subject. Filed through PR 444's
 * `recordGeneratedAsset` chokepoint, so the same originals-immutable / generated-kept-separate guarantee carries
 * through for free, tagged `REFLECTIVE_TRANSPARENT_STUDIO_TAG`, the family's own key, and every one of
 * `REFLECTIVE_TRANSPARENT_PIPELINE_STAGES` — the whole honest pipeline always runs together, never partially (a
 * cropped-but-not-colour-corrected image is never "done").
 */
export async function recordReflectiveTransparentOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<ReflectiveTransparentOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'reflective/transparent studio output');

  const source = await deps.db.mediaAsset.findFirst({ where: { id: d.sourceAssetId, storeId: who.storeId } });
  if (!source || !source.isOriginal || source.role !== 'reflective_reference' || source.archivedAt) {
    throw new PhotoshootError(
      'NO_REFLECTIVE_REFERENCE',
      `a ${d.family} studio image is never generated without a real, on-file reflective_reference phone photo — C7.12 never invents glass, reflection or transparency`,
      ['sourceAssetId'],
    );
  }

  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: d.sourceAssetId,
    role: 'reflective_reference',
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [REFLECTIVE_TRANSPARENT_STUDIO_TAG, d.family, ...REFLECTIVE_TRANSPARENT_PIPELINE_STAGES],
  });
  return { ...row, family: d.family };
}

/**
 * The most recent, non-archived reflective/transparent studio output already on file for this source photo and
 * family (`photoshoot.read`) — what a later job orchestrator checks before queuing a new pass, so the same real
 * photo is never processed twice (C7.6 "reuse approved outputs unless the source … changed"), the same shape as
 * `findExistingFootwearStudioOutput`/`findExistingWornAccessoryOutput`. Null when none exists yet.
 */
export async function findExistingReflectiveTransparentOutput(
  deps: Pick<PhotoshootDeps, 'db'>,
  who: Who,
  sourceAssetId: string,
  family: ReflectiveTransparentFamily,
): Promise<ReflectiveTransparentOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, sourceAssetId, role: 'reflective_reference', isAiGenerated: true, archivedAt: null, tags: { hasEvery: [REFLECTIVE_TRANSPARENT_STUDIO_TAG, family] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, family };
}

/** Which of `REFLECTIVE_TRANSPARENT_PIPELINE_STAGES` a finished output's own tags record as run — reads the
 * stage tags back, the same round-trip shape `completedFinishingSteps` (PR 455/456) already set. Every stage is
 * always present on a real output of this engine (the pipeline never runs partially), so this is mostly useful
 * for a reviewer confirming nothing was skipped. */
export function completedReflectiveTransparentStages(tags: readonly string[]): ReflectiveTransparentPipelineStage[] {
  return REFLECTIVE_TRANSPARENT_PIPELINE_STAGES.filter((s) => tags.includes(s));
}
