// S08 · PR 192 — one courier performance table (Reports › Delivery & RTO, and a courier's own page): parcels with a final
// outcome, delivered, on time against the promise, came back, refused at the door, and the exceptions on the way. A rate
// with nothing under it shows "—", never 0 %.
import type { PerfLine } from '@extas/shipping';
import { t, type Dict } from '@/lib/i18n';

export function pct(x: number | null, locale: string): string {
  return x === null ? '—' : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' }).format(x);
}

export function PerfTable({ dict, rows, first, locale, testId }: { dict: Dict; rows: readonly PerfLine[]; first: 'courier' | 'zone' | 'district'; locale: string; testId: string }) {
  const c = (k: string) => t(dict, `courierReport.col.${k}`);
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(x);
  return (
    <div className="a2-tblw a2-mt12">
      <table className="a2-tbl" data-testid={testId}>
        <thead>
          <tr>
            <th>{c(first)}</th>
            <th className="r">{c('parcels')}</th>
            <th className="r">{c('delivered')}</th>
            <th className="r">{c('onTime')}</th>
            <th className="r">{c('returned')}</th>
            <th className="r">{c('refused')}</th>
            <th className="r">{c('tries')}</th>
            <th className="r">{c('lost')}</th>
            <th className="r">{c('damaged')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid="perf-row">
              <td className="a2-tdh">
                <b>{r.label || '—'}</b>
              </td>
              <td className="r" data-l={c('parcels')}>
                {n(r.parcels)}
              </td>
              <td className="r cr-rate" data-l={c('delivered')}>
                {pct(r.successRate, locale)}
                <span className="cr-sub">{n(r.delivered)}</span>
              </td>
              <td className="r cr-rate" data-l={c('onTime')}>
                {pct(r.onTimeRate, locale)}
                <span className="cr-sub">
                  {n(r.onTime)}/{n(r.promised)}
                </span>
              </td>
              <td className="r cr-rate" data-l={c('returned')}>
                {pct(r.returnRate, locale)}
                <span className="cr-sub">{n(r.returned)}</span>
              </td>
              <td className="r cr-rate" data-l={c('refused')}>
                {pct(r.refusalRate, locale)}
                <span className="cr-sub">{n(r.refused)}</span>
              </td>
              <td className="r" data-l={c('tries')}>
                {n(r.exceptions.ATTEMPT_FAILED)}
              </td>
              <td className="r" data-l={c('lost')}>
                {n(r.exceptions.LOST)}
              </td>
              <td className="r" data-l={c('damaged')}>
                {n(r.exceptions.DAMAGED)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
