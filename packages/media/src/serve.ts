// PR 23, 24 — what the shop hands to a browser: a rendition by its storage key (the /media route, used when no CDN
// address is set or the CDN asks the origin), the <picture> data of a photo, and the watermarked download copy.
import { deliveryConfig, watermarkConfig, type Settings } from './config';
import { mediaUrl, type ImageSource } from './delivery';
import type { Db, MediaDeps } from './deps';
import { MediaError } from './errors';
import { downloadKey, isRenditionKey, slugOfKey, variantHash } from './naming';
import { stampWatermark } from './watermark';

/** A rendition file, or null (unknown key, an original, a download copy, or an archived photo: never served). */
export async function renditionFile(deps: Pick<MediaDeps, 'db' | 'storage'>, key: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  if (!isRenditionKey(key)) return null;
  const r = await deps.db.mediaRendition.findFirst({ where: { storageKey: key }, select: { storeId: true, format: true, asset: { select: { storage: true, archivedAt: true } } } });
  if (!r || r.asset.archivedAt) return null;
  const storage = await deps.storage(r.storeId, r.asset.storage);
  const f = await storage.get(key);
  return f ? { body: f.body, contentType: `image/${r.format}` } : null;
}

/** The <picture> data of each photo (rendered ones only; a photo still processing has no variants yet). */
export async function imageSources(deps: { db: Db; settings: Settings }, storeId: number, assetIds: readonly string[]): Promise<Map<string, ImageSource>> {
  const out = new Map<string, ImageSource>();
  if (!assetIds.length) return out;
  const cfg = await deliveryConfig(deps.settings, storeId);
  const presets = cfg.presets.map((p) => p.name);
  const rows = await deps.db.mediaAsset.findMany({
    where: { id: { in: [...new Set(assetIds)] }, storeId, archivedAt: null, kind: 'IMAGE' },
    select: { id: true, dominantColor: true, altEn: true, altBn: true, renditions: { where: { preset: { in: presets }, format: { in: cfg.formats } } } },
  });
  for (const a of rows) {
    out.set(a.id, {
      id: a.id,
      dominantColor: a.dominantColor,
      altEn: a.altEn,
      altBn: a.altBn,
      ratio: cfg.ratio,
      slots: cfg.slots,
      phoneMaxWidth: cfg.phoneMaxWidth,
      variants: a.renditions.map((r) => ({
        preset: r.preset,
        format: r.format as ImageSource['variants'][number]['format'],
        width: r.width,
        height: r.height,
        url: mediaUrl(r.storageKey, cfg.publicBaseUrl),
      })),
    });
  }
  return out;
}

export interface DownloadCopy {
  body: Uint8Array;
  contentType: 'image/jpeg';
  fileName: string;
  watermarked: boolean;
}

/**
 * PR 23 — the download / save copy of a product photo: the `media.watermark.preset` JPEG with the watermark stamped
 * on a copy. Made once per photo and watermark setting, then kept beside the renditions (a new setting = a new copy;
 * the old one stays). Only photos on an active product gallery can be downloaded this way.
 */
export async function downloadCopy(deps: Pick<MediaDeps, 'db' | 'storage' | 'settings'>, assetId: string): Promise<DownloadCopy> {
  const a = await deps.db.mediaAsset.findFirst({
    where: { id: assetId, kind: 'IMAGE', archivedAt: null, productMedia: { some: { archivedAt: null } } },
    select: { id: true, storeId: true, storage: true, storageKey: true },
  });
  if (!a) throw new MediaError('NOT_FOUND', 'no such photo');
  const wm = await watermarkConfig(deps.settings, a.storeId);
  const r = await deps.db.mediaRendition.findUnique({ where: { assetId_preset_format: { assetId: a.id, preset: wm.preset, format: 'jpeg' } } });
  if (!r) throw new MediaError('NOT_RENDERED', 'the photo sizes are not made yet');
  const storage = await deps.storage(a.storeId, a.storage);
  const slug = slugOfKey(a.storageKey);
  const fileName = `${slug}.jpg`;

  if (!wm.enabled) {
    const clean = await storage.get(r.storageKey);
    if (!clean) throw new MediaError('NOT_RENDERED', 'the photo file is missing');
    return { body: clean.body, contentType: 'image/jpeg', fileName, watermarked: false };
  }
  let text = wm.text;
  if (!text) {
    const store = await deps.db.store.findUnique({ where: { id: a.storeId }, select: { name: true } });
    text = store?.name?.trim() || null;
  }
  if (!text) throw new MediaError('NO_WATERMARK_TEXT', 'neither a watermark text nor a store name is set');

  const hash = variantHash({ r: r.storageKey, t: text, p: wm.position, o: wm.opacity, s: wm.scale, q: wm.quality });
  const key = downloadKey({ storeId: a.storeId, assetId: a.id, slug, hash });
  const cached = await storage.get(key);
  if (cached) return { body: cached.body, contentType: 'image/jpeg', fileName, watermarked: true };
  const clean = await storage.get(r.storageKey);
  if (!clean) throw new MediaError('NOT_RENDERED', 'the photo file is missing');
  const body = await stampWatermark(clean.body, { text, position: wm.position, opacity: wm.opacity, scale: wm.scale, quality: wm.quality });
  await storage.put(key, body, 'image/jpeg');
  return { body, contentType: 'image/jpeg', fileName, watermarked: true };
}
