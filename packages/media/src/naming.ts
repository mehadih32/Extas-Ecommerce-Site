// PR 22 — the naming convention. Every stored file has a short, descriptive, lower-case, hyphenated name (P06 §3:
// `pique-polo-navy-front-card.<hash>.avif`), the extension of its real format, and a content hash in the name, so a
// changed file always gets a new name (A2.9.8: long browser/CDN caching is safe) and nothing is ever overwritten.
//
//   media/s<store>/o/<yyyy>/<mm>/<sha256:16>-<slug>.<ext>          the archived original (never served, never changed)
//   media/s<store>/r/<asset id>/<slug>-<preset>.<hash>.<ext>       a rendition (served to the shop)
//   media/s<store>/w/<asset id>/<slug>-download.<hash>.jpg         a watermarked download copy (served on download)
import { createHash } from 'node:crypto';
import type { ImageFormat } from './config';

const MAX_SLUG = 60;

/** A file name without its extension: `IMG 0023.final.JPG` → `IMG 0023.final`. */
export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]{2,5}$/, '');
}

/** `Piqué Polo — Navy (front)` → `pique-polo-navy-front`; nothing usable → `image`. */
export function slugify(text: string | null | undefined): string {
  const s = (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return s || 'image';
}

/** File extension of a format; JPEG files end in `.jpg`. */
export function extensionOf(format: ImageFormat | 'png' | 'tiff' | 'gif' | 'svg' | 'heif'): string {
  return format === 'jpeg' ? 'jpg' : format === 'heif' ? 'heic' : format;
}

export function contentTypeOf(format: ImageFormat): string {
  return `image/${format}`;
}

export function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

/** A short, stable hash of everything that decides a file's bytes. */
export function variantHash(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
}

const storeDir = (storeId: number) => `media/s${storeId}`;

export function originalKey(o: { storeId: number; checksum: string; slug: string; ext: string; at: Date }): string {
  const y = o.at.getUTCFullYear();
  const m = String(o.at.getUTCMonth() + 1).padStart(2, '0');
  return `${storeDir(o.storeId)}/o/${y}/${m}/${o.checksum.slice(0, 16)}-${o.slug}.${o.ext}`;
}

export function renditionKey(o: { storeId: number; assetId: string; slug: string; preset: string; format: ImageFormat; hash: string }): string {
  return `${storeDir(o.storeId)}/r/${o.assetId}/${o.slug}-${o.preset}.${o.hash}.${extensionOf(o.format)}`;
}

export function downloadKey(o: { storeId: number; assetId: string; slug: string; hash: string }): string {
  return `${storeDir(o.storeId)}/w/${o.assetId}/${o.slug}-download.${o.hash}.jpg`;
}

/** Only renditions are public. Originals and download copies are never served under their storage key. */
export function isRenditionKey(key: string): boolean {
  return /^media\/s\d+\/r\/[0-9a-f-]{36}\/[a-z0-9-]+\.[0-9a-f]{12}\.(avif|webp|jpg)$/.test(key);
}

/** The slug part of an original's key (`…/<hash16>-<slug>.<ext>`). */
export function slugOfKey(key: string): string {
  const base = key.split('/').pop() ?? '';
  const m = /^[0-9a-f]{16}-(.+)\.[a-z0-9]+$/.exec(base);
  return m?.[1] ?? 'image';
}
