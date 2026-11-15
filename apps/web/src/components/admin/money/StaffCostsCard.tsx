'use client';
// S28 · PR 837 (admin prototype v5, Money › Costs "Salaries and monthly costs") — each person's salary and each monthly
// bill with the amount from a month on. A changed amount is a new row "from this month" (earlier months keep their old
// figure); a person who leaves is stopped from a month, never deleted. The card adds a month up by kind and "Use for this
// month" puts the totals in the fixed-costs form above for the owner to check and Save there: nothing is paid or moved here.
// The whole list is sent with the version it was read at (a second editor gets "STALE"), to /api/admin/costs/staff.
import { useId, useMemo, useState } from 'react';
import { STAFF_COST_KINDS, salaryPlan, staffAmountAt, staffNetAt, staffNextChange, staffTotalsFor, type StaffCostKind, type StaffCostPerson } from '@extas/settings/staff-costs';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { typedMinor } from '@/lib/admin-books/money';
import { formatMoney, toMajor, type Money } from '../products/model';
import { ShellIcon } from '../shell/ShellIcon';
import { useRouter } from 'next/navigation';

export interface StaffCostsData {
  people: StaffCostPerson[];
  version: string;
}

const newId = (): string => `s${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, '').slice(0, 20)}`;

export function StaffCostsCard({
  dict,
  locale,
  money,
  data,
  month,
  canEdit,
  canPay = false,
  accounts = [],
  onUse,
}: {
  dict: Dict;
  locale: string;
  money: Money;
  data: StaffCostsData;
  /** The month picked on the fixed-costs card above (YYYY-MM). */
  month: string;
  canEdit: boolean;
  /** PR 859: Accounts and the owner (fixed costs + cashbook rights) may pay the month's salary. */
  canPay?: boolean;
  /** The cashbook accounts a salary can be paid from. */
  accounts?: { key: string; name: string }[];
  /** Puts a month's totals (typed form) in the fixed-costs form above. */
  onUse(totals: Record<StaffCostKind, string>): void;
}) {
  const router = useRouter();
  const id = useId();
  const c = (key: string, vars?: Record<string, string | number>) => t(dict, `moneyCosts.staff.${key}`, vars);
  const m = (minor: number) => formatMoney(minor, money);
  const [people, setPeople] = useState<StaffCostPerson[]>(data.people);
  const [version, setVersion] = useState(data.version);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [edit, setEdit] = useState<{ id: string; amount: string; from: string } | null>(null);
  // PR 849: the advance, bonus and deduction of the month picked (prototype Salaries)
  const [adjust, setAdjust] = useState<{ id: string; adv: string; bonus: string; ded: string; note: string } | null>(null);
  const [add, setAdd] = useState<{ name: string; post: string; kind: StaffCostKind; amount: string; from: string; payDay: string } | null>(null);
  // PR 859: Pay salary (prototype Salaries): one person or everybody due, from a cashbook account, with the PIN; nothing is automatic
  const [pay, setPay] = useState<{ ids: string[]; account: string; pin: string } | null>(null);
  const dirty = JSON.stringify(people) !== JSON.stringify(data.people) || version !== data.version;
  const useMonth = month || new Date().toISOString().slice(0, 7);
  const totals = useMemo(() => staffTotalsFor(people, useMonth), [people, useMonth]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }), [locale]);
  const monthName = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));
  const typed = (text: string): number | undefined => (text.trim() ? (typedMinor(text, money.digits) ?? undefined) : undefined);
  const ok = (key: string) => c(key);

  function startAdd() {
    setEdit(null);
    setAdd({ name: '', post: '', kind: 'salary', amount: '', from: useMonth, payDay: '5' });
  }
  function commitAdd() {
    if (!add) return;
    const minor = typed(add.amount);
    const day = Number(add.payDay);
    if (!add.name.trim() || minor === undefined || !/^\d{4}-\d{2}$/.test(add.from) || !Number.isInteger(day) || day < 1 || day > 28) return setSaid({ text: c('needAll'), bad: true });
    setPeople((l) => [...l, { id: newId(), name: add.name.trim(), post: add.post.trim(), kind: add.kind, payDay: day, amounts: [{ from: add.from, minor }], stoppedFrom: null }]);
    setAdd(null);
    setSaid(null);
  }
  function commitEdit() {
    if (!edit) return;
    const minor = typed(edit.amount);
    if (minor === undefined || !/^\d{4}-\d{2}$/.test(edit.from)) return setSaid({ text: c('needAmount'), bad: true });
    setPeople((l) =>
      l.map((p) => (p.id === edit.id ? { ...p, stoppedFrom: p.stoppedFrom && p.stoppedFrom <= edit.from ? null : p.stoppedFrom, amounts: [...p.amounts.filter((a) => a.from !== edit.from), { from: edit.from, minor }].sort((a, b) => (a.from < b.from ? -1 : 1)) } : p)),
    );
    setEdit(null);
    setSaid(null);
  }
  function startAdjust(p: StaffCostPerson) {
    const a = p.adj?.[useMonth];
    setEdit(null);
    setAdd(null);
    setAdjust({ id: p.id, adv: a?.adv ? toMajor(a.adv, money) : '', bonus: a?.bonus ? toMajor(a.bonus, money) : '', ded: a?.ded ? toMajor(a.ded, money) : '', note: a?.note ?? '' });
  }
  function commitAdjust() {
    if (!adjust) return;
    const parts = { adv: typed(adjust.adv), bonus: typed(adjust.bonus), ded: typed(adjust.ded) };
    if ((adjust.adv.trim() && parts.adv === undefined) || (adjust.bonus.trim() && parts.bonus === undefined) || (adjust.ded.trim() && parts.ded === undefined)) return setSaid({ text: c('needAmount'), bad: true });
    const next = { adv: parts.adv ?? 0, bonus: parts.bonus ?? 0, ded: parts.ded ?? 0, note: adjust.note.trim() };
    const none = !next.adv && !next.bonus && !next.ded && !next.note;
    setPeople((l) =>
      l.map((p) => {
        if (p.id !== adjust.id) return p;
        const rest = Object.fromEntries(Object.entries(p.adj ?? {}).filter(([k]) => k !== useMonth));
        return { ...p, adj: none ? rest : { ...rest, [useMonth]: next } };
      }),
    );
    setAdjust(null);
    setSaid(null);
  }
  /** A pay slip of one person for the month picked: opens the browser's print page (nothing is sent to the person from here). */
  function paySlip(p: StaffCostPerson) {
    const x = staffNetAt(p, useMonth);
    const w = window.open('', '_blank', 'width=640,height=720');
    if (!w) return setSaid({ text: c('slipBlocked'), bad: true });
    const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
    const row = (label: string, v: number, bold = false) => `<tr><td>${esc(label)}</td><td style="text-align:right">${bold ? '<b>' : ''}${esc(m(v))}${bold ? '</b>' : ''}</td></tr>`;
    const note = p.adj?.[useMonth]?.note ?? '';
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>${esc(c('slipTitle'))}</title><body style="font:14px system-ui,sans-serif;margin:32px;max-width:520px"><h2>${esc(c('slipTitle'))} · ${esc(monthName(useMonth))}</h2><p><b>${esc(p.name)}</b>${p.post ? ` · ${esc(p.post)}` : ''}</p><table style="width:100%;border-collapse:collapse" cellpadding="6">${row(c('colAmountShort'), x.base)}${row(c('bonus'), x.bonus)}${row(c('deduction'), x.ded)}${row(c('advance'), x.adv)}${row(c('netToPay'), x.net, true)}</table>${note ? `<p>${esc(note)}</p>` : ''}</body>`,
    );
    w.document.close();
    w.focus();
    w.print();
  }
  const salaryDue = (ids?: string[]) => salaryPlan(people, useMonth, ids);
  function startPay(ids?: string[]) {
    const plan = salaryDue(ids);
    if (!plan.length) return setSaid({ text: c('payNone'), bad: true });
    setEdit(null);
    setAdd(null);
    setAdjust(null);
    setPay({ ids: plan.map((x) => x.id), account: accounts[0]?.key ?? '', pin: '' });
  }
  async function payNow() {
    if (!pay || !pay.account || !pay.pin) return;
    setBusy(true);
    const a = await call('POST', '/api/admin/costs/staff/pay', { month: useMonth, accountKey: pay.account, ids: pay.ids, pin: pay.pin });
    setBusy(false);
    if (a.status === 201) {
      const paid = (a.data.paid as { minor: number }[]) ?? [];
      setPay(null);
      setSaid(null);
      showToast({ text: c('paidDone', { count: paid.length, total: m(paid.reduce((n, x) => n + x.minor, 0)) }), tone: 'ok' });
      return router.refresh();
    }
    const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
    const key = `moneyCosts.staff.err.${code}`;
    const txt = t(dict, key);
    setSaid({ text: txt === key ? c('err.other') : txt, bad: true });
    setPay({ ...pay, pin: '' });
  }
  function stop(pid: string) {
    setPeople((l) => l.map((p) => (p.id === pid ? { ...p, stoppedFrom: useMonth } : p)));
  }
  function resume(pid: string) {
    setPeople((l) => l.map((p) => (p.id === pid ? { ...p, stoppedFrom: null } : p)));
  }
  async function save() {
    setBusy(true);
    const a = await call('PUT', '/api/admin/costs/staff', { value: { people }, version });
    setBusy(false);
    if (a.status === 200) {
      setSaid(null);
      showToast({ text: c('saved'), tone: 'ok' });
      return router.refresh();
    }
    const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
    const key = `moneyCosts.staff.err.${code}`;
    const txt = t(dict, key);
    setSaid({ text: txt === key ? c('err.other') : txt, bad: true });
  }

  const sorted = [...people].sort((x, y) => STAFF_COST_KINDS.indexOf(x.kind) - STAFF_COST_KINDS.indexOf(y.kind) || x.name.localeCompare(y.name));
  return (
    <section className="a2-card a2-mt12" data-testid="staff-costs" aria-labelledby={`${id}-h`}>
      <h2 className="a2-h3" id={`${id}-h`}>
        {c('title')}
      </h2>
      <p className="a2-cs">{c('sub')}</p>
      {canPay && !dirty && salaryDue().length ? (
        <div className="a2-row a2-mt12">
          <button type="button" className="a2-btn pri" onClick={() => startPay()} data-testid="staff-pay-all">
            {c('payAll')} · {c('payTotal', { count: salaryDue().length, total: m(salaryDue().reduce((n, x) => n + x.minor, 0)) })}
          </button>
        </div>
      ) : null}
      {sorted.length ? (
        <div className="a2-tbl-wrap a2-mt12">
          <table className="a2-tbl" data-testid="staff-table">
            <thead>
              <tr>
                <th>{c('colName')}</th>
                <th>{c('colKind')}</th>
                <th>{c('colPayDay')}</th>
                <th className="r">{c('colAmount', { month: monthName(useMonth) })}</th>
                <th className="r">{c('advance')}</th>
                <th className="r">{c('bonus')}</th>
                <th className="r">{c('deduction')}</th>
                <th className="r">{c('netToPay')}</th>
                <th aria-label={c('colActions')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const next = staffNextChange(p, useMonth);
                const stopped = p.stoppedFrom !== null && p.stoppedFrom <= useMonth;
                const nx = staffNetAt(p, useMonth);
                const dash = <span className="a2-mute">—</span>;
                return (
                  <tr key={p.id} data-testid="staff-row">
                    <td>
                      <b>{p.name}</b>
                      {p.post ? <div className="a2-xs a2-mute">{p.post}</div> : null}
                      {p.amounts.length > 1 || p.stoppedFrom ? (
                        <details className="a2-xs a2-mute" data-testid="staff-history">
                          <summary>{c('history')}</summary>
                          <ul>
                            {p.amounts.map((a) => (
                              <li key={a.from}>
                                {monthName(a.from)}: {m(a.minor)}
                              </li>
                            ))}
                            {p.stoppedFrom ? <li>{c('stoppedFrom', { month: monthName(p.stoppedFrom) })}</li> : null}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td>{c(`kind.${p.kind}`)}</td>
                    <td>{p.payDay}</td>
                    <td className="r">
                      {stopped ? <span className="a2-mute">{c('stoppedFrom', { month: monthName(p.stoppedFrom!) })}</span> : m(staffAmountAt(p, useMonth))}
                      {next && !stopped ? (
                        <div className="a2-xs a2-mute">
                          {monthName(next.from)}: {next.minor === 0 ? c('stops') : m(next.minor)}
                        </div>
                      ) : null}
                    </td>
                    <td className="r">{nx.adv ? `−${m(nx.adv)}` : dash}</td>
                    <td className="r">{nx.bonus ? `+${m(nx.bonus)}` : dash}</td>
                    <td className="r">{nx.ded ? `−${m(nx.ded)}` : dash}</td>
                    <td className="r">{nx.base ? <b data-testid="staff-net">{m(nx.net)}</b> : dash}
                      {p.paid?.[useMonth] ? (
                        <div className="a2-xs a2-mute" data-testid="staff-paid" title={c('paidLocked')}>
                          {c('paidTag', { date: p.paid[useMonth]!.at })}
                        </div>
                      ) : null}</td>
                    <td className="r">
                      {canEdit ? (
                        <div className="a2-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {canPay && !dirty && salaryDue([p.id]).length ? (
                            <button type="button" className="a2-btn sm pri" onClick={() => startPay([p.id])} data-testid="staff-pay">
                              {c('pay')}
                            </button>
                          ) : null}
                          {nx.base && !p.paid?.[useMonth] ? (
                            <button type="button" className="a2-btn sm" onClick={() => startAdjust(p)} data-testid="staff-adjust-open">
                              {c('adjust')}
                            </button>
                          ) : null}
                          {nx.base ? (
                            <button type="button" className="a2-btn sm" onClick={() => paySlip(p)} data-testid="staff-slip">
                              {c('slip')}
                            </button>
                          ) : null}
                          <button type="button" className="a2-btn sm" onClick={() => { setAdd(null); setEdit({ id: p.id, amount: toMajor(staffAmountAt(p, useMonth) || p.amounts.at(-1)!.minor, money), from: useMonth }); }} data-testid="staff-change">
                            <ShellIcon name="edit" size={14} />
                            {c('change')}
                          </button>
                          {p.stoppedFrom ? (
                            <button type="button" className="a2-btn sm" onClick={() => resume(p.id)} data-testid="staff-resume">
                              {c('resume')}
                            </button>
                          ) : (
                            <button type="button" className="a2-btn sm" onClick={() => stop(p.id)} data-testid="staff-stop">
                              {c('stop')}
                            </button>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="a2-sm a2-mute a2-mt12" data-testid="staff-none">
          {c('none')}
        </p>
      )}
      {edit ? (
        <div className="ct-form a2-mt12" data-testid="staff-edit">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ea`}>
              {c('newAmount')}
            </label>
            <input id={`${id}-ea`} className="a2-inp" inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ef`}>
              {c('fromMonth')}
            </label>
            <input id={`${id}-ef`} className="a2-inp" type="month" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} />
          </div>
          <p className="a2-xs a2-mute">{c('fromHelp')}</p>
          <div className="a2-row" style={{ gap: 8 }}>
            <button type="button" className="a2-btn pri" onClick={commitEdit} data-testid="staff-edit-ok">
              {c('apply')}
            </button>
            <button type="button" className="a2-btn" onClick={() => setEdit(null)}>
              {c('cancel')}
            </button>
          </div>
        </div>
      ) : null}
      {pay ? (
        <div className="ct-form a2-mt12" data-testid="staff-pay-form" role="group" aria-label={c('payTitle')}>
          <p className="a2-sm">
            <b>{c('payTitle')}</b> · {monthName(useMonth)}
          </p>
          <ul className="a2-sm">
            {salaryDue(pay.ids).map((x) => (
              <li key={x.id}>
                {x.name}: <b>{m(x.minor)}</b>
              </li>
            ))}
          </ul>
          <p className="a2-sm">
            <b>{c('payTotal', { count: salaryDue(pay.ids).length, total: m(salaryDue(pay.ids).reduce((n, x) => n + x.minor, 0)) })}</b>
          </p>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-pa`}>
              {c('payFrom')}
            </label>
            <select id={`${id}-pa`} className="a2-sel" value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-pp`}>
              {c('payPin')}
            </label>
            <input id={`${id}-pp`} className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={pay.pin} onChange={(e) => setPay({ ...pay, pin: e.target.value })} data-testid="staff-pay-pin" />
          </div>
          <p className="a2-xs a2-mute">{c('payNote')}</p>
          <div className="a2-row" style={{ gap: 8 }}>
            <button type="button" className="a2-btn pri" disabled={busy || !pay.pin || !pay.account} onClick={payNow} data-testid="staff-pay-ok">
              {c('payGo')}
            </button>
            <button type="button" className="a2-btn" onClick={() => setPay(null)}>
              {c('cancel')}
            </button>
          </div>
        </div>
      ) : null}
      {adjust ? (
        <div className="ct-form a2-mt12" data-testid="staff-adjust">
          <p className="a2-sm">
            <b>{people.find((x) => x.id === adjust.id)?.name}</b> · {monthName(useMonth)}
          </p>
          {(['adv', 'bonus', 'ded'] as const).map((k) => (
            <div className="a2-fld" key={k}>
              <label className="a2-lbl" htmlFor={`${id}-j${k}`}>
                {c(k === 'adv' ? 'advanceTaken' : k === 'bonus' ? 'bonus' : 'deduction')}
              </label>
              <input id={`${id}-j${k}`} className="a2-inp" inputMode="decimal" value={adjust[k]} onChange={(e) => setAdjust({ ...adjust, [k]: e.target.value })} />
            </div>
          ))}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-jn`}>
              {c('adjustNote')}
            </label>
            <input id={`${id}-jn`} className="a2-inp" maxLength={120} value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
          </div>
          <p className="a2-xs a2-mute">{c('adjustHelp')}</p>
          <div className="a2-row" style={{ gap: 8 }}>
            <button type="button" className="a2-btn pri" onClick={commitAdjust} data-testid="staff-adjust-ok">
              {c('apply')}
            </button>
            <button type="button" className="a2-btn" onClick={() => setAdjust(null)}>
              {c('cancel')}
            </button>
          </div>
        </div>
      ) : null}
      {add ? (
        <div className="ct-form a2-mt12" data-testid="staff-add">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-an`}>
              {c('colName')}
            </label>
            <input id={`${id}-an`} className="a2-inp" maxLength={80} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ap`}>
              {c('post')}
            </label>
            <input id={`${id}-ap`} className="a2-inp" maxLength={60} value={add.post} onChange={(e) => setAdd({ ...add, post: e.target.value })} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ak`}>
              {c('colKind')}
            </label>
            <select id={`${id}-ak`} className="a2-sel" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value as StaffCostKind })}>
              {STAFF_COST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {c(`kind.${k}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-aa`}>
              {c('monthlyAmount')}
            </label>
            <input id={`${id}-aa`} className="a2-inp" inputMode="decimal" value={add.amount} onChange={(e) => setAdd({ ...add, amount: e.target.value })} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-af`}>
              {c('fromMonth')}
            </label>
            <input id={`${id}-af`} className="a2-inp" type="month" value={add.from} onChange={(e) => setAdd({ ...add, from: e.target.value })} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ad`}>
              {c('colPayDay')}
            </label>
            <input id={`${id}-ad`} className="a2-inp" inputMode="numeric" value={add.payDay} onChange={(e) => setAdd({ ...add, payDay: e.target.value })} />
          </div>
          <div className="a2-row" style={{ gap: 8 }}>
            <button type="button" className="a2-btn pri" onClick={commitAdd} data-testid="staff-add-ok">
              {c('addOk')}
            </button>
            <button type="button" className="a2-btn" onClick={() => setAdd(null)}>
              {c('cancel')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="a2-mt12" data-testid="staff-totals">
        <p className="a2-sm">
          <b>{c('totalsFor', { month: monthName(useMonth) })}</b> · {STAFF_COST_KINDS.map((k) => `${c(`kind.${k}`)} ${m(totals[k])}`).join(' · ')}
        </p>
      </div>
      <div className="a2-row a2-mt12" style={{ gap: 8, flexWrap: 'wrap' }}>
        {canEdit ? (
          <button type="button" className="a2-btn" onClick={startAdd} disabled={busy} data-testid="staff-add-open">
            <ShellIcon name="plus" size={14} />
            {c('add')}
          </button>
        ) : null}
        <button
          type="button"
          className="a2-btn"
          disabled={busy || !sorted.length || !canEdit}
          onClick={() => onUse(Object.fromEntries(STAFF_COST_KINDS.map((k) => [k, toMajor(totals[k], money)])) as Record<StaffCostKind, string>)}
          data-testid="staff-use"
        >
          {c('use', { month: monthName(useMonth) })}
        </button>
        {canEdit ? (
          <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="staff-save">
            {busy ? c('saving') : c('save')}
          </button>
        ) : null}
      </div>
      {said ? (
        <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="staff-said">
          {said.text}
        </p>
      ) : null}
      <p className="a2-xs a2-mute a2-mt6">{ok('note')}</p>
    </section>
  );
}
