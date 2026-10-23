// PR 54 — the product page's photos (Blueprint D3.5, demo 30-product.js pdp_track / pdp_thumbs, 31-zoom.js): which
// pictures each colour shows and in what order, and the small sums the strip and the full-screen viewer share. Pure:
// the server builds the shots, the client parts move between them.
import type { GarmentView } from './garment-art';
import type { PdpShot, PdpShotKind } from './product-model';
import type { ImageSource } from '@extas/media';

/** The catalogue's photo roles (ProductMedia.role) as the page names them; a video is not a photo and is left out. */
export const SHOT_KIND: Record<string, PdpShotKind | null> = {
  FRONT: 'front',
  BACK: 'back',
  DETAIL: 'detail',
  ON_MODEL: 'model',
  FLAT_LAY: 'flat',
  FABRIC: 'fabric',
  TRUE_COLOUR: 'trueColour',
  SET: 'set',
  OTHER: 'other',
  VIDEO: null,
};

/** The drawing view that stands for a photo of this kind while it loads (or has none). */
export function drawFor(kind: PdpShotKind): GarmentView {
  if (kind === 'back' || kind === 'detail' || kind === 'model' || kind === 'flat') return kind;
  if (kind === 'fabric') return 'detail';
  if (kind === 'trueColour') return 'flat';
  return 'front';
}

/** A drawing view as a shot kind (`flat` is the daylight flat lay, the demo's "true colour" tile). */
const VIEW_KIND: Record<GarmentView, PdpShotKind> = { front: 'front', back: 'back', detail: 'detail', model: 'model', flat: 'flat' };

export interface MediaRow {
  id: string;
  /** null = a photo of the product, shown for every colour. */
  colour: string | null;
  role: string;
  photo: ImageSource | null;
}

/**
 * Each colour's shots, in the owner's order: the colour's own photos, then the product's shared ones. A colour with
 * no photo at all shows the garment drawing in its own colour, one tile per view of `pdp.gallery.drawingViews`.
 * `colours` empty = a product with no colour (key '*').
 */
export function shotsFor(colours: readonly string[], media: readonly MediaRow[], drawingViews: readonly GarmentView[], noColour: string): Record<string, PdpShot[]> {
  const keys = colours.length ? colours : [noColour];
  const photo = (m: MediaRow): PdpShot[] => {
    const kind = SHOT_KIND[m.role];
    return kind && m.photo ? [{ id: m.id, kind, photo: m.photo, draw: drawFor(kind) }] : [];
  };
  const shared = media.filter((m) => m.colour === null).flatMap(photo);
  const views = drawingViews.length ? drawingViews : (['front'] as const);
  const out: Record<string, PdpShot[]> = {};
  for (const key of keys) {
    const own = media.filter((m) => m.colour === key).flatMap(photo);
    const list = [...own, ...shared];
    out[key] = list.length ? list : views.map((v) => ({ id: `draw-${key}-${v}`, kind: VIEW_KIND[v], photo: null, draw: v }));
  }
  return out;
}

/** The shot a step lands on, kept inside the strip (the arrows stop at both ends, demo pdp_trkGo). */
export function stepTo(i: number, d: number, n: number): number {
  return n <= 0 ? 0 : Math.max(0, Math.min(n - 1, i + d));
}

/** Which tile a scrolled strip shows: the one whose left edge is nearest the strip's scroll position. */
export function nearestTile(lefts: readonly number[], scrollLeft: number): number {
  let best = 0;
  let bd = Infinity;
  lefts.forEach((l, i) => {
    const d = Math.abs(l - scrollLeft);
    if (d < bd - 0.5) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** The full-screen viewer's zoom, kept between 1 (the whole photo) and the viewer's largest step. */
export function clampZoom(z: number, max: number): number {
  return Number.isFinite(z) ? Math.max(1, Math.min(max, z)) : 1;
}

/**
 * How far a zoomed photo may be moved: never so far that its edge comes inside the frame (demo zm_clamp). `box` is
 * the frame, the photo fills it at zoom 1.
 */
export function clampPan(x: number, y: number, zoom: number, box: { w: number; h: number }): { x: number; y: number } {
  const mx = ((zoom - 1) * box.w) / 2;
  const my = ((zoom - 1) * box.h) / 2;
  return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
}

/**
 * Computer, thumbnails down the side (demo owner B P8, ownb_thumbFit): how many show — at most `max`, and no more
 * than fit beside the main photo (`fit`, null = not measured yet). The last one shown carries "+N", N counting itself
 * and the hidden ones. Everything shows when it all fits.
 */
export function thumbsShown(n: number, max: number, fit: number | null): { shown: number; more: number } {
  const cap = Math.max(2, Math.min(max, fit ?? max));
  if (n <= cap) return { shown: n, more: 0 };
  return { shown: cap, more: n - cap + 1 };
}
