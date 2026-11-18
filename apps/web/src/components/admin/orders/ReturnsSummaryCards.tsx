// PR 1121 (prototype v5, Orders › Returns & exchanges): the head row (Returned parcels, Order value with its buying
// price, Most common reason, Excel and PDF) and the "Return reasons" bars, for the page's date range. Figures only.
import type { ReturnsSummary } from '@/lib/admin-returns/summary';
import { BarList } from '../reports/ReportCharts';
import { PrintButton } from '../reports/PrintButton';
import { ShellIcon } from '../shell/ShellIcon';

export interface ReturnsSummaryWords {
  parcels: string;
  value: string;
  buying: string;
  common: string;
  commonNone: string;
  commonN: string;
  reasonsH: string;
  reasonsNone: string;
  excel: string;
  pdf: string;
}

export function ReturnsSummaryCards({ s, w, money, num, labelOf, csvHref }: { s: ReturnsSummary; w: ReturnsSummaryWords; money: (minor: number) => string; num: (n: number) => string; labelOf: (code: string) => string; csvHref: string }) {
  const top = s.reasons[0];
  return (
    <>
      <div className="a2-kpis a2-mt12 rt-sum" data-testid="returns-summary">
        <div className="a2-card a2-kpi" data-testid="returns-sum-parcels">
          <div className="a2-kl">
            <ShellIcon name="uturn" size={14} /> {w.parcels}
          </div>
          <div className="a2-kv">{num(s.parcels)}</div>
        </div>
        <div className="a2-card a2-kpi" data-testid="returns-sum-value">
          <div className="a2-kl">
            <ShellIcon name="box" size={14} /> {w.value}
          </div>
          <div className="a2-kv">{money(s.valueMinor)}</div>
          <div className="a2-kf">
            <span className="a2-kn">{w.buying.replace('{amount}', money(s.costMinor))}</span>
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="returns-sum-reason">
          <div className="a2-kl">
            <ShellIcon name="info" size={14} /> {w.common}
          </div>
          <div className="a2-kv a2-ell">{top ? labelOf(top.code) : w.commonNone}</div>
          {top ? (
            <div className="a2-kf">
              <span className="a2-kn">{w.commonN.replace('{n}', num(top.n))}</span>
            </div>
          ) : null}
        </div>
        <div className="a2-card a2-kpi" data-testid="returns-sum-files">
          <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
            <a className="a2-btn" href={csvHref} download data-testid="returns-excel">
              <ShellIcon name="dl" size={15} />
              {w.excel}
            </a>
            <PrintButton label={w.pdf} testId="returns-pdf" cls="a2-btn" />
          </div>
        </div>
      </div>
      <section className="a2-card a2-mt12" aria-label={w.reasonsH} data-testid="returns-reasons">
        <h2 className="a2-h4">{w.reasonsH}</h2>
        {s.reasons.length ? (
          <BarList testId="returns-reasons-bars" items={s.reasons.map((r) => ({ key: r.code, label: labelOf(r.code), value: r.n, shown: num(r.n) }))} />
        ) : (
          <p className="a2-xs a2-mute a2-mt6">{w.reasonsNone}</p>
        )}
      </section>
    </>
  );
}
