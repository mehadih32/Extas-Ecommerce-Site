// S24 · PR 457 (Blueprint C7.8, C7.16 — "Plus a small editor in the admin: crop, straighten, brightness and
// contrast, spot removal, and 'run finishing again'") — the in-admin image editor's own backend. `ImageEdit`
// (packages/db/prisma/schema.prisma) already exists for exactly this, `@append-only` — no migration here.
//
// An edit is recorded as one ordered list of operations (the schema's own `operations: Json`), in C7.8's own
// five-item order: crop, straighten, brightnessContrast, spotRemoval, runFinishingAgain. `crop` reuses PR 454's
// own normalised 0–1 `bboxSchema` (`detailRegions.ts`) rather than a second box shape.
//
// `runFinishingAgain` is a request, not a spend: it only ever marks that the owner asked for it — the same
// honest "not wired yet" scope every S24 PR before this one left for its own unbuilt engine. A later job runner
// reads it; PR 455–456's own `planFinishing`/`recordFinishingStepOutput` already do the real work once the edit
// produces its own result asset (a brand-new asset carries no finishing tags of its own, so the existing planner
// already says every one of the five finishing steps is needed again — nothing here special-cases a "re-run").
// `resultAssetId` stays null here, filled in later once a job runner has actually produced the edited pixels —
// the crop/rotate/brightness/spot-removal pixel engine itself is not built here either, matching PR 450/453/454/
// 455's own unbuilt-engine scope for their own pieces.
import { z } from 'zod';
import { allow, checkStoreId, logChange, parse, PhotoshootError, type PhotoshootDeps, type Who } from './context';
import { bboxSchema } from './detailRegions';

const point01 = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();

const cropOp = z.object({ kind: z.literal('crop'), box: bboxSchema }).strict();
const straightenOp = z.object({ kind: z.literal('straighten'), degrees: z.number().min(-45).max(45) }).strict();
const brightnessContrastOp = z
  .object({ kind: z.literal('brightnessContrast'), brightness: z.number().min(-100).max(100), contrast: z.number().min(-100).max(100) })
  .strict();
const spotRemovalOp = z.object({ kind: z.literal('spotRemoval'), points: z.array(point01).min(1).max(20) }).strict();
const runFinishingAgainOp = z.object({ kind: z.literal('runFinishingAgain') }).strict();

/** C7.8's own five editor operations, in the order the blueprint lists them. A data-model vocabulary, like the
 * asset roles and the finishing steps — never an owner setting. */
export const EDIT_OPERATION_KINDS = ['crop', 'straighten', 'brightnessContrast', 'spotRemoval', 'runFinishingAgain'] as const;
export type EditOperationKind = (typeof EDIT_OPERATION_KINDS)[number];

const editOperationSchema = z.discriminatedUnion('kind', [cropOp, straightenOp, brightnessContrastOp, spotRemovalOp, runFinishingAgainOp]);
export type EditOperation = z.infer<typeof editOperationSchema>;
export type CropOperation = z.infer<typeof cropOp>;
export type StraightenOperation = z.infer<typeof straightenOp>;
export type BrightnessContrastOperation = z.infer<typeof brightnessContrastOp>;
export type SpotRemovalOperation = z.infer<typeof spotRemovalOp>;

const recordInput = z
  .object({ sourceAssetId: z.string().uuid(), operations: z.array(editOperationSchema).min(1).max(20) })
  .strict();
export type RecordImageEditInput = z.input<typeof recordInput>;

export interface ImageEditRow {
  id: string;
  storeId: number;
  sourceAssetId: string;
  resultAssetId: string | null;
  operations: EditOperation[];
  editedById: string | null;
  createdAt: Date;
}

type ImageEditRecord = { id: string; storeId: number; sourceAssetId: string; resultAssetId: string | null; operations: unknown; editedById: string | null; createdAt: Date };
const toRow = (r: ImageEditRecord): ImageEditRow => ({ ...r, operations: r.operations as EditOperation[] });

/** True once an edit's own operations ask for C7.8's "run finishing again" — pure, no database. */
export const wantsFinishingRerun = (ops: readonly EditOperation[]): boolean => ops.some((o) => o.kind === 'runFinishingAgain');

/** Which operation kinds a submitted edit carries, in the order they were applied, plus whether it asked for a
 * finishing re-run — pure, no database. The editor's own "nothing picked yet" guard reads this; it never invents
 * a default operation. */
export function describeEdit(ops: readonly EditOperation[]): { kinds: EditOperationKind[]; finishingRerun: boolean } {
  return { kinds: ops.map((o) => o.kind), finishingRerun: wantsFinishingRerun(ops) };
}

/**
 * Records one editing session over an image (`photoshoot.write`): crop, straighten, brightness/contrast, spot
 * removal and/or "run finishing again", in the order the owner applied them. Refuses an asset that is not this
 * store's own or is archived. `runFinishingAgain` only ever makes sense on an image the pipeline itself produced
 * (C7.8's finishing pass never touches a real original) — refused on anything else. Append-only:
 * `resultAssetId` stays null until a later job runner has actually produced the edited pixels.
 */
export async function recordImageEdit(deps: PhotoshootDeps, who: Who, input: unknown): Promise<ImageEditRow> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.write');
  const d = parse(recordInput, input, 'image edit');
  const asset = await deps.db.mediaAsset.findFirst({ where: { id: d.sourceAssetId, storeId: who.storeId } });
  if (!asset) throw new PhotoshootError('SOURCE_INVALID', 'the image was not found in this store', ['sourceAssetId']);
  if (asset.archivedAt) throw new PhotoshootError('SOURCE_INVALID', 'an archived image cannot be edited', ['sourceAssetId']);
  if (wantsFinishingRerun(d.operations) && !asset.isAiGenerated) {
    throw new PhotoshootError('SOURCE_INVALID', '"run finishing again" only applies to a generated image, never a real original', ['operations']);
  }
  const row = await deps.db.imageEdit.create({
    data: { storeId: who.storeId, sourceAssetId: d.sourceAssetId, operations: d.operations, editedById: who.actor.staffUserId ?? null },
  });
  await logChange(deps.db, who, {
    action: 'photoshoot.imageEdit.record',
    entityType: 'ImageEdit',
    entityId: row.id,
    before: null,
    after: { sourceAssetId: d.sourceAssetId, kinds: d.operations.map((o) => o.kind) },
  });
  return toRow(row);
}

/** Every edit on file for an image (`photoshoot.read`), most recent first — the editor's own history list. */
export async function listImageEdits(deps: Pick<PhotoshootDeps, 'db'>, who: Who, sourceAssetId: string): Promise<ImageEditRow[]> {
  checkStoreId(who.storeId);
  await allow(deps, who, 'photoshoot.read');
  const rows = await deps.db.imageEdit.findMany({ where: { sourceAssetId, storeId: who.storeId }, orderBy: { createdAt: 'desc' } });
  return rows.map(toRow);
}
