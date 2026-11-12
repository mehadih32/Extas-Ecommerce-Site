// S24 · PR 475 (Blueprint C7.22 item 32) — the combo and gift-set composition studio. Unlike the paragraphs this
// stack's other engines are built from (C7.12's own named rules for reflective/transparent goods, PR 473, or the
// worn-accessory families, PR 471/472), this one line of C7.22's own PR list carries no further blueprint prose —
// so this module states its own reasoned scope, kept deliberately narrow and consistent with every rule the
// package already set.
//
// Genuinely different from `packages/combos`'s own `set-photo.ts` (PR 575, Blueprint D8.5): that module lays each
// piece's own RAW, as-uploaded product photo edge to edge (`photo-layout.ts`'s side-by-side / top+bottom /
// three-up) for the storefront's own combo page — a plain collage, never staged, and never touching the AI studio.
// This module instead composes ONE staged studio frame from each piece's own already-produced photo — which may
// itself be a real original or any other S24 engine's finished render (a ghost-mannequin shot, a product-only
// shot, a worn-accessory render …) — for marketing and gift-set presentation. The two modules solve different
// problems and deliberately keep their own, separate vocabulary (`COMBO_GIFT_SET_LAYOUTS` below is never
// `packages/combos`'s own `PhotoLayout`): a storefront combo's own set photo never needs staging, and a marketing
// gift-set composition never needs to be the exact photo the combo's own price/stock page shows.
//
// Also genuinely different from two later, still-unbuilt C7.22 items this one sits beside: item 33 (scene
// library, a shared background/lighting preset catalogue this module's own `scene` concept will draw from once
// built — out of this PR's scope, the same "not built yet" gap PR 469 left for Detail Finder wiring) and items
// 34–35 (set product type and two-garment ON-MODEL try-on — a different, single-model engine putting two
// garments on ONE model at once). This module never puts anything on a model: it only arranges each piece's own
// existing, flat/product-only image together in one frame, product-only like footwear or perfume rather than
// on-model like try-on.
//
// The C7.6/C7.12 "never invent" hard rule, applied to a GROUP: every named piece must already have its own real,
// on-file photo actually linked (`ProductMedia`) to that exact product in this store before it may join a
// composition — the same discipline `NO_BACK_REFERENCE`, `NO_FOOTWEAR_REFERENCE`, `NO_WORN_ACCESSORY_REFERENCE`
// and `NO_REFLECTIVE_REFERENCE` already enforce for their own single-product engines, generalised here to a set of
// products rather than a set of angles. PR 444's own `recordGeneratedAsset` chokepoint only ever traces a
// generated row back to ONE real source photo, so the composed row's own `sourceAssetId` is its lead piece's
// photo (the first piece in the list); every piece (including the lead one) is additionally recorded as its own
// `piece:<productId>:<sourceAssetId>` tag, so the full group is always readable back from the row without
// widening PR 444's own single-source model to a row this package has never needed before.
//
// Deliberately NOT here: wiring `studio.photoshoot.comboGiftSetEnabled` into `recordComboGiftSetOutput` itself as
// an enforced gate — the same honest gap PR 474 left for `kidsModelEnabled`/`kidsModelAllowed` (no job
// orchestrator calls this module yet, so there is nothing today for a settings gate to actually stop); any new
// sub-job row in the AI Cost Book (C7.20's own `PHOTOSHOOT_SUB_JOBS` is a fixed list of seven and this is not one
// of them, the same reasoning PR 473's own header already gives); and the scene-library field itself (item 33).
import { z } from 'zod';
import { allow, checkStoreId, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { recordGeneratedAsset, type AssetRow } from './assets';

/** C7.22 item 32's own two named outcomes. Data only — nothing in this module treats one differently from the
 * other; the distinction exists for the admin and the tag a finished output carries. */
export const COMBO_GIFT_SET_KINDS = ['combo', 'gift_set'] as const;
export type ComboGiftSetKind = (typeof COMBO_GIFT_SET_KINDS)[number];
export const isComboGiftSetKind = (v: unknown): v is ComboGiftSetKind => typeof v === 'string' && (COMBO_GIFT_SET_KINDS as readonly string[]).includes(v);

/** How the pieces are grouped in the one staged frame — this engine's own vocabulary (see the module header for
 * why it is deliberately not `packages/combos`'s own `PhotoLayout` names). */
export const COMBO_GIFT_SET_LAYOUTS = ['flat_lay_grouped', 'standing_grouped', 'boxed_gift'] as const;
export type ComboGiftSetLayout = (typeof COMBO_GIFT_SET_LAYOUTS)[number];
export const isComboGiftSetLayout = (v: unknown): v is ComboGiftSetLayout => typeof v === 'string' && (COMBO_GIFT_SET_LAYOUTS as readonly string[]).includes(v);

/** A combo or gift set is, by definition, more than one piece; six is this engine's own practical ceiling on how
 * much one frame can show legibly — both plain facts about the photograph, not a price or policy, so kept here
 * as fixed vocabulary the same way footwear's six named angles are (`recipes.ts`'s own "angleCount kept as its
 * own descriptive text" discipline, applied as a plain number here instead). */
export const MIN_COMBO_GIFT_SET_PIECES = 2;
export const MAX_COMBO_GIFT_SET_PIECES = 6;

export const isValidComboGiftSetPieceCount = (n: number): boolean => Number.isInteger(n) && n >= MIN_COMBO_GIFT_SET_PIECES && n <= MAX_COMBO_GIFT_SET_PIECES;

// ---------------------------------------------------------------------------------------------------------------
// The "never invent" plan — pure, no database. The caller (an admin screen building a combo/gift-set job) already
// knows, from its own product-media query, whether each candidate piece has any real, on-file, linked photo at
// all; this module stays pure and never queries the database itself for the plan, the same discipline every other
// engine's own `plan*` function in this package already follows.

export interface ComboGiftSetPieceCandidate {
  productId: string;
  /** Whether this product already has at least one real, non-archived photo on file and linked to it
   * (`ProductMedia`) — the caller's own fact, not derived here. */
  hasLinkedPhoto: boolean;
}

export const COMBO_GIFT_SET_MISSING_PIECE_REASONS = ['NO_PIECE_PHOTO'] as const;
export type ComboGiftSetMissingPieceReason = (typeof COMBO_GIFT_SET_MISSING_PIECE_REASONS)[number];

export interface ComboGiftSetPiecePlanItem {
  productId: string;
  ready: boolean;
  /** Set only when `ready` is false. */
  reason?: ComboGiftSetMissingPieceReason;
}

/**
 * Which of the wanted pieces already have a real, on-file photo to compose from — pure, the same shape as
 * `planFootwearAngles`/`planWornAccessoryViews`/`planReflectiveTransparentOutput`. Call this before queuing any
 * job; `recordComboGiftSetOutput`'s own gate refuses exactly what this plan marks `ready: false`.
 */
export function planComboGiftSetComposition(pieces: readonly ComboGiftSetPieceCandidate[]): ComboGiftSetPiecePlanItem[] {
  return pieces.map((p) => (p.hasLinkedPhoto ? { productId: p.productId, ready: true } : { productId: p.productId, ready: false, reason: 'NO_PIECE_PHOTO' }));
}

/** Just the pieces still missing a real, linked photo, off `planComboGiftSetComposition`. */
export function missingComboGiftSetPieces(pieces: readonly ComboGiftSetPieceCandidate[]): string[] {
  return planComboGiftSetComposition(pieces)
    .filter((p) => !p.ready)
    .map((p) => p.productId);
}

export interface ComboGiftSetMissingPieceRequest {
  productId: string;
  message: string;
}

/** C7.6's own "never invent" sentence, applied to one missing piece of a group — the same shape as
 * `footwearMissingAngleMessage`/`wornAccessoryMissingViewMessage`/`reflectiveTransparentMissingReferenceMessage`. */
export function comboGiftSetMissingPieceMessage(productId: string): string {
  return `Product ${productId} has no real, on-file photo linked to it yet — add one before it can join a combo or gift-set composition. It is never invented.`;
}

/**
 * Pure, no database: every wanted piece that still has no real, linked photo on file, paired with the plain ask
 * above — recomputed fresh from the caller's own candidates every time, the same "part of the normal upload flow,
 * not an error" shape the other engines' own `missing*Requests` functions already set.
 */
export function comboGiftSetMissingPieceRequests(pieces: readonly ComboGiftSetPieceCandidate[]): ComboGiftSetMissingPieceRequest[] {
  return missingComboGiftSetPieces(pieces).map((productId) => ({ productId, message: comboGiftSetMissingPieceMessage(productId) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Recording a finished composition.

/** The free tag every combo/gift-set studio output carries — the same pattern `FOOTWEAR_STUDIO_TAG`,
 * `WORN_ACCESSORY_STUDIO_TAG` and `REFLECTIVE_TRANSPARENT_STUDIO_TAG` already set. */
export const COMBO_GIFT_SET_STUDIO_TAG = 'combo_gift_set_studio';

/** The stable tag one piece carries on a finished composition's own row — `productId` and `sourceAssetId` are
 * both UUIDs (never containing a colon), so this round-trips exactly through `comboGiftSetPiecesFromTags` below. */
export function comboGiftSetPieceTag(piece: { productId: string; sourceAssetId: string }): string {
  return `piece:${piece.productId}:${piece.sourceAssetId}`;
}

/** Reads a finished composition's own pieces straight back off its tags, in the order they were tagged (Postgres
 * `text[]` keeps insertion order) — the same round-trip shape `completedReflectiveTransparentStages` already set,
 * useful for a reviewer confirming exactly which pieces one composed image actually shows without a second query.
 * Ignores every unrelated tag (the studio tag itself, the kind, the layout, the piece-count marker). */
export function comboGiftSetPiecesFromTags(tags: readonly string[]): { productId: string; sourceAssetId: string }[] {
  return tags
    .filter((t) => t.startsWith('piece:'))
    .map((t) => {
      const [, productId, sourceAssetId] = t.split(':');
      return { productId: productId!, sourceAssetId: sourceAssetId! };
    });
}

const pieceInput = z.object({ productId: z.string().uuid(), sourceAssetId: z.string().uuid() }).strict();

const recordOutputInput = z
  .object({
    kind: z.enum(COMBO_GIFT_SET_KINDS),
    layout: z.enum(COMBO_GIFT_SET_LAYOUTS),
    pieces: z
      .array(pieceInput)
      .min(MIN_COMBO_GIFT_SET_PIECES)
      .max(MAX_COMBO_GIFT_SET_PIECES)
      .refine((ps) => new Set(ps.map((p) => p.productId)).size === ps.length, 'each piece must be a different product')
      .refine((ps) => new Set(ps.map((p) => p.sourceAssetId)).size === ps.length, 'each piece must use its own photo'),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();
export type RecordComboGiftSetOutputInput = z.input<typeof recordOutputInput>;

export interface ComboGiftSetPiece {
  productId: string;
  sourceAssetId: string;
}

export interface ComboGiftSetOutput extends AssetRow {
  kind: ComboGiftSetKind;
  layout: ComboGiftSetLayout;
  pieces: ComboGiftSetPiece[];
}

/**
 * Records a finished combo/gift-set composition (`photoshoot.generate`). Refuses (`NO_PIECE_REFERENCE`, naming
 * every bad piece by its 1-based position) unless EVERY named piece's `sourceAssetId` is a real asset on file in
 * this store, not archived, and actually linked (`ProductMedia`, not archived) to that exact `productId` — C7.6's
 * own "never invent" rule generalised from one product's angles to a whole group's own pieces. Filed through PR
 * 444's `recordGeneratedAsset` chokepoint against the lead (first) piece's own photo, tagged
 * `COMBO_GIFT_SET_STUDIO_TAG`, the kind, the layout, a `piece_count:<n>` marker and every piece's own
 * `comboGiftSetPieceTag` — the whole group recorded on one row, never split across several.
 */
export async function recordComboGiftSetOutput(deps: PhotoshootDeps, who: Who, input: unknown): Promise<ComboGiftSetOutput> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordOutputInput, input, 'combo/gift-set composition output');

  const assetIds = d.pieces.map((p) => p.sourceAssetId);
  const [assets, links] = await Promise.all([
    deps.db.mediaAsset.findMany({ where: { id: { in: assetIds }, storeId: who.storeId } }),
    deps.db.productMedia.findMany({ where: { assetId: { in: assetIds }, productId: { in: d.pieces.map((p) => p.productId) }, storeId: who.storeId, archivedAt: null } }),
  ]);
  const badPieces: string[] = [];
  d.pieces.forEach((p, i) => {
    const asset = assets.find((a) => a.id === p.sourceAssetId);
    const linked = links.some((l) => l.assetId === p.sourceAssetId && l.productId === p.productId);
    if (!asset || asset.archivedAt || !linked) badPieces.push(String(i + 1));
  });
  if (badPieces.length) {
    throw new PhotoshootError(
      'NO_PIECE_REFERENCE',
      'every piece of a combo/gift-set composition needs its own real, on-file photo already linked to that exact product — C7.6 never invents a piece',
      badPieces,
    );
  }

  const lead = d.pieces[0]!;
  const row = await recordGeneratedAsset(deps, who, {
    sourceAssetId: lead.sourceAssetId,
    role: 'combo_gift_set_composition',
    storageKey: d.storageKey,
    storage: d.storage,
    mimeType: d.mimeType,
    bytes: d.bytes,
    checksumSha256: d.checksumSha256,
    width: d.width,
    height: d.height,
    tags: [COMBO_GIFT_SET_STUDIO_TAG, d.kind, d.layout, `piece_count:${d.pieces.length}`, ...d.pieces.map(comboGiftSetPieceTag)],
  });
  return { ...row, kind: d.kind, layout: d.layout, pieces: d.pieces };
}

/**
 * The most recent, non-archived combo/gift-set composition already on file for exactly this kind, layout and set
 * of pieces (`photoshoot.read`) — what a later job orchestrator checks before queuing a new render, so the same
 * group is never paid for twice (C7.6 "reuse approved outputs unless the source … changed"), the same shape as
 * `findExistingFootwearStudioOutput`/`findExistingWornAccessoryOutput`/`findExistingReflectiveTransparentOutput`.
 * The `piece_count` tag keeps a shorter group from ever matching a longer one that happens to share every named
 * piece as a subset. Null when none exists yet.
 */
export async function findExistingComboGiftSetOutput(
  deps: Pick<PhotoshootDeps, 'db'>,
  who: Who,
  kind: ComboGiftSetKind,
  layout: ComboGiftSetLayout,
  pieces: readonly ComboGiftSetPiece[],
): Promise<ComboGiftSetOutput | null> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const tags = [COMBO_GIFT_SET_STUDIO_TAG, kind, layout, `piece_count:${pieces.length}`, ...pieces.map(comboGiftSetPieceTag)];
  const row = await deps.db.mediaAsset.findFirst({
    where: { storeId: who.storeId, role: 'combo_gift_set_composition', isAiGenerated: true, archivedAt: null, tags: { hasEvery: tags } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return { id: row.id, storeId: row.storeId, isOriginal: row.isOriginal, role: row.role, isAiGenerated: row.isAiGenerated, sourceAssetId: row.sourceAssetId, archivedAt: row.archivedAt, tags: row.tags, kind, layout, pieces: comboGiftSetPiecesFromTags(row.tags) };
}
