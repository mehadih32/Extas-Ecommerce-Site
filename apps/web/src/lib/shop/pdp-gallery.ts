// PR 54 — the product page's photos (Blueprint D3.5, demo 30-product.js pdp_track / pdp_thumbs, 31-zoom.js): which
// pictures each colour shows and in what order, and the small sums the strip and the full-screen viewer share. Pure:
// the server builds the shots, the client parts move between them.
// PR 461 (Blueprint C7.15 "Front end" — S24 Photoshoot Studio) — once a colour's shots include an S24 on-model
// image, two small additions on top of the same gallery, nothing new to look at: the canonical order ("real front
// shot → on-model views → back → fabric close-up → detail", so the real photo stays the hero exactly as C7.15
// says, whatever order the photos were attached in) and a per-shot angle label for the on-model photos ("front /
// three-quarter / back / walking / seated", C7.15's own words, the same vocabulary `@extas/photoshoot`'s
// `MODEL_ANGLES` uses for a model's reference photos) so two different on-model photos are never announced the
// same way. Colour-change re-render reading from the pre-generated cache needs nothing extra here: `shotsFor`
// already builds every colour's shots once, up front (PR 49/54's `PdpModel.shots`), and the gallery only ever
// switches which pre-built array it shows — no re-render, no network call, no regeneration ever happens on a
// page view (C7.15: "all generation happens at upload time, never at page-view time").
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
 * `colours` empty = a product with no colour (key '*'). PR 461: once an S24 on-model shot is in the mix, the list
 * is put into the canonical order first (`withOnModelOrder`) — every other colour, with no on-model shot, keeps
 * exactly the order the rows came in, unchanged (today's shops, and PR 54's own tests, are never touched).
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
    const list = withOnModelOrder([...own, ...shared]);
    out[key] = list.length ? list : views.map((v) => ({ id: `draw-${key}-${v}`, kind: VIEW_KIND[v], photo: null, draw: v }));
  }
  return out;
}

/**
 * The front end's own display rank for each kind, used only by `withOnModelOrder` (Blueprint C7.15: "Gallery
 * order: real front shot → on-model views → back → fabric close-up → detail"). Every kind the sentence does not
 * name keeps the relative order it already had, after the five it does name.
 */
const GALLERY_RANK: Record<PdpShotKind, number> = { front: 0, model: 1, back: 2, fabric: 3, detail: 4, flat: 5, trueColour: 6, set: 7, other: 8 };

/**
 * PR 461 — once a colour's shots include at least one S24 on-model photo, put the whole list into C7.15's own
 * order; a colour with none (every shop before S24, and every shop that never turns the Photoshoot Studio on)
 * keeps the order its rows came in, byte for byte — `shotsFor`'s long-standing "owner's order" promise (PR 54)
 * never changes for a plain photo set. `Array.prototype.sort` is a stable sort (ES2019+), so two shots of the same
 * kind — two fabric close-ups, say — never swap.
 */
export function withOnModelOrder(shots: readonly PdpShot[]): PdpShot[] {
  if (!shots.some((s) => s.kind === 'model')) return [...shots];
  return [...shots].sort((a, b) => GALLERY_RANK[a.kind] - GALLERY_RANK[b.kind]);
}

/** C7.15's own words for the on-model angle switcher: "front / three-quarter / back / walking / seated" — the same
 * five names (`side` apart) `@extas/photoshoot`'s `MODEL_ANGLES` uses for a model's own reference photos. */
export const ON_MODEL_ANGLES = ['front', 'threeQuarter', 'back', 'walking', 'seated'] as const;
export type OnModelAngle = (typeof ON_MODEL_ANGLES)[number];

/**
 * A label for each on-model shot, by its position among the colour's own on-model shots — the angle the
 * Photoshoot Studio's review queue approved them in (PR 445/458), the same order the gallery now shows them in.
 * Every shot that is not an on-model photo gets `null`; a sixth or later on-model photo (rare — most products
 * generate at most five angles) stays `null` too, rather than guess: it still shows, under the gallery's plain
 * "On model photo" wording. Lets two different on-model photos announce themselves differently to a screen
 * reader without adding anything new to look at (the demo's gallery has no separate switcher control — the
 * existing strip, arrows and thumbnails already move between every shot, on-model ones included; C7.15 itself
 * says "on-model images are part of the normal gallery, with the same zoom").
 */
export function onModelAngles(shots: readonly PdpShot[]): (OnModelAngle | null)[] {
  let n = 0;
  return shots.map((s) => {
    if (s.kind !== 'model') return null;
    const angle = ON_MODEL_ANGLES[n] ?? null;
    n += 1;
    return angle;
  });
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
