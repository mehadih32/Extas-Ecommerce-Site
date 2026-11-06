'use client';
// PR 627 (CN-036, LUMEN-SPEC §3 item 1) — the hero chart card (Home, Money, Reports): the dark hero card with what it
// counts, the big count-up number and its change against the period before, the range switch (the page's ranges, from
// its own setting: Today / 7D / 30D …), a line chart in plain SVG (no chart library) that draws in, and a read-out
// that follows the pointer (or a finger) with the point's own figure. The keyboard works too: the chart takes focus,
// ← → move along it, Home / End jump, Esc hides the read-out; each move is read out to a screen reader.
// A range with an `href` is a link (the page counts that range on the server); without one the switch shows a range
// the page already sent. The line draws only when motion is not reduced (the theme layer's --lm-t-draw is 0 then).
// Figures arrive already counted and written (`shown`): nothing here adds up money.
import Link from 'next/link';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { CHART_H, CHART_W, heroShape, pointAt, pointLeft, type CountFormat } from '@/lib/admin-lumen/model';
import { useLumen } from './context';
import { CountUp } from './CountUp';
import { Delta } from './SummaryTiles';

export interface HeroPoint {
  label: string;
  value: number;
  shown: string;
  /** The same point of the period before, as written (optional). */
  prevShown?: string;
}

export interface HeroRange {
  key: string;
  label: string;
  total: number;
  shown: string;
  delta?: number | null;
  deltaText?: string;
  vs?: string;
  points: readonly HeroPoint[];
  /** The period before, on the same points (drawn dashed). */
  prev?: readonly number[];
  /** Small figures under the number (orders, average, …), already written. */
  mini?: readonly { label: string; shown: string }[];
  /** A link to the page counting this range (the server's choice); none = switch in place. */
  href?: string;
}

export interface HeroChartProps {
  title: string;
  ranges: readonly HeroRange[];
  initial?: string;
  format: CountFormat;
  good?: 'up' | 'down';
  /** The line's name in the read-out ("Sales"). */
  seriesName: string;
  /** The period before's name in the read-out ("Before"). */
  prevName?: string;
  testId?: string;
  /** An extra class on the big number (the Today page gives its figure the class the smoke test's figure check reads). */
  numClass?: string;
}

export function HeroChart({ title, ranges, initial, format, good = 'up', seriesName, prevName, testId = 'lm-hero', numClass }: HeroChartProps) {
  const { lt } = useLumen();
  const [key, setKey] = useState(initial && ranges.some((r) => r.key === initial) ? initial : (ranges[0]?.key ?? ''));
  const [at, setAt] = useState<number | null>(null);
  const [said, setSaid] = useState('');
  const plot = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = ranges.find((x) => x.key === key) ?? ranges[0];
  const values = useMemo(() => (r ? r.points.map((p) => p.value) : []), [r]);
  const shape = useMemo(() => heroShape(values, r?.prev), [values, r?.prev]);
  if (!r) return null;
  const n = r.points.length;
  const pt = at === null ? null : r.points[at];

  const fromPointer = (ev: PointerEvent<HTMLDivElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || !box.width || !n) return;
    setAt(pointAt((ev.clientX - box.left) / box.width, n));
  };
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    let i = at ?? n - 1;
    if (ev.key === 'ArrowRight') i = Math.min(n - 1, (at ?? -1) + 1);
    else if (ev.key === 'ArrowLeft') i = Math.max(0, (at ?? n) - 1);
    else if (ev.key === 'Home') i = 0;
    else if (ev.key === 'End') i = n - 1;
    else if (ev.key === 'Escape') {
      setAt(null);
      return;
    } else return;
    ev.preventDefault();
    setAt(i);
    const p = r.points[i]!;
    setSaid(`${p.label}: ${seriesName} ${p.shown}${p.prevShown && prevName ? `, ${prevName} ${p.prevShown}` : ''}`);
  };
  const left = at === null ? 0 : pointLeft(at, n);

  return (
    <section className="lm-hero lm-in" data-testid={testId} aria-labelledby={`${uid}-t`}>
      <div className="lm-hero-top">
        <div className="lm-hero-h">
          <h2 id={`${uid}-t`}>{title}</h2>
          <div className="lm-hero-big">
            <CountUp className={numClass ? `lm-big ${numClass}` : 'lm-big'} value={r.total} shown={r.shown} format={format} testId={`${testId}-total`} />
            <Delta x={r.delta} text={r.deltaText} good={good} vs={r.vs} />
          </div>
          {r.vs ? <p className="lm-hero-vs">{r.vs}</p> : null}
        </div>
        {ranges.length > 1 ? (
          <div className="lm-seg" role="group" aria-label={lt('range')} data-testid={`${testId}-range`}>
            {ranges.map((x) =>
              x.href ? (
                <Link key={x.key} href={x.href} scroll={false} className={x.key === r.key ? 'on' : undefined} aria-current={x.key === r.key ? 'true' : undefined}>
                  {x.label}
                </Link>
              ) : (
                <button
                  key={x.key}
                  type="button"
                  className={x.key === r.key ? 'on' : undefined}
                  aria-pressed={x.key === r.key}
                  onClick={() => {
                    setKey(x.key);
                    setAt(null);
                  }}
                >
                  {x.label}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
      {n ? (
        <div className="lm-hero-chart">
          <div
            ref={plot}
            className="lm-hero-plot"
            tabIndex={0}
            role="img"
            aria-label={`${title}: ${lt('chartHelp')}`}
            onPointerMove={fromPointer}
            onPointerDown={fromPointer}
            onPointerLeave={(ev) => ev.pointerType === 'mouse' && setAt(null)}
            onKeyDown={onKey}
            onBlur={() => setAt(null)}
            data-testid={`${testId}-plot`}
          >
            <svg key={r.key} className="lm-draw" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" className="lm-hero-stop" stopOpacity=".42" />
                  <stop offset="1" className="lm-hero-stop" stopOpacity="0" />
                </linearGradient>
              </defs>
              {shape.prev ? <path d={shape.prev} className="lm-hero-prev" vectorEffect="non-scaling-stroke" /> : null}
              <path d={shape.area} fill={`url(#${uid}-g)`} />
              <path d={shape.line} className="lm-hero-line" vectorEffect="non-scaling-stroke" />
            </svg>
            {pt ? (
              <>
                <i className="lm-hero-guide" style={{ left: `${left}%` }} />
                <i className="lm-hero-dot" style={{ left: `${left}%`, top: `${shape.tops[at!] ?? 100}%` }} />
                <div className={`lm-hero-tip${left > 70 ? ' end' : left < 30 ? ' start' : ''}`} style={{ left: `${left}%` }} aria-hidden="true" data-testid={`${testId}-tip`}>
                  <b>{pt.label}</b>
                  <span>
                    {seriesName} <em>{pt.shown}</em>
                  </span>
                  {pt.prevShown && prevName ? (
                    <span className="p">
                      {prevName} <em>{pt.prevShown}</em>
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="lm-hero-x" aria-hidden="true">
            <span>{r.points[0]?.label}</span>
            {n > 2 ? <span>{r.points[Math.floor((n - 1) / 2)]?.label}</span> : null}
            {n > 1 ? <span>{r.points[n - 1]?.label}</span> : null}
          </div>
          <span className="lm-vh" aria-live="polite">
            {said}
          </span>
        </div>
      ) : (
        <p className="lm-hero-none">{lt('noData')}</p>
      )}
      {r.mini?.length ? (
        <div className="lm-hero-mini">
          {r.mini.map((m) => (
            <div key={m.label}>
              <small>{m.label}</small>
              <b>{m.shown}</b>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
