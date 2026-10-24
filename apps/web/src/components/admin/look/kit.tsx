// PR 12 (CN-025) — the V12.4 drawing kit as server components (demo 97z-adm2-rd1-core.js §3: a3Card, a3Delta, a3Bar,
// a3Line, a3Bars, a3Spark, a3Funnel, a3Heat, a3Empty, a3Lnk). Every page redesigned in the V12.4 language draws with
// these, so a chart, a card or a ▲/▼ looks the same on every page and in every design. Colours are the stylesheet's
// tokens (app/admin/look.css, `--a3-*`); charts carry their figures, already written in the admin's language, for the
// hover tip (ChartTips.tsx) and an aria-label for screen readers.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import { heatAlpha, niceScale, smoothPath, sparkPath, ticksOf, xLabelsAt } from '@/lib/admin-look/chart';
import type { Fmt } from './fmt';

export function Card({ cls, id, title, sub, right, children, testId }: { cls?: string; id?: string; title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className={`a3-card${cls ? ` ${cls}` : ''}`} id={id} data-testid={testId}>
      {title ? (
        <div className="a3-chd">
          <div>
            <h2>{title}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          {right}
        </div>
      ) : null}
      <div className="a3-cb">{children}</div>
    </section>
  );
}

/** ▲/▼ against the period before (x is a fraction; `pts` writes percentage points; `good: 'down'` when less is better). */
export function Delta({ f, x, good = 'up', pts, raw }: { f: Fmt; x: number | null | undefined; good?: 'up' | 'down'; pts?: boolean; raw?: string }) {
  if (x === null || x === undefined || !Number.isFinite(x)) return <span className="a3-dl0">—</span>;
  const up = x >= 0;
  const ok = good === 'down' ? !up : up;
  const txt = raw ?? (pts ? f.t('dsh.pts', { n: Math.abs(x * 100).toFixed(1) }) : `${Math.abs(x * 100).toFixed(1)}%`);
  return (
    <span className={`a3-dlt ${ok ? 'g' : 'b'}`}>
      {up ? '▲' : '▼'} {txt}
    </span>
  );
}

export function Bar({ p, tone }: { p: number; tone?: 'bad' }) {
  return (
    <span className={`a3-bar${tone ? ` ${tone}` : ''}`}>
      <i style={{ width: `${Math.max(1.5, Math.min(100, p * 100)).toFixed(1)}%` }} />
    </span>
  );
}

export function Pill({ tone, children, title }: { tone: 'ok' | 'gold' | 'bad' | 'line'; children: ReactNode; title?: string }) {
  return (
    <span className={`a3-pill ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Empty({ text, title, small = true, icon = 'check', testId }: { text: ReactNode; title?: ReactNode; small?: boolean; icon?: ShellIconName; testId?: string }) {
  return (
    <div className={`a3-empty${small ? ' sm' : ''}`} data-testid={testId}>
      <ShellIcon name={icon} size={small ? 18 : 22} />
      {title ? <b>{title}</b> : null}
      <span>{text}</span>
    </div>
  );
}

/** A card whose numbers have no store yet: it names the stage that brings them (never a made-up figure). */
export function Soon({ f, stage, what, testId }: { f: Fmt; stage: string; what: string; testId?: string }) {
  return <Empty icon="clock" text={f.t('dsh.soon', { what, stage: f.t(`dsh.stage.${stage}`) })} testId={testId ?? `dsh-soon-${stage}`} />;
}

export function Lnk({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="a3-lnk" href={href}>
      {children}
      <ShellIcon name="cr" size={14} />
    </Link>
  );
}

/** A small line (no axis), in a token colour. */
export function Spark({ id, values, color = 'var(--a3-c1)', w = 120, h = 36, area = true }: { id: string; values: readonly (number | null)[]; color?: string; w?: number; h?: number; area?: boolean }) {
  const p = sparkPath(
    values.map((v) => v ?? 0),
    w,
    h,
  );
  return (
    <svg className="a3-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false" style={{ color }}>
      {area ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity=".18" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={p.area} fill={`url(#${id})`} />
        </>
      ) : null}
      <path d={p.d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={p.last[0].toFixed(1)} cy={p.last[1].toFixed(1)} r={2.6} fill="currentColor" />
    </svg>
  );
}

export interface Series {
  v: readonly number[];
  color: string;
  name: string;
  /** Each value as written in the tip. */
  shown: readonly string[];
  area?: boolean;
  dash?: boolean;
  w?: number;
}

const H = 100;

/** One label per distinct text: an empty chart (all 0) has its tiny scale, which would print "0" on every line. */
function YLabels({ ticks, max, yfmt }: { ticks: number[]; max: number; yfmt: (v: number) => string }) {
  const shown = ticks.filter((v, i) => i === 0 || yfmt(v) !== yfmt(ticks[i - 1] ?? v));
  return (
    <div className="a3-cy" aria-hidden="true">
      {shown.map((v) => (
        <span key={v} style={{ top: `${((H - (v / max) * H) / H) * 100}%` }}>
          {yfmt(v)}
        </span>
      ))}
    </div>
  );
}

/** The figures a chart hands to the hover tip (ChartTips.tsx reads them; no HTML inside). */
export interface TipData {
  l: readonly string[];
  s: { n: string; c: string; v: readonly string[] }[];
  f?: readonly string[];
  b?: boolean;
  /** The dot's height per point (0–100, % from the top), for a line. */
  d?: readonly number[];
  dc?: string;
}

/** A line or area chart (demo a3Line). */
export function LineChart({ id, labels, xl, series, h = 220, label, yfmt, foot, ticks = 3 }: { id: string; labels: readonly string[]; xl?: readonly string[]; series: readonly Series[]; h?: number; label: string; yfmt: (v: number) => string; foot?: readonly string[]; ticks?: number }) {
  const n = labels.length;
  const sc = niceScale(Math.max(1, ...series.flatMap((s) => s.v)) * 1.05, ticks);
  const tk = ticksOf(sc);
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * 1000 : 500);
  const y = (v: number) => H - (v / sc.max) * H;
  const last = series[series.length - 1];
  const lv = last?.v[n - 1] ?? 0;
  const tip: TipData = { l: labels, s: series.map((s) => ({ n: s.name, c: s.color, v: s.shown })), f: foot, d: last ? last.v.map((v) => Number(((y(v) / H) * 100).toFixed(2))) : [], dc: last?.color };
  return (
    <div className="a3-chart" style={{ height: h }} role="img" aria-label={label}>
      <YLabels ticks={tk} max={sc.max} yfmt={yfmt} />
      <div className="a3-cp" data-a3c={JSON.stringify(tip)}>
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            {series.map((s, k) =>
              s.area ? (
                <linearGradient key={k} id={`${id}g${k}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity=".16" />
                  <stop offset="1" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ) : null,
            )}
          </defs>
          {tk.map((v) => (
            <line key={v} x1={0} x2={1000} y1={y(v)} y2={y(v)} style={{ stroke: v ? 'var(--a3-grid)' : 'var(--a3-grid0)' }} vectorEffect="non-scaling-stroke" strokeDasharray={v ? '2 4' : undefined} />
          ))}
          {series.map((s, k) => {
            const d = smoothPath(s.v.map((v, i) => [x(i), y(v || 0)] as [number, number]));
            return (
              <g key={k}>
                {s.area ? <path d={`${d} L1000,${H} L0,${H} Z`} fill={`url(#${id}g${k})`} /> : null}
                <path d={d} fill="none" style={{ stroke: s.color }} strokeWidth={s.w ?? 2} strokeDasharray={s.dash ? '5 5' : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>
        {last ? <i className="a3-ce" style={{ left: '100%', top: `${(y(lv) / H) * 100}%`, borderColor: last.color }} /> : null}
        <i className="a3-cg" />
        <i className="a3-cd" style={{ borderColor: last?.color }} />
      </div>
      <div className="a3-cx" aria-hidden="true">
        {xLabelsAt(n).map((p) => (
          <span key={p.i} className={p.end ? 'e' : undefined} style={{ left: `${p.left}%` }}>
            {(xl ?? labels)[p.i]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Bars, stacked when there are several series, with an optional line on top (demo a3Bars). */
export function BarsChart({ labels, xl, series, line, h = 200, label, yfmt, ticks = 3 }: { labels: readonly string[]; xl?: readonly string[]; series: readonly Series[]; line?: Series; h?: number; label: string; yfmt: (v: number) => string; ticks?: number }) {
  const n = labels.length;
  const tot = labels.map((_, i) => series.reduce((s, x) => s + (x.v[i] ?? 0), 0));
  const sc = niceScale(Math.max(1, ...tot) * 1.05, ticks);
  const tk = ticksOf(sc);
  const bw = 1000 / Math.max(1, n);
  const gap = Math.min(bw * 0.34, 14);
  const rects: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    let acc = 0;
    series.forEach((s, k) => {
      const v = s.v[i] ?? 0;
      if (!v) return;
      const hh = (v / sc.max) * H;
      rects.push(<rect key={`${i}-${k}`} x={(i * bw + gap / 2).toFixed(2)} y={(H - acc - hh).toFixed(2)} width={(bw - gap).toFixed(2)} height={hh.toFixed(2)} style={{ fill: s.color }} />);
      acc += hh;
    });
  }
  const lm = line ? Math.max(1, ...line.v) * 1.1 : 1;
  const all = line ? [...series, line] : series;
  const tip: TipData = { l: labels, s: all.map((s) => ({ n: s.name, c: s.color, v: s.shown })), b: true };
  const every = Math.max(1, Math.ceil(n / 6));
  return (
    <div className="a3-chart" style={{ height: h }} role="img" aria-label={label}>
      <YLabels ticks={tk} max={sc.max} yfmt={yfmt} />
      <div className="a3-cp" data-a3c={JSON.stringify(tip)}>
        <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {tk.map((v) => {
            const yy = H - (v / sc.max) * H;
            return <line key={v} x1={0} x2={1000} y1={yy} y2={yy} style={{ stroke: v ? 'var(--a3-grid)' : 'var(--a3-grid0)' }} vectorEffect="non-scaling-stroke" strokeDasharray={v ? '2 4' : undefined} />;
          })}
          {rects}
          {line ? <path d={smoothPath(line.v.map((v, i) => [(i + 0.5) * bw, H - (v / lm) * H] as [number, number]))} fill="none" style={{ stroke: line.color }} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        <i className="a3-cg bar" style={{ width: `${100 / Math.max(1, n)}%` }} />
      </div>
      <div className="a3-cx" aria-hidden="true">
        {Array.from({ length: Math.ceil(n / every) }, (_, k) => k * every).map((j) => (
          <span key={j} style={{ left: `${((j + 0.5) / n) * 100}%` }}>
            {(xl ?? labels)[j]}
          </span>
        ))}
      </div>
    </div>
  );
}

export interface FunnelStep {
  l: string;
  n: number;
  color: string;
  href?: string;
  note?: string;
}

/** The order funnel: each step's bar against the first, and its share of the step before (demo a3Funnel). */
export function Funnel({ f, steps }: { f: Fmt; steps: readonly FunnelStep[] }) {
  const top = steps[0]?.n || 1;
  return (
    <div className="a3-fun">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1]!.n : null;
        const inner = (
          <>
            <div className="a3-fh">
              <span>{s.l}</span>
              <b className="a3-num">{f.n(s.n)}</b>
            </div>
            <div className="a3-fb">
              <i style={{ width: `${Math.max(2, (s.n / top) * 100).toFixed(1)}%`, background: s.color }} />
            </div>
            <div className="a3-fn">
              {prev !== null ? f.t('dsh.funnel.ofBefore', { n: prev ? Math.round((s.n / prev) * 100) : 0 }) : f.t('dsh.funnel.placedHere')}
              {s.note ? ` · ${s.note}` : ''}
            </div>
          </>
        );
        return s.href ? (
          <Link key={i} className="a3-fs" href={s.href}>
            {inner}
          </Link>
        ) : (
          <div key={i} className="a3-fs">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/** A weekday × time heat map (demo a3Heat); each cell names its count in the tip. */
export function Heat({ rows, cols, cell, label, every = 2 }: { rows: readonly { l: string; v: readonly number[] }[]; cols: readonly string[]; cell: (v: number) => string; label: string; every?: number }) {
  const mx = Math.max(1, ...rows.flatMap((r) => r.v));
  return (
    <div className="a3-heat" role="img" aria-label={label} style={{ gridTemplateColumns: `44px repeat(${cols.length},minmax(0,1fr))` }}>
      <span />
      {cols.map((c, i) => (
        <span key={i} className="a3-hx" aria-hidden="true">
          {i % every ? '' : c}
        </span>
      ))}
      {rows.map((r) => [
        <span key={`${r.l}-l`} className="a3-hy" aria-hidden="true">
          {r.l}
        </span>,
        ...r.v.map((v, i) => {
          const a = heatAlpha(v, mx);
          return <i key={`${r.l}-${i}`} style={{ background: a ? `rgba(var(--a3-heat-rgb),${a})` : 'var(--a3-heat0)' }} data-tip-t={`${r.l} · ${cols[i]}`} data-tip-s={cell(v)} />;
        }),
      ])}
    </div>
  );
}

/** Two words for a tile or a row with its figure, as a link when it has one. */
export function Tile({ href, className, children, testId }: { href?: string; className: string; children: ReactNode; testId?: string }) {
  return href ? (
    <Link className={className} href={href} data-testid={testId}>
      {children}
    </Link>
  ) : (
    <div className={className} data-testid={testId}>
      {children}
    </div>
  );
}
