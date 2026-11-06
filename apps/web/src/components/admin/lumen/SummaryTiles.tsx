// PR 627 (CN-036, LUMEN-SPEC §3 item 1) — summary tiles: a row of cards, each with what it counts, a big number that
// counts up, and the change against the period before (▲ green when it is good news, ▼ red when not; for a figure
// where less is better, such as returns, `good: 'down'` turns that round). A tile with a page opens it. The figures
// arrive already counted and written in the admin's language (the page's Fmt), so a tile never makes one up; a tile
// with nothing to compare shows "—". Drawn on the server; only the number's count-up runs in the browser.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { deltaTone, type CountFormat } from '@/lib/admin-lumen/model';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import { CountUp } from './CountUp';

export interface SummaryTile {
  key: string;
  label: string;
  value: number;
  /** The final figure as written (৳1,23,456 / 1,234). */
  shown: string;
  format: CountFormat;
  /** Change against the period before as a fraction (null: nothing to compare, drawn "—"; left out: a count with no
   *  period, no change mark at all — PR 632). */
  delta?: number | null;
  /** The change as written ("12.4%"); the sign is drawn as ▲/▼. */
  deltaText?: string;
  /** "vs the 7 days before" (screen readers and the small line under the number). */
  vs?: string;
  good?: 'up' | 'down';
  href?: string;
  icon?: ShellIconName;
  /** A small extra under the number (a spark line, a note). */
  extra?: ReactNode;
  /** A figure that is a word ("Fine", "On") is drawn smaller so it fits its tile (Lumen follow-up, PR 644). */
  word?: boolean;
  /** The figure's colour when the figure itself is news (a failed run, a waiting count): the theme's ok/warn/bad. */
  tone?: 'ok' | 'warn' | 'bad';
  /** Extra data-* marks on the tile ({ ok: 'true' } → data-ok="true"), so a page keeps what its checks read. */
  data?: Readonly<Record<string, string | number>>;
}

/** The data-* attributes of a tile. */
function dataAttrs(data: SummaryTile['data']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) out[`data-${k}`] = String(v);
  return out;
}

export function Delta({ x, text, good = 'up', vs }: { x: number | null | undefined; text?: string; good?: 'up' | 'down'; vs?: string }) {
  const v = x === undefined ? null : x;
  const tone = deltaTone(v, good);
  if (v === null) return <span className="lm-dl flat">—</span>;
  return (
    <span className={`lm-dl ${tone}`} title={vs}>
      <span aria-hidden="true">{v > 0 ? '▲' : v < 0 ? '▼' : '•'}</span> {text ?? `${Math.abs(v * 100).toFixed(1)}%`}
      {vs ? <span className="lm-vh"> {vs}</span> : null}
    </span>
  );
}

export function SummaryTiles({ tiles, label, testId = 'lm-tiles', className }: { tiles: readonly SummaryTile[]; label: string; testId?: string; className?: string }) {
  return (
    <section className={className ? `lm-tiles ${className}` : 'lm-tiles'} aria-label={label} data-testid={testId}>
      {tiles.map((tl) => {
        const body = (
          <>
            <span className="lm-tile-h">
              {tl.icon ? <ShellIcon name={tl.icon} size={18} /> : null}
              <span>{tl.label}</span>
            </span>
            <CountUp className={['lm-tile-n', tl.word ? 'w' : '', tl.tone ?? ''].filter(Boolean).join(' ')} value={tl.value} shown={tl.shown} format={tl.format} />
            <span className="lm-tile-f">
              {tl.delta !== undefined ? <Delta x={tl.delta} text={tl.deltaText} good={tl.good} vs={tl.vs} /> : null}
              {tl.vs ? (
                <small className="lm-tile-vs" aria-hidden="true">
                  {tl.vs}
                </small>
              ) : null}
            </span>
            {tl.extra ? <span className="lm-tile-x">{tl.extra}</span> : null}
          </>
        );
        return tl.href ? (
          <Link key={tl.key} className="lm-tile lm-in" href={tl.href} data-testid={`${testId}-${tl.key}`} {...dataAttrs(tl.data)}>
            {body}
          </Link>
        ) : (
          <div key={tl.key} className="lm-tile lm-in" data-testid={`${testId}-${tl.key}`} {...dataAttrs(tl.data)}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
