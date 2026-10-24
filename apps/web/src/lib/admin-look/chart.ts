// PR 12 (CN-025) — the arithmetic of the V12.4 drawing kit (demo 97z-adm2-rd1-core.js a3Nice, a2Smooth, a3Avg, the
// x labels, the funnel and the heat map): pure, so the charts are drawn on the server and tested here. Nothing adds up
// money: the figures arrive from @extas/metrics already counted, and these only scale, smooth and place them.

/** A round top for an axis and the step between its lines (demo a3Nice). */
export function niceScale(max: number, ticks = 3): { max: number; step: number } {
  if (!(max > 0) || !Number.isFinite(max)) return { max: 1, step: 1 };
  const raw = max / ticks;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  return { max: Math.ceil(max / step) * step, step };
}

/** The axis values from 0 to the top, one per step. */
export function ticksOf(s: { max: number; step: number }): number[] {
  const out: number[] = [];
  for (let v = 0; v <= s.max + 1e-9; v += s.step) out.push(Number(v.toFixed(6)));
  return out;
}

/** A smooth SVG path through the points (demo a2Smooth: Catmull-Rom style curves, tension 0.16), never overshooting. */
export function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length < 2) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  const k = 0.16;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    // Each curve stays between its two days' values: a jump after flat days never dips below 0 or above the peak.
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const y = (v: number) => f(Math.min(hi, Math.max(lo, v)));
    d += ` C${f(p1[0] + (p2[0] - p0[0]) * k)},${y(p1[1] + (p2[1] - p0[1]) * k)} ${f(p2[0] - (p3[0] - p1[0]) * k)},${y(p2[1] - (p3[1] - p1[1]) * k)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** A trailing average over `days` values (demo a3Avg; 1 = the values as they are). */
export function trailingAverage(values: readonly number[], days: number): number[] {
  const w = Math.max(1, Math.floor(days));
  return values.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - w + 1); j <= i; j++) {
      s += values[j] ?? 0;
      n++;
    }
    return Math.round(s / n);
  });
}

/** Which x labels to print: about six, always the last one (demo a3XLabels). Positions are 0–100 (%). */
export function xLabelsAt(n: number, every?: number): { i: number; left: number; end: boolean }[] {
  if (n <= 0) return [];
  const step = every && every > 0 ? every : Math.max(1, Math.ceil(n / 6));
  const out: { i: number; left: number; end: boolean }[] = [];
  for (let i = 0; i < n; i += step) out.push({ i, left: n > 1 ? (i / (n - 1)) * 100 : 50, end: false });
  if (n > 1 && (n - 1) % step) {
    // The last day is always named; a regular label less than a full step before it would print on top of it
    // on a phone, so that one goes.
    const last = out[out.length - 1];
    if (last && last.i > 0 && n - 1 - last.i < step) out.pop();
    out.push({ i: n - 1, left: 100, end: true });
  }
  return out;
}

/** The change from the period before as a fraction, or null when there is nothing to compare with (demo a2Trend). */
export function change(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !Number.isFinite(prev) || prev === 0 || !Number.isFinite(cur)) return null;
  return (cur - prev) / Math.abs(prev);
}

/** A success rate (kept ÷ finished), or null when nothing finished. */
export function rate(kept: number, finished: number): number | null {
  return finished > 0 ? kept / finished : null;
}

/** Each funnel step's share of the step before it, as a whole percent (the first step: null). */
export function funnelShares(steps: readonly number[]): (number | null)[] {
  return steps.map((n, i) => (i === 0 ? null : steps[i - 1]! > 0 ? Math.round((n / steps[i - 1]!) * 100) : 0));
}

/** The busiest cell of a heat map, or null when every cell is 0. */
export function heatPeak(rows: readonly (readonly number[])[]): { row: number; col: number; v: number } | null {
  let best: { row: number; col: number; v: number } | null = null;
  rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      if (v > 0 && (!best || v > best.v)) best = { row: ri, col: ci, v };
    }),
  );
  return best;
}

/** A heat cell's strength (0 = empty, else 0.1–0.95, demo a3Heat). */
export function heatAlpha(v: number, max: number): number {
  if (!(v > 0) || !(max > 0)) return 0;
  return Number((0.1 + (v / max) * 0.85).toFixed(2));
}

/** Values cut into windows of `size` from the end, each window's values passed to `fold` (oldest window first). */
export function windows<T>(values: readonly number[], size: number, fold: (w: number[]) => T): T[] {
  const out: T[] = [];
  for (let end = values.length; end - size >= 0; end -= size) out.unshift(fold(values.slice(end - size, end)));
  return out;
}

/** A spark line's path and its last point in a w × h box (demo a3Spark). Fewer than two values draw flat. */
export function sparkPath(values: readonly number[], w: number, h: number): { d: string; area: string; last: [number, number] } {
  const vals = values.length >= 2 ? values.map((v) => (Number.isFinite(v) ? v : 0)) : [0, 0];
  const mx = Math.max(...vals);
  const mn = Math.min(...vals);
  const rg = mx - mn || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 3 - ((v - mn) / rg) * (h - 8)] as [number, number]);
  const d = smoothPath(pts);
  const last = pts[pts.length - 1]!;
  return { d, area: `${d} L${w - 2},${h} L2,${h} Z`, last };
}
