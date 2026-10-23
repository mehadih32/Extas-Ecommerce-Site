// PR 53 — the first-screen budget's arithmetic (Blueprint D2 "first-screen fit", demo 30-product.js PDP_FIT /
// pdp_budget), kept apart from the DOM so it can be tested. On a phone the photo is the slack of the first screen: its
// height is planned so the size row and the measurement line end just above the buy bar, never shorter than the photo's
// floor nor taller than its ceiling. The numbers come from the `pdp.fit` setting; nothing here knows a category.
import type { PdpFitSettings } from '@extas/settings';

/** The blocks that may end the first screen, deepest first (the Find my size card, then the measurement line). */
export const FIT_ANCHORS = ['.pdp-fmssec', '.pdp-fitline'] as const;
/** The anchor whose own top margin is the air under it (it sits in the middle of its room). */
export const FIT_CENTRED = '.pdp-fitline';

export interface PhotoBounds {
  /** The photo's floor, px. */
  min: number;
  /** The photo's ceiling, px. */
  max: number;
  /** A deeper anchor may end the first screen while the photo stays at least this tall, px. */
  deep: number;
}

/** The photo's floor, ceiling and "deep" height on a screen `vh` px tall. */
export function photoBounds(fit: PdpFitSettings, vh: number): PhotoBounds {
  const max = Math.min(fit.photoMaxVh * vh, fit.photoMaxPx);
  const min = Math.min(Math.max(fit.photoFloorPx, Math.min(fit.photoMinPx, fit.photoMinVh * vh)), max);
  return { min, max, deep: fit.deepVh * vh };
}

/** One anchor as measured on the page: where its bottom is (page coordinates) and the air it wants under it. */
export interface AnchorProbe {
  sel: string;
  bottom: number;
  clear: number;
}

export interface PhotoPlan {
  /** The photo's planned height, px. */
  want: number;
  /** The anchor that ends the first screen; '' when the photo is at its ceiling and everything already fits. */
  who: string;
}

/**
 * The photo height that brings an anchor to just above the bar. `probes` are the anchors present on the page in
 * FIT_ANCHORS order; `h0` is the photo's current height. A deeper anchor wins only while the photo stays between "deep"
 * and the ceiling; the measurement line always wins within the floor and ceiling. Null: no anchor on the page.
 */
export function planPhoto(fit: PdpFitSettings, vh: number, bar: number, h0: number, probes: AnchorProbe[]): PhotoPlan | null {
  const b = photoBounds(fit, vh);
  const last = FIT_ANCHORS[FIT_ANCHORS.length - 1];
  for (const p of probes) {
    const h = h0 + (vh - bar - p.clear - p.bottom);
    if (p.sel === last) {
      const want = Math.max(b.min, Math.min(b.max, h));
      return { want, who: want >= b.max - 0.5 && h > b.max + 1 ? '' : p.sel };
    }
    if (h >= b.deep && h <= b.max) return { want: h, who: p.sel };
  }
  return null;
}

/** The anchor's bottom is above the bar with its air kept (half a pixel of rounding allowed). */
export function anchorClears(bottom: number, clear: number, vh: number, bar: number): boolean {
  return bottom <= vh - bar - clear + 0.6;
}
