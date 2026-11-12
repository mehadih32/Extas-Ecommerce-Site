// S24 · PR 445 (Blueprint C7.16 "Model library screen", C7.21 "share … the model library") — the model library and
// its rights/consent records: `StudioModel` (a model in the library, owned by one store or shared with every store,
// A4.3/A4.8), `StudioModelAsset` (one of that model's own reference photos, per angle, reusing the shared Media
// library the same way PR 438's brand-asset library does — an ordinary `MediaAsset` filed under the private
// `photoshoot` folder, PR 445's addition to `PRIVATE_MEDIA_FOLDERS`, so a model's photo never shows as a product
// picture and a product photo never lands here) and `ModelConsent` (the rights/consent record for using that
// person's likeness — C7.6 "rights and consent records"). A model and its consent records are never deleted (CLAUDE.md
// rule 3): a model is archived/restored; a consent record, once granted, is an append-only legal record that is never
// edited or removed — its own `expiresAt` is how it stops being valid. Nothing here generates an image, costs
// anything or touches a product (that starts at PR 446).
import { z } from 'zod';
import { allow, checkStoreId, logChange, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';

/** The private folder a model's own reference photos and consent documents live in (`PRIVATE_MEDIA_FOLDERS`). */
export const MODEL_MEDIA_FOLDER = 'photoshoot';

/** Full-body human model, or a part-model (hands, feet, …) for accessories — C7.22 item 31 widens this later. */
export const MODEL_KINDS = ['full_body', 'part'] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

/** The angles a model's own reference photo set is built from (what the on-model generation pipeline draws on). */
export const MODEL_ANGLES = ['front', 'three_quarter', 'side', 'back', 'walking', 'seated'] as const;
export type ModelAngle = (typeof MODEL_ANGLES)[number];

const isModelKind = (v: unknown): v is ModelKind => typeof v === 'string' && (MODEL_KINDS as readonly string[]).includes(v);
const isModelAngle = (v: unknown): v is ModelAngle => typeof v === 'string' && (MODEL_ANGLES as readonly string[]).includes(v);

export interface ModelRow {
  id: string;
  storeId: number;
  name: string;
  gender: string | null;
  ageGroup: string | null;
  kind: ModelKind;
  heightCm: number | null;
  sizeWorn: string | null;
  categoryIds: string[];
  sharedWithAllStores: boolean;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface ModelAssetRow {
  id: string;
  modelId: string;
  assetId: string;
  angle: ModelAngle;
  createdAt: Date;
}

export interface ConsentRow {
  id: string;
  modelId: string;
  documentAssetId: string | null;
  scope: string;
  grantedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}

const toModelRow = (m: { id: string; storeId: number; name: string; gender: string | null; ageGroup: string | null; kind: string; heightCm: number | null; sizeWorn: string | null; categoryIds: string[]; sharedWithAllStores: boolean; archivedAt: Date | null; createdAt: Date }): ModelRow => ({ ...m, kind: m.kind as ModelKind });
const toAssetRow = (a: { id: string; modelId: string; assetId: string; angle: string; createdAt: Date }): ModelAssetRow => ({ ...a, angle: a.angle as ModelAngle });
const toConsentRow = (c: { id: string; modelId: string; documentAssetId: string | null; scope: string; grantedAt: Date; expiresAt: Date | null; createdAt: Date }): ConsentRow => c;

const modelInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    gender: z.string().trim().min(1).max(40).nullish(),
    ageGroup: z.string().trim().min(1).max(40).nullish(),
    kind: z.string().refine(isModelKind, 'unknown model kind'),
    heightCm: z.number().int().min(30).max(260).nullish(),
    sizeWorn: z.string().trim().min(1).max(40).nullish(),
    categoryIds: z.array(z.string().uuid()).max(100).default([]),
    sharedWithAllStores: z.boolean().default(false),
  })
  .strict();

/** Adds a model to the library (`photoshoot.write`). Audited. */
export async function createModel(deps: PhotoshootDeps, who: Who, input: unknown): Promise<ModelRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(modelInput, input, 'model');
  const row = await deps.db.studioModel.create({
    data: { storeId: who.storeId, name: d.name, gender: d.gender ?? null, ageGroup: d.ageGroup ?? null, kind: d.kind, heightCm: d.heightCm ?? null, sizeWorn: d.sizeWorn ?? null, categoryIds: d.categoryIds, sharedWithAllStores: d.sharedWithAllStores },
  });
  await logChange(deps.db, who, { action: 'photoshoot.model.create', entityType: 'StudioModel', entityId: row.id, before: null, after: { name: row.name, kind: row.kind } });
  return toModelRow(row);
}

const modelPatch = modelInput.partial();

/** Edits a model's own fields (`photoshoot.write`). Never touches its assets or consent records. Audited. */
export async function updateModel(deps: PhotoshootDeps, who: Who, id: string, input: unknown): Promise<ModelRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const before = await deps.db.studioModel.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such model in this store');
  const d = parse(modelPatch, input, 'model');
  const row = await deps.db.studioModel.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.gender !== undefined ? { gender: d.gender ?? null } : {}),
      ...(d.ageGroup !== undefined ? { ageGroup: d.ageGroup ?? null } : {}),
      ...(d.kind !== undefined ? { kind: d.kind } : {}),
      ...(d.heightCm !== undefined ? { heightCm: d.heightCm ?? null } : {}),
      ...(d.sizeWorn !== undefined ? { sizeWorn: d.sizeWorn ?? null } : {}),
      ...(d.categoryIds !== undefined ? { categoryIds: d.categoryIds } : {}),
      ...(d.sharedWithAllStores !== undefined ? { sharedWithAllStores: d.sharedWithAllStores } : {}),
    },
  });
  await logChange(deps.db, who, { action: 'photoshoot.model.update', entityType: 'StudioModel', entityId: row.id, before: { name: before.name, kind: before.kind }, after: { name: row.name, kind: row.kind } });
  return toModelRow(row);
}

/** Archives or restores a model (never deleted). Audited. */
export async function setModelArchived(deps: PhotoshootDeps, who: Who, id: string, archived: boolean): Promise<ModelRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const before = await deps.db.studioModel.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such model in this store');
  const row = await deps.db.studioModel.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  await logChange(deps.db, who, { action: archived ? 'photoshoot.model.archive' : 'photoshoot.model.restore', entityType: 'StudioModel', entityId: row.id, before: { archivedAt: before.archivedAt }, after: { archivedAt: row.archivedAt } });
  return toModelRow(row);
}

/** The store's own models plus every model shared with all stores (`photoshoot.read`): live first, newest first. */
export async function listModels(deps: Pick<PhotoshootDeps, 'db'>, who: Who): Promise<ModelRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.studioModel.findMany({
    where: { OR: [{ storeId: who.storeId }, { sharedWithAllStores: true }] },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  return rows.map(toModelRow);
}

const assetInput = z.object({ modelId: z.string().uuid(), assetId: z.string().uuid(), angle: z.string().refine(isModelAngle, 'unknown angle') }).strict();

/**
 * Attaches one of the model's own reference photos (`photoshoot.write`). The photo must already be a real,
 * original asset uploaded to this store's Media library (`/api/admin/media`, folder `photoshoot`) — this function
 * never uploads a file itself, only links an existing one. Several photos per angle are allowed (a reshoot keeps
 * the old one on file rather than overwriting it).
 */
export async function addModelAsset(deps: PhotoshootDeps, who: Who, input: unknown): Promise<ModelAssetRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(assetInput, input, 'model asset');
  const model = await deps.db.studioModel.findFirst({ where: { id: d.modelId, storeId: who.storeId } });
  if (!model) throw new PhotoshootError('NOT_FOUND', 'no such model in this store', ['modelId']);
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId } });
  if (!asset) throw new PhotoshootError('SOURCE_INVALID', 'no such file in this store', ['assetId']);
  if (!asset.isOriginal) throw new PhotoshootError('SOURCE_INVALID', 'a model reference photo must be a real, original upload — never a generated one', ['assetId']);
  const row = await deps.db.studioModelAsset.create({ data: { storeId: who.storeId, modelId: d.modelId, assetId: d.assetId, angle: d.angle } });
  await logChange(deps.db, who, { action: 'photoshoot.model.addAsset', entityType: 'StudioModelAsset', entityId: row.id, before: null, after: { modelId: d.modelId, angle: d.angle } });
  return toAssetRow(row);
}

/** Unlinks a reference photo from a model (the file itself stays in the Media library — never deleted). Audited. */
export async function removeModelAsset(deps: PhotoshootDeps, who: Who, id: string): Promise<void> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const before = await deps.db.studioModelAsset.findFirst({ where: { id, storeId: who.storeId } });
  if (!before) throw new PhotoshootError('NOT_FOUND', 'no such model asset in this store');
  await deps.db.studioModelAsset.delete({ where: { id } });
  await logChange(deps.db, who, { action: 'photoshoot.model.removeAsset', entityType: 'StudioModelAsset', entityId: id, before: { modelId: before.modelId, angle: before.angle }, after: null });
}

/** A model's own reference photos (`photoshoot.read`), newest first. */
export async function listModelAssets(deps: Pick<PhotoshootDeps, 'db'>, who: Who, modelId: string): Promise<ModelAssetRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.studioModelAsset.findMany({ where: { modelId, storeId: who.storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toAssetRow);
}

const consentInput = z
  .object({
    modelId: z.string().uuid(),
    documentAssetId: z.string().uuid().nullish(),
    scope: z.string().trim().min(1).max(200),
    grantedAt: z.coerce.date(),
    expiresAt: z.coerce.date().nullish(),
  })
  .strict()
  .refine((d) => d.grantedAt.getTime() <= Date.now(), { message: 'grantedAt cannot be in the future', path: ['grantedAt'] })
  .refine((d) => !d.expiresAt || d.expiresAt.getTime() > d.grantedAt.getTime(), { message: 'expiresAt must be after grantedAt', path: ['expiresAt'] });

/**
 * Records a model's rights/consent (`photoshoot.write`) — C7.6 "rights and consent records". Append-only: once
 * granted, a consent record is a legal record and is never edited or removed; its own `expiresAt` is how it stops
 * being valid. A later renewal is a new record, not a change to this one.
 */
export async function recordConsent(deps: PhotoshootDeps, who: Who, input: unknown): Promise<ConsentRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(consentInput, input, 'consent');
  const model = await deps.db.studioModel.findFirst({ where: { id: d.modelId, storeId: who.storeId } });
  if (!model) throw new PhotoshootError('NOT_FOUND', 'no such model in this store', ['modelId']);
  if (d.documentAssetId) {
    const doc = await deps.db.mediaAsset.findFirst({ where: { id: d.documentAssetId, storeId: who.storeId } });
    if (!doc) throw new PhotoshootError('SOURCE_INVALID', 'no such consent document in this store', ['documentAssetId']);
  }
  const row = await deps.db.modelConsent.create({
    data: { storeId: who.storeId, modelId: d.modelId, documentAssetId: d.documentAssetId ?? null, scope: d.scope, grantedAt: d.grantedAt, expiresAt: d.expiresAt ?? null },
  });
  await logChange(deps.db, who, { action: 'photoshoot.model.recordConsent', entityType: 'ModelConsent', entityId: row.id, before: null, after: { modelId: d.modelId, scope: d.scope, expiresAt: row.expiresAt } });
  return toConsentRow(row);
}

/** A model's consent records (`photoshoot.read`), newest grant first. */
export async function listConsents(deps: Pick<PhotoshootDeps, 'db'>, who: Who, modelId: string): Promise<ConsentRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.modelConsent.findMany({ where: { modelId, storeId: who.storeId }, orderBy: { grantedAt: 'desc' } });
  return rows.map(toConsentRow);
}

/** Whether the model has an unexpired consent record right now — the gate PR 446's generation jobs must check. */
export function hasValidConsent(consents: readonly { expiresAt: Date | null }[], now: Date = new Date()): boolean {
  return consents.some((c) => !c.expiresAt || c.expiresAt.getTime() > now.getTime());
}
