// Reports (prototype v5): the two small charts the profit report uses beside its tiles — horizontal bars (profit by channel) and
// a week-by-week margin line. Server components, plain SVG/CSS, figures come from the page (never typed here).
import type { ReactNode } from "react";
import "./report-answers.css";

export interface BarItem {
  key: string;
  label: ReactNode;
  value: number;
  shown: string;
}

export function BarList({
  items,
  testId,
}: {
  items: readonly BarItem[];
  testId: string;
}) {
  const max = Math.max(1, ...items.map((x) => Math.abs(x.value)));
  return (
    <ul className="rpb" data-testid={testId}>
      {items.map((x, i) => (
        <li key={x.key} data-testid={`${testId}-row`}>
          <div className="rpb-h">
            <span>{x.label}</span>
            <b>{x.shown}</b>
          </div>
          <div className="rpb-t">
            <i
              className={x.value < 0 ? "bad" : i % 2 ? "c2" : ""}
              style={{
                width: `${Math.max(2, Math.round((Math.abs(x.value) / max) * 100))}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface LinePoint {
  label: string;
  value: number | null;
}

/** One line over `points` (a margin in %), 0 to 100 on the side, the first and last label under it. */
export function MarginLine({
  points,
  name,
  testId,
}: {
  points: readonly LinePoint[];
  name: string;
  testId: string;
}) {
  const W = 560;
  const H = 190;
  const pad = { l: 34, r: 14, t: 12, b: 26 };
  const known = points.filter(
    (p): p is { label: string; value: number } => p.value !== null,
  );
  const top = Math.max(
    100,
    Math.ceil(Math.max(0, ...known.map((p) => p.value)) / 25) * 25,
  );
  const span = W - pad.l - pad.r;
  const x = (i: number) =>
    (points.length < 2 ? span / 2 : (i * span) / (points.length - 1)) + pad.l;
  const y = (v: number) =>
    pad.t + (1 - Math.max(0, v) / top) * (H - pad.t - pad.b);
  const path = points
    .flatMap((p, i) =>
      p.value === null ? [] : [`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`],
    )
    .join(" ");
  return (
    <div data-testid={testId}>
      <svg
        className="rpl"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={name}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(top * g)}
              y2={y(top * g)}
              stroke="var(--lm-ln2)"
            />
            <text
              x={pad.l - 6}
              y={y(top * g) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--lm-faint)"
            >
              {Math.round(top * g)}
            </text>
          </g>
        ))}
        {path ? (
          <polyline
            points={path}
            fill="none"
            stroke="var(--lm-ac)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        ) : null}
        {points.map((p, i) =>
          i === 0 || i === points.length - 1 || points.length <= 4 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={
                i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
              }
              fontSize="11"
              fill="var(--lm-faint)"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      <div className="rpl-leg">
        <span>{name}</span>
      </div>
    </div>
  );
}
