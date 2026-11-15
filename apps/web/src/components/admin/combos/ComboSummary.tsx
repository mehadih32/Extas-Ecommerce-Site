// PR 829 (prototype v5, Products › Combos): the four figures and the one-line note above the combo lists — On the shop
// (with how many wait), Combos sold in the report's days, Combo sales in those days, and the average saving a customer
// gets — and a note naming the best seller. Drawn on the server from the combo list and the combo report; read only.
import type { ComboReport, ComboView } from '@extas/combos';
import { summaryOf } from './summary-model';
import { t, type Dict } from '@/lib/i18n';

export function ComboSummary({ dict, combos, report, liveRules, name, num, fmt }: { dict: Dict; combos: ComboView[]; report: ComboReport; liveRules: number; name: (c: { nameEn: string; nameBn: string | null }) => string; num: (n: number) => string; fmt: (minor: number) => string }) {
  const s = summaryOf(combos, report, liveRules);
  const tt = (k: string, vars?: Record<string, string | number>) => t(dict, `combos.sum.${k}`, vars);
  const tiles: [string, string, string | null][] = [
    ['onShop', num(s.onShop), tt('waiting', { n: num(s.waiting) })],
    ['sold', num(s.sold), null],
    ['sales', fmt(s.salesMinor), null],
    ['saving', `${num(s.avgSavingPercent)}%`, null],
  ];
  return (
    <div data-testid="cb-summary">
      <div className="cb-kpis">
        {tiles.map(([key, value, sub]) => (
          <div key={key} className="cb-kpi" data-testid={`cb-sum-${key}`}>
            <span className="ad-mini">{tt(`k.${key}`, { days: num(report.days) })}</span>
            <b>{value}</b>
            {sub ? <span className="ad-mini">{sub}</span> : null}
          </div>
        ))}
      </div>
      <div className={`cb-info${s.waiting ? ' warn' : ''}`} data-testid="cb-sum-note">
        <div>
          {s.best ? (
            <>
              <b>{name(s.best)}</b> {tt('best', { n: num(s.best.sets), days: num(report.days) })}
              {s.waiting ? ` ${tt('waitingNote', { n: num(s.waiting) })}` : ''}
            </>
          ) : (
            tt('none')
          )}
        </div>
      </div>
    </div>
  );
}
