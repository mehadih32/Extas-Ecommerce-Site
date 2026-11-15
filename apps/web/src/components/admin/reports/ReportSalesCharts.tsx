// PR 796 (prototype v5 Reports): the two small charts the Sales report and its sisters draw, as plain SVG and CSS (server components,
// figures come from the page): a multi-part donut with a legend, and a column chart (one column per hour or weekday).
import type { ReactNode } from "react";
import "./report-answers.css";

export interface DonutPart {
  key: string;
  label: string;
  value: number;
}

const TONES = [
  "var(--lm-ac)",
  "var(--lm-ok)",
  "var(--lm-warn)",
  "var(--lm-bad)",
  "var(--lm-faint)",
  "var(--lm-ac-ink)",
];

/** Parts of a whole as arcs with the total in the middle and a legend beside it; nothing but a grey ring when the total is 0. */
export function Donut({
  parts,
  center,
  aria,
  testId,
}: {
  parts: readonly DonutPart[];
  center: ReactNode;
  aria: string;
  testId: string;
}) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  let acc = 0;
  return (
    <div className="rp-donut-row" data-testid={testId}>
      <svg
        viewBox="0 0 42 42"
        width="132"
        height="132"
        role="img"
        aria-label={aria}
      >
        <circle
          cx="21"
          cy="21"
          r="15.915"
          fill="none"
          stroke="var(--lm-sf2)"
          strokeWidth="7"
        />
        {total > 0
          ? parts.map((p, i) => {
              const share = (p.value / total) * 100;
              const el = (
                <circle
                  key={p.key}
                  cx="21"
                  cy="21"
                  r="15.915"
                  fill="none"
                  stroke={TONES[i % TONES.length]}
                  strokeWidth="7"
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={25 - acc}
                />
              );
              acc += share;
              return el;
            })
          : null}
        <text
          x="21"
          y="22.5"
          textAnchor="middle"
          fontSize="6.5"
          fontWeight="700"
          fill="currentColor"
        >
          {center}
        </text>
      </svg>
      <ul className="rpd-leg">
        {parts.map((p, i) => (
          <li key={p.key} data-testid={`${testId}-part`}>
            <i
              className="rp-dot"
              style={{ background: TONES[i % TONES.length] }}
            />{" "}
            {p.label}: <b>{p.value.toLocaleString("en")}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number;
  shown: string;
}

/** One column per item, the tallest full height; the label under it, the exact figure in its title. */
export function Columns({
  items,
  testId,
  tone,
}: {
  items: readonly Column[];
  testId: string;
  tone?: "c2";
}) {
  const max = Math.max(1, ...items.map((x) => x.value));
  return (
    <div
      className={`rpc${tone ? ` ${tone}` : ""}`}
      data-testid={testId}
      role="list"
    >
      {items.map((x) => (
        <div
          key={x.key}
          className="rpc-c"
          role="listitem"
          title={`${x.label}: ${x.shown}`}
          data-testid={`${testId}-col`}
        >
          <i
            style={{
              height: `${Math.max(2, Math.round((x.value / max) * 100))}%`,
            }}
          />
          <span>{x.label}</span>
        </div>
      ))}
    </div>
  );
}
