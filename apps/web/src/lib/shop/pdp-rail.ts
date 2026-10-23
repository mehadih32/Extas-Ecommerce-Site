// PR 68 — the floating action rail's arithmetic (demo 30-product.js PDP_RAIL / pdp_railClamp), apart from the DOM so
// it can be tested. The rail eases a little with the direction of the scroll and settles back a moment after the
// scroll stops; wherever the drift would take it, it stays between two lines it may never cross: the title's line
// (so it never climbs onto the photo or the title's own words) and a line just above the buy bar. The numbers are the
// `pdp.icons` setting.
import type { PdpIconsSettings } from '@extas/settings';

/** Where the drift heads after a scroll of `dy` px: following a share of it, never further than the cap. */
export function driftTarget(target: number, dy: number, set: Pick<PdpIconsSettings, 'driftMaxPx' | 'follow'>): number {
  const max = set.driftMaxPx;
  return Math.max(-max, Math.min(max, target + dy * set.follow));
}

/** One frame of easing towards the target; `done` once it is there (within a quarter pixel). */
export function easeStep(cur: number, target: number, ease: number): { cur: number; done: boolean } {
  const next = cur + (target - cur) * ease;
  return Math.abs(target - next) < 0.25 ? { cur: target, done: true } : { cur: next, done: false };
}

export interface RailBox {
  /** The rail's own top without drift (its CSS place minus half its height), viewport px. */
  natural: number;
  /** The rail's height. */
  h: number;
  /** The title's bottom line, viewport px (null: no title on screen to respect). */
  titleBottom: number | null;
  /** The viewport's height and the buy bar's height (0 when there is none). */
  vh: number;
  bar: number;
}

/**
 * The drift the rail may really take: never above the title's line plus `ceilGapPx`, never closer to the bar than
 * `barGapPx`. On a screen too short for both, the bar's line wins (the buy controls are never covered).
 */
export function railClamp(off: number, box: RailBox, set: Pick<PdpIconsSettings, 'ceilGapPx' | 'barGapPx'>): number {
  const floor = box.vh - box.bar - set.barGapPx - box.h;
  let ceil = box.titleBottom === null ? 0 : box.titleBottom + set.ceilGapPx;
  if (ceil > floor) ceil = floor;
  let o = off;
  if (box.natural + o < ceil) o = ceil - box.natural;
  if (box.natural + o > floor) o = floor - box.natural;
  return o;
}
