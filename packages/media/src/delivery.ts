// PR 24 — the responsive image pipeline, the pure part (no sharp, no database: the storefront component imports it).
// An ImageSource is everything a page needs to draw one photo; pictureSources() turns it into the <picture> markup:
//
//   <source type="image/avif" media="(max-width: 767px)" srcset="…card 400w, …card2x 800w">   phone
//   <source type="image/avif" srcset="…card2x 800w, …main 1200w">                             larger screens
//   … the same for WebP and JPEG …
//   <img src="…jpg" srcset="…" width="…" height="…">                                           JPEG fallback
//
// Which sizes each place may use, on a phone and on a larger screen, is the setting `media.image.slots`; by default a
// phone is never offered the zoom size on the page (owner spec §3.4), and the zoom viewer gets the 2000 px size on a
// larger screen. Width and height are always set (from the renditions themselves), so nothing jumps while loading.
import type { ImageFormat, Slots } from './config';
export type { ImageFormat, Slots } from './config';

export interface ImageVariant {
  preset: string;
  format: ImageFormat;
  width: number;
  height: number;
  url: string;
}

export interface ImageSource {
  id: string;
  /** Placeholder colour until the photo arrives, `#rrggbb`. */
  dominantColor: string | null;
  altEn: string | null;
  altBn: string | null;
  /** The store's ratio, for the placeholder box when nothing is rendered yet. */
  ratio: { width: number; height: number };
  variants: ImageVariant[];
  slots: Slots;
  phoneMaxWidth: number;
}

export interface PictureSource {
  type: string;
  media?: string;
  srcSet: string;
}

export interface PictureMarkup {
  sources: PictureSource[];
  img: { src: string; srcSet: string; width: number; height: number };
}

/** Public address of a stored rendition: the CDN base when set, else this site's /media route. */
export function mediaUrl(key: string, publicBaseUrl: string | null): string {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return publicBaseUrl ? `${publicBaseUrl.replace(/\/+$/, '')}/${path}` : `/media/${path}`;
}

/** Browser preference: the smallest format first; JPEG always last (it is the <img> fallback). */
const ORDER: ImageFormat[] = ['avif', 'webp', 'jpeg'];
const TYPE: Record<ImageFormat, string> = { avif: 'image/avif', webp: 'image/webp', jpeg: 'image/jpeg' };

function pick(src: ImageSource, presets: readonly string[], format: ImageFormat): ImageVariant[] {
  const seen = new Set<number>();
  return src.variants
    .filter((v) => v.format === format && presets.includes(v.preset))
    .sort((a, b) => a.width - b.width)
    .filter((v) => (seen.has(v.width) ? false : (seen.add(v.width), true)));
}

const srcSet = (vs: ImageVariant[]) => vs.map((v) => `${v.url} ${v.width}w`).join(', ');
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The <picture> sources for a place on the page, or null when no rendition of that place exists yet. */
export function pictureSources(src: ImageSource, slot: string): PictureMarkup | null {
  const cfg = src.slots[slot];
  if (!cfg) throw new Error(`no image slot "${slot}" in media.image.slots`);
  const formats = ORDER.filter((f) => src.variants.some((v) => v.format === f));
  if (!formats.length) return null;
  const fallback = formats.includes('jpeg') ? 'jpeg' : formats[formats.length - 1]!;
  const split = !same(cfg.phone, cfg.wide);
  const phoneMedia = `(max-width: ${src.phoneMaxWidth}px)`;

  const sources: PictureSource[] = [];
  for (const f of formats) {
    const phone = pick(src, cfg.phone, f);
    const wide = pick(src, cfg.wide, f);
    if (f === fallback) {
      if (split && phone.length) sources.push({ type: TYPE[f], media: phoneMedia, srcSet: srcSet(phone) });
      continue;
    }
    if (split) {
      if (phone.length) sources.push({ type: TYPE[f], media: phoneMedia, srcSet: srcSet(phone) });
      if (wide.length) sources.push({ type: TYPE[f], srcSet: srcSet(wide) });
    } else if (wide.length) sources.push({ type: TYPE[f], srcSet: srcSet(wide) });
  }

  const wideFallback = pick(src, cfg.wide, fallback);
  const imgSet = wideFallback.length ? wideFallback : pick(src, cfg.phone, fallback);
  if (!imgSet.length) return null;
  const largest = imgSet[imgSet.length - 1]!;
  return { sources, img: { src: imgSet[0]!.url, srcSet: srcSet(imgSet), width: largest.width, height: largest.height } };
}

/** Every address a phone could be sent for this slot (tests use it to prove a phone never gets the zoom file). */
export function phoneUrls(src: ImageSource, slot: string): string[] {
  const m = pictureSources(src, slot);
  if (!m) return [];
  const split = m.sources.some((s) => s.media);
  const urls = (set: string) => set.split(', ').map((s) => s.split(' ')[0]!);
  // With a phone source present, a phone takes the first matching source; the <img> set is used only by browsers that
  // read neither (and then the phone JPEG source matched first too).
  if (split) return m.sources.filter((s) => s.media).flatMap((s) => urls(s.srcSet));
  return [...m.sources.flatMap((s) => urls(s.srcSet)), ...urls(m.img.srcSet)];
}
