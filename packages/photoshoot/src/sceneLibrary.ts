// S24 · PR 476 (Blueprint C7.13 "Scene library", C7.22 item 33). C7.13's own paragraph, verbatim: "Beyond the
// plain studio background, a small set of approved backgrounds — studio grey, street, festive, winter — chosen
// per campaign. One garment set can then be re-rendered into a seasonal scene without a new shoot." And C7.13's
// own occasion-scene paragraph, on how a scene actually joins the library: "Approved scenes are saved to the
// scene library and reused, so the catalogue stays consistent within a season."
//
// Scope, reasoned narrowly the same way PR 475's own header reasoned item 32's: item 33 sits between two other
// C7.22 items PR 475's own header already named as out of its own scope, and this module builds exactly the
// shared catalogue those items will draw from — nothing more:
//  - the occasion-scene suggester (item 37, PR 480, still unbuilt: "offers three scene options with small
//    previews … a demo frame is always shown before the full set is generated … Approved scenes are saved to the
//    scene library and reused") will CALL `recordSceneLibraryEntry` below once the owner approves a demo frame
//    for a suggested occasion — this PR builds the library entry it will call into, never the suggester itself;
//  - every S24 render engine (the combo/gift-set studio, PR 475, and whichever job orchestrator one day applies a
//    saved scene to a NEW garment set) will READ `findLatestSceneLibraryEntry`/`listSceneLibrary` below once such
//    wiring exists — not built here either, the same honest "no caller yet" gap PR 474/475 left for their own
//    switches (`kidsModelEnabled`/`comboGiftSetEnabled`).
//
// No migration (CLAUDE.md: the Prisma schema is a single-owner shared file) — an approved scene is recorded as an
// ordinary `MediaAsset` row, filed through PR 444's own `recordGeneratedAsset` chokepoint and read back off its
// tags, the exact "tag-encoded metadata on a chokepoint-filed row" discipline `reflectiveTransparentStudio.ts`
// and `comboGiftSetStudio.ts` already use — never a new table. A4.3's own sentence, "the Studio asset, model and
// scene libraries, which a store may use or keep private," is already a real column on `MediaAsset`
// (`sharedWithAllStores`, migrated for PR 445's own model library and already read by `models.ts`'s own
// `listModels`) — this module is simply the first to read/write that same column for a `MediaAsset`-backed
// library rather than a `StudioModel` one, so the scene library's own sharing rule costs no new schema at all.
//
// "Never invent" generalised once more (C7.6/C7.12's own rule, after `NO_BACK_REFERENCE`, `NO_FOOTWEAR_REFERENCE`,
// `NO_WORN_ACCESSORY_REFERENCE`, `NO_REFLECTIVE_REFERENCE` and `NO_PIECE_REFERENCE`): a scene is never "saved to
// the library" on the strength of a description alone. It may only be saved once a real demo frame has actually
// been rendered from a real, on-file, non-archived, original photo — the same "a real on-file photo, not a
// description" discipline every other engine's own gate enforces, generalised here from one product's own photo
// to one scene's own demo. `recordGeneratedAsset`'s own chokepoint already refuses a missing or generated source
// (`SOURCE_INVALID`) but — like `reflectiveTransparentStudio.ts`/`comboGiftSetStudio.ts` before it — does NOT by
// itself refuse an ARCHIVED source, so this module checks that itself and refuses with its own code
// (`NO_SCENE_REFERENCE`), the same shape those two modules' own pre-checks already use.
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** C7.13's own four named backgrounds, verbatim — the base catalogue every store starts with, before the owner
 * has ever approved a single custom occasion scene. Kept as fixed vocabulary, the same reasoning
 * `REFLECTIVE_TRANSPARENT_FAMILIES`/`COMBO_GIFT_SET_LAYOUTS` already give: a plain fact about the catalogue of
 * backgrounds the studio offers, never a price or a policy the owner would ever be asked a number for. */
export const SCENE_LIBRARY_PRESETS = ['studio_grey', 'street', 'festive', 'winter'] as const;
export type SceneLibraryPreset = (typeof SCENE_LIBRARY_PRESETS)[number];
export const isSceneLibraryPreset = (v: unknown): v is SceneLibraryPreset => typeof v === 'string' && (SCENE_LIBRARY_PRESETS as readonly string[]).includes(v);

/** A custom scene key the occasion suggester (PR 480, still unbuilt) will mint for a seasonal/occasion scene it
 * has suggested (C7.13's own examples: "Winter morning," "Eid evening," "Match day," "Summer") once the owner
 * approves its own demo frame. Deliberately permissive — lowercase ASCII letters, digits and underscores, 1–60
 * characters, starting with a letter — so this PR never has to guess PR 480's own naming scheme; it only has to
 * keep every key safe to tag and to split back out of a tag (no colon, the separator `sceneLibrarySceneTag` uses
 * below, the same reasoning `comboGiftSetPieceTag`'s own UUID-only pieces already relied on). */
const CUSTOM_SCENE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,59}$/;

/** Every real scene key this library ever accepts: one of the four named presets, or a well-formed custom slug. */
export const isSceneLibraryKey = (v: unknown): v is string => typeof v === 'string' && (isSceneLibraryPreset(v) || CUSTOM_SCENE_KEY_PATTERN.test(v));

// ---------------------------------------------------------------------------------------------------------------
// The "never invent" plan — pure, no database. The caller (an admin screen that has already rendered and shown a
// demo frame for one scene) knows, from its own query, whether a real approved demo is already on file for that
// scene; this module stays pure and never queries the database itself for the plan, the same discipline every
// other engine's own `plan*` function in this package already follows.

export interface SceneLibraryCandidate {
  sceneKey: string;
  /** Whether a real, on-file demo frame for this scene has already been approved — the caller's own fact, not
   * derived here. */
  hasApprovedDemo: boolean;
}

export const SCENE_LIBRARY_MISSING_REASONS = ['NO_SCENE_DEMO'] as const;
export type SceneLibraryMissingReason = (typeof SCENE_LIBRARY_MISSING_REASONS)[number];

export interface SceneLibraryPlanItem {
  sceneKey: string;
  ready: boolean;
  /** Set only when `ready` is false. */
  reason?: SceneLibraryMissingReason;
}

/**
 * Whether one scene already has a real, on-file approved demo to save (or reuse) — pure, the same shape as
 * `planFootwearAngles`/`planWornAccessoryViews`/`planReflectiveTransparentOutput`/`planComboGiftSetComposition`.
 * Call this before saving any scene; `recordSceneLibraryEntry`'s own gate refuses exactly what this plan marks
 * `ready: false`.
 */
export function planSceneLibraryEntry(candidate: SceneLibraryCandidate): SceneLibraryPlanItem {
  return candidate.hasApprovedDemo ? { sceneKey: candidate.sceneKey, ready: true } : { sceneKey: candidate.sceneKey, ready: false, reason: 'NO_SCENE_DEMO' };
}

/** Just the scenes still missing a real, approved demo, off `planSceneLibraryEntry`, in order. */
export function missingSceneLibraryEntries(candidates: readonly SceneLibraryCandidate[]): string[] {
  return candidates.filter((c) => !planSceneLibraryEntry(c).ready).map((c) => c.sceneKey);
}

export interface SceneLibraryMissingDemoRequest {
  sceneKey: string;
  message: string;
}

/** C7.13's own "a demo frame is always shown before the full set is generated" sentence, turned into the plain
 * ask every other engine's own `missing*Message` function already gives — the same "never invent" words. */
export function sceneLibraryMissingDemoMessage(sceneKey: string): string {
  return `Scene "${sceneKey}" has no real, approved demo frame on file yet — show a demo and get the owner's approval before it can be saved to the scene library. It is never invented.`;
}

/**
 * Pure, no database: one request per scene still missing its approved demo, the plural "Requests" shape every
 * other engine's own `missing*Requests` function already returns.
 */
export function sceneLibraryMissingDemoRequests(candidates: readonly SceneLibraryCandidate[]): SceneLibraryMissingDemoRequest[] {
  return missingSceneLibraryEntries(candidates).map((sceneKey) => ({ sceneKey, message: sceneLibraryMissingDemoMessage(sceneKey) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Recording an approved scene.

/** The free tag every scene-library entry carries — the same pattern `REFLECTIVE_TRANSPARENT_STUDIO_TAG`/
 * `COMBO_GIFT_SET_STUDIO_TAG`/`WORN_ACCESSORY_STUDIO_TAG`/`FOOTWEAR_STUDIO_TAG` already set. */
export const SCENE_LIBRARY_TAG = 'scene_library';

/** The stable tag one entry carries its own scene key on — `sceneKey` is restricted to lowercase letters, digits
 * and underscores (never a colon), so this round-trips exactly through `sceneLibraryKeyFromTags` below, the same
 * shape `comboGiftSetPieceTag`/`comboGiftSetPiecesFromTags` already set. */
export function sceneLibrarySceneTag(sceneKey: string): string {
  return `scene:${sceneKey}`;
}

/** Reads one entry's own scene key straight back off its tags — `null` when no `scene:` tag is present (never a
 * real entry this module itself recorded). Ignores every unrelated tag (the library tag itself). */
export function sceneLibraryKeyFromTags(tags: readonly string[]): string | null {
  const tag = tags.find((t) => t.startsWith('scene:'));
  return tag ? tag.slice('scene:'.length) : null;
}

const recordInput = z
  .object({
    sceneKey: z.string().refine(isSceneLibraryKey, 'unknown or malformed scene key'),
    sourceAssetId: z.string().uuid(),
    /** A4.3: "the Studio … scene libraries, which a store may use or keep private." Off by default — a newly
     * approved scene starts private to the store that approved it, the owner's own explicit choice to widen it. */
    sharedWithAllStores: z.boolean().default(false),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();
export type RecordSceneLibraryEntryInput = z.input<typeof recordInput>;

export interface SceneLibraryEntry extends AssetRow {
  sceneKey: string;
  sharedWithAllStores: boolean;
}

/**
 * Records a newly approved scene (`photoshoot.generate`) — C7.13's own "approved scenes are saved to the scene
 * library and reused." Refuses (`NO_SCENE_REFERENCE`) unless the named `sourceAssetId` is itself a real,
 * non-archived, original photo on file in this store — the same "never invent" hard rule `NO_BACK_REFERENCE`/
 * `NO_FOOTWEAR_REFERENCE`/`NO_WORN_ACCESSORY_REFERENCE`/`NO_REFLECTIVE_REFERENCE`/`NO_PIECE_REFERENCE` already
 * enforce for their own engines: a scene is only ever "approved" once a real demo has actually been rendered from
 * a real photo, never on the strength of a description alone. Filed through PR 444's own `recordGeneratedAsset`
 * chokepoint, tagged `SCENE_LIBRARY_TAG` and the scene's own `sceneLibrarySceneTag`; `sharedWithAllStores` is then
 * set on the new row exactly as asked (A4.3), never on the real source photo.
 */
export async function recordSceneLibraryEntry(deps: PhotoshootDeps, who: Who, input: unknown): Promise<SceneLibraryEntry> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordInput, input, 'scene library entry');

  const source = await deps.db.mediaAsset.findFirst({ where: { id: d.sourceAssetId, storeId: who.storeId } });
  if (!source || !source.isOriginal || source.archivedAt) {
    throw new PhotoshootError(
      'NO_SCENE_REFERENCE',
      'a scene is never saved to the library without a real, on-file, non-archived photo it was actually demoed from — C7.13 never invents an approval',
      ['sourceAssetId'],
    );
  }

  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: d.sourceAssetId,
    role: 'scene_library_demo',
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [SCENE_LIBRARY_TAG, sceneLibrarySceneTag(d.sceneKey)],
  });

  if (d.sharedWithAllStores) {
    await deps.db.mediaAsset.update({ where: { id: row.id }, data: { sharedWithAllStores: true } });
  }

  return { ...row, sceneKey: d.sceneKey, sharedWithAllStores: d.sharedWithAllStores };
}

function toSceneEntry(row: { id: string; storeId: number; isOriginal: boolean; role: string | null; isAiGenerated: boolean; sourceAssetId: string | null; archivedAt: Date | null; tags: string[]; sharedWithAllStores: boolean }): SceneLibraryEntry | null {
  const sceneKey = sceneLibraryKeyFromTags(row.tags);
  if (!sceneKey) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, sceneKey, sharedWithAllStores: row.sharedWithAllStores };
}

/**
 * The most recently approved, non-archived scene-library entry on file for this exact scene key (`photoshoot.read`)
 * — what a later job orchestrator would look up before re-rendering a NEW garment set into a saved scene (C7.13's
 * own "re-rendered into a seasonal scene without a new shoot"), the same reuse shape as
 * `findExistingFootwearStudioOutput`/`findExistingWornAccessoryOutput`/`findExistingReflectiveTransparentOutput`/
 * `findExistingComboGiftSetOutput`. Scoped like `models.ts`'s own `listModels` (A4.3): the store's own entries plus
 * every entry any store has shared with all stores. Null when no scene has been approved under this key yet.
 */
export async function findLatestSceneLibraryEntry(deps: Pick<PhotoshootDeps, 'db'>, who: Who, sceneKey: string): Promise<SceneLibraryEntry | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.mediaAsset.findFirst({
    where: { OR: [{ storeId: who.storeId }, { sharedWithAllStores: true }], role: 'scene_library_demo', isAiGenerated: true, archivedAt: null, tags: { hasEvery: [SCENE_LIBRARY_TAG, sceneLibrarySceneTag(sceneKey)] } },
    orderBy: { createdAt: 'desc' },
  });
  return row ? toSceneEntry(row) : null;
}

/**
 * The scene library's own catalogue (`photoshoot.read`): the store's own approved scenes plus every scene any
 * store has shared with all stores (A4.3, the same sharing shape `models.ts`'s own `listModels` already set for
 * the model library), one entry per scene key — the most recently approved one, so "the catalogue stays
 * consistent within a season" (C7.13) even after a scene has been re-approved with a new demo. Newest scenes
 * first.
 */
export async function listSceneLibrary(deps: Pick<PhotoshootDeps, 'db'>, who: Who): Promise<SceneLibraryEntry[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.mediaAsset.findMany({
    where: { OR: [{ storeId: who.storeId }, { sharedWithAllStores: true }], role: 'scene_library_demo', isAiGenerated: true, archivedAt: null, tags: { has: SCENE_LIBRARY_TAG } },
    orderBy: { createdAt: 'desc' },
  });
  const seen = new Set<string>();
  const out: SceneLibraryEntry[] = [];
  for (const row of rows) {
    const entry = toSceneEntry(row);
    if (!entry || seen.has(entry.sceneKey)) continue;
    seen.add(entry.sceneKey);
    out.push(entry);
  }
  return out;
}
