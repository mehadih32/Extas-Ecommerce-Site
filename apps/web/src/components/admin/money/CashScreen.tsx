'use client';
// S28 · PR 687 (admin prototype v5) — Finance › Money in & out: account balances, this month's money in and out, every movement,
// "Record money" (each needs the owner's PIN), "Reverse" for a wrong entry (a new opposite entry, never an edit) and a read-only
// forecast. Words: messages/admin-cash.*.json (`moneyCash.*`). Nothing here sends or pays money to anyone.
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import type { CashbookView, CashForecast } from '@extas/inventory';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, toMinor, type Lang, type Money } from '../products/model';

export interface CashScreenProps {
  dict: Dict;
  lang: Lang;
  money: Money;
  book: CashbookView;
  forecast: CashForecast;
  codHeldMinor: number;
  canRecord: boolean;
}

/** What "Record money" can record (the prototype's five). */
const TYPES = ['CAPITAL', 'OWNER_TAKE', 'OTHER_IN', 'OTHER_OUT', 'TRANSFER'] as const;
const IN_TYPES: readonly string[] = ['CAPITAL', 'OTHER_IN'];

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2)}`);

export function CashScreen(p: CashScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyCash.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const accName = useMemo(() => new Map(p.book.accounts.map((a) => [a.key, p.lang === 'bn' && a.nameBn ? a.nameBn : a.nameEn])), [p.book.accounts, p.lang]);
  const kindName = (k: string) => {
    const v = t(p.dict, `moneyCash.kinds.${k}`);
    return v.startsWith('moneyCash.') ? k : v;
  };
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [open, setOpen] = useState<null | 'record' | 'reverse'>(null);
  const [kind, setKind] = useState<(typeof TYPES)[number]>('CAPITAL');
  const [account, setAccount] = useState(p.book.accounts.find((a) => !a.archived)?.key ?? 'cash');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [requestKey, setRequestKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const live = p.book.accounts.filter((a) => !a.archived);

  const rows = p.book.entries.filter((e) => {
    if (filter === 'in' && !(e.amountMinor > 0)) return false;
    if (filter === 'out' && !(e.amountMinor < 0)) return false;
    const hay = `${kindName(e.kind)} ${accName.get(e.accountKey) ?? e.accountKey} ${e.note ?? ''}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  function close() {
    setOpen(null);
    setPin('');
    setAmount('');
    setNote('');
    setReason('');
    setReverseId(null);
    setSaid(null);
    setRequestKey(newKey());
  }
  function problem(status: number, error?: string) {
    if (status === 403 && error !== 'WRONG_PIN') return c('err.forbidden');
    const known = ['PIN_REQUIRED', 'WRONG_PIN', 'PIN_LOCKED', 'PIN_NOT_SET', 'CASH_OFF', 'INVALID_INPUT', 'NOT_ADJUSTABLE', 'CONFLICT'];
    return c(`err.${known.includes(error ?? '') ? error : 'other'}`);
  }
  async function record() {
    const minor = toMinor(amount, p.money);
    if (!minor || minor < 1) return setSaid(c('err.amount'));
    setBusy(true);
    const a = await call('POST', '/api/admin/money/cash', {
      action: 'record',
      kind,
      accountKey: account,
      toAccountKey: kind === 'TRANSFER' ? to : undefined,
      amountMinor: minor,
      note: note.trim() || undefined,
      requestKey,
      pin,
    });
    setBusy(false);
    if (a.status === 201) {
      showToast({ text: c('recorded'), tone: 'ok' });
      close();
      return router.refresh();
    }
    setSaid(problem(a.status, (a.data as { error?: string }).error));
  }
  async function reverse() {
    if (!reverseId) return;
    setBusy(true);
    const a = await call('POST', '/api/admin/money/cash', {
      action: 'reverse',
      id: reverseId,
      reason,
      pin,
    });
    setBusy(false);
    if (a.status === 201) {
      showToast({ text: c('reversed'), tone: 'ok' });
      close();
      return router.refresh();
    }
    setSaid(problem(a.status, (a.data as { error?: string }).error));
  }

  const tight = p.forecast.tightest;
  return (
    <div className="w4-stack" data-testid="cash-screen">
      {!p.book.enabled ? (
        <p className="a2-note" data-testid="cash-off">
          {c('off')}
        </p>
      ) : null}
      <section className="a2-card" aria-labelledby={`${id}-acc`}>
        <h2 className="a2-h3" id={`${id}-acc`}>
          {c('accounts.title')}
        </h2>
        <div className="w4-kpis a2-mt12">
          {live.map((a) => (
            <div key={a.key} className="w4-kpi" data-testid={`cash-acc-${a.key}`}>
              <span className="a2-xs a2-mute">{accName.get(a.key)}</span>
              <b>{m(a.balanceMinor)}</b>
            </div>
          ))}
          <div className="w4-kpi" data-testid="cash-total">
            <span className="a2-xs a2-mute">{c('accounts.total')}</span>
            <b>{m(p.book.totalMinor)}</b>
          </div>
        </div>
        <div className="w4-kpis a2-mt12">
          <div className="w4-kpi">
            <span className="a2-xs a2-mute">{c('month.in')}</span>
            <b className="w4-pos" data-testid="cash-month-in">
              {m(p.book.month.inMinor)}
            </b>
          </div>
          <div className="w4-kpi">
            <span className="a2-xs a2-mute">{c('month.out')}</span>
            <b className="w4-neg" data-testid="cash-month-out">
              {m(p.book.month.outMinor)}
            </b>
          </div>
        </div>
        <div className="a2-mt12 w4-row">
          <button type="button" className="a2-btn pri" disabled={!p.canRecord || !p.book.enabled} onClick={() => setOpen('record')} data-testid="cash-record">
            {c('record')}
          </button>
        </div>
        {!p.canRecord ? <p className="a2-note a2-mt12">{c('readOnly')}</p> : null}
      </section>

      <section className="a2-card" aria-labelledby={`${id}-fc`} data-testid="cash-forecast">
        <h2 className="a2-h3" id={`${id}-fc`}>
          {c('forecast.title', { days: p.forecast.days.length })}
        </h2>
        <p className="a2-cs">{c('forecast.sub')}</p>
        <ul className="w4-list a2-mt6">
          <li className="w4-li">
            <span className="w4-grow">{c('forecast.cod')}</span>
            <b>{m(p.codHeldMinor)}</b>
          </li>
          <li className="w4-li">
            <span className="w4-grow">{c('forecast.fixed')}</span>
            <b>{m(p.forecast.fixedMinor)}</b>
          </li>
          {tight ? (
            <li className="w4-li">
              <span className="w4-grow">{c('forecast.tightest', { day: tight.day })}</span>
              <b className={tight.balanceMinor < 0 ? 'w4-neg' : ''}>{m(tight.balanceMinor)}</b>
            </li>
          ) : null}
        </ul>
        <p className={`a2-sm a2-mt6 ${p.forecast.fixedCovered ? 'a2-mute' : 'bk-warn'}`} role="status" data-testid="cash-covered">
          {p.forecast.fixedCovered ? c('forecast.covered') : c('forecast.short')}
        </p>
      </section>

      <section className="a2-card" aria-labelledby={`${id}-all`}>
        <h2 className="a2-h3" id={`${id}-all`}>
          {c('all.title')}
        </h2>
        <div className="w4-row a2-mt12">
          <input className="a2-inp" value={q} placeholder={c('all.find')} aria-label={c('all.find')} onChange={(e) => setQ(e.target.value)} data-testid="cash-find" />
          {(['all', 'in', 'out'] as const).map((f) => (
            <button key={f} type="button" className={`a2-btn sm${filter === f ? ' pri' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {c(`all.${f}`)}
            </button>
          ))}
        </div>
        {rows.length ? (
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl" data-testid="cash-table">
              <thead>
                <tr>
                  <th>{c('col.day')}</th>
                  <th>{c('col.what')}</th>
                  <th>{c('col.account')}</th>
                  <th className="w4-r">{c('col.amount')}</th>
                  <th className="w4-r">{c('col.balance')}</th>
                  <th>{c('col.note')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className={e.reversed ? 'w4-struck' : ''}>
                    <td>{e.day}</td>
                    <td>{kindName(e.kind)}</td>
                    <td>{accName.get(e.accountKey) ?? e.accountKey}</td>
                    <td className={`w4-r ${e.amountMinor < 0 ? 'w4-neg' : 'w4-pos'}`}>{m(e.amountMinor)}</td>
                    <td className="w4-r">{m(e.balanceAfterMinor)}</td>
                    <td>{e.reversed ? c('col.reversed') : (e.reason ?? e.note ?? '')}</td>
                    <td>
                      {p.canRecord && !e.reversed && !e.reversesId && e.kind !== 'OPENING' && e.source === 'manual' ? (
                        <button
                          type="button"
                          className="a2-btn sm"
                          onClick={() => {
                            setReverseId(e.id);
                            setOpen('reverse');
                          }}
                        >
                          {c('reverse')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-cs a2-mt6">{c('all.empty')}</p>
        )}
        {p.book.more ? <p className="a2-xs a2-mute a2-mt6">{c('all.more')}</p> : null}
      </section>

      {open ? (
        <div className="w4-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-dlg`} data-testid="cash-dialog">
          <div className="a2-card w4-modal-box">
            <h2 className="a2-h3" id={`${id}-dlg`}>
              {open === 'record' ? c('record') : c('reverseTitle')}
            </h2>
            {open === 'record' ? (
              <>
                <label className="a2-fld">
                  <span>{c('f.kind')}</span>
                  <select className="a2-inp" value={kind} onChange={(e) => setKind(e.target.value as (typeof TYPES)[number])} data-testid="cash-kind">
                    {TYPES.map((k) => (
                      <option key={k} value={k}>
                        {c(`types.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="a2-fld">
                  <span>{kind === 'TRANSFER' ? c('f.from') : IN_TYPES.includes(kind) ? c('f.into') : c('f.outOf')}</span>
                  <select className="a2-inp" value={account} onChange={(e) => setAccount(e.target.value)}>
                    {live.map((a) => (
                      <option key={a.key} value={a.key}>
                        {accName.get(a.key)}
                      </option>
                    ))}
                  </select>
                </label>
                {kind === 'TRANSFER' ? (
                  <label className="a2-fld">
                    <span>{c('f.to')}</span>
                    <select className="a2-inp" value={to} onChange={(e) => setTo(e.target.value)} data-testid="cash-to">
                      <option value="" />
                      {live
                        .filter((a) => a.key !== account)
                        .map((a) => (
                          <option key={a.key} value={a.key}>
                            {accName.get(a.key)}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label className="a2-fld">
                  <span>{c('f.amount')}</span>
                  <input className="a2-inp" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="cash-amount" />
                </label>
                <label className="a2-fld">
                  <span>{c('f.note')}</span>
                  <input className="a2-inp" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
                </label>
              </>
            ) : (
              <label className="a2-fld">
                <span>{c('f.reason')}</span>
                <input className="a2-inp" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-testid="cash-reason" />
              </label>
            )}
            <label className="a2-fld">
              <span>{c('f.pin')}</span>
              <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} data-testid="cash-pin" />
            </label>
            {said ? (
              <p className="a2-sm bk-warn" role="alert" data-testid="cash-said">
                {said}
              </p>
            ) : null}
            <div className="w4-row a2-mt12">
              <button type="button" className="a2-btn" onClick={close}>
                {c('cancel')}
              </button>
              <button
                type="button"
                className="a2-btn pri"
                disabled={busy || !pin || (open === 'reverse' && reason.trim().length < 3)}
                onClick={open === 'record' ? record : reverse}
                data-testid="cash-confirm"
              >
                {busy ? c('saving') : open === 'record' ? c('confirm') : c('reverse')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
