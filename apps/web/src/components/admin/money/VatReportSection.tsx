// S16 · PR 537 — the VAT report on Money → VAT (server-rendered, read-only): one-press periods or from/to (the rules of
// Costs and Profit & loss), Sales of delivered orders, the VAT inside it (goods, and delivery when the owner counts it),
// the goods with no rate named by SKU, then by rate, by category and day by day, and the CSV. Shown only while the VAT
// system is on; off, one line says where to switch it on. The figure is lib/vat-report.ts.
import Link from 'next/link';
import { QUICK_PERIODS, type QuickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import type { VatReport } from '@/lib/vat-report';
import { bpsToPercent } from '@/lib/vat-percent';

export interface VatReportProps {
  dict: Dict;
  here: string;
  today: string;
  from: string;
  to: string;
  current: QuickPeriod | undefined;
  notes: string[];
  limits: { maxDays: number; maxDayRows: number };
  report: VatReport | null;
  money: (minor: number) => string;
  dayText: (ymd: string) => string;
  categoryName: (id: string | null) => string;
}

export function VatReportSection(p: VatReportProps) {
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyVat.report.${k}`, vars);
  const cr = (k: string) => t(p.dict, `moneyCostReport.${k}`);
  const r = p.report;
  if (!r)
    return (
      <section className="a2-card a2-mt12" aria-labelledby="vr-title" data-testid="vat-report-off">
        <h2 className="a2-h3" id="vr-title">
          {c('title')}
        </h2>
        <p className="a2-cs">{c('off')}</p>
      </section>
    );
  const m = p.money;
  const kpis = [
    { key: 'sales', value: m(r.salesMinor), sub: c('kpi.orders', { n: r.orders }) },
    { key: 'vat', value: m(r.totalVatMinor) },
    { key: 'goodsVat', value: m(r.goodsVatMinor) },
    { key: 'deliveryVat', value: r.deliveryVatMinor === null ? '—' : m(r.deliveryVatMinor), sub: r.deliveryVatMinor === null ? c('kpi.deliveryOff') : undefined },
    { key: 'noRate', value: m(r.unratedMinor) },
  ];
  const skus = r.unratedSkus.join(', ');
  const cut = r.byDay.length > p.limits.maxDayRows;
  return (
    <section className="a2-mt12" aria-labelledby="vr-title" data-testid="vat-report" data-from={p.from} data-to={p.to}>
      <div className="a2-card">
        <h2 className="a2-h3" id="vr-title">
          {c('title')}
        </h2>
        <p className="a2-cs">{c('sub')}</p>
        <nav className="ct-actions a2-mt12" aria-label={cr('quick.label')} data-testid="vr-quick">
          {QUICK_PERIODS.map((q) => (
            <Link key={q} className={`a2-btn${p.current === q ? ' pri' : ''}`} href={`${p.here}?period=${q}#vr-title`} aria-current={p.current === q ? 'true' : undefined} data-testid={`vr-quick-${q}`}>
              {cr(`quick.${q}`)}
            </Link>
          ))}
        </nav>
        <form className="a2-mt12" action={`${p.here}#vr-title`} method="get" aria-label={cr('form.label')} data-testid="vr-form">
          <div className="ct-grid">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="vr-from">
                {cr('form.from')}
              </label>
              <input id="vr-from" name="from" type="date" className="a2-inp" max={p.today} defaultValue={p.from} />
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="vr-to">
                {cr('form.to')}
              </label>
              <input id="vr-to" name="to" type="date" className="a2-inp" max={p.today} defaultValue={p.to} />
            </div>
          </div>
          <div className="ct-actions a2-mt12">
            <button type="submit" className="a2-btn pri" data-testid="vr-show">
              {cr('form.show')}
            </button>
            <a className="a2-btn" href={`/api/admin/money/vat/report?from=${p.from}&to=${p.to}`} download data-testid="vr-export">
              {c('export')}
            </a>
          </div>
          {p.notes
            .filter((n) => n !== 'byMonth')
            .map((n) => (
              <p key={n} className="a2-xs bk-warn a2-mt12" data-testid={`vr-note-${n}`}>
                {t(p.dict, `moneyCostReport.note.${n}`, { days: p.limits.maxDays, rows: p.limits.maxDayRows })}
              </p>
            ))}
        </form>
      </div>

      <p className="a2-xs a2-mute a2-mt12">{c('period', { from: p.dayText(p.from), to: p.dayText(p.to) })}</p>
      <div className="a2-kpis k3 a2-mt12" data-testid="vr-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="a2-kpi" data-testid={`vr-kpi-${k.key}`}>
            <span className="a2-xs a2-mute">{c(`kpi.${k.key}`)}</span>
            <b className="a2-kv">{k.value}</b>
            {k.sub ? <span className="a2-xs a2-mute">{k.sub}</span> : null}
          </div>
        ))}
      </div>
      {r.unratedMinor > 0 ? (
        <p className="a2-xs bk-warn a2-mt12" data-testid="vr-norate">
          {c('noRateLine', { amount: m(r.unratedMinor), skus: skus || '—' })}
        </p>
      ) : null}

      <div className="a2-card a2-mt12" data-testid="vr-rates">
        <h3 className="a2-h3">{c('byRate.title')}</h3>
        {r.byRate.length ? (
          r.byRate.map((x) => (
            <div key={x.bps ?? 'none'} className="a2-rule" data-testid="vr-rate">
              <span>
                <b>{x.bps === null ? c('byRate.none') : `${bpsToPercent(x.bps)}%`}</b>
                <span className="a2-xs a2-mute cl-sub">{c('byRate.line', { n: x.lines, amount: m(x.netMinor) })}</span>
              </span>
              <span />
              <b>{x.vatMinor === null ? '—' : m(x.vatMinor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('byRate.empty')}</p>
        )}
      </div>

      {r.byCategory.length ? (
        <div className="a2-card a2-mt12" data-testid="vr-cats">
          <h3 className="a2-h3">{c('byCategory.title')}</h3>
          {r.byCategory.map((x) => (
            <div key={x.categoryId ?? 'none'} className="a2-rule" data-testid="vr-cat">
              <span>
                <b>{x.categoryId === null ? c('byCategory.none') : p.categoryName(x.categoryId)}</b>
                <span className="a2-xs a2-mute cl-sub">
                  {c('byRate.line', { n: x.lines, amount: m(x.netMinor) })}
                  {x.unratedMinor ? ` · ${c('byCategory.noRate', { amount: m(x.unratedMinor) })}` : ''}
                </span>
              </span>
              <span />
              <b>{m(x.vatMinor)}</b>
            </div>
          ))}
        </div>
      ) : null}

      {r.byDay.length ? (
        <div className="a2-card a2-mt12" data-testid="vr-days">
          <h3 className="a2-h3">{c('byDay.title')}</h3>
          {cut ? <p className="a2-xs a2-mute">{c('byDay.cut', { n: p.limits.maxDayRows })}</p> : null}
          {r.byDay.slice(0, p.limits.maxDayRows).map((x) => (
            <div key={x.day} className="a2-rule" data-testid="vr-day">
              <span>
                <b>{p.dayText(x.day)}</b>
                <span className="a2-xs a2-mute cl-sub">{c('byDay.line', { n: x.orders, amount: m(x.salesMinor) })}</span>
              </span>
              <span />
              <b>{m(x.vatMinor)}</b>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
