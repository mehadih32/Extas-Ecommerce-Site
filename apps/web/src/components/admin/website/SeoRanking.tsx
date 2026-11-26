'use client';
// PR 1232 (prototype v5 · SEO & Google ranking): the Google ranking card as the prototype draws it — "Compared with 4 weeks
// ago", the chips All, Top 3, Top 10, Rising and Falling (each with its count) and the table Search words, Position, Change,
// Searches / month, Clicks and Page. The figures are Search Console's: until it is connected the chips and the columns are
// there with no rows, and the card says how to connect it. Rising and Falling need the position of 4 weeks ago; a row
// without one ("—") is in neither.
import Link from 'next/link';
import { useState } from 'react';

export interface SeoRankRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  /** Places gained since 4 weeks ago (positive = up), or null when that is not known. */
  change: number | null;
  page: string | null;
}

type Chip = 'all' | 'top3' | 'top10' | 'rising' | 'falling';
const CHIPS: readonly Chip[] = ['all', 'top3', 'top10', 'rising', 'falling'];
const TOP3 = 3; // hardcode-ok: the prototype's "Top 3" chip
const TOP10 = 10; // hardcode-ok: page one of Google, the prototype's "Top 10" chip

const keep = (c: Chip, r: SeoRankRow): boolean => {
  if (c === 'top3') return r.position !== null && r.position > 0 && r.position <= TOP3;
  if (c === 'top10') return r.position !== null && r.position > 0 && r.position <= TOP10;
  if (c === 'rising') return r.change !== null && r.change > 0;
  if (c === 'falling') return r.change !== null && r.change < 0;
  return true;
};

export function SeoRanking({ words, rows, connected, locale }: { words: Record<string, string>; rows: SeoRankRow[] | null; connected: boolean; locale: string }) {
  const [chip, setChip] = useState<Chip>('all');
  const num = (n: number) => new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(n);
  const list = rows ?? [];
  const shown = list.filter((r) => keep(chip, r));
  const pos = (p: number | null) => (p === null ? '—' : `#${num(Math.round(p))}`);
  return (
    <section className="a2-card a2-mt12" data-testid="seo-ranking" aria-labelledby="seo-rank-h">
      <h2 className="a2-h3" id="seo-rank-h">
        {words.title}
      </h2>
      <p className="a2-kn">{words.compared}</p>
      <div className="a2-views a2-mt6" role="group" aria-label={words.title} data-testid="seo-rank-chips">
        {CHIPS.map((c) => (
          <button key={c} type="button" className={`a2-view${chip === c ? ' on' : ''}`} aria-pressed={chip === c} onClick={() => setChip(c)}>
            {words[c]}
            {rows ? <span className="a2-cnt">{num(list.filter((r) => keep(c, r)).length)}</span> : null}
          </button>
        ))}
      </div>
      <div className="seo-rankw">
        <table className="a2-table seo-rank">
          <thead>
            <tr>
              <th>{words.colWords}</th>
              <th>{words.colPos}</th>
              <th>{words.colChange}</th>
              <th>{words.colSearches}</th>
              <th>{words.colClicks}</th>
              <th>{words.colPage}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.query}>
                <td>
                  <b>{r.query}</b>
                </td>
                <td>
                  <span className={`seo-pos${r.position !== null && r.position <= TOP3 ? ' t3' : r.position !== null && r.position <= TOP10 ? ' t10' : ''}`}>{pos(r.position)}</span>
                </td>
                <td>{r.change === null || r.change === 0 ? '—' : r.change > 0 ? `▲ ${num(r.change)}` : `▼ ${num(-r.change)}`}</td>
                <td>{num(r.impressions)}</td>
                <td>{num(r.clicks)}</td>
                <td className="seo-path">{r.page ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!connected || !rows ? <p className="a2-kn">{words.noConsole}</p> : !shown.length ? <p className="a2-kn">{words.noneHere}</p> : null}
      <Link className="a2-btn sm a2-mt6" href="/admin/website/seo/organic">
        {words.console}
      </Link>
    </section>
  );
}
