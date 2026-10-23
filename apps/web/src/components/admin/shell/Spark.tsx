// PR 155 (follow-up 90) — the KPI tile's small line (demo a2Spark): day by day, oldest first, drawn on the server as an
// SVG in the tile's own colour (currentColor), hidden from screen readers (the tile's words carry the figure).
const W = 104;
const H = 34;

function smooth(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  const k = 0.16;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) * k).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * k).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * k).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * k).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** The points of a sparkline in a W × H box (a flat line when every value is the same). */
export function sparkPoints(values: readonly number[]): [number, number][] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || 1;
  return values.map((v, i) => [(i * W) / (values.length - 1), H - 3 - ((v - lo) / range) * (H - 8)]);
}

export function Spark({ id, values }: { id: string; values: readonly number[] }) {
  if (values.length < 2) return null;
  const pts = sparkPoints(values);
  const d = smooth(pts);
  const last = pts[pts.length - 1]!;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={(last[0] - 1.5).toFixed(1)} cy={last[1].toFixed(1)} r="2.6" fill="currentColor" />
    </svg>
  );
}
