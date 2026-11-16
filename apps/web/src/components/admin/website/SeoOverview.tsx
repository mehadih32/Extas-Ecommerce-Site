// PR 1051 (prototype v5 · SEO & Google ranking): the page's first screen in the prototype's order and words. Four figures
// (SEO score ring, clicks from Google a month, searches in the top 10, average position), the Google ranking table, the
// problems to fix beside the pages with the weakest SEO, then the sitemap card beside the redirects table. All figures
// are the shop's own: the score and the problems come from the SEO health list, the ranking from Search Console (a "—"
// and the way to connect it until it is), the sitemap from the sitemaps the shop made, the redirects from the redirect list.
import Link from 'next/link';
import { SendSitemapButton } from './SendSitemapButton';

export interface SeoOverviewProps {
  c: (k: string, vars?: Record<string, string | number>) => string;
  num: (n: number) => string;
  date: (iso: string) => string;
  score: number | null;
  needFix: number;
  total: number;
  problems: { id: string; label: string; n: number }[];
  weakest: { key: string; name: string; href: string; score: number }[];
  gsc: null | { clicks: number; impressions: number; position: number | null; queries: { query: string; clicks: number; impressions: number; position: number | null }[] };
  consoleOn: boolean;
  sitemap: { madeAt: string; pages: number; address: string | null };
  redirects: { id: string; from: string; to: string; hits: number }[] | null;
  canWrite: boolean;
}

export function SeoOverview(p: SeoOverviewProps) {
  const { c, num } = p;
  const tone = p.score === null ? 'mute' : p.score >= 80 ? 'good' : p.score >= 60 ? 'warn' : 'bad'; // hardcode-ok: score bands
  const top10 = p.gsc ? p.gsc.queries.filter((q) => q.position !== null && q.position > 0 && q.position <= 10).length : null; // hardcode-ok: top-10
  const pos = p.gsc?.position == null ? '—' : num(Math.round(p.gsc.position * 10) / 10); // hardcode-ok: one decimal
  return (
    <div className="seo-ov" data-testid="seo-overview">
      <div className="seo-fig" data-testid="seo-figures">
        <div className="a2-card seo-score" data-testid="seo-score-card">
          <div className={`seo-ring ${tone}`} style={{ ['--seo-pct' as string]: `${p.score ?? 0}%` }} data-testid="seo-score">
            <b>{p.score === null ? '—' : num(p.score)}</b>
          </div>
          <div>
            <b>{c('ov.score')}</b>
            <div className="a2-kn">{p.score === null ? c('ov2.noPages') : c(tone === 'good' ? 'ov2.good' : tone === 'warn' ? 'ov2.ok' : 'ov2.bad')}</div>
            <div className="a2-kn">{c('ov2.open', { n: num(p.problems.reduce((a, x) => a + (x.n > 0 ? 1 : 0), 0)) })}</div>
          </div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('ov2.clicksMonth')}</div>
          <div className="a2-kv">{p.gsc ? num(p.gsc.clicks) : '—'}</div>
          <div className="a2-kn">{p.gsc ? '' : c('ov2.notConnected')}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('ov2.top10')}</div>
          <div className="a2-kv">
            {top10 === null ? '—' : num(top10)}
            {p.gsc ? <span className="a2-kn"> / {num(p.gsc.queries.length)}</span> : null}
          </div>
          <div className="a2-kn">{p.gsc ? '' : c('ov2.notConnected')}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{c('ov.position')}</div>
          <div className="a2-kv">{pos}</div>
          <div className="a2-kn">{c('ov2.lower')}</div>
        </div>
      </div>

      <section className="a2-card a2-mt12" data-testid="seo-ranking" aria-labelledby="seo-rank-h">
        <h2 className="a2-h3" id="seo-rank-h">
          {c('ov.google')}
        </h2>
        {p.gsc ? (
          <table className="a2-table seo-rank">
            <thead>
              <tr>
                <th>{c('ov2.words')}</th>
                <th>{c('ov2.pos')}</th>
                <th>{c('ov2.perMonth')}</th>
                <th>{c('ov.clicks')}</th>
              </tr>
            </thead>
            <tbody>
              {p.gsc.queries.map((r) => (
                <tr key={r.query}>
                  <td>
                    <b>{r.query}</b>
                  </td>
                  <td>
                    <span className={`seo-pos${r.position !== null && r.position <= 3 ? ' t3' : r.position !== null && r.position <= 10 ? ' t10' : ''}`}>{r.position === null ? '—' : `#${num(Math.round(r.position))}`}</span>
                  </td>
                  <td>{num(r.impressions)}</td>
                  <td>{num(r.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="a2-kn">{c('ov.noConsole')}</p>
        )}
        <Link className="a2-btn sm a2-mt6" href="/admin/website/seo/organic">
          {c('ov.console')}
        </Link>
      </section>

      <div className="seo-two a2-mt12">
        <section className="a2-card" data-testid="seo-problems" aria-labelledby="seo-prob-h">
          <h2 className="a2-h3" id="seo-prob-h">
            {c('ov.problems')}
          </h2>
          {p.problems.some((x) => x.n > 0) ? (
            <ul className="seo-list">
              {p.problems
                .filter((x) => x.n > 0)
                .map((x) => (
                  <li key={x.id}>
                    <span className="a2-pill warn">{c('ov2.fixSoon')}</span>
                    <span>
                      {x.label} · <b>{num(x.n)}</b>
                    </span>
                    <Link className="a2-btn sm" href={`/admin/website/seo/health?issue=${x.id}`}>
                      {c('ov2.see')}
                    </Link>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="a2-kn">{c('ov2.none')}</p>
          )}
        </section>
        <section className="a2-card" data-testid="seo-weakest" aria-labelledby="seo-weak-h">
          <h2 className="a2-h3" id="seo-weak-h">
            {c('ov2.weakTitle')}
          </h2>
          <p className="a2-kn">{c('ov2.weakSub')}</p>
          {p.weakest.length ? (
            <ul className="seo-list seo-weak">
              {p.weakest.map((r) => (
                <li key={r.key}>
                  <Link href={r.href}>{r.name}</Link>
                  <span className="seo-bar" aria-hidden="true">
                    <i style={{ width: `${r.score}%` }} />
                  </span>
                  <b>{num(r.score)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-kn">{c('ov2.none')}</p>
          )}
          <Link className="a2-btn sm a2-mt6" href="/admin/website/seo/health">
            {c('ov.all')}
          </Link>
        </section>
      </div>

      <div className="seo-two a2-mt12">
        <section className="a2-card" data-testid="seo-sitemap-card" aria-labelledby="seo-sm-h">
          <h2 className="a2-h3" id="seo-sm-h">
            {c('ov2.smTitle')}
          </h2>
          <dl className="seo-kv">
            <div>
              <dt>{c('ov2.smConsole')}</dt>
              <dd>
                <span className={`a2-pill ${p.consoleOn ? 'g' : 'warn'}`}>{c(p.consoleOn ? 'ov2.connected' : 'ov2.notConnectedPill')}</span>
              </dd>
            </div>
            <div>
              <dt>{c('ov2.smMade')}</dt>
              <dd>{p.date(p.sitemap.madeAt)}</dd>
            </div>
            <div>
              <dt>{c('ov2.smPages')}</dt>
              <dd>{num(p.sitemap.pages)}</dd>
            </div>
            {p.sitemap.address ? (
              <div>
                <dt>{c('ov2.smAddress')}</dt>
                <dd className="seo-addr2">{p.sitemap.address}</dd>
              </div>
            ) : null}
          </dl>
          {p.canWrite ? <SendSitemapButton label={c('ov2.smSend')} busy={c('ov2.smSending')} done={c('ov2.smSent')} failed={c('ov2.smFailed')} /> : null}
        </section>
        <section className="a2-card" data-testid="seo-redirects" aria-labelledby="seo-rd-h">
          <h2 className="a2-h3" id="seo-rd-h">
            {c('ov2.rdTitle')}
          </h2>
          {p.redirects && p.redirects.length > 0 ? (
            <table className="a2-table">
              <thead>
                <tr>
                  <th>{c('ov2.rdOld')}</th>
                  <th>{c('ov2.rdNew')}</th>
                  <th>{c('ov2.rdVisits')}</th>
                </tr>
              </thead>
              <tbody>
                {p.redirects.map((r) => (
                  <tr key={r.id}>
                    <td className="seo-path">{r.from}</td>
                    <td className="seo-path">{r.to}</td>
                    <td>{num(r.hits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="a2-kn">{c('ov.noRedirects')}</p>
          )}
          <Link className="a2-btn sm a2-mt6" href="/admin/website/seo/redirects">
            {c('ov.addRedirect')}
          </Link>
        </section>
      </div>
    </div>
  );
}
