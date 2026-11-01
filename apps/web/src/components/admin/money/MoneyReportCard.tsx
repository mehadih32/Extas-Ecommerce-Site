'use client';
// S16 · PR 351 — the money report card on Money → Profit & loss: on/off, how often (every day for that day, every week
// for the last 7 days, every month for the month before), the time (store time), the weekday or the day of the month,
// and the language; the next day it goes and the words it would send now (the worker's own words). Saving asks once more
// ("Save" → "Yes, save") and sends the version it was read at. Without `books.report` it is read-only. Nothing here
// sends anything or moves money.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { MoneyReportView } from '@/lib/money-report-api';
import { call } from '../api';

export function MoneyReportCard(p: { dict: Dict; view: MoneyReportView; canEdit: boolean; nextDayText: string | null }) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyProfit.report.${k}`, vars);
  const [v, setV] = useState(p.view.value);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !p.canEdit || busy;

  async function save() {
    if (!sure) return setSure(true);
    setSure(false);
    setBusy(true);
    const a = await call('PUT', '/api/admin/money/profit/report', { value: v, version: p.view.version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: c('saved'), bad: false });
      return router.refresh();
    }
    const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
    const k = `moneyProfit.report.err.${code}`;
    setSaid({ text: t(p.dict, k) === k ? c('err.other') : t(p.dict, k), bad: true });
  }

  return (
    <section className="a2-card a2-mt12" aria-labelledby={`${id}-t`} data-testid="pl-report">
      <h2 className="a2-h3" id={`${id}-t`}>
        {c('title')}
      </h2>
      <p className="a2-cs">{c('sub')}</p>
      <div className="a2-swl a2-mt12">
        <span id={`${id}-on`}>{c('on')}</span>
        <button type="button" className={`a2-sw${v.enabled ? ' on' : ''}`} role="switch" aria-checked={v.enabled} aria-labelledby={`${id}-on`} disabled={off} onClick={() => setV({ ...v, enabled: !v.enabled })} data-testid="pl-report-on" />
      </div>
      <div className="ct-grid a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-f`}>
            {c('frequency')}
          </label>
          <select id={`${id}-f`} className="a2-sel" value={v.frequency} disabled={off} onChange={(e) => setV({ ...v, frequency: e.target.value as typeof v.frequency })} data-testid="pl-report-frequency">
            {(['daily', 'weekly', 'monthly'] as const).map((f) => (
              <option key={f} value={f}>
                {c(f)}
              </option>
            ))}
          </select>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-a`}>
            {c('at')}
          </label>
          <input id={`${id}-a`} className="a2-inp" type="time" value={v.at} disabled={off} onChange={(e) => setV({ ...v, at: e.target.value.slice(0, 5) })} data-testid="pl-report-at" />
        </div>
        {v.frequency === 'weekly' ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-w`}>
              {c('weekday')}
            </label>
            <select id={`${id}-w`} className="a2-sel" value={v.weekday} disabled={off} onChange={(e) => setV({ ...v, weekday: Number(e.target.value) })} data-testid="pl-report-weekday">
              {[6, 0, 1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {c(`days.d${d}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {v.frequency === 'monthly' ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-m`}>
              {c('monthDay')}
            </label>
            <select id={`${id}-m`} className="a2-sel" value={v.monthDay} disabled={off} onChange={(e) => setV({ ...v, monthDay: Number(e.target.value) })} data-testid="pl-report-monthday">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-l`}>
            {c('lang')}
          </label>
          <select id={`${id}-l`} className="a2-sel" value={v.lang} disabled={off} onChange={(e) => setV({ ...v, lang: e.target.value as typeof v.lang })} data-testid="pl-report-lang">
            <option value="bn">{c('bn')}</option>
            <option value="en">{c('en')}</option>
          </select>
        </div>
      </div>
      <p className="a2-sm a2-mt12" data-testid="pl-report-next">
        <b>{p.nextDayText ? c('next', { day: p.nextDayText, at: p.view.value.at }) : c('off')}</b>
      </p>
      <p className="a2-xs a2-mute">{c('telegram')}</p>
      {p.canEdit ? (
        <div className="ct-actions a2-mt12">
          <button type="button" className={`a2-btn ${sure ? 'pri' : ''}`} disabled={busy} onClick={() => void save()} data-testid="pl-report-save">
            {sure ? c('confirm') : c('save')}
          </button>
        </div>
      ) : (
        <p className="a2-xs a2-mute a2-mt12">{c('readOnly')}</p>
      )}
      {said ? (
        <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="pl-report-said">
          {said.text}
        </p>
      ) : null}
      <details className="a2-more-opts pl-report-more a2-mt12" data-testid="pl-report-preview">
        <summary>{c('preview')}</summary>
        <pre className="a2-xs pl-report-text">{p.view.preview}</pre>
      </details>
    </section>
  );
}
