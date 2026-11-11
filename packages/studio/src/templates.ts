// S23 · PR 438 (Blueprint C5.2 "template-based assembly … not by generating footage") — the studio's own templates:
// the shape the video assembly engine (PR 439) will fill with a store's own photos, the brand frame and a
// royalty-free track. A template names its kind (an image post, a story, a reel or a short), its aspect ratio, and
// which brand assets (PR 438's own asset library, `assets.ts`) it uses by default — nothing here renders a video or
// spends anything; it only describes what one would look like. Templates are store-owned, versioned (bumped on every
// change so a render job can pin the exact shape it used), and never deleted: "archive" and "restore" only, the same
// as every other list in this package.
import { z } from 'zod';
import { BRAND_ASSET_FOLDER } from './assets';
import { allow, checkStoreId, holds, logChange, nowOf, parse, StudioError, type StudioDeps, type Who } from './context';

/** What a template is for (Blueprint C5.2: "reels, shorts, image posts" plus the Story format every platform shares). */
export const TEMPLATE_KINDS = ['image', 'story', 'reel', 'short'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Aspect ratios the four platforms actually accept for these kinds. */
export const TEMPLATE_ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const;
const ASPECT_RATIOS = TEMPLATE_ASPECT_RATIOS;

const nameOf = z.string().trim().min(1).max(80);
const uuid = z.uuid();
// hardcode-ok: a list-length guard on the spec, not a business number (CN-018 is about policy, not this kind of bound).
const BRAND_ASSETS_MAX = 10;
const NOTES_MAX = 500;

/**
 * What the render engine (PR 439) will read off a template. `durationSeconds` only means something for `reel`/`short`
 * and is left out of an `image`/`story` spec; `brandAssetIds` point at the asset library (`assets.ts`) — a logo, an
 * overlay frame, a royalty-free track — and are checked against it when the spec is saved, never trusted blind.
 */
export const templateSpecSchema = z
  .object({
    aspectRatio: z.enum(ASPECT_RATIOS),
    durationSeconds: z.number().int().min(1).max(90).optional(),
    brandAssetIds: z.array(uuid).max(BRAND_ASSETS_MAX).default([]),
    notes: z.string().trim().max(NOTES_MAX).optional(),
  })
  .strict();
export type TemplateSpec = z.infer<typeof templateSpecSchema>;

export const saveTemplateInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), kind: z.enum(TEMPLATE_KINDS), name: nameOf, spec: templateSpecSchema }).strict(),
  z.object({ action: z.literal('update'), id: uuid, name: nameOf, spec: templateSpecSchema, version: z.string().max(40).optional() }).strict(),
  z.object({ action: z.literal('archive'), id: uuid, archived: z.boolean(), version: z.string().max(40).optional() }).strict(),
]);

export interface StudioTemplateRow {
  id: string;
  kind: TemplateKind;
  name: string;
  spec: TemplateSpec;
  version: number;
  archived: boolean;
  updatedAt: string;
}

const rowOf = (t: { id: string; kind: string; name: string; spec: unknown; version: number; archivedAt: Date | null; updatedAt: Date }): StudioTemplateRow => ({
  id: t.id,
  kind: t.kind as TemplateKind,
  name: t.name,
  spec: t.spec as TemplateSpec,
  version: t.version,
  archived: t.archivedAt !== null,
  updatedAt: t.updatedAt.toISOString(),
});

/** Checks every `brandAssetIds` entry names a brand asset this store actually has (`assets.ts`'s own folder). */
async function checkBrandAssets(deps: Pick<StudioDeps, 'db'>, storeId: number, spec: TemplateSpec): Promise<void> {
  if (!spec.brandAssetIds.length) return;
  const found = await deps.db.mediaAsset.findMany({ where: { storeId, id: { in: spec.brandAssetIds }, folder: BRAND_ASSET_FOLDER }, select: { id: true } });
  const have = new Set(found.map((a) => a.id));
  const missing = spec.brandAssetIds.filter((id) => !have.has(id));
  if (missing.length) throw new StudioError('NOT_FOUND', 'a brand asset in this template is not in the library', missing);
}

/** The store's templates (`studio.read`), live first, then by kind and name. */
export async function studioTemplates(deps: StudioDeps, who: Who): Promise<{ rows: StudioTemplateRow[]; canWrite: boolean }> {
  await allow(deps, who, 'studio.read');
  const rows = await deps.db.studioTemplate.findMany({
    where: { storeId: who.storeId },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { kind: 'asc' }, { name: 'asc' }],
  });
  return { rows: rows.map(rowOf), canWrite: await holds(deps, who, 'studio.write') };
}

/** Adds, updates (bumps the version) or archives/restores a template (`studio.write`). Audited. */
export async function saveStudioTemplate(deps: StudioDeps, who: Who, input: unknown): Promise<StudioTemplateRow> {
  await allow(deps, who, 'studio.write');
  checkStoreId(who.storeId);
  const d = parse(saveTemplateInput, input, 'template');
  if (d.action === 'add') {
    await checkBrandAssets(deps, who.storeId, d.spec);
    const made = await deps.db.studioTemplate.create({ data: { storeId: who.storeId, kind: d.kind, name: d.name, spec: d.spec, version: 1 } });
    await logChange(deps.db, who, { action: 'studio.template.add', entityType: 'StudioTemplate', entityId: made.id, before: null, after: { kind: d.kind, name: d.name, spec: d.spec } });
    return rowOf(made);
  }
  const t = await deps.db.studioTemplate.findFirst({ where: { id: d.id, storeId: who.storeId } });
  if (!t) throw new StudioError('NOT_FOUND', 'no such template', ['id']);
  if (d.version !== undefined && d.version !== t.updatedAt.toISOString()) throw new StudioError('STALE', 'the template changed; read it again', ['version']);
  const before = rowOf(t);
  if (d.action === 'archive') {
    const after = await deps.db.studioTemplate.update({ where: { id: t.id }, data: { archivedAt: d.archived ? (t.archivedAt ?? nowOf(deps)) : null } });
    await logChange(deps.db, who, { action: 'studio.template.archive', entityType: 'StudioTemplate', entityId: t.id, before, after: rowOf(after) });
    return rowOf(after);
  }
  if (t.archivedAt) throw new StudioError('TEMPLATE_ARCHIVED', 'restore the template before changing it', ['id']);
  await checkBrandAssets(deps, who.storeId, d.spec);
  const after = await deps.db.studioTemplate.update({ where: { id: t.id }, data: { name: d.name, spec: d.spec, version: t.version + 1 } });
  await logChange(deps.db, who, { action: 'studio.template.update', entityType: 'StudioTemplate', entityId: t.id, before, after: rowOf(after) });
  return rowOf(after);
}
