// S24 · PR 447 (Blueprint C7.5 steps 2, 3, 5, 6; Virtual Photoshoot Studio) — garment prep and standardisation:
// auto-orient/denoise/white-balance, the precise cut-out of the garment from its background, the standard canvas
// and colour verification against the ERP colour. The actual pixel work (orient, resize to the store's own ratio,
// background fill) already lives in `@extas/media`'s general pipeline (PR 22) and is reused as is — nothing here
// duplicates it. What this module adds is the garment-specific layer that pipeline cannot know on its own:
//
//   - recording a cut-out/standardised result as its own generated row, through PR 444's `recordGeneratedAsset`
//     chokepoint (so it inherits the exact same originals-immutable guarantee every other engine does), tagged
//     for reuse (`garment_prep`);
//   - colour verification: how far a photo's measured colour sits from the garment's real, ERP-recorded colour
//     (C7.4's grey card / colour checker is what makes the measurement trustworthy in the first place) — a pure
//     distance function plus the store's own tolerance (`photoshoot.colourTolerance`, PR 447's setting, off/0 as
//     it ships per CN-018). C7.5 step 6 says drift is *flagged*, never a hard refusal: this never throws.
//
// No provider/algorithm is wired yet (that is the provider adapter, PR 449–452) — exactly PR 446's honest scope.
import { z } from 'zod';
import { allow, checkStoreId, parse, type PhotoshootDeps, type Who } from './context';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** The free tag a garment-prep (cut-out/standardised) output carries, so later steps can find and reuse it. */
export const GARMENT_PREP_TAG = 'garment_prep';

const hexInput = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, 'a 6-digit hex colour, e.g. #1A2B3C');

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses a 6-digit hex colour (`#` optional) into its RGB triple, or null when it is not one. */
export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Straight-line RGB distance (0 = identical, ~441.67 = black vs white) — simple, honest, no colour-space claims. */
export function colourDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export interface ColourDriftResult {
  /** The straight-line RGB distance between the two colours, rounded to one decimal place. */
  distance: number;
  /** The tolerance this was checked against (the store's `photoshoot.colourTolerance`, 0 = never flags). */
  tolerance: number;
  /** True only when `tolerance` is above 0 and the distance exceeds it — C7.5 step 6: flagged, never a refusal. */
  flagged: boolean;
}

/**
 * Pure: how far `measuredHex` (what the pipeline actually read off the photo, corrected against the grey card)
 * sits from `referenceHex` (the garment's real, ERP-recorded colour), and whether that is past the given
 * tolerance. No database, no setting lookup — `checkGarmentColour` below is the version that reads the store's
 * own tolerance; this one is for a caller that already has it (or wants to try several).
 */
export function colourDrift(measuredHex: string, referenceHex: string, tolerance: number): ColourDriftResult {
  const measured = hexToRgb(measuredHex);
  const reference = hexToRgb(referenceHex);
  if (!measured || !reference) throw new RangeError('colourDrift needs two 6-digit hex colours');
  const distance = Math.round(colourDistance(measured, reference) * 10) / 10;
  return { distance, tolerance, flagged: tolerance > 0 && distance > tolerance };
}

/**
 * `colourDrift`, reading the store's own `photoshoot.colourTolerance` (`photoshoot.read` — this only looks, it
 * never writes or refuses a photo). `measuredHex`/`referenceHex` must each be a 6-digit hex colour.
 */
export async function checkGarmentColour(deps: PhotoshootDeps, who: Who, measuredHex: unknown, referenceHex: unknown): Promise<ColourDriftResult> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const measured = parse(hexInput, measuredHex, 'measured colour');
  const reference = parse(hexInput, referenceHex, 'reference colour');
  // 0 (never flags) when no settings reader is wired, the same honest default the setting itself ships with.
  const tolerance = deps.settings ? await deps.settings.value('photoshoot.colourTolerance', { storeId: who.storeId }) : 0;
  return colourDrift(measured, reference, tolerance);
}

const recordOutputInput = z
  .object({
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
export type RecordGarmentPrepOutputInput = z.input<typeof recordOutputInput>;

/**
 * Records a cut-out/standardised garment photo (`photoshoot.generate`) — the clean, canvas-normalised version a
 * later step (ghost-mannequin, on-model) can be given instead of the raw original. Routes through PR 444's
 * `recordGeneratedAsset`, so every immutability/source guarantee carries over for free; filed under
 * `primary_garment` (it is still a photo *of* the garment, the same role the raw flat-lay carries) and tagged
 * `garment_prep` for reuse.
 */
export async function recordGarmentPrepOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<AssetRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'garment-prep output');
  return recordGeneratedAsset(deps, who, { ...d, role: 'primary_garment', tags: [GARMENT_PREP_TAG] });
}

/**
 * The most recent, non-archived garment-prep output already on file for this source photo (`photoshoot.read`) —
 * what a later job orchestrator checks before paying for a repeat cut-out/standardisation run (C7.6 "reuse
 * approved outputs unless the source … changed"). Null when none exists yet.
 */
export async function findExistingGarmentPrepOutput(deps: Pick<PhotoshootDeps, 'db'>, who: Who, sourceAssetId: string): Promise<AssetRow | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, sourceAssetId, role: 'primary_garment', isAiGenerated: true, archivedAt: null, tags: { has: GARMENT_PREP_TAG } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags };
}
