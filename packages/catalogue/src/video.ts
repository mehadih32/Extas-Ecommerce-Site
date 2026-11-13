// S28 · PR 681 — a product's video: a YouTube, Vimeo or Facebook link, or an uploaded clip (stored as it is; making it
// lighter stays a mock until a transcoder is connected). One active video per product; adding a new one archives the
// old (nothing is deleted). The product page shows a poster and a play button; the player loads only when a customer
// taps (setting `catalogue.video`, off as shipped). Reading needs `catalogue.read`; every change `catalogue.write`.
import { z } from 'zod';
import { CatalogueError } from './errors';
import { allow, assertImage, found, logChange, parse, setting, type CatalogueDeps, type Who } from './context';

export { isoDuration, parseVideoLink, type ParsedVideoLink, type VideoProvider } from './video-link';
import { parseVideoLink } from './video-link';

export interface VideoView {
  id: string;
  productId: string;
  source: 'LINK' | 'FILE';
  provider: string;
  url: string | null;
  embedId: string | null;
  fileAssetId: string | null;
  posterAssetId: string | null;
  durationSec: number | null;
  titleEn: string | null;
  titleBn: string | null;
}

const SELECT = {
  id: true,
  productId: true,
  source: true,
  provider: true,
  url: true,
  embedId: true,
  fileAssetId: true,
  posterAssetId: true,
  durationSec: true,
  titleEn: true,
  titleBn: true,
} as const;

export const linkVideoSchema = z
  .object({
    url: z.string().trim().min(8).max(500),
    durationSec: z.int().min(1).max(36000).nullish(),
    posterAssetId: z.uuid().nullish(),
    titleEn: z.string().trim().max(120).nullish(),
    titleBn: z.string().trim().max(120).nullish(),
  })
  .strict();

export const fileVideoSchema = z
  .object({
    assetId: z.uuid(),
    durationSec: z.int().min(1).max(36000).nullish(),
    posterAssetId: z.uuid().nullish(),
    titleEn: z.string().trim().max(120).nullish(),
    titleBn: z.string().trim().max(120).nullish(),
  })
  .strict();

export const videoPatchSchema = z
  .object({
    durationSec: z.int().min(1).max(36000).nullish(),
    posterAssetId: z.uuid().nullish(),
    titleEn: z.string().trim().max(120).nullish(),
    titleBn: z.string().trim().max(120).nullish(),
  })
  .strict();

async function requireProduct(deps: CatalogueDeps, who: Who, productId: string): Promise<void> {
  found(await deps.db.product.findFirst({ where: { id: productId, storeId: who.storeId }, select: { id: true } }), 'product');
}

async function switchedOn(deps: CatalogueDeps, who: Who) {
  const s = await setting(deps, who, 'catalogue.video');
  if (!s.on) throw new CatalogueError('CONFLICT', 'product videos are switched off', ['VIDEO_OFF']);
  return s;
}

export async function getProductVideo(deps: CatalogueDeps, who: Who, productId: string): Promise<VideoView | null> {
  await allow(deps, who, 'catalogue.read');
  await requireProduct(deps, who, productId);
  return (await deps.db.productVideo.findFirst({
    where: { storeId: who.storeId, productId, archivedAt: null },
    select: SELECT,
    orderBy: { createdAt: 'desc' },
  })) as VideoView | null;
}

async function replaceWith(deps: CatalogueDeps, who: Who, productId: string, data: Omit<VideoView, 'id' | 'productId'>): Promise<VideoView> {
  const now = deps.now?.() ?? new Date();
  return deps.db.$transaction(async (tx) => {
    const old = await tx.productVideo.findMany({ where: { storeId: who.storeId, productId, archivedAt: null }, select: { id: true } });
    if (old.length) await tx.productVideo.updateMany({ where: { id: { in: old.map((o) => o.id) } }, data: { archivedAt: now } });
    const row = (await tx.productVideo.create({ data: { storeId: who.storeId, productId, ...data }, select: SELECT })) as VideoView;
    await logChange(tx, who, 'video.set', 'ProductVideo', row.id, { replaced: old.map((o) => o.id) }, { source: row.source, provider: row.provider });
    return row;
  });
}

/** Sets the product's video from a link (the old one is archived). */
export async function setLinkVideo(deps: CatalogueDeps, who: Who, productId: string, input: unknown): Promise<VideoView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(linkVideoSchema, input, 'video link');
  const s = await switchedOn(deps, who);
  await requireProduct(deps, who, productId);
  const link = parseVideoLink(d.url);
  if (!link) throw new CatalogueError('INVALID_INPUT', 'only YouTube, Vimeo and Facebook links are taken', ['url']);
  if (!s.providers.includes(link.provider)) throw new CatalogueError('INVALID_INPUT', 'this kind of link is not switched on', ['url']);
  await assertImage(deps.db, who.storeId, d.posterAssetId, 'posterAssetId');
  return replaceWith(deps, who, productId, {
    source: 'LINK',
    provider: link.provider,
    url: d.url,
    embedId: link.id,
    fileAssetId: null,
    posterAssetId: d.posterAssetId ?? null,
    durationSec: d.durationSec ?? null,
    titleEn: d.titleEn ?? null,
    titleBn: d.titleBn ?? null,
  });
}

/** Sets the product's video from an uploaded clip (a VIDEO file of this store in the media library). */
export async function setFileVideo(deps: CatalogueDeps, who: Who, productId: string, input: unknown): Promise<VideoView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(fileVideoSchema, input, 'video file');
  const s = await switchedOn(deps, who);
  if (!s.allowUpload) throw new CatalogueError('CONFLICT', 'uploading a clip is switched off', ['UPLOAD_OFF']);
  await requireProduct(deps, who, productId);
  const a = await deps.db.mediaAsset.findFirst({ where: { id: d.assetId, storeId: who.storeId, kind: 'VIDEO', archivedAt: null }, select: { id: true, bytes: true } });
  if (!a) throw new CatalogueError('INVALID_INPUT', 'not a video file of this store', ['assetId']);
  if (Number(a.bytes) > s.maxUploadMb * 1024 * 1024) throw new CatalogueError('INVALID_INPUT', 'the clip is larger than the limit', ['assetId']);
  await assertImage(deps.db, who.storeId, d.posterAssetId, 'posterAssetId');
  return replaceWith(deps, who, productId, {
    source: 'FILE',
    provider: 'FILE',
    url: null,
    embedId: null,
    fileAssetId: a.id,
    posterAssetId: d.posterAssetId ?? null,
    durationSec: d.durationSec ?? null,
    titleEn: d.titleEn ?? null,
    titleBn: d.titleBn ?? null,
  });
}

/** Length, poster and title of the active video. */
export async function updateProductVideo(deps: CatalogueDeps, who: Who, productId: string, input: unknown): Promise<VideoView> {
  await allow(deps, who, 'catalogue.write');
  const d = parse(videoPatchSchema, input, 'video change');
  const cur = found(await deps.db.productVideo.findFirst({ where: { storeId: who.storeId, productId, archivedAt: null }, select: SELECT }), 'video');
  await assertImage(deps.db, who.storeId, d.posterAssetId, 'posterAssetId');
  const data = {
    ...(d.durationSec !== undefined ? { durationSec: d.durationSec } : {}),
    ...(d.posterAssetId !== undefined ? { posterAssetId: d.posterAssetId } : {}),
    ...(d.titleEn !== undefined ? { titleEn: d.titleEn } : {}),
    ...(d.titleBn !== undefined ? { titleBn: d.titleBn } : {}),
  };
  return deps.db.$transaction(async (tx) => {
    const row = (await tx.productVideo.update({ where: { id: cur.id }, data, select: SELECT })) as VideoView;
    await logChange(tx, who, 'video.update', 'ProductVideo', cur.id, cur, row);
    return row;
  });
}

/** Takes the video off the product (archived; the file stays in the library). */
export async function removeProductVideo(deps: CatalogueDeps, who: Who, productId: string): Promise<void> {
  await allow(deps, who, 'catalogue.write');
  const cur = found(await deps.db.productVideo.findFirst({ where: { storeId: who.storeId, productId, archivedAt: null }, select: SELECT }), 'video');
  const now = deps.now?.() ?? new Date();
  await deps.db.$transaction(async (tx) => {
    await tx.productVideo.update({ where: { id: cur.id }, data: { archivedAt: now } });
    await logChange(tx, who, 'video.remove', 'ProductVideo', cur.id, cur, { archivedAt: now.toISOString() });
  });
}
