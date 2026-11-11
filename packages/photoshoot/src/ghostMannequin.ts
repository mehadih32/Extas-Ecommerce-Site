// S24 · PR 446 (Blueprint C7.9, C7.6, C7.5 step 4) — the ghost-mannequin engine: the garment is photographed on a
// mannequin, the mannequin is removed, the inner neck and back are reconstructed, the shape is kept. "Its own
// engine, not an afterthought" (C7.9): clean and premium on its own (the default for boxers/underwear, C7.9's shot
// plan table) and "also the best input for the on-model step, so the pipeline produces it first and reuses it" —
// its front/back output is tagged with the same `front_reference`/`back_reference` roles a real photo carries
// (plus the free label `ghost_mannequin`), so the on-model engine (PR 449–452) can find and reuse it instead of
// re-deriving the same shape from the flat-lay every time.
//
// No provider adapter exists yet (PR 449–452 build FASHN + a second provider behind one interface) and no job
// table is wired yet (PR 451, 452) — this module only ever (a) plans which views a product's real references
// support, enforcing the C7.6 hard rule that a back view is never invented without a real back_reference on file,
// and (b) records a finished result a job runner hands it, through PR 444's `recordGeneratedAsset` chokepoint, so
// every later engine inherits the exact same originals-immutable / generated-kept-separate guarantee. It never
// calls an AI provider and never spends anything itself.
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { hasBackReference } from './roles';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** The two views the ghost-mannequin engine produces (C7.9: "ghost mannequin front and back"). */
export const GHOST_MANNEQUIN_VIEWS = ['front', 'back'] as const;
export type GhostMannequinView = (typeof GHOST_MANNEQUIN_VIEWS)[number];

/** The free tag every ghost-mannequin output carries, so later steps (and the admin) can find them. */
export const GHOST_MANNEQUIN_TAG = 'ghost_mannequin';

/** The real role a finished ghost-mannequin view is filed under — the same roles a real reference photo carries. */
export const ghostMannequinRole = (view: GhostMannequinView): 'front_reference' | 'back_reference' => (view === 'front' ? 'front_reference' : 'back_reference');

export interface GhostMannequinAsset {
  role: string | null;
  isOriginal: boolean;
  archivedAt?: Date | string | null;
}

export interface GhostMannequinPlanItem {
  view: GhostMannequinView;
  ready: boolean;
  /** Set only when `ready` is false — what is missing before this view can be produced. */
  reason?: 'NO_FRONT_REFERENCE' | 'NO_BACK_REFERENCE';
}

/**
 * Which of the wanted views the ghost-mannequin engine can produce from a product's real, on-file reference
 * assets — pure, no database. Front needs a real flat-lay (`primary_garment` or `front_reference`); back needs a
 * real, non-archived `back_reference` (C7.6's hard rule: never invent a back view from a front-only reference).
 * Call this before queuing any job — PR 451/452's orchestrator is the first caller once it exists.
 */
export function planGhostMannequinViews(assets: readonly GhostMannequinAsset[], wanted: readonly GhostMannequinView[] = GHOST_MANNEQUIN_VIEWS): GhostMannequinPlanItem[] {
  const live = (r: string) => assets.some((a) => a.isOriginal && a.role === r && !a.archivedAt);
  const hasFront = live('primary_garment') || live('front_reference');
  const hasBack = hasBackReference(assets);
  return wanted.map((view) => {
    if (view === 'front') return hasFront ? { view, ready: true } : { view, ready: false, reason: 'NO_FRONT_REFERENCE' };
    return hasBack ? { view, ready: true } : { view, ready: false, reason: 'NO_BACK_REFERENCE' };
  });
}

const recordOutputInput = z
  .object({
    sourceAssetId: z.string().uuid(),
    view: z.enum(GHOST_MANNEQUIN_VIEWS),
    /** Required for `view: 'back'` — the real, on-file back_reference this output is allowed to exist because of. */
    backReferenceAssetId: z.string().uuid().nullish(),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((d) => d.view !== 'back' || !!d.backReferenceAssetId, { message: 'a back view needs a real back_reference on file', path: ['backReferenceAssetId'] });
export type RecordGhostMannequinOutputInput = z.input<typeof recordOutputInput>;

export interface GhostMannequinOutput extends AssetRow {
  view: GhostMannequinView;
}

/**
 * Records a finished ghost-mannequin render (`photoshoot.generate`) as its own new `MediaAsset` row, through PR
 * 444's `recordGeneratedAsset` — so it inherits every originals-immutable / source-verified guarantee for free —
 * filed under the matching reference role and tagged `ghost_mannequin` for reuse (C7.9). For `view: 'back'`, the
 * named `backReferenceAssetId` must be a real, non-archived `back_reference` asset of this store, checked here:
 * this is where C7.6's hard rule actually bites for the first time — a job runner that skips this function and
 * calls `recordGeneratedAsset` directly could still write a back view with no real back reference, so every later
 * engine that generates a back view (PR 449+ on-model included) must route through a check like this one, not
 * assume the generic recorder already made it safe.
 */
export async function recordGhostMannequinOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<GhostMannequinOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'ghost-mannequin output');
  if (d.view === 'back') {
    const back = await deps.db.mediaAsset.findFirst({ where: { id: d.backReferenceAssetId!, storeId: who.storeId } });
    if (!back || !back.isOriginal || back.role !== 'back_reference' || back.archivedAt) {
      throw new PhotoshootError('NO_BACK_REFERENCE', 'a back view is never generated without a real, on-file back reference', ['backReferenceAssetId']);
    }
  }
  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: d.sourceAssetId,
    role: ghostMannequinRole(d.view),
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [GHOST_MANNEQUIN_TAG],
  });
  return { ...row, view: d.view };
}

/**
 * The most recent, non-archived ghost-mannequin output already on file for this source photo and view
 * (`photoshoot.read`) — what PR 451/452's job orchestrator checks before queuing a new render, so the same flat-lay
 * is never paid for twice (C7.6 "reuse approved outputs unless the source … changed", C7.9 "produces it first and
 * reuses it"). Null when none exists yet.
 */
export async function findExistingGhostMannequinOutput(deps: Pick<PhotoshootDeps, 'db'>, who: Who, sourceAssetId: string, view: GhostMannequinView): Promise<GhostMannequinOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, sourceAssetId, role: ghostMannequinRole(view), isAiGenerated: true, archivedAt: null, tags: { has: GHOST_MANNEQUIN_TAG } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, view };
}
