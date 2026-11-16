// Parity round 3, lane F (PR 809) — the two blocks the prototype v5 puts on Finance › Overview: the "Profit snapshot" (net profit
// for today, the last 7 days and this month, each with its change and a sales-against-costs bar) and "Decide today" (one card
// per thing waiting, each with one action). Figures come from the page; words from its dictionary; colours are --lm-* tokens.
import Link from 'next/link';
import { Delta } from './Parts';
import './lane-f.css';
import './money-parts.css';

export interface SnapCol {
  key: string;
  label: string;
  vs: string;
  href: string;
  netShown: string;
  negative: boolean;
  delta: number | null;
  salesShown: string;
  costShown: string;
  /** Share of sales the costs took, 0–100 (100 when there are no sales but a loss). */
  costPct: number;
}

export function ProfitSnapshot({ cols, texts }: { cols: readonly SnapCol[]; texts: { title: string; sub: string; open: string; bar: string; sales: string; costs: string; note: string; more: string; moreHref: string } }) {
  return (
    <section className="a2-card a2-mt12" data-testid="fn-snapshot" aria-label={texts.title}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{texts.title}</h2>
          <div className="a2-cs">{texts.sub}</div>
        </div>
        <Link className="lf-more" href={texts.moreHref}>
          {texts.more} →
        </Link>
      </div>
      <div className="lf-snap">
        {cols.map((c) => (
          <Link key={c.key} className="lf-sn" href={c.href} title={texts.open} data-testid={`fn-snap-${c.key}`}>
            <div className="lf-snl">
              <span>{c.label}</span>
              <Delta pct={c.delta} />
            </div>
            <div className={`lf-snv${c.negative ? ' neg' : ''}`}>{c.netShown}</div>
            <div className="lf-sc" title={texts.bar}>
              <i className="cost" style={{ width: `${c.costPct}%` }} />
              <i className="keep" style={{ width: `${100 - c.costPct}%` }} />
            </div>
            <div className="lf-snd">
              <span>
                {texts.sales} <b>{c.salesShown}</b>
              </span>
              <span>
                {texts.costs} <b>{c.costShown}</b>
              </span>
            </div>
            <div className="a2-xs a2-mute">{c.vs}</div>
          </Link>
        ))}
      </div>
      <p className="lf-note a2-mt12">{texts.note}</p>
    </section>
  );
}

export interface DecideCard {
  key: string;
  tone: 'ok' | 'warn' | 'bad';
  head: string;
  text: string;
  action?: { label: string; href: string };
}

export function DecideToday({ cards, texts }: { cards: readonly DecideCard[]; texts: { title: string; sub: string; none: string } }) {
  return (
    <section className="a2-card a2-mt12" data-testid="fn-decide" aria-label={texts.title}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{texts.title}</h2>
          <div className="a2-cs">{texts.sub}</div>
        </div>
      </div>
      {cards.length ? (
        <div className="lf-dec">
          {cards.map((c) => (
            <div key={c.key} className="lf-dc" data-testid={`fn-decide-${c.key}`}>
              <div className="lf-dh">
                <i className={c.tone} />
                {c.head}
              </div>
              <p>{c.text}</p>
              {c.action ? (
                <Link className="a2-btn sm" href={c.action.href}>
                  {c.action.label}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="a2-xs a2-mute">{texts.none}</p>
      )}
    </section>
  );
}

export interface MonthRow {
  key: string;
  label: string;
  shown: string;
  /** 0-100, the bar's length against sales. */
  pct: number;
  kind: 'in' | 'out' | 'net';
}

/** Prototype v5 Finance > Overview "This month so far": the month's profit line by line, as bars against sales. */
export function MonthSoFar({ title, more, moreHref, rows, tiles, foot }: { title: string; more: string; moreHref: string; rows: readonly MonthRow[]; tiles: readonly { key: string; label: string; shown: string }[]; foot: string }) {
  return (
    <section className="a2-card" data-testid="fn-month" aria-label={title}>
      <div className="a2-ch">
        <h2 className="a2-h3">{title}</h2>
        <Link className="lf-more" href={moreHref}>
          {more} →
        </Link>
      </div>
      <div className="lf-ms">
        {rows.map((r) => (
          <div key={r.key} className={`lf-msr${r.kind === 'out' ? '' : ' tot'}`}>
            <span>{r.label}</span>
            <span className="lf-msb" aria-hidden="true">
              <i className={r.kind === 'out' ? '' : r.kind} style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }} />
            </span>
            <b>{r.shown}</b>
          </div>
        ))}
      </div>
      <div className="lf-mst">
        {tiles.map((x) => (
          <div key={x.key}>
            {x.label}
            <b>{x.shown}</b>
          </div>
        ))}
      </div>
      <p className="lf-note a2-mt12">{foot}</p>
    </section>
  );
}
