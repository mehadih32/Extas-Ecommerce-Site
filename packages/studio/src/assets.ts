// S23 · PR 438 (Blueprint C5.4 "a module of its own because it carries an asset library") — the studio's brand
// asset library: the shop's own logo, overlay/brand frame, price card, intro/outro and royalty-free track, each one
// an ordinary `MediaAsset` (the library every other module shares, `@extas/media`) filed under the `studio` folder.
// Follow-up 504 already keeps a private folder's files out of every product picker (`PRIVATE_MEDIA_FOLDERS`); this
// PR adds `studio` to that list, so a brand asset never turns up as a product photo and a product photo never turns
// up here. Uploading a file still goes through the shared Media library (`media.upload`) with `folder: 'studio'` —
// this package does not re-implement image checks, storage or renditions — but naming what a file *is* for the
// studio (its `kind`: logo, overlay frame, intro, outro, track) and listing/archiving it as a brand asset is gated
// on `studio.read`/`studio.write` first, on top of whatever Media permission the underlying call also needs
// (documented on each function below; defense in depth, same as `attachToProduct`'s own product + media checks).
import { archiveMedia, restoreMedia, type MediaDeps, type MediaSummary } from '@extas/media';
import { z } from 'zod';
import { allow, logChange, parse, StudioError, type StudioDeps, type Who } from './context';

/** The private folder every brand asset lives in (kept out of product/content pickers — `PRIVATE_MEDIA_FOLDERS`). */
export const BRAND_ASSET_FOLDER = 'studio';

/** What a brand asset is for. A file can carry at most one of these (the rest of its tags are left alone). */
export const BRAND_ASSET_KINDS = ['logo', 'overlay', 'frame', 'intro', 'outro', 'track'] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

const KIND_SET: ReadonlySet<string> = new Set(BRAND_ASSET_KINDS);

export const setBrandAssetKindInput = z
  .object({ assetId: z.uuid(), kind: z.enum(BRAND_ASSET_KINDS).nullable() })
  .strict();

export interface StudioAssetRow {
  id: string;
  kind: BrandAssetKind | null;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  name: string | null;
  tags: string[];
  archived: boolean;
  createdAt: string;
}

const rowOf = (a: { id: string; mimeType: string; bytes: bigint; width: number | null; height: number | null; originalFileName: string | null; tags: string[]; archivedAt: Date | null; createdAt: Date }): StudioAssetRow => ({
  id: a.id,
  kind: (BRAND_ASSET_KINDS as readonly string[]).find((k) => a.tags.includes(k)) as BrandAssetKind | undefined ?? null,
  mimeType: a.mimeType,
  bytes: Number(a.bytes),
  width: a.width,
  height: a.height,
  name: a.originalFileName,
  tags: a.tags.filter((t) => !KIND_SET.has(t)),
  archived: a.archivedAt !== null,
  createdAt: a.createdAt.toISOString(),
});

/** The store's brand assets (`studio.read`): live first, by kind, newest first. */
export async function studioBrandAssets(deps: StudioDeps, who: Who): Promise<StudioAssetRow[]> {
  await allow(deps, who, 'studio.read');
  const rows = await deps.db.mediaAsset.findMany({
    where: { storeId: who.storeId, folder: BRAND_ASSET_FOLDER },
    orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  return rows.map(rowOf);
}

/** Names what a brand asset is for (`studio.write`). Any other tag on the file is left as it was. Audited. */
export async function setBrandAssetKind(deps: StudioDeps, who: Who, input: unknown): Promise<StudioAssetRow> {
  await allow(deps, who, 'studio.write');
  const d = parse(setBrandAssetKindInput, input, 'asset');
  const a = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId, folder: BRAND_ASSET_FOLDER } });
  if (!a) throw new StudioError('NOT_FOUND', 'no such brand asset in this store', ['assetId']);
  const before = rowOf(a);
  const tags = [...a.tags.filter((t) => !KIND_SET.has(t)), ...(d.kind ? [d.kind] : [])];
  const after = await deps.db.mediaAsset.update({ where: { id: a.id }, data: { tags } });
  await logChange(deps.db, who, { action: 'studio.asset.kind', entityType: 'MediaAsset', entityId: a.id, before: { kind: before.kind }, after: { kind: d.kind } });
  return rowOf(after);
}

/**
 * Archives or restores a brand asset (`studio.write`, then `@extas/media`'s own `media.manage` check and its "still
 * used" guard — e.g. a template that points at it, `templates.ts`'s `checkBrandAssets`). Nothing is ever deleted;
 * the file stays in storage and "restore" brings it back, exactly as the shared Media library already guarantees.
 */
export async function setBrandAssetArchived(studio: StudioDeps, media: MediaDeps, who: Who, input: { assetId: string; archived: boolean; reason?: string }): Promise<StudioAssetRow> {
  await allow(studio, who, 'studio.write');
  const a = await studio.db.mediaAsset.findFirst({ where: { id: input.assetId, storeId: who.storeId, folder: BRAND_ASSET_FOLDER } });
  if (!a) throw new StudioError('NOT_FOUND', 'no such brand asset in this store', ['assetId']);
  const where = { storeId: who.storeId, id: input.assetId };
  const after = input.archived
    ? await archiveMedia(media, who.actor, where, input.reason ?? 'studio: brand asset retired', who.ctx)
    : await restoreMedia(media, who.actor, where, who.ctx);
  return rowOf({ ...a, bytes: BigInt(after.bytes), archivedAt: after.archivedAt });
}

export type { MediaSummary };
