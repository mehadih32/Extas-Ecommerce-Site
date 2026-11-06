// PR 627 (CN-036, LUMEN-SPEC §3) — the arithmetic of the Lumen patterns, pure so it is tested here and shared by
// the components (components/admin/lumen/): the count-up, the hero chart's shape and hover point, the delta against the
// period before and the toast's pause flags (the list's filters: list.ts; the form's checklist: form.ts).
// Nothing here adds up money: the figures arrive already counted (@extas/metrics), these only place and filter them.
import { niceScale, smoothPath } from '../admin-look/chart';

/* ---------- numbers ---------- */

/** How a count-up writes its number while it runs (the same way the server wrote the final one). */
export type CountFormat = { kind: 'number'; locale: string } | { kind: 'money'; locale: string; currency: string; digits: number } | { kind: 'percent'; locale: string; digits?: number };

/** A number in the admin's way: Western digits, the locale's grouping (1,23,456 in Bangladesh), the shop's currency. */
export function formatCount(v: number, f: CountFormat): string {
  try {
    if (f.kind === 'money') {
      const unit = 10 ** f.digits;
      return new Intl.NumberFormat(f.locale, { style: 'currency', currency: f.currency, currencyDisplay: 'narrowSymbol', numberingSystem: 'latn', maximumFractionDigits: 0 }).format(Math.round(v) / unit);
    }
    if (f.kind === 'percent') return `${new Intl.NumberFormat(f.locale, { numberingSystem: 'latn', minimumFractionDigits: f.digits ?? 0, maximumFractionDigits: f.digits ?? 0 }).format(v * 100)}%`;
    return new Intl.NumberFormat(f.locale, { numberingSystem: 'latn', maximumFractionDigits: 0 }).format(Math.round(v));
  } catch {
    return String(Math.round(v));
  }
}

/** The count-up's ease (fast start, soft landing). */
export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The value shown at a moment of the count-up (elapsed and total in ms); a zero length lands at once. */
export function countAt(to: number, elapsed: number, total: number): number {
  if (!(total > 0) || elapsed >= total) return to;
  return to * easeOut(elapsed / total);
}

/** The change against the period before as a fraction (null when there is nothing to compare with). */
export function deltaOf(now: number, before: number | null | undefined): number | null {
  if (before === null || before === undefined || !Number.isFinite(before) || !Number.isFinite(now)) return null;
  if (before === 0) return now === 0 ? 0 : null;
  return (now - before) / Math.abs(before);
}

/** Whether a delta is good news (less can be better: returns, late parcels). */
export function deltaTone(x: number | null, good: 'up' | 'down' = 'up'): 'ok' | 'bad' | 'flat' {
  if (x === null || x === 0) return 'flat';
  return (x > 0) === (good === 'up') ? 'ok' : 'bad';
}

/* ---------- the hero chart ---------- */

export const CHART_W = 1000;
export const CHART_H = 100;

export interface HeroShape {
  line: string;
  area: string;
  prev: string | null;
  /** Each point's height (0–100 % from the top), for the hover dot. */
  tops: number[];
  max: number;
}

/** The hero chart's line, its soft area and the period before (dashed), on one scale. */
export function heroShape(values: readonly number[], prev?: readonly number[] | null): HeroShape {
  const n = values.length;
  const sc = niceScale(Math.max(1, ...values, ...(prev ?? [])) * 1.08, 3);
  const x = (i: number, len: number) => (len > 1 ? (i / (len - 1)) * CHART_W : CHART_W / 2);
  const y = (v: number) => CHART_H - (Math.max(0, v) / sc.max) * CHART_H;
  const pts = values.map((v, i) => [x(i, n), y(v)] as [number, number]);
  const line = n === 1 ? `M0,${pts[0]![1].toFixed(1)} L${CHART_W},${pts[0]![1].toFixed(1)}` : smoothPath(pts);
  const area = line ? `${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z` : '';
  const prevPts = prev && prev.length > 1 ? smoothPath(prev.map((v, i) => [x(i, prev.length), y(v)] as [number, number])) : null;
  return { line, area, prev: prevPts, tops: pts.map((p) => Number(((p[1] / CHART_H) * 100).toFixed(2))), max: sc.max };
}

/** The point under the pointer (x as a fraction of the plot's width). */
export function pointAt(xFrac: number, n: number): number {
  if (n <= 1) return 0;
  return Math.max(0, Math.min(n - 1, Math.round(xFrac * (n - 1))));
}

/** The point's left edge in % (for the guide line, the dot and the read-out). */
export const pointLeft = (i: number, n: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);

/* ---------- the toast's pauses (hard rule 7: mouse, touch and keyboard each have their own flag) ---------- */

export interface PauseFlags {
  mouse: boolean;
  touch: boolean;
  key: boolean;
}

export const NO_PAUSE: PauseFlags = { mouse: false, touch: false, key: false };

export type PauseEvent = 'mouseenter' | 'mouseleave' | 'touchstart' | 'touchend' | 'focusin' | 'focusout';

/** The flags after one event: each input sets and clears only its own flag. */
export function pauseAfter(f: PauseFlags, e: PauseEvent): PauseFlags {
  switch (e) {
    case 'mouseenter':
      return { ...f, mouse: true };
    case 'mouseleave':
      return { ...f, mouse: false };
    case 'touchstart':
      return { ...f, touch: true };
    case 'touchend':
      return { ...f, touch: false };
    case 'focusin':
      return { ...f, key: true };
    case 'focusout':
      return { ...f, key: false };
  }
}

/** The toast's clock runs only while nothing holds it. */
export const paused = (f: PauseFlags) => f.mouse || f.touch || f.key;
