// Lumen follow-up on PR 644/645 (CN-036, LUMEN-SPEC §3 item 1) — a report's figures row as the shared summary tiles.
// A report's view model already writes each figure in the admin's language (the value) with its note (the foot); this
// adds how the figure counts up: a count, an amount of money or a share, from the number behind it. A figure with no
// number behind it (a word such as "Fine", or "—") is shown as written at once. Pure, so it is tested beside it.
import type { SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import type { CountFormat } from './model';

export interface ReportFigure {
  id: string;
  label: string;
  /** The figure as written (৳1,234 / 12% / 1,234 / a word). */
  value: string;
  /** The note under the figure. */
  foot?: string;
  /** The number behind the figure (a fraction for a share, minor units for money); null or left out: none. */
  n?: number | null;
  kind?: 'count' | 'money' | 'percent' | 'word';
  tone?: SummaryTile['tone'];
  href?: string;
  data?: SummaryTile['data'];
}

export interface FigureFormats {
  locale: string;
  /** The shop's money format (currency and its minor digits), for figures of kind 'money'. */
  money?: Extract<CountFormat, { kind: 'money' }>;
}

/** The summary tiles of a report's figures row, in order. */
export function figureTiles(figs: readonly ReportFigure[], f: FigureFormats): SummaryTile[] {
  return figs.map((g) => {
    const kind = g.kind ?? 'count';
    const format: CountFormat = kind === 'money' && f.money ? f.money : kind === 'percent' ? { kind: 'percent', locale: f.locale } : { kind: 'number', locale: f.locale };
    const counts = kind !== 'word' && typeof g.n === 'number' && Number.isFinite(g.n) && !(kind === 'money' && !f.money);
    const tile: SummaryTile = { key: g.id, label: g.label, value: counts ? (g.n as number) : 0, shown: g.value, format };
    if (kind === 'word') tile.word = true;
    if (g.tone) tile.tone = g.tone;
    if (g.href) tile.href = g.href;
    if (g.data) tile.data = g.data;
    if (g.foot) tile.extra = g.foot;
    return tile;
  });
}
