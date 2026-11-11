// S24 · PR 444 (Blueprint C7.5 step 1, C7.6) — the asset-model guarantees every later Studio PR builds on:
//   1. the original is kept forever, untouched — nothing here ever flips `isOriginal`, changes `sourceAssetId` or
//      `isAiGenerated` on an existing row, or deletes a row (CLAUDE.md rule 3: nothing is ever deleted);
//   2. a generated image is always a NEW `MediaAsset` row, linked back to the real photo it came from
//      (`sourceAssetId`), flagged `isAiGenerated: true`, and tagged with a role from the fixed C7.6 taxonomy —
//      never written over the original row.
// Tagging a reference role on an existing original (which real photo is the front, the back, the detail shot) is
// the one allowed update to an original row, and it only ever touches `role`/`altEn`/`altBn` — never the fields the
// immutability guarantee protects.
import { z } from 'zod';
import { isAssetRole, type AssetRole } from './roles';
import { allow, checkStoreId, logChange, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';

const IMMUTABLE_FIELDS = ['isOriginal', 'sourceAssetId', 'isAiGenerated', 'storageKey', 'checksumSha256'] as const;

export interface AssetRow {
  id: string;
  storeId: number;
  isOriginal: boolean;
  role: string | null;
  isAiGenerated: boolean;
  sourceAssetId: string | null;
  archivedAt: Date | null;
}

/** Refuses a patch that would touch any field the immutability guarantee protects (PR 444's whole point). */
export function assertNoProtectedFieldChange(patch: Record<string, unknown>): void {
  const touched = IMMUTABLE_FIELDS.filter((f) => f in patch);
  if (touched.length) throw new PhotoshootError('ORIGINAL_IMMUTABLE', 'an asset’s original, source, AI-generated or file fields can never be changed once set', touched);
}

const tagRoleInput = z
  .object({
    assetId: z.string().uuid(),
    role: z.string().refine(isAssetRole, 'unknown asset role'),
  })
  .strict();

/**
 * Tags which C7.6 role a real, already-uploaded photo plays (front / back / detail / …). The only write this
 * module ever makes to an existing original row; every other field stays exactly as the upload left it.
 */
export async function tagReferenceRole(deps: PhotoshootDeps, who: Who, input: unknown): Promise<AssetRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(tagRoleInput, input, 'role tag');
  const before = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such asset in this store');
  if (!before.isOriginal) throw new PhotoshootError('ORIGINAL_IMMUTABLE', 'only a real, original photo can carry a reference role — not a generated one');
  const row = await deps.db.mediaAsset.update({ where: { id: d.assetId }, data: { role: d.role } });
  await logChange(deps.db, who, { action: 'photoshoot.asset.tagRole', entityType: 'MediaAsset', entityId: row.id, before: { role: before.role }, after: { role: d.role } });
  return toRow(row);
}

export interface RecordGeneratedAssetInput {
  /** The real, original photo this generation is derived from (verified to exist, be an original, in this store). */
  sourceAssetId: string;
  role: AssetRole;
  storageKey: string;
  storage: 'LOCAL_DISK' | 'AZURE_BLOB' | 'S3_COMPATIBLE' | 'GOOGLE_DRIVE';
  mimeType: string;
  bytes: number;
  checksumSha256: string;
  width?: number;
  height?: number;
}

const recordInput = z
  .object({
    sourceAssetId: z.string().uuid(),
    role: z.string().refine(isAssetRole, 'unknown asset role'),
    storageKey: z.string().min(1),
    storage: z.enum(['LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE']),
    mimeType: z.string().min(1),
    bytes: z.number().int().min(0),
    checksumSha256: z.string().min(32),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
  })
  .strict();

/**
 * Stores a pipeline output (ghost mannequin, try-on, finishing, detail re-projection …) as its own row — always
 * `isOriginal: false`, `isAiGenerated: true`, pointing back at the real photo it came from. Refuses when the named
 * source is missing, belongs to another store, or is itself a generated image (an AI image must always trace back
 * to a real one, never to another AI image — C7.5).
 */
export async function recordGeneratedAsset(deps: PhotoshootDeps, who: Who, input: RecordGeneratedAssetInput): Promise<AssetRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.generate');
  const d = parse(recordInput, input, 'generated asset');
  const source = await deps.db.mediaAsset.findFirst({ where: { id: d.sourceAssetId, storeId: who.storeId } });
  if (!source) throw new PhotoshootError('SOURCE_INVALID', 'the source photo was not found in this store', ['sourceAssetId']);
  if (!source.isOriginal) throw new PhotoshootError('SOURCE_INVALID', 'a generated image must trace back to a real, original photo — never to another generated one', ['sourceAssetId']);
  const row = await deps.db.mediaAsset.create({
    data: {
      storeId: who.storeId,
      kind: 'IMAGE',
      storage: d.storage,
      storageKey: d.storageKey,
      mimeType: d.mimeType,
      bytes: BigInt(d.bytes),
      width: d.width ?? null,
      height: d.height ?? null,
      checksumSha256: d.checksumSha256,
      isOriginal: false,
      isAiGenerated: true,
      sourceAssetId: source.id,
      role: d.role,
      tags: [],
    },
  });
  await logChange(deps.db, who, { action: 'photoshoot.asset.recordGenerated', entityType: 'MediaAsset', entityId: row.id, before: null, after: { sourceAssetId: source.id, role: d.role } });
  return toRow(row);
}

function toRow(r: { id: string; storeId: number; isOriginal: boolean; role: string | null; isAiGenerated: boolean; sourceAssetId: string | null; archivedAt: Date | null }): AssetRow {
  return { id: r.id, storeId: r.storeId, isOriginal: r.isOriginal, role: r.role, isAiGenerated: r.isAiGenerated, sourceAssetId: r.sourceAssetId, archivedAt: r.archivedAt };
}

/** The role-tagged references on file for a set of assets, for PR 448's "what is missing" check. */
export async function listReferenceRoles(deps: Pick<PhotoshootDeps, 'db'>, who: Pick<Who, 'storeId'>, assetIds: readonly string[]): Promise<AssetRow[]> {
  if (!assetIds.length) return [];
  const rows = await deps.db.mediaAsset.findMany({ where: { id: { in: [...assetIds] }, storeId: who.storeId } });
  return rows.map(toRow);
}
