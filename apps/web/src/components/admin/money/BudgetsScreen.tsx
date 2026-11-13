'use client';
// S28 · PR 688 (admin prototype v5) — Finance › Budgets & profit: the profit snapshot (today, last 7 days, this month, and the
// monthly target when it is on), each cost against its budget with an "at this pace" status, "Edit budgets" (owner's PIN), and
// who can approve refunds. Words: messages/admin-budgets.*.json (`moneyBudgets.*`). Nothing here moves money.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { BudgetsView, ProfitSnapshot } from '@extas/inventory';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, toMajor, toMinor, type Lang, type Money } from '../products/model';

export interface BudgetsScreenProps {
  dict: Dict;
  lang: Lang;
  money: Money;
  budgets: BudgetsView;
  snapshot: ProfitSnapshot;
  roles: { key: string; nameEn: string; nameBn: string }[];
  canEdit: boolean;
}

export function BudgetsScreen(p: BudgetsScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `moneyBudgets.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(p.budgets.month);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(p.budgets.lines.map((l) => [l.headKey, l.budgetMinor === null ? '' : toMajor(l.budgetMinor, p.money)])));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  async function save() {
    const budgets: Record<string, number> = {};
    for (const l of p.budgets.lines) {
      const raw = vals[l.headKey]?.trim() ?? '';
      if (!raw) continue;
      const minor = toMinor(raw, p.money);
      if (minor === null || minor === undefined || minor < 0) return setSaid(c('err.INVALID_INPUT'));
      budgets[l.headKey] = minor;
    }
    setBusy(true);
    const a = await call('POST', '/api/admin/money/budgets', { fromMonth: from, budgets, pin });
    setBusy(false);
    if (a.status === 200) {
      const changed = (a.data as { changed?: string[] }).changed ?? [];
      showToast({ text: changed.length ? c('edit.saved') : c('edit.same'), tone: 'ok' });
      setOpen(false);
      setPin('');
      setSaid(null);
      return router.refresh();
    }
    const error = (a.data as { error?: string }).error ?? '';
    setSaid(a.status === 403 && error !== 'WRONG_PIN' ? c('err.forbidden') : c(`err.${['PIN_REQUIRED', 'WRONG_PIN', 'PIN_LOCKED', 'PIN_NOT_SET', 'INVALID_INPUT'].includes(error) ? error : 'other'}`));
  }

  const target = p.snapshot.target;
  return (
    <div className="w4-stack" data-testid="budgets-screen">
      <section className="a2-card" aria-labelledby={`${id}-snap`} data-testid="profit-snapshot">
        <h2 className="a2-h3" id={`${id}-snap`}>
          {c('snap.title')}
        </h2>
        <div className="w4-kpis a2-mt12">
          {p.snapshot.spans.map((s) => (
            <div key={s.key} className="w4-kpi" data-testid={`snap-${s.key}`}>
              <span className="a2-xs a2-mute">{c(`snap.${s.key}`)}</span>
              {s.netProfitMinor === null ? <b className="a2-sm">{c('snap.unknown')}</b> : <b className={s.netProfitMinor < 0 ? 'w4-neg' : 'w4-pos'}>{m(s.netProfitMinor)}</b>}
              <span className="a2-xs a2-mute">{c('snap.sales', { amount: m(s.salesMinor) })}</span>
              {s.fixedMinor !== null ? <span className="a2-xs a2-mute">{c('snap.fixed', { amount: m(s.fixedMinor) })}</span> : null}
            </div>
          ))}
        </div>
        {target ? (
          <div className="a2-mt12" data-testid="snap-target">
            <span className="a2-xs a2-mute">{c('snap.target')}</span>
            <progress className="w4-bar" max={target.amountMinor} value={Math.min(target.salesMinor, target.amountMinor)} />
            <span className="a2-sm">{c('snap.targetOf', { sales: m(target.salesMinor), target: m(target.amountMinor) })}</span>
          </div>
        ) : null}
      </section>

      <section className="a2-card" aria-labelledby={`${id}-bud`}>
        <h2 className="a2-h3" id={`${id}-bud`}>
          {c('budgets.title')}
        </h2>
        <p className="a2-cs">{c('budgets.sub', { day: p.budgets.day, days: p.budgets.days })}</p>
        <div className="a2-tblw a2-mt6">
          <table className="a2-tbl" data-testid="budgets-table">
            <thead>
              <tr>
                <th>{c('budgets.head')}</th>
                <th className="w4-r">{c('budgets.budget')}</th>
                <th className="w4-r">{c('budgets.spent')}</th>
                <th className="w4-r">{c('budgets.pace')}</th>
                <th>{c('budgets.state')}</th>
              </tr>
            </thead>
            <tbody>
              {p.budgets.lines.map((l) => (
                <tr key={l.headKey} data-state={l.state}>
                  <td>{c(`heads.${l.headKey}`)}</td>
                  <td className="w4-r">{l.budgetMinor === null ? '—' : m(l.budgetMinor)}</td>
                  <td className="w4-r">{m(l.spentMinor)}</td>
                  <td className="w4-r">{m(l.paceMinor)}</td>
                  <td className={l.state === 'over' || l.state === 'pace' ? 'w4-neg' : ''}>{c(`budgets.states.${l.state}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="a2-mt12 w4-row">
          <button type="button" className="a2-btn pri" disabled={!p.canEdit} onClick={() => setOpen(true)} data-testid="budgets-edit">
            {c('budgets.edit')}
          </button>
        </div>
        {!p.canEdit ? <p className="a2-note a2-mt12">{c('readOnly')}</p> : null}
      </section>

      <section className="a2-card" aria-labelledby={`${id}-ref`} data-testid="refund-approvers">
        <h2 className="a2-h3" id={`${id}-ref`}>
          {c('refunds.title')}
        </h2>
        <p className="a2-cs">{c('refunds.sub')}</p>
        {p.roles.length ? (
          <ul className="w4-list a2-mt6">
            {p.roles.map((r) => (
              <li key={r.key} className="w4-li">
                {p.lang === 'bn' ? r.nameBn : r.nameEn}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-cs a2-mt6">{c('refunds.none')}</p>
        )}
      </section>

      {open ? (
        <div className="w4-modal" role="dialog" aria-modal="true" aria-labelledby={`${id}-dlg`} data-testid="budgets-dialog">
          <div className="a2-card w4-modal-box">
            <h2 className="a2-h3" id={`${id}-dlg`}>
              {c('edit.title')}
            </h2>
            <p className="a2-cs">{c('edit.hint')}</p>
            <label className="a2-fld">
              <span>{c('edit.from')}</span>
              <input className="a2-inp" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM" data-testid="budgets-from" />
            </label>
            {p.budgets.lines.map((l) => (
              <label key={l.headKey} className="a2-fld">
                <span>{c(`heads.${l.headKey}`)}</span>
                <input className="a2-inp" inputMode="decimal" value={vals[l.headKey] ?? ''} onChange={(e) => setVals({ ...vals, [l.headKey]: e.target.value })} />
              </label>
            ))}
            <label className="a2-fld">
              <span>{c('edit.pin')}</span>
              <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} data-testid="budgets-pin" />
            </label>
            {said ? (
              <p className="a2-sm bk-warn" role="alert">
                {said}
              </p>
            ) : null}
            <div className="w4-row a2-mt12">
              <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
                {c('edit.cancel')}
              </button>
              <button type="button" className="a2-btn pri" disabled={busy || !pin} onClick={save} data-testid="budgets-save">
                {busy ? c('edit.saving') : c('edit.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
