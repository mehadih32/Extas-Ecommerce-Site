// S24 · PR 471 (Blueprint C7.12, C7.22 item 28) — the worn-accessory engine, part 1: caps, sunglasses, watches and
// carried bags. C7.12's own recipe-table row for each of these four families names TWO engines together, never
// one rigid choice: "Caps | on-head + product-only", "Sunglasses | on-face + product-only", "Watches | on-wrist +
// product-only", "Bags | product-only + carried on model" — a worn/on-body shot (on a head, a face, a wrist, or
// carried) AND a flat/folded/standing product-only shot, for every one of the four. This module is that shared
// shape, reusing the hand/wrist/face part-model library `models.ts`'s own `kind: 'part'` already set aside for
// exactly this (C7.12: "Hand / wrist / face part-models — for watches, rings, sunglasses and wallets … treated
// exactly like a model profile") and PR 454's own detail re-projection mechanism for the branded-goods rule below.
//
// Two views, never six named angles: unlike footwear's own six distinct angles (PR 465/466, each a different
// camera position with nothing to derive one from another), C7.12's own angle COUNT for these four families (4
// for caps/sunglasses, 5 for watches/bags) exactly matches each family's own DETAIL POINT count in its recipe row
// — the number names how many close-up details the family has, not a separate set of named camera positions, so
// forcing it into a footwear-shaped six-angle planner would invent a shape C7.12 never asked for (the same
// "angleCount kept as its own descriptive text, never forced into one shape" discipline `recipes.ts`'s own
// `CategoryRecipeDef` already set). Those detail points are wired into Detail Finder's existing, generic
// machinery below instead (`detailRegions.ts`'s own `cap`/`sunglasses`/`watch`/`bag` entries) — the same "don't
// rebuild, point at the real thing" choice PR 465 already made for footwear's own four detail points. What THIS
// module owns is the two real engines C7.12 actually names for the family as a whole: `worn` (on a head, a face,
// a wrist, or carried) and `flat` (laid flat, folded or standing, product-only) — each needing its own real,
// on-file reference photo before anything is generated from it, the same C7.12 "never invent" hard rule PR 446
// and PR 465/466 already enforce for their own engines. `flat`'s own reference reuses `front_reference` (the same
// role a plain product-only flat-lay already carries); `worn` is the one genuinely new reference role this
// engine needs (`roles.ts`'s own new `worn_reference`).
//
// Detail fidelity on branded goods (C7.12, verbatim): "For watches, sunglasses and bags, the brand name and dial
// text are exactly what the customer studies. Detail re-projection is mandatory for these families — the real
// logo and text are composited back from the owner's photograph, never left to the model." Caps are deliberately
// NOT named in that sentence, so `WORN_ACCESSORY_MANDATORY_REPROJECTION_FAMILIES` below holds exactly the three
// the blueprint names, never all four — Part 2 (PR 472) is where this plan becomes a real gate on recording an
// output, reusing PR 454's own `DetailRegion`/`approveDetailRegion` machinery rather than inventing a parallel one.
//
// Part 1's own honest scope (this PR): the family and view vocabulary, the one new reference role, the "never
// invent" view planner (mirroring `planFootwearAngles`'s own shape, PR 465), the mandatory-reprojection family
// list (data only — the gate itself is Part 2), and each family's own Detail Finder checklist wiring. Deliberately
// NOT here (Part 2, PR 472): recording the finished studio image itself, the mandatory-reprojection gate actually
// enforced, and the plain-language "ask for the missing view" message C7.12 asks for.
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { recordGeneratedAsset, type AssetRow } from './assets';
import type { AssetRole } from './roles';

/** C7.12's own four worn-accessory families — the same keys `recipes.ts`'s own `CATEGORY_RECIPES` already names
 * (`caps`, `sunglasses`, `watches`, `bags`), reused here rather than re-spelled, so the two modules can never name
 * the same family two different ways. */
export const WORN_ACCESSORY_FAMILIES = ['caps', 'sunglasses', 'watches', 'bags'] as const;
export type WornAccessoryFamily = (typeof WORN_ACCESSORY_FAMILIES)[number];
export const isWornAccessoryFamily = (v: unknown): v is WornAccessoryFamily => typeof v === 'string' && (WORN_ACCESSORY_FAMILIES as readonly string[]).includes(v);

/** The two engines C7.12's own recipe-table row names together for every one of the four families — never a
 * single rigid choice. `worn` is C7.12's own "on-head"/"on-face"/"on-wrist"/"carried on model" column; `flat` is
 * its own "product-only" column (laid flat, folded or standing, depending on the family). */
export const WORN_ACCESSORY_VIEWS = ['worn', 'flat'] as const;
export type WornAccessoryView = (typeof WORN_ACCESSORY_VIEWS)[number];

const WORN_ACCESSORY_VIEW_ROLE: Record<WornAccessoryView, AssetRole> = {
  worn: 'worn_reference',
  flat: 'front_reference',
};

/** The real reference role a given view is filed under. `flat` reuses the same role a plain product-only
 * flat-lay already carries (the same "reuse where it already fits" choice PR 465 made for three of footwear's
 * own six angles); `worn` is this engine's own new role. */
export const wornAccessoryViewRole = (view: WornAccessoryView): AssetRole => WORN_ACCESSORY_VIEW_ROLE[view];

export interface WornAccessoryAsset {
  role: string | null;
  isOriginal: boolean;
  archivedAt?: Date | string | null;
}

/** The ad hoc "what's missing" reason per view — the same shape as `FootwearMissingAngleReason` (PR 465), never
 * the formal `PhotoshootErrorCode` union: this is a plan a caller reads, not a thrown refusal. */
export const WORN_ACCESSORY_MISSING_VIEW_REASONS = ['NO_WORN_REFERENCE', 'NO_FLAT_REFERENCE'] as const;
export type WornAccessoryMissingViewReason = (typeof WORN_ACCESSORY_MISSING_VIEW_REASONS)[number];

const WORN_ACCESSORY_VIEW_REASON: Record<WornAccessoryView, WornAccessoryMissingViewReason> = {
  worn: 'NO_WORN_REFERENCE',
  flat: 'NO_FLAT_REFERENCE',
};

export interface WornAccessoryViewPlanItem {
  view: WornAccessoryView;
  ready: boolean;
  /** Set only when `ready` is false — which exact reference photo is missing before this view can be produced. */
  reason?: WornAccessoryMissingViewReason;
}

/**
 * Which of the wanted worn-accessory views the engine can produce from a product's real, on-file reference
 * photos — pure, no database, the same shape as `planFootwearAngles` (PR 465). Each view needs its OWN real,
 * non-archived reference asset (C7.12's hard rule: never invent the worn shot from the flat one, or the flat shot
 * from the worn one — they are different photographs of the same real item). Call this before queuing any job;
 * Part 2's own recorder refuses exactly what this plan marks `ready: false`.
 */
export function planWornAccessoryViews(assets: readonly WornAccessoryAsset[], wanted: readonly WornAccessoryView[] = WORN_ACCESSORY_VIEWS): WornAccessoryViewPlanItem[] {
  const hasRole = (role: AssetRole) => assets.some((a) => a.isOriginal && a.role === role && !a.archivedAt);
  return wanted.map((view) => {
    const role = wornAccessoryViewRole(view);
    return hasRole(role) ? { view, ready: true } : { view, ready: false, reason: WORN_ACCESSORY_VIEW_REASON[view] };
  });
}

/** Just the views still missing a real reference photo, off `planWornAccessoryViews` — Part 2's own "ask for the
 * missing view" message is built from this. */
export function missingWornAccessoryViews(assets: readonly WornAccessoryAsset[], wanted: readonly WornAccessoryView[] = WORN_ACCESSORY_VIEWS): WornAccessoryView[] {
  return planWornAccessoryViews(assets, wanted)
    .filter((p) => !p.ready)
    .map((p) => p.view);
}

/** C7.12's own "mandatory for these families" sentence, verbatim: "For watches, sunglasses and bags, the brand
 * name and dial text are exactly what the customer studies. Detail re-projection is mandatory for these
 * families." Caps are deliberately left out — the blueprint names only these three. Data only in Part 1; Part 2
 * (PR 472) is where this list actually gates `recordWornAccessoryOutput`. */
export const WORN_ACCESSORY_MANDATORY_REPROJECTION_FAMILIES = ['sunglasses', 'watches', 'bags'] as const satisfies readonly WornAccessoryFamily[];

/** True only for one of the three families C7.12's own sentence names — never caps. */
export const wornAccessoryRequiresDetailReprojection = (family: WornAccessoryFamily): boolean =>
  (WORN_ACCESSORY_MANDATORY_REPROJECTION_FAMILIES as readonly WornAccessoryFamily[]).includes(family);

// ---------------------------------------------------------------------------------------------------------------
// S24 · PR 472 (Blueprint C7.12, C7.22 item 29) — the worn-accessory engine, part 2: the three pieces Part 1
// (PR 471) left out on purpose — recording the finished per-view studio image itself, the mandatory detail
// re-projection gate actually enforced (not just named as data), and C7.12's own plain-language "ask for the
// missing view."

/** The free tag every worn-accessory studio output carries, so later steps (and the admin) can find them among a
 * product's other generated assets — the same pattern `FOOTWEAR_STUDIO_TAG` already set. The output's own family
 * is carried as a SECOND tag (`d.family`, e.g. `'watches'`) rather than folded into this one constant, so a
 * watch's `worn` output is never confused with a bag's by a reader filtering on this tag alone. */
export const WORN_ACCESSORY_STUDIO_TAG = 'worn_accessory_studio';

const recordOutputInput = z
  .object({
    family: z.enum(WORN_ACCESSORY_FAMILIES),
    view: z.enum(WORN_ACCESSORY_VIEWS),
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
export type RecordWornAccessoryOutputInput = z.input<typeof recordOutputInput>;

export interface WornAccessoryOutput extends AssetRow {
  family: WornAccessoryFamily;
  view: WornAccessoryView;
}

/**
 * Records a finished worn-accessory studio render (`photoshoot.generate`) — C7.12's own worn/flat shot for one of
 * the four families. Refuses unless the named `sourceAssetId` is itself a real, non-archived reference photo
 * tagged with THIS exact view's own role (`NO_WORN_ACCESSORY_REFERENCE`, the same "never invent" hard rule PR 466
 * enforces for every footwear angle) — nothing here is ever produced from the other view's photo. For
 * `sunglasses`/`watches`/`bags` (Part 1's own `wornAccessoryRequiresDetailReprojection`), ALSO refuses unless an
 * approved `DetailRegion` (PR 454) already exists on that exact source reference photo
 * (`DETAIL_REPROJECTION_REQUIRED`) — C7.12's own "mandatory for these families" sentence actually enforced as a
 * gate here, never left as a comment; caps pass with no such gate, since the blueprint names only the other
 * three. Filed through PR 444's `recordGeneratedAsset` chokepoint, tagged `WORN_ACCESSORY_STUDIO_TAG` plus the
 * family's own key.
 */
export async function recordWornAccessoryOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<WornAccessoryOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'worn-accessory studio output');

  const source = await deps.db.mediaAsset.findFirst({ where: { id: d.sourceAssetId, storeId: who.storeId } });
  const wantRole = wornAccessoryViewRole(d.view);
  if (!source || !source.isOriginal || source.role !== wantRole || source.archivedAt) {
    throw new PhotoshootError('NO_WORN_ACCESSORY_REFERENCE', `a ${d.family} ${d.view} studio image is never generated without a real, on-file ${wantRole} reference`, ['sourceAssetId']);
  }

  if (wornAccessoryRequiresDetailReprojection(d.family)) {
    const approvedRegion = await deps.db.detailRegion.findFirst({ where: { assetId: d.sourceAssetId, storeId: who.storeId, approved: true } });
    if (!approvedRegion) {
      throw new PhotoshootError(
        'DETAIL_REPROJECTION_REQUIRED',
        `C7.12 makes detail re-projection mandatory for ${d.family} — approve a logo/text detail region on this reference photo (PR 454) before a studio image is recorded from it`,
        ['sourceAssetId'],
      );
    }
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
    tags: [WORN_ACCESSORY_STUDIO_TAG, d.family],
  });
  return { ...row, family: d.family, view: d.view };
}

/**
 * The most recent, non-archived worn-accessory studio output already on file for this source photo, family and
 * view (`photoshoot.read`) — what a later job orchestrator checks before queuing a new render, so the same
 * reference photo is never paid for twice (C7.6 "reuse approved outputs unless the source … changed"), the same
 * shape as `findExistingFootwearStudioOutput` (PR 466). Null when none exists yet.
 */
export async function findExistingWornAccessoryOutput(deps: Pick<PhotoshootDeps, 'db'>, who: Who, sourceAssetId: string, family: WornAccessoryFamily, view: WornAccessoryView): Promise<WornAccessoryOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, sourceAssetId, role: wornAccessoryViewRole(view), isAiGenerated: true, archivedAt: null, tags: { hasEvery: [WORN_ACCESSORY_STUDIO_TAG, family] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, family, view };
}

/** A plain label for each family, for the "ask for the missing view" message below — never the raw plural
 * recipe key. */
const WORN_ACCESSORY_FAMILY_LABEL: Record<WornAccessoryFamily, string> = {
  caps: 'cap',
  sunglasses: 'sunglasses',
  watches: 'watch',
  bags: 'bag',
};

/** A plain label for each view — never the raw snake_case role. */
const WORN_ACCESSORY_VIEW_LABEL: Record<WornAccessoryView, string> = {
  worn: 'worn',
  flat: 'flat, laid-out',
};

export interface WornAccessoryMissingViewRequest {
  view: WornAccessoryView;
  /** C7.12's own plain words: "the system says plainly when it does not [have enough reference] and asks for
   * the missing angle rather than inventing it" — the same sentence applied here one level up, to a missing
   * VIEW rather than a missing angle. */
  message: string;
}

/** C7.12's own honest ask, built straight from the family and view names — never a separate label table to keep
 * in step with `WORN_ACCESSORY_FAMILY_LABEL`/`WORN_ACCESSORY_VIEW_LABEL` by hand. The same shape as
 * `footwearMissingAngleMessage` (PR 466). */
export function wornAccessoryMissingViewMessage(family: WornAccessoryFamily, view: WornAccessoryView): string {
  const familyLabel = WORN_ACCESSORY_FAMILY_LABEL[family];
  const viewLabel = WORN_ACCESSORY_VIEW_LABEL[view];
  return `There is no real ${viewLabel} photo of this ${familyLabel} yet — please add one ${viewLabel} photo before the worn-accessory studio can produce that view.`;
}

/**
 * Pure, no database: every wanted view that still has no real reference photo on file for this family, paired
 * with C7.12's own ask — recomputed fresh from the real references on file every time, the same "part of the
 * normal upload flow, not an error" shape `footwearMissingAngleRequests` (PR 466) already set.
 */
export function wornAccessoryMissingViewRequests(family: WornAccessoryFamily, assets: readonly WornAccessoryAsset[], wanted: readonly WornAccessoryView[] = WORN_ACCESSORY_VIEWS): WornAccessoryMissingViewRequest[] {
  return missingWornAccessoryViews(assets, wanted).map((view) => ({ view, message: wornAccessoryMissingViewMessage(family, view) }));
}
