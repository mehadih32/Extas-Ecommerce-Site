// Parity round 3, lane F (PR 807-812) — the small pieces the prototype v5 uses on Marketing, Inbox, Finance, Rules and Offers
// pages, as server components: a KPI tile with its change against the period before, the "AI" / "What this means" line, the
// dashed guide note, filter chips with counts, the period bar and a two-line chart. Figures always come from the page (never
// typed here); the words come from the page's dictionary. Colours are the `--lm-*` tokens only.
import Link from 'next/link';
import type { ReactNode } from 'react';
import './lane-f.css';

/** Change against the period before: a percent, or null when there is nothing to compare with. */
export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100; // hardcode-ok: percent
}

export function Delta({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null || !Number.isFinite(pct)) return null;
  const up = pct > 0.05; // hardcode-ok: under a twentieth of a percent shows as flat
  const down = pct < -0.05; // hardcode-ok: same
  const good = inverse ? down : up;
  const cls = !up && !down ? 'flat' : good ? 'good' : 'bad';
  return (
    <span className={`lf-d ${cls}`} data-testid="lf-delta">
      {up ? '▲' : down ? '▼' : '•'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export interface KpiProps {
  label: string;
  value: ReactNode;
  delta?: number | null;
  inverse?: boolean;
  sub?: ReactNode;
  testId?: string;
}

export function Kpi({ label, value, delta = null, inverse, sub, testId }: KpiProps) {
  return (
    <div className="a2-card lf-kpi" data-testid={testId}>
      <div className="lf-kl">{label}</div>
      <div className="lf-kv">{value}</div>
      {delta !== null || sub ? (
        <div className="lf-ks">
          <Delta pct={delta} inverse={inverse} />
          {sub ? <span>{sub}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
  return <div className={`lf-grid lf-g${cols} a2-mt12`}>{children}</div>;
}

/** The accent line at the top of a page: the one thing to know. `tag` is the little label ("AI"). */
export function AiLine({ tag = 'AI', children, testId = 'lf-ai' }: { tag?: string; children: ReactNode; testId?: string }) {
  return (
    <div className="lf-ai a2-mt12" data-testid={testId}>
      <b className="lf-tag">{tag}</b>
      <span>{children}</span>
    </div>
  );
}

/** The dashed grey note at the foot of a table: how the figures are counted. */
export function GuideNote({ children, testId = 'lf-note' }: { children: ReactNode; testId?: string }) {
  return (
    <p className="lf-note a2-mt12" data-testid={testId}>
      {children}
    </p>
  );
}

export interface ChipDef {
  key: string;
  label: string;
  count?: number;
  href: string;
}

/** Filter chips with a count each (links, so the page stays a server component and the filter is in the address). */
export function Chips({ items, current, testId = 'lf-chips', label }: { items: readonly ChipDef[]; current: string; testId?: string; label?: string }) {
  return (
    <nav className="lf-chips" aria-label={label} data-testid={testId}>
      {items.map((c) => (
        <Link key={c.key} href={c.href} scroll={false} className={`lf-chip${c.key === current ? ' on' : ''}`} aria-current={c.key === current ? 'true' : undefined} data-testid={`${testId}-${c.key}`}>
          {c.label}
          {c.count === undefined ? null : <span className="lf-c">{c.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** The period buttons, with the words "compared with the period before" beside them. */
export function PeriodBar({ items, current, note, testId = 'lf-period' }: { items: readonly { key: string; label: string; href: string }[]; current: string; note?: string; testId?: string }) {
  return (
    <div className="lf-per a2-mt12" data-testid={testId}>
      <nav className="lf-seg" aria-label={note}>
        {items.map((p) => (
          <Link key={p.key} href={p.href} scroll={false} className={p.key === current ? 'on' : undefined} aria-current={p.key === current ? 'true' : undefined} data-testid={`${testId}-${p.key}`}>
            {p.label}
          </Link>
        ))}
      </nav>
      {note ? <span className="a2-xs a2-mute">{note}</span> : null}
    </div>
  );
}

export interface ChartSeries {
  name: string;
  tone: 'ok' | 'ac';
  values: readonly number[];
}

/** Two lines on one axis (spend against sales per day): plain SVG, first and last label under it, a key above. */
export function TwoLines({ labels, series, testId }: { labels: readonly string[]; series: readonly ChartSeries[]; testId: string }) {
  const W = 640; // hardcode-ok: chart box
  const H = 200; // hardcode-ok: chart box
  const pad = 6; // hardcode-ok: chart padding
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  return (
    <figure className="lf-chart" data-testid={testId}>
      <figcaption className="lf-key">
        {series.map((s) => (
          <span key={s.name}>
            <i className={s.tone} aria-hidden="true" />
            {s.name}
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => s.name).join(' / ')} preserveAspectRatio="none">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="ax" />
        {series.map((s) => (
          <polyline key={s.name} className={s.tone} fill="none" points={s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        ))}
      </svg>
      <div className="lf-ends">
        <span>{labels[0] ?? ''}</span>
        <span>{labels[n - 1] ?? ''}</span>
      </div>
    </figure>
  );
}
