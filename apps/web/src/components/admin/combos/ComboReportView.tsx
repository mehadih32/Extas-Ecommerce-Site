// S03 · PR 104 — the combo report (?tab=report): which sets sell and which colour pairs customers pick. The window
// (days) opens at `combos.report.defaultDays` and can be changed in the small form (a plain GET, no script); the lists
// show the best `combos.report.topCount`. The money is the shop's one KPI definition (PR 155, @extas/metrics): "Ordered
// value" (every placed order, on the placed day) and "Sales" (delivered orders only, on the delivered day) are two
// separate tiles, never one for the other; sets ordered and what customers saved come from the ordered sets; views,
// colour picks and adds are counted as they happen. Drawn on the server (no hooks).
import type { ComboReport } from '@extas/combos';
import { t, type Dict } from '@/lib/i18n';
import { nameIn, type Lang } from './model';

export interface ComboReportViewProps {
  dict: Dict;
  lang: Lang;
  fmt(minor: number | null): string;
  num(n: number): string;
  report: ComboReport;
  /** The days box's limits (the setting's own). */
  minDays: number;
  maxDays: number;
  here: string;
}

/** A share as a whole percentage, never above what happened (rounded down). */
const share = (part: number, whole: number) => (whole ? Math.floor((part * 100) / whole) : 0);

export function ComboReportView({ dict: d, lang, fmt, num, report: r, minDays, maxDays, here }: ComboReportViewProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const k = r.totals;
  const tiles: [string, string, string | null][] = [
    ['views', num(k.views), null],
    ['picks', num(k.picks), null],
    ['adds', num(k.adds), k.views ? tt('report.ofViews', { n: num(share(k.adds, k.views)) }) : null],
    ['sets', num(k.setsOrdered), k.adds ? tt('report.ofAdds', { n: num(share(k.setsOrdered, k.adds)) }) : null],
    ['ordered', fmt(k.orderedMinor), k.orders ? tt('report.orders', { n: num(k.orders) }) : null],
    ['sales', fmt(k.salesMinor), k.salesOrders ? tt('report.salesOrders', { n: num(k.salesOrders) }) : null],
    ['saved', fmt(k.savedMinor), null],
  ];
  const empty = !r.top.length && !r.pairs.length;
  return (
    <section className="cb-report" data-testid="cb-report">
      <div className="cb-sec-hd">
        <div>
          <h2 className="cb-h2">{tt('report.title')}</h2>
          <p className="ad-intro">{tt('report.intro', { days: num(r.days), from: r.from, to: r.to })}</p>
        </div>
        <form className="cb-report-days" method="get" action={here}>
          <input type="hidden" name="tab" value="report" />
          <label className="ad-label" htmlFor="cb-report-days">
            {tt('report.days')}
          </label>
          <div className="cb-report-days-row">
            <input id="cb-report-days" className="ad-input" type="number" name="days" inputMode="numeric" min={minDays} max={maxDays} defaultValue={r.days} />
            <button type="submit" className="ad-btn ad-btn-ghost">
              {tt('report.show')}
            </button>
          </div>
        </form>
      </div>

      <div className="cb-kpis">
        {tiles.map(([key, value, sub]) => (
          <div key={key} className="cb-kpi" data-testid={`cb-kpi-${key}`}>
            <span className="ad-mini">{tt(`report.k.${key}`)}</span>
            <b>{value}</b>
            {sub ? <span className="ad-mini">{sub}</span> : null}
          </div>
        ))}
      </div>

      {empty ? (
        <div className="cb-empty">{tt('report.empty')}</div>
      ) : (
        <div className="cb-report-cols">
          <div className="ad-card cb-report-card">
            <h3 className="cb-h3">{tt('report.topTitle')}</h3>
            {r.top.length ? (
              <ol className="cb-report-list">
                {r.top.map((x) => (
                  <li key={x.comboId} data-testid={`cb-report-${x.slug}`}>
                    <b className="cb-report-name">{nameIn(lang, x.nameEn, x.nameBn)}</b>
                    <span className="ad-mini">{tt('report.line', { sets: num(x.setsOrdered), ordered: fmt(x.orderedMinor), sales: fmt(x.salesMinor), adds: num(x.adds), views: num(x.views) })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ad-mini">{tt('report.none')}</p>
            )}
          </div>
          <div className="ad-card cb-report-card">
            <h3 className="cb-h3">{tt('report.pairsTitle')}</h3>
            <p className="ad-mini">{tt('report.pairsIntro')}</p>
            {r.pairs.length ? (
              <ol className="cb-report-list">
                {r.pairs.map((p, i) => (
                  <li key={`${p.comboId}-${i}`}>
                    <span className="cb-report-pair">
                      <span className="cb-dots" aria-hidden="true">
                        {p.colours.map((c) => (
                          <i key={c.id} style={{ background: c.hex }} />
                        ))}
                      </span>
                      <b className="cb-report-name">{p.colours.map((c) => nameIn(lang, c.nameEn, c.nameBn)).join(' + ')}</b>
                    </span>
                    <span className="ad-mini">{tt('report.pairLine', { combo: nameIn(lang, p.comboNameEn, p.comboNameBn), n: num(p.picks) })}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="ad-mini">{tt('report.none')}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
