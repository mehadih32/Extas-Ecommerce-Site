// S24 · PR 479 (Blueprint C7.13 "Unisex / couple shots", C7.22 item 36) — the unisex/couple composition engine.
//
// C7.13 verbatim: "Some sets are unisex, and one frame showing a male and a female model both wearing the set says
// it instantly. Built as: generate each model separately on their own profile, then compose them into one scene
// with matched lighting, scale, ground plane and shadow. Composing two separately-generated people is far more
// reliable than asking a model to generate two people at once, and each person's garment stays accurate."
//
// The blueprint's own method is the whole point: this module never generates a model wearing anything itself —
// it composes TWO renders a single-model engine already produced (the baseline on-model try-on, `setTryOnStudio.ts`
// for a two-garment set, or any other S24 engine that puts a garment on a model), exactly the way `comboGiftSetStudio.ts`
// composes several already-produced PRODUCT photos into one staged frame rather than photographing a combo itself.
// `COUPLE_COMPOSITION_MEMBERS` below is deliberately `male`/`female`, C7.13's own two named models, never a wider
// "any two people" vocabulary this blueprint paragraph does not ask for.
//
// The traceability problem this module has to solve, investigated before writing anything (the same discipline
// PR 467/477 already followed): PR 444's own `recordGeneratedAsset` chokepoint only ever accepts a `sourceAssetId`
// that is itself a real, original photo ("a generated image must trace back to a real one, never to another AI
// image — C7.5") — but C7.13's own method feeds this engine TWO ALREADY-GENERATED renders, neither of them an
// original. `finishing.ts`'s own `recordFinishingStepOutput` (PR 454) already solved exactly this shape for its own
// single-input case: it never passes the generated candidate's own id to `recordGeneratedAsset`, it passes
// `candidate.sourceAssetId` — the real original that generated row ALREADY traces back to, the same chain PR 444's
// own invariant guarantees exists. This module does the same, transitively, off the male member's own render (the
// lead member, the same "first-named member is the anchor" choice `comboGiftSetStudio.ts`'s own lead piece and
// `setTryOnStudio.ts`'s own top component already made): `recordCoupleCompositionOutput` reads the male member's
// own row, confirms it is itself a real, non-archived, already-generated photo with a real `sourceAssetId`
// (`finishing.ts`'s own exact check, "finishing only ever runs on a generated image, never a real original" —
// applied here the other way: this engine only ever runs on two ALREADY generated images), then files the new
// composed row through `recordGeneratedAsset` against THAT real original — never against the male render itself,
// which would fail PR 444's own `SOURCE_INVALID` check, and never a second, parallel chokepoint invented here.
//
// Deliberately NOT verifying the two members actually show the exact same garment or set: `MediaAsset` carries no
// link back to which product (or which `StudioModel`) a generated render was produced from — that fact lives only
// in the caller's own job record, never in this table (the same "pure, fed by the caller's own facts" limit every
// other engine's own `plan*` function in this package already accepts, e.g. `SetTryOnComponentAsset.role`,
// `ComboGiftSetPieceCandidate.hasLinkedPhoto`) — an admin screen that already has both renders open side by side,
// and already knows which is the male render and which is the female one, is trusted for the pairing; a later job
// orchestrator may add a stronger check once one exists (no caller exists yet, the same honest gap every other
// S24 engine's own first PR leaves, e.g. PR 474/475/476).
//
// "Matched lighting, scale, ground plane and shadow" (C7.13 verbatim) names the actual COMPOSITING WORK a real
// image-generation call still has to do — nothing this module can enforce without a provider call (no provider
// adapter calls this module yet, the same honest gap every other S24 engine's own first PR leaves). Keeping the
// checklist itself as a plain, fixed, exported list (`COUPLE_COMPOSITION_MATCH_DIMENSIONS`) — never a setting, a
// plain fact of the photograph the same way `SET_TRY_ON_ANGLES`/`DETAIL_FINDER_CHECKLIST` entries are — means a
// later review screen or job orchestrator can show/confirm each one by name without this module guessing their
// own UI.
//
// Deliberately NOT here: wiring any job orchestrator or provider adapter to actually call this module; a new AI
// Cost Book sub-job row (C7.20's own fixed list of seven is not widened, the same reasoning PR 473/475/476's own
// headers already give); the occasion-scene suggester (C7.13's own last paragraph, item 37, still unbuilt).
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** C7.13's own two named models, verbatim: "a male and a female model both wearing the set" — never more, never
 * fewer, and never a wider "any two people" vocabulary this blueprint paragraph does not ask for. */
export const COUPLE_COMPOSITION_MEMBERS = ['male', 'female'] as const;
export type CoupleCompositionMember = (typeof COUPLE_COMPOSITION_MEMBERS)[number];
export const isCoupleCompositionMember = (v: unknown): v is CoupleCompositionMember => typeof v === 'string' && (COUPLE_COMPOSITION_MEMBERS as readonly string[]).includes(v);

/** C7.13's own own compositing checklist, verbatim and in order: "matched lighting, scale, ground plane and
 * shadow." A plain, fixed fact of the photograph (like `SET_TRY_ON_ANGLES`), never a setting — nothing here is
 * enforced by this module itself (no provider call exists yet to actually match them); exported so a later review
 * screen or job orchestrator can show/confirm each one by its own name without this module guessing its UI. */
export const COUPLE_COMPOSITION_MATCH_DIMENSIONS = ['lighting', 'scale', 'ground_plane', 'shadow'] as const;
export type CoupleCompositionMatchDimension = (typeof COUPLE_COMPOSITION_MATCH_DIMENSIONS)[number];

// ---------------------------------------------------------------------------------------------------------------
// The "never invent" plan — pure, no database. The caller (an admin screen or job orchestrator that already knows
// whether each member's own on-model render has been produced yet) supplies the one fact this module needs per
// member; this module never queries the database itself for the plan, the same discipline every other engine's
// own `plan*` function in this package already follows.

export interface CoupleCompositionMemberCandidate {
  member: CoupleCompositionMember;
  /** Whether a real, already-generated, on-file render of this member wearing the garment/set already exists —
   * the caller's own fact, not derived here (C7.13's own method: "generate each model separately on their own
   * profile" FIRST, compose second). */
  hasRender: boolean;
}

export const COUPLE_COMPOSITION_MISSING_REASONS = ['NO_MALE_RENDER', 'NO_FEMALE_RENDER'] as const;
export type CoupleCompositionMissingReason = (typeof COUPLE_COMPOSITION_MISSING_REASONS)[number];

const MISSING_REASON_FOR: Record<CoupleCompositionMember, CoupleCompositionMissingReason> = {
  male: 'NO_MALE_RENDER',
  female: 'NO_FEMALE_RENDER',
};

export interface CoupleCompositionPlanItem {
  member: CoupleCompositionMember;
  ready: boolean;
  /** Set only when `ready` is false. */
  reason?: CoupleCompositionMissingReason;
}

/**
 * Which of the two members already has a real, already-generated render to compose from — pure, the same shape as
 * `planComboGiftSetComposition`/`planSetTryOnAngles`. Call this before queuing any job; `recordCoupleCompositionOutput`'s
 * own gate refuses exactly what this plan marks `ready: false`.
 */
export function planCoupleComposition(candidates: readonly CoupleCompositionMemberCandidate[]): CoupleCompositionPlanItem[] {
  return candidates.map((c) => (c.hasRender ? { member: c.member, ready: true } : { member: c.member, ready: false, reason: MISSING_REASON_FOR[c.member] }));
}

/** Just the members still missing a real render, off `planCoupleComposition`. */
export function missingCoupleCompositionMembers(candidates: readonly CoupleCompositionMemberCandidate[]): CoupleCompositionMember[] {
  return planCoupleComposition(candidates)
    .filter((p) => !p.ready)
    .map((p) => p.member);
}

export interface CoupleCompositionMissingMemberRequest {
  member: CoupleCompositionMember;
  message: string;
}

const MEMBER_LABEL: Record<CoupleCompositionMember, string> = { male: 'male model', female: 'female model' };

/** C7.13's own honesty rule ("the system says plainly … and asks" — C7.12's own phrase, generalised here the
 * same way `comboGiftSetMissingPieceMessage`/`setTryOnMissingAngleMessage` already generalise it), applied to one
 * missing couple-shot member. */
export function coupleCompositionMissingMemberMessage(member: CoupleCompositionMember): string {
  return `There is no real, already-generated ${MEMBER_LABEL[member]} render on file yet — produce it first before a couple shot can be composed from it. It is never invented.`;
}

/**
 * Pure, no database: every wanted member that still has no real render on file, paired with the plain ask above —
 * recomputed fresh from the caller's own candidates every time, the same "part of the normal upload flow, not an
 * error" shape every other engine's own `missing*Requests` function already sets.
 */
export function coupleCompositionMissingMemberRequests(candidates: readonly CoupleCompositionMemberCandidate[]): CoupleCompositionMissingMemberRequest[] {
  return missingCoupleCompositionMembers(candidates).map((member) => ({ member, message: coupleCompositionMissingMemberMessage(member) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Recording a finished composition.

/** The free tag every couple-composition studio output carries — the same pattern `COMBO_GIFT_SET_STUDIO_TAG`/
 * `SET_TRY_ON_STUDIO_TAG` already set. */
export const COUPLE_COMPOSITION_STUDIO_TAG = 'couple_composition_studio';

/** The stable tag one member carries on a finished composition's own row — `member` is always `male` or `female`,
 * never containing a colon, so this round-trips exactly through `coupleCompositionMembersFromTags` below (the
 * same shape `comboGiftSetPieceTag`/`setTryOnComponentTag` already set). */
export function coupleCompositionMemberTag(member: CoupleCompositionMember, renderAssetId: string): string {
  return `member:${member}:${renderAssetId}`;
}

/** Reads a finished composition's own two member renders straight back off its tags — `null` unless BOTH are
 * present, since a row this module itself ever writes always tags both. */
export function coupleCompositionMembersFromTags(tags: readonly string[]): { maleRenderAssetId: string; femaleRenderAssetId: string } | null {
  let maleRenderAssetId: string | undefined;
  let femaleRenderAssetId: string | undefined;
  for (const t of tags) {
    if (!t.startsWith('member:')) continue;
    const [, member, id] = t.split(':');
    if (member === 'male') maleRenderAssetId = id;
    else if (member === 'female') femaleRenderAssetId = id;
  }
  if (!maleRenderAssetId || !femaleRenderAssetId) return null;
  return { maleRenderAssetId, femaleRenderAssetId };
}

const recordOutputInput = z
  .object({
    maleRenderAssetId: z.string().uuid(),
    femaleRenderAssetId: z.string().uuid(),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((d) => d.maleRenderAssetId !== d.femaleRenderAssetId, { message: 'the male and the female render must be two different photos', path: ['femaleRenderAssetId'] });
export type RecordCoupleCompositionOutputInput = z.input<typeof recordOutputInput>;

export interface CoupleCompositionOutput extends AssetRow {
  maleRenderAssetId: string;
  femaleRenderAssetId: string;
}

/** True only for a real, non-archived render this engine may compose from — already AI-generated (C7.13's own
 * method: compose from an ALREADY-generated render, never a flat-lay reference), and itself tracing back to a
 * real original (PR 444's own invariant, re-checked here the same way `finishing.ts`'s own gate already does). */
function isReadyMemberRender(asset: { isAiGenerated: boolean; archivedAt: Date | null; sourceAssetId: string | null } | null): asset is { isAiGenerated: true; archivedAt: null; sourceAssetId: string } {
  return !!asset && asset.isAiGenerated && !asset.archivedAt && !!asset.sourceAssetId;
}

/**
 * Records a finished couple-shot composition (`photoshoot.generate`) — C7.13's own "one frame showing a male and
 * a female model both wearing the set." Refuses (`NO_COUPLE_MEMBER_REFERENCE`, naming every bad member — `male`,
 * `female`, or both) unless BOTH the named renders are real, non-archived, already-generated photos already on
 * file in this store, each itself tracing back to a real original (never invents either half of the couple shot,
 * and never composes from a flat-lay reference that was never actually rendered on a model). Filed through PR
 * 444's `recordGeneratedAsset` chokepoint against the real original the MALE member's own render traces back to
 * (the lead member, the same single-source limit `comboGiftSetStudio.ts`/`setTryOnStudio.ts` already document),
 * under the new `couple_composition` role, tagged `COUPLE_COMPOSITION_STUDIO_TAG` and both members' own
 * `coupleCompositionMemberTag`.
 */
export async function recordCoupleCompositionOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<CoupleCompositionOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'couple composition output');

  const [maleAsset, femaleAsset] = await Promise.all([
    deps.db.mediaAsset.findFirst({ where: { id: d.maleRenderAssetId, storeId: who.storeId } }),
    deps.db.mediaAsset.findFirst({ where: { id: d.femaleRenderAssetId, storeId: who.storeId } }),
  ]);

  const bad: CoupleCompositionMember[] = [];
  if (!isReadyMemberRender(maleAsset)) bad.push('male');
  if (!isReadyMemberRender(femaleAsset)) bad.push('female');
  if (bad.length) {
    throw new PhotoshootError(
      'NO_COUPLE_MEMBER_REFERENCE',
      'a couple-shot composition is never generated without a real, on-file, non-archived, already-generated render for both the male and the female member — C7.13 never invents one half of a couple shot',
      bad,
    );
  }

  const row = await recordGeneratedAsset(deps, who, {
    // isReadyMemberRender already guarantees maleAsset.sourceAssetId is a real, non-null id.
    sourceAssetId: maleAsset!.sourceAssetId!,
    role: 'couple_composition',
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [COUPLE_COMPOSITION_STUDIO_TAG, coupleCompositionMemberTag('male', d.maleRenderAssetId), coupleCompositionMemberTag('female', d.femaleRenderAssetId)],
  });
  return { ...row, maleRenderAssetId: d.maleRenderAssetId, femaleRenderAssetId: d.femaleRenderAssetId };
}

/**
 * The most recent, non-archived couple composition already on file for exactly this pair of member renders
 * (`photoshoot.read`) — what a later job orchestrator checks before queuing a new composition, so the same couple
 * shot is never paid for twice (C7.6 "reuse approved outputs unless the source … changed"), the same shape as
 * `findExistingComboGiftSetOutput`/`findExistingSetTryOnOutput`. Null when none exists yet.
 */
export async function findExistingCoupleCompositionOutput(deps: Pick<PhotoshootDeps, 'db'>, who: Who, maleRenderAssetId: string, femaleRenderAssetId: string): Promise<CoupleCompositionOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const tags = [COUPLE_COMPOSITION_STUDIO_TAG, coupleCompositionMemberTag('male', maleRenderAssetId), coupleCompositionMemberTag('female', femaleRenderAssetId)];
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, role: 'couple_composition', isAiGenerated: true, archivedAt: null, tags: { hasEvery: tags } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, maleRenderAssetId, femaleRenderAssetId };
}
