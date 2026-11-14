// S28 · PR 714-717 — the period bar of the v5 report pages (server component): the one-press periods, two dates and "Show",
// and the CSV download. The same words and period rules as the money reports (`moneyCostReport.*`, `costs.report`).
import Link from 'next/link';
import { QUICK_PERIODS, type QuickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';

export interface ReportBarProps {
  dict: Dict;
  here: string;
  /** The testid prefix (pl, pr, mk). */
  id: string;
  from: string;
  to: string;
  today: string;
  current: QuickPeriod | undefined;
  csv: string;
  notes: readonly string[];
  limitDays: number;
}

export function ReportBar({ dict: d, here, id, from, to, today, current, csv, notes, limitDays }: ReportBarProps) {
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const c = (k: string, v?: Record<string, string | number>) => t(d, `reportsV5.common.${k}`, v);
  return (
    <>
      <nav className="ct-actions a2-mt12" aria-label={cr('quick.label')} data-testid={`${id}-quick`}>
        {QUICK_PERIODS.map((p) => (
          <Link key={p} className={`a2-btn cr-tap${current === p ? ' pri' : ''}`} href={`${here}?period=${p}`} aria-current={current === p ? 'true' : undefined} data-testid={`${id}-quick-${p}`}>
            {cr(`quick.${p}`)}
          </Link>
        ))}
      </nav>
      <form className="a2-card a2-mt12" action={here} method="get" aria-label={cr('form.label')} data-testid={`${id}-form`}>
        <div className="ct-grid">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-from`}>
              {cr('form.from')}
            </label>
            <input id={`${id}-from`} name="from" type="date" className="a2-inp" max={today} defaultValue={from} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-to`}>
              {cr('form.to')}
            </label>
            <input id={`${id}-to`} name="to" type="date" className="a2-inp" max={today} defaultValue={to} />
          </div>
        </div>
        <div className="ct-actions a2-mt12">
          <button type="submit" className="a2-btn pri cr-tap" data-testid={`${id}-show`}>
            {cr('form.show')}
          </button>
          <a className="a2-btn cr-tap" href={csv} download data-testid={`${id}-csv`}>
            {c('csv')}
          </a>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('csvHelp')}</p>
        {notes
          .filter((n) => n !== 'byMonth')
          .map((n) => (
            <p key={n} className="a2-xs bk-warn a2-mt6" data-testid={`${id}-note-${n}`}>
              {c(`note.${n}`, { days: limitDays })}
            </p>
          ))}
      </form>
    </>
  );
}
