// S02 · PR 596 — the side canvas's one rule for where a zone fits, pure (no imports): the shop's client fitter and the
// admin's approval map use the same numbers. A gutter is the room beside the page's content column; a zone keeps `gap`
// px from the content and from the window's edge, takes its standard size when that fits, scales down to the room it
// has, and hides when even half its standard size does not fit (never over the content).

export interface FitZone {
  side: 'left' | 'right';
  width: number;
  height: number;
}

export interface Fit {
  show: boolean;
  /** 1 = the standard size. */
  scale: number;
  /** Its left edge in the window (px). */
  x: number;
  width: number;
  height: number;
}

/** The smallest share of its standard size a zone may shrink to before it hides. */
export const MIN_SCALE = 0.5; // hardcode-ok: the demo's "never hide — scale" floor

/** Where a zone sits in a window `view` px wide around a content column `content` px wide. */
export function fitZone(z: FitZone, view: number, content: number, gap: number, minWidth: number): Fit {
  const gutter = Math.max(0, (view - content) / 2);
  const room = gutter - 2 * gap;
  const scale = Math.min(1, room / z.width);
  if (view < minWidth || scale < MIN_SCALE) return { show: false, scale: 0, x: 0, width: 0, height: 0 };
  const width = Math.round(z.width * scale);
  const height = Math.round(z.height * scale);
  const inner = (gutter - width) / 2;
  const x = z.side === 'left' ? Math.round(inner) : Math.round(view - gutter + inner);
  return { show: true, scale, x, width, height };
}

/** A floating zone's drift (px) at a scroll position: a slow triangle wave between -float/2 and +float/2. */
export function floatOffset(scrollY: number, float: number): number {
  if (float <= 0) return 0;
  const period = float * 8;
  const t = ((scrollY % period) + period) % period / period;
  return Math.round((t < 0.5 ? t * 2 : 2 - t * 2) * float - float / 2);
}

/** Whether a zone shows on a day (YYYY-MM-DD, store time zone): its switch, then its whole days. */
export const zoneLive = (z: { on: boolean; from: string | null; to: string | null }, today: string) => z.on && (!z.from || z.from <= today) && (!z.to || today <= z.to);
