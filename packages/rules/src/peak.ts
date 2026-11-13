// S28 · PR 679 (CN-048): Peak and Eid mode, the pure rules. The shop reads the owner's `orders.peak` setting and, while the mode is on and a
// daily cap is set, stops promising a delivery day once that day's orders reach the cap; "Print all in parts" cuts a print run into parts of
// the owner's size. Nothing here touches the database or sends anything: callers pass the counts in. Off and empty as shipped (CN-018).
import type { PeakSettings } from '@extas/settings';

export interface PeakStatus {
  /** The mode is on and a cap is set: the shop watches the day's orders. */
  watching: boolean;
  /** Orders still allowed today (null: no cap). */
  left: number | null;
  /** The day is full: the shop stops promising a delivery day. */
  full: boolean;
}

export function peakStatus(peak: PeakSettings | null | undefined, ordersToday: number): PeakStatus {
  if (!peak || !peak.enabled || peak.dailyCap == null) return { watching: false, left: null, full: false };
  const left = Math.max(0, peak.dailyCap - Math.max(0, ordersToday));
  return { watching: true, left, full: left === 0 };
}

/** The words shown when the day is full, in the viewer's language; empty when the owner wrote none (the shop then uses its own). */
export function peakFullText(peak: PeakSettings | null | undefined, lang: 'en' | 'bn'): string {
  if (!peak) return '';
  const own = lang === 'bn' ? peak.fullTextBn : peak.fullTextEn;
  return (own || peak.fullTextEn || '').trim();
}

/** "Print all in parts": the sticker ids cut into parts of `partSize` (empty size: one part, nothing is cut). */
export function printParts<T>(items: readonly T[], peak: PeakSettings | null | undefined): T[][] {
  const size = peak?.partSize ?? null;
  if (!size || size < 1 || items.length <= size) return items.length ? [items.slice()] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
