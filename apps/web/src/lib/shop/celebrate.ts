// PR 87 — the celebration overlay on order placement (Blueprint D1.5 / §41.18), as plain rules: whether the thank-you
// page offers it at all (the owner's switch and the occasion's days, or his preview), and, on the phone itself, whether
// it may run — never on a slow connection, data saving or a low-end phone, once per customer per occasion, and only
// the still words for a customer who asked for less motion. The drawing is Celebrate.tsx.
import type { ThanksCelebrateSettings } from '@extas/settings';

/** The query that plays it on a thank-you page while it is off, for the owner to see it first. */
export const CELEBRATE_QUERY = 'celebrate';
export const CELEBRATE_PREVIEW = 'preview';

export interface CelebrationPlan {
  /** The browser-storage key that marks it seen (per occasion, or per order when not once per customer). */
  seenKey: string;
  style: ThanksCelebrateSettings['style'];
  text: string;
  durationMs: number;
  /** A preview plays every time and ignores "seen". */
  preview: boolean;
}

/** What the thank-you page of `orderNumber` offers, or null: nothing is sent to the browser at all. */
export function celebrationFor(
  set: ThanksCelebrateSettings,
  today: string,
  orderNumber: string,
  query: string | null,
  text: string,
): CelebrationPlan | null {
  const preview = set.preview && query === CELEBRATE_PREVIEW;
  const live = set.on && (!set.from || today >= set.from) && (!set.until || today <= set.until);
  if (!preview && !live) return null;
  return {
    seenKey: set.once ? `celebrate:${set.campaign}` : `celebrate:${set.campaign}:${orderNumber}`,
    style: set.style,
    text,
    durationMs: Math.min(set.durationMs, 2500), // hardcode-ok: the Blueprint's ceiling (D1.5), also the schema's
    preview,
  };
}

export interface DeviceFacts {
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.connection.effectiveType, when the browser tells. */
  effectiveType: string | null;
  /** navigator.deviceMemory in GB, when the browser tells. */
  memoryGb: number | null;
  cores: number | null;
  seen: boolean;
}

/** Below these the phone is too slow to animate without stealing from the page (technical floors, not policy). */
const SLOW_NETWORKS = new Set(['slow-2g', '2g', '3g']);
const MIN_MEMORY_GB = 2; // hardcode-ok: technical floor for a canvas animation
const MIN_CORES = 4; // hardcode-ok: technical floor for a canvas animation

/** 'play' the particles, show only the 'still' words (reduced motion), or 'skip'. */
export function celebrationMode(plan: Pick<CelebrationPlan, 'preview' | 'text'>, d: DeviceFacts): 'play' | 'still' | 'skip' {
  if (d.seen && !plan.preview) return 'skip';
  if (d.reducedMotion) return plan.text ? 'still' : 'skip';
  if (plan.preview) return 'play';
  if (d.saveData || (d.effectiveType !== null && SLOW_NETWORKS.has(d.effectiveType))) return 'skip';
  if ((d.memoryGb !== null && d.memoryGb < MIN_MEMORY_GB) || (d.cores !== null && d.cores < MIN_CORES)) return 'skip';
  return 'play';
}
