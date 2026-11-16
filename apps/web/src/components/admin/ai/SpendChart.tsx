// PR 935 — AI Center › Costs & limits: "Spend so far this month", the running total by day (prototype v5 m-ai.js renderCosts chart).
// A plain server-drawn SVG line over the AI usage records already kept; colours come from the theme tokens in ai-limits.css.
export function SpendChart({ values, title, sub, none, dayLabel, top }: { values: number[]; title: string; sub: string; none: string; dayLabel: (n: number) => string; top: string }) {
  const W = 600; // hardcode-ok: the drawing's own coordinate space, scaled by the viewBox
  const H = 160; // hardcode-ok: the drawing's own coordinate space, scaled by the viewBox
  const max = Math.max(...values, 0);
  const n = values.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - (max > 0 ? (v / max) * H : 0);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <section className="a2-card ai-chart a2-mt12" data-testid="ai-limits-chart" aria-label={title}>
      <h2 className="a2-h3">{title}</h2>
      <p className="a2-xs a2-mute">{sub}</p>
      {max <= 0 ? (
        <p className="a2-sm a2-mute" data-testid="ai-limits-chart-none">
          {none}
        </p>
      ) : (
        <>
          <svg className="ai-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
            <polyline className="ai-chart-line" points={points} fill="none" />
          </svg>
          <div className="ai-chart-ax a2-xs a2-mute">
            <span>{dayLabel(1)}</span>
            <span>{top}</span>
            <span>{dayLabel(n)}</span>
          </div>
        </>
      )}
    </section>
  );
}
