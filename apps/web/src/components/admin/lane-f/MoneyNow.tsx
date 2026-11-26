// Parity round 3, lane F2 (PR 821) — the prototype v5 Finance › Overview blocks under the profit snapshot: "Where the money is
// now" (four tiles), "Courier money", "Next 14 days of cash" and "Books match with the ERP". Figures arrive ready written
// (the page formats them); words come from the page's dictionary; colours are --lm-* tokens.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Kpi } from './Parts';
import './lane-f.css';
import './money-now.css';

/** "<b>word</b> plain" → bold elements, never raw HTML. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('<b>') ? <b key={i}>{p.slice(3, -4)}</b> : <span key={i}>{p}</span>))}
    </>
  );
}

export interface NowTile {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone?: 'warn' | 'bad';
  href: string;
  mini?: { label: string; shown: string }[];
  holdBar?: ('u' | 'w' | 'x' | '')[];
}

/** Small line icons for the four tiles (the prototype puts one before each label). */
const TILE_ICON: Record<string, string> = {
  hand: 'M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2',
  couriers: 'M2 6h11v9H2zM13 9h4l3 3v3h-7zM6 18a1.5 1.5 0 1 0 0 .01M16 18a1.5 1.5 0 1 0 0 .01',
  erp: 'M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4',
  wallets: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};

export function MoneyTiles({ title, tiles }: { title: string; tiles: readonly NowTile[] }) {
  return (
    <section className="a2-mt12" data-testid="fn-now" aria-label={title}>
      <h2 className="a2-h3">{title}</h2>
      <div className="lf-tiles a2-mt6">
        {tiles.map((x) => (
          <Link key={x.key} href={x.href} className={`lf-tile${x.tone ? ` ${x.tone}` : ''}`} data-testid={`fn-now-${x.key}`}>
            <div className="lf-tl">
              {TILE_ICON[x.key] ? (
                <svg className="lf-ti" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={TILE_ICON[x.key]} />
                </svg>
              ) : null}
              {x.label}
            </div>
            <div className="lf-tv">{x.value}</div>
            <div className="lf-ts">{x.sub}</div>
            {x.mini?.length ? (
              <div className="lf-mini">
                {x.mini.map((m) => (
                  <span key={m.label}>
                    {m.label} <b>{m.shown}</b>
                  </span>
                ))}
              </div>
            ) : null}
            {x.holdBar ? (
              <div className="lf-hold" aria-hidden="true">
                {x.holdBar.map((c, i) => (
                  <i key={i} className={c} />
                ))}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

export interface CourierMoneyProps {
  texts: { title: string; sub: string; cod: string; codSub: string; claims: string; claimsSub: string; payouts: string; noPayout: string; c360: string; account: string; match: string };
  codShown: string;
  claimsShown: string;
  claimsBad: boolean;
  payouts: { id: string; label: string; tone: 'info' | 'warn' | 'good' }[];
  links: { c360: string; account: string; match: string };
}

export function CourierMoney({ texts, codShown, claimsShown, claimsBad, payouts, links }: CourierMoneyProps) {
  return (
    <section className="a2-card a2-mt12" data-testid="fn-courier-money" aria-label={texts.title}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{texts.title}</h2>
          <div className="a2-cs">{texts.sub}</div>
        </div>
      </div>
      <div className="lf-grid lf-g3">
        <Kpi label={texts.cod} value={codShown} sub={texts.codSub} testId="fn-cm-cod" />
        <Kpi label={texts.claims} value={<span className={claimsBad ? 'lf-out' : undefined}>{claimsShown}</span>} sub={texts.claimsSub} testId="fn-cm-claims" />
        <div className="lf-kpi">
          <div className="lf-kl">{texts.payouts}</div>
          {payouts.length ? (
            <div className="lf-chips" data-testid="fn-cm-payouts">
              {payouts.map((p) => (
                <span key={p.id} className={`a2-pill ${p.tone === 'good' ? 'ok' : p.tone === 'warn' ? 'warn' : ''}`}>
                  {p.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="a2-xs a2-mute">{texts.noPayout}</div>
          )}
        </div>
      </div>
      <div className="lf-acts a2-mt12">
        <Link className="a2-btn sm primary" href={links.c360}>
          {texts.c360}
        </Link>
        <Link className="a2-btn sm" href={links.account}>
          {texts.account}
        </Link>
        <Link className="a2-btn sm ghost" href={links.match}>
          {texts.match}
        </Link>
      </div>
    </section>
  );
}

export interface ForecastProps {
  texts: { title: string; series: string; tightest: string; inWord: string; outWord: string; dayBy: string; dayHead: string; inHead: string; outHead: string; handHead: string; tightBadge: string; fixed: string; none: string; start: string };
  days: { day: string; label: string; inShown: string; outShown: string; balShown: string; bal: number; tight: boolean }[];
  tightLine: string | null;
  tightBad: boolean;
  inTotal: string;
  outTotal: string;
  startLine: string;
  fixedLine: string | null;
}

/** One line of the money in hand across the next days, the tightest day, in and out, and the day-by-day table. */
export function CashForecast({ texts, days, tightLine, tightBad, inTotal, outTotal, startLine, fixedLine }: ForecastProps) {
  const W = 640; // hardcode-ok: chart box
  const H = 170; // hardcode-ok: chart box
  const pad = 6; // hardcode-ok: chart padding
  const vals = days.map((d) => d.bal);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const x = (i: number) => (days.length <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (days.length - 1));
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
  return (
    <section className="a2-card" data-testid="fn-forecast" aria-label={texts.title}>
      <div className="a2-ch">
        <h2 className="a2-h3">{texts.title}</h2>
      </div>
      {days.length ? (
        <>
          <figure className="lf-chart">
            <figcaption className="lf-key">
              <span>
                <i className="ac" aria-hidden="true" />
                {texts.series}
              </span>
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={texts.series} preserveAspectRatio="none" style={{ height: H }}>
              <line x1={pad} y1={y(0)} x2={W - pad} y2={y(0)} className="ax" />
              <polyline className="ac" fill="none" points={days.map((d, i) => `${x(i).toFixed(1)},${y(d.bal).toFixed(1)}`).join(' ')} />
            </svg>
            <div className="lf-ends">
              <span>{days[0]!.label}</span>
              <span>{days[days.length - 1]!.label}</span>
            </div>
          </figure>
          {tightLine ? (
            <p className={`lf-callout ${tightBad ? 'warn' : 'ok'}`} data-testid="fn-tight">
              <Rich text={tightLine} />
            </p>
          ) : null}
          <div className="lf-io a2-xs">
            <span className="lf-in">
              + {inTotal} {texts.inWord}
            </span>
            <span className="lf-out">
              − {outTotal} {texts.outWord}
            </span>
          </div>
          {fixedLine ? <div className="a2-xs a2-mute a2-mt6">{fixedLine}</div> : null}
          <details className="lf-day a2-mt12">
            {/* PR 1233: the prototype draws "Day by day" as a button; the summary says it is one */}
            <summary className="a2-btn sm ghost" role="button">
              {texts.dayBy}
            </summary>
            <p className="a2-xs a2-mute a2-mt6">{startLine}</p>
            <div className="lf-tw">
              <table className="lf-table">
                <thead>
                  <tr>
                    <th>{texts.dayHead}</th>
                    <th className="r">{texts.inHead}</th>
                    <th className="r">{texts.outHead}</th>
                    <th className="r">{texts.handHead}</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day}>
                      <td>
                        {d.label}
                        {d.tight ? <span className="a2-pill warn lf-ml">{texts.tightBadge}</span> : null}
                      </td>
                      <td className="r lf-in">{d.inShown}</td>
                      <td className="r lf-out">{d.outShown}</td>
                      <td className="r">
                        <b>{d.balShown}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className="a2-xs a2-mute">{texts.none}</p>
      )}
    </section>
  );
}

export function BooksMatch({ title, tone, children, action }: { title: string; tone: 'ok' | 'bad' | 'info'; children: ReactNode; action?: { label: string; href: string } }) {
  return (
    <section className="a2-card a2-mt12" data-testid="fn-books-match" aria-label={title}>
      <div className="a2-ch">
        <h2 className="a2-h3">{title}</h2>
      </div>
      <p className={`lf-callout ${tone === 'bad' ? 'bad' : tone === 'ok' ? 'ok' : 'info'}`}>{children}</p>
      {action ? (
        <Link className="a2-btn sm a2-mt6" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
