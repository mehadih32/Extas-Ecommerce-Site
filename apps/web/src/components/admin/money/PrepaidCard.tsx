'use client';
// S16 · PR 343 — the two working parts of Money → Cost ledger: the prepaid balances (record a top-up the shop already
// paid for, set the low mark under which the page warns) and the export of a period as a CSV file. Writes go to
// /api/admin/money/cost-ledger/* and the page is read again. Without `costs.write` the balances are read-only. A top-up
// is sent with a request key kept until it is written, so a double tap or a retry records it once. Amounts are read like
// the Books pages (`typedMinor`: 1,000 and 1,00,000, Bengali digits). Nothing here pays anyone or buys credit.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { typedMinor } from '@/lib/admin-books/money';
import { call } from '../api';
import { formatMoney, type Money } from '../products/model';

export interface PrepaidRow {
  service: string;
  balanceMinor: number;
  lowMinor: number | null;
  low: boolean;
  lastTopUp: { amountMinor: number; credits: number | null; at: string } | null;
}

export interface PrepaidCardProps {
  dict: Dict;
  money: Money;
  services: readonly string[];
  rows: PrepaidRow[];
  canEdit: boolean;
  /** Today in the store's time zone (YYYY-MM-DD), the export's default end. */
  today: string;
  monthStart: string;
  lastTopUpText: Record<string, string>;
}

const newKey = (): string => globalThis.crypto?.randomUUID?.() ?? `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export function PrepaidCard(p: PrepaidCardProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyCostLedger.${k}`, vars);
  const svc = (s: string) => {
    const k = `moneyCostLedger.service.${s}`;
    const v = t(p.dict, k);
    return v === k ? s : v;
  };
  const m = (minor: number) => formatMoney(minor, p.money);
  const errText = (code: string | undefined) => {
    const k = `moneyCostLedger.err.${code ?? 'other'}`;
    const v = t(p.dict, k);
    return v === k ? c('err.other') : v;
  };
  const [service, setService] = useState(p.services[0] ?? 'SMS');
  const [amount, setAmount] = useState('');
  const [credits, setCredits] = useState('');
  const [note, setNote] = useState('');
  const [low, setLow] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [reqKey, setReqKey] = useState(newKey);
  const [from, setFrom] = useState(p.monthStart);
  const [to, setTo] = useState(p.today);

  async function topUp() {
    const amountMinor = amount.trim() ? typedMinor(amount, p.money.digits) : null;
    if (!amountMinor || amountMinor <= 0) return setSaid({ text: c('prepaid.badAmount'), bad: true });
    const n = credits.trim() ? Number(credits.trim()) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1)) return setSaid({ text: c('prepaid.badCredits'), bad: true });
    setBusy(true);
    const a = await call('POST', '/api/admin/money/cost-ledger/top-up', { service, amountMinor, credits: n, note: note.trim() || null, requestKey: reqKey });
    setBusy(false);
    if (a.status === 201 || a.status === 200) {
      setReqKey(newKey());
      setAmount('');
      setCredits('');
      setNote('');
      setSaid({ text: c('prepaid.added', { balance: m(Number(a.data.balanceMinor ?? 0)) }), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  async function saveLow() {
    const lowMinor = low.trim() ? typedMinor(low, p.money.digits) : null;
    if (low.trim() && lowMinor === null) return setSaid({ text: c('prepaid.badAmount'), bad: true });
    setBusy(true);
    const a = await call('PUT', '/api/admin/money/cost-ledger/low-mark', { service, lowMinor });
    setBusy(false);
    if (a.status === 200) {
      setLow('');
      setSaid({ text: lowMinor === null ? c('prepaid.lowCleared') : c('prepaid.lowSaved', { low: m(lowMinor) }), bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }

  const exportHref = `/api/admin/money/cost-ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const exportOk = Boolean(from && to && from <= to);

  return (
    <>
      <section className="a2-card a2-mt12" aria-labelledby={`${id}-pp`} data-testid="cl-prepaid">
        <h2 className="a2-h3" id={`${id}-pp`}>
          {c('prepaid.title')}
        </h2>
        <p className="a2-cs">{c('prepaid.sub')}</p>
        {p.rows.length ? (
          p.rows.map((r) => (
            <div key={r.service} className="a2-rule" data-testid={`cl-balance-${r.service}`} data-low={r.low ? 'yes' : 'no'}>
              <span>
                <b>{svc(r.service)}</b>
                <span className="a2-xs a2-mute cl-sub">{r.lastTopUp ? p.lastTopUpText[r.service] : c('prepaid.noTopUp')}</span>
              </span>
              <span className="a2-xs a2-mute">{r.lowMinor === null ? c('prepaid.noLow') : c('prepaid.lowAt', { low: m(r.lowMinor) })}</span>
              <b className={r.low ? 'bk-warn' : undefined}>
                {m(r.balanceMinor)}
                {r.low ? ` · ${c('prepaid.low')}` : ''}
              </b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('prepaid.none')}</p>
        )}
        {p.canEdit ? (
          <div className="ct-form a2-mt12" data-testid="cl-topup-form">
            <div className="ct-grid">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-svc`}>
                  {c('prepaid.service')}
                </label>
                <select id={`${id}-svc`} className="a2-sel" value={service} disabled={busy} onChange={(e) => setService(e.target.value)} data-testid="cl-service">
                  {p.services.map((s) => (
                    <option key={s} value={s}>
                      {svc(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-amt`}>
                  {c('prepaid.amount')} ({p.money.currency})
                </label>
                <input id={`${id}-amt`} className="a2-inp" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} data-testid="cl-amount" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-cr`}>
                  {c('prepaid.credits')}
                </label>
                <input id={`${id}-cr`} className="a2-inp" inputMode="numeric" autoComplete="off" value={credits} disabled={busy} onChange={(e) => setCredits(e.target.value)} data-testid="cl-credits" />
              </div>
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-note`}>
                  {c('prepaid.note')}
                </label>
                <input id={`${id}-note`} className="a2-inp" maxLength={300} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid="cl-note" />
              </div>
            </div>
            <div className="ct-actions">
              <button type="button" className="a2-btn pri" disabled={busy} onClick={topUp} data-testid="cl-topup">
                {busy ? c('prepaid.saving') : c('prepaid.add')}
              </button>
            </div>
            <div className="ct-grid">
              <div className="a2-fld">
                <label className="a2-lbl" htmlFor={`${id}-low`}>
                  {c('prepaid.lowField')} ({p.money.currency})
                </label>
                <input id={`${id}-low`} className="a2-inp" inputMode="decimal" autoComplete="off" value={low} disabled={busy} onChange={(e) => setLow(e.target.value)} data-testid="cl-low" />
              </div>
            </div>
            <p className="a2-xs a2-mute ct-hint">{c('prepaid.lowHint')}</p>
            <div className="ct-actions">
              <button type="button" className="a2-btn" disabled={busy} onClick={saveLow} data-testid="cl-low-save">
                {c('prepaid.lowSave')}
              </button>
            </div>
            {said ? (
              <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="cl-said">
                {said.text}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12">{c('prepaid.readOnly')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby={`${id}-ex`} data-testid="cl-export">
        <h2 className="a2-h3" id={`${id}-ex`}>
          {c('export.title')}
        </h2>
        <p className="a2-cs">{c('export.sub')}</p>
        <div className="ct-grid a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-from`}>
              {c('export.from')}
            </label>
            <input id={`${id}-from`} type="date" className="a2-inp" max={p.today} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="cl-from" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-to`}>
              {c('export.to')}
            </label>
            <input id={`${id}-to`} type="date" className="a2-inp" max={p.today} value={to} onChange={(e) => setTo(e.target.value)} data-testid="cl-to" />
          </div>
        </div>
        <div className="ct-actions a2-mt12">
          {exportOk ? (
            <a className="a2-btn" href={exportHref} download data-testid="cl-export-link">
              {c('export.download')}
            </a>
          ) : (
            <span className="a2-xs bk-warn">{c('export.badRange')}</span>
          )}
        </div>
      </section>
    </>
  );
}
