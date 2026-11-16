'use client';
// PR 1040 (S28, final round D14; prototype Finance › Costs "1 · Fixed costs & salaries") — the four tiles, the salaries of the month
// with the advance, bonus and deduction ROWS (a new row each time, never an edit; the owner's PIN), "Pay" and "Pay all due" (the
// cashbook, the owner's PIN), the other monthly costs with "Change" (from which month; the old months keep their amount) and
// "History" (who, when, why), and the six-month trend. Nothing is deleted: a person or bill is stopped from a month, a wrong bonus
// or deduction is cancelled by a row that points at it. Words: messages/admin-costs.*.json (`moneyCosts.fc.*`).
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { STAFF_COST_KINDS, salaryPlan, staffAmountAt, staffNetAt, staffNextChange, withPayRows, type StaffCostKind, type StaffCostPerson } from '@extas/settings/staff-costs';
import { t, type Dict } from '@/lib/i18n';
import type { CostChangeView, PayRowView } from '@/lib/staff-pay';
import { typedMinor } from '@/lib/admin-books/money';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, toMajor, type Money } from '../products/model';
import { ShellIcon } from '../shell/ShellIcon';

export interface FixedCostsProps {
  dict: Dict;
  locale: string;
  money: Money;
  /** The list as saved (no rows applied) and the version it was read at. */
  people: StaffCostPerson[];
  version: string;
  rows: PayRowView[];
  changes: CostChangeView[];
  month: string;
  /** The day of the month today (1–31). */
  day: number;
  trend: { month: string; salaryMinor: number; otherMinor: number }[];
  perOrderMinor: number | null;
  deliveriesAtPace: number;
  canEdit: boolean;
  canPay: boolean;
  accounts: { key: string; name: string }[];
}

type Panel =
  | { kind: 'person'; id: string }
  | { kind: 'change'; id: string; amount: string; from: string; note: string }
  | { kind: 'history'; id: string }
  | { kind: 'pay'; ids: string[]; account: string; pin: string }
  | { kind: 'add'; what: 'person' | 'head'; name: string; post: string; cat: StaffCostKind; amount: string; payDay: string; from: string }
  | null;

const newId = (): string => `s${(globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, '').slice(0, 20)}`;
const addMonth = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function FixedCostsSection(p: FixedCostsProps) {
  const router = useRouter();
  const c = (key: string, vars?: Record<string, string | number>) => t(p.dict, `moneyCosts.fc.${key}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [row, setRow] = useState({ kind: 'BONUS', amount: '', note: '', account: p.accounts[0]?.key ?? '', pin: '' });
  const [cancel, setCancel] = useState<{ id: string; reason: string; pin: string } | null>(null);
  const [hist, setHist] = useState<CostChangeView[] | null>(null);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(p.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }), [p.locale]);
  const monthShort = useMemo(() => new Intl.DateTimeFormat(p.locale, { month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }), [p.locale]);
  const monthName = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));
  const people = useMemo(() => withPayRows(p.people, p.rows), [p.people, p.rows]);
  const typed = (text: string): number | undefined => (text.trim() ? (typedMinor(text, p.money.digits) ?? undefined) : undefined);
  const errText = (code: string) => {
    for (const k of [`moneyCosts.fc.err.${code}`, `moneyCosts.staff.err.${code}`]) {
      const x = t(p.dict, k);
      if (x !== k) return x;
    }
    return t(p.dict, 'moneyCosts.staff.err.other');
  };

  const salaries = people.filter((x) => x.kind === 'salary').sort((a, b) => a.payDay - b.payDay || a.name.localeCompare(b.name));
  const heads = people.filter((x) => x.kind !== 'salary').sort((a, b) => a.payDay - b.payDay || a.name.localeCompare(b.name));
  const cur = p.trend[p.trend.length - 1]!;
  const prev = p.trend[p.trend.length - 2]!;
  const total = cur.salaryMinor + cur.otherMinor;
  const prevTotal = prev.salaryMinor + prev.otherMinor;
  const delta = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null;
  const due = salaryPlan(people, p.month);
  const late = salaries.filter((s) => !s.paid?.[p.month] && staffNetAt(s, p.month).net > 0 && s.payDay < p.day);
  const dueTotal = due.reduce((n, x) => n + x.minor, 0);
  const maxBar = Math.max(1, ...p.trend.map((x) => x.salaryMinor + x.otherMinor));
  const personOf = (id: string) => people.find((x) => x.id === id);

  async function saveList(next: StaffCostPerson[], note?: string) {
    setBusy(true);
    const a = await call('PUT', '/api/admin/costs/staff', { value: { people: next }, version: p.version, note });
    setBusy(false);
    if (a.status === 200) {
      setPanel(null);
      setSaid(null);
      showToast({ text: c('saved'), tone: 'ok' });
      return router.refresh();
    }
    setSaid(errText(a.status === 0 ? 'network' : String(a.data.error ?? 'other')));
  }
  /** The stored person (no rows applied), changed. */
  const base = (id: string) => p.people.find((x) => x.id === id)!;

  async function addRow(personId: string) {
    const minor = typed(row.amount);
    if (!minor || minor <= 0) return setSaid(c('needAmount'));
    setBusy(true);
    const a = await call('POST', '/api/admin/costs/staff/rows', { personId, month: p.month, kind: row.kind, amountMinor: minor, note: row.note, accountKey: row.kind === 'ADVANCE' ? row.account : undefined, pin: row.pin });
    setBusy(false);
    if (a.status === 201) {
      setRow({ ...row, amount: '', note: '', pin: '' });
      setSaid(null);
      showToast({ text: c('rowAdded'), tone: 'ok' });
      return router.refresh();
    }
    setRow({ ...row, pin: '' });
    setSaid(errText(a.status === 0 ? 'network' : String(a.data.error ?? 'other')));
  }
  async function cancelRow() {
    if (!cancel) return;
    setBusy(true);
    const a = await call('POST', `/api/admin/costs/staff/rows/${cancel.id}/reverse`, { reason: cancel.reason, pin: cancel.pin });
    setBusy(false);
    if (a.status === 201) {
      setCancel(null);
      setSaid(null);
      showToast({ text: c('rowCancelled'), tone: 'ok' });
      return router.refresh();
    }
    setCancel({ ...cancel, pin: '' });
    setSaid(errText(a.status === 0 ? 'network' : String(a.data.error ?? 'other')));
  }
  async function payNow() {
    if (panel?.kind !== 'pay' || !panel.account || !panel.pin) return;
    setBusy(true);
    const a = await call('POST', '/api/admin/costs/staff/pay', { month: p.month, accountKey: panel.account, ids: panel.ids, pin: panel.pin });
    setBusy(false);
    if (a.status === 201) {
      const paid = (a.data.paid as { minor: number }[]) ?? [];
      setPanel(null);
      setSaid(null);
      showToast({ text: t(p.dict, 'moneyCosts.staff.paidDone', { count: paid.length, total: m(paid.reduce((n, x) => n + x.minor, 0)) }), tone: 'ok' });
      return router.refresh();
    }
    setPanel({ ...panel, pin: '' });
    setSaid(errText(a.status === 0 ? 'network' : String(a.data.error ?? 'other')));
  }
  function startPay(ids?: string[]) {
    const plan = salaryPlan(people, p.month, ids);
    if (!plan.length) return setSaid(t(p.dict, 'moneyCosts.staff.payNone'));
    setSaid(null);
    setPanel({ kind: 'pay', ids: plan.map((x) => x.id), account: p.accounts[0]?.key ?? '', pin: '' });
  }
  function commitChange() {
    if (panel?.kind !== 'change') return;
    const minor = typed(panel.amount);
    if (minor === undefined || !/^\d{4}-\d{2}$/.test(panel.from)) return setSaid(t(p.dict, 'moneyCosts.staff.needAmount'));
    const from = panel.from;
    void saveList(
      p.people.map((x) => (x.id === panel.id ? { ...x, stoppedFrom: x.stoppedFrom && x.stoppedFrom <= from ? null : x.stoppedFrom, amounts: [...x.amounts.filter((a) => a.from !== from), { from, minor }].sort((a, b) => (a.from < b.from ? -1 : 1)) } : x)),
      panel.note,
    );
  }
  function commitAdd() {
    if (panel?.kind !== 'add') return;
    const minor = typed(panel.amount);
    const day = Number(panel.payDay);
    if (!panel.name.trim() || minor === undefined || !/^\d{4}-\d{2}$/.test(panel.from) || !Number.isInteger(day) || day < 1 || day > 28) return setSaid(t(p.dict, 'moneyCosts.staff.needAll'));
    const kind: StaffCostKind = panel.what === 'person' ? 'salary' : panel.cat === 'salary' ? 'other' : panel.cat;
    void saveList([...p.people, { id: newId(), name: panel.name.trim(), post: panel.post.trim(), kind, payDay: day, amounts: [{ from: panel.from, minor }], stoppedFrom: null }], panel.what === 'person' ? c('joined') : c('newHead'));
  }
  function stopFrom(id: string, resume: boolean) {
    void saveList(p.people.map((x) => (x.id === id ? { ...x, stoppedFrom: resume ? null : p.month } : x)), resume ? c('resumed') : c('stopped'));
  }
  async function openHistory(id: string) {
    setPanel({ kind: 'history', id });
    setHist(null);
    const a = await call('GET', `/api/admin/costs/staff/history?head=${encodeURIComponent(id)}`);
    setHist(a.status === 200 ? ((a.data.changes as CostChangeView[]) ?? []) : []);
  }

  const mv = (v: number, sign: '+' | '−') => (v ? <span className={sign === '+' ? 'fc-in' : 'fc-out'}>{sign}{m(v)}</span> : <span className="a2-mute">—</span>);
  const dayNow = p.day;

  const personPanel = panel?.kind === 'person' ? personOf(panel.id) : null;
  return (
    <section className="fc" data-testid="fixed-costs-section" aria-labelledby="fc-h">
      <h2 className="fc-h" id="fc-h">
        {c('h1')}
      </h2>
      <div className="a2-kpis fc-tiles" data-testid="fc-tiles">
        <div className="a2-card a2-kpi" data-testid="fc-total">
          <div className="a2-kl">{c('tile.total')}</div>
          <div className="a2-kv">{m(total)}</div>
          <div className="a2-xs a2-mute a2-mt6">
            {c('tile.totalSub', { sal: m(cur.salaryMinor), oth: m(cur.otherMinor) })}
            {delta !== null ? ` · ${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)}% ${c('tile.vsLast')}` : ''}
          </div>
        </div>
        <div className="a2-card a2-kpi" data-testid="fc-per-order">
          <div className="a2-kl">{c('tile.perOrder')}</div>
          <div className="a2-kv">{p.perOrderMinor === null ? '—' : m(Math.round(p.perOrderMinor / 10 ** p.money.digits) * 10 ** p.money.digits)}</div>
          <div className="a2-xs a2-mute a2-mt6">{p.perOrderMinor === null ? c('tile.perOrderNone') : c('tile.perOrderSub', { n: p.deliveriesAtPace })}</div>
        </div>
        <div className={`a2-card a2-kpi${late.length ? ' fc-late' : ''}`} data-testid="fc-due">
          <div className="a2-kl">{c('tile.due')}</div>
          <div className="a2-kv">{m(dueTotal)}</div>
          <div className="a2-xs a2-mute a2-mt6">{due.length ? (late.length ? c('tile.dueSub', { n: due.length, late: late.length }) : c('tile.dueSubNo', { n: due.length })) : c('tile.allPaid')}</div>
          {due.length && p.canPay ? (
            <button type="button" className="a2-btn sm pri a2-mt6" onClick={() => startPay()} data-testid="fc-pay-all">
              {c('payAllDue')}
            </button>
          ) : null}
        </div>
        <div className="a2-card a2-kpi" data-testid="fc-six">
          <div className="a2-kl">{c('tile.six')}</div>
          <div className="a2-kv fc-small">
            {m(p.trend[0]!.salaryMinor + p.trend[0]!.otherMinor)} → {m(total)}
          </div>
        </div>
      </div>
      <p className="a2-note a2-mt12">{c('note')}</p>
      {said ? (
        <p className="a2-note a2-mt12" role="alert" data-testid="fc-said">
          {said}
        </p>
      ) : null}

      <section className="a2-card a2-mt12" data-testid="fc-salaries" aria-labelledby="fc-sal-h">
        <h3 className="a2-h3" id="fc-sal-h">
          {c('sal.title')} · {monthName(p.month)}
        </h3>
        <p className="a2-cs">{c('sal.sub')}</p>
        {salaries.length ? (
          <div className="a2-tbl-wrap a2-mt12">
            <table className="a2-tbl" data-testid="fc-sal-table">
              <thead>
                <tr>
                  <th>{c('sal.staff')}</th>
                  <th className="r">{c('sal.salary')}</th>
                  <th className="r">{c('sal.payDay')}</th>
                  <th className="r">{c('sal.advance')}</th>
                  <th className="r">{c('sal.bonus')}</th>
                  <th className="r">{c('sal.deductions')}</th>
                  <th className="r">{c('sal.net')}</th>
                  <th className="r">{c('sal.thisMonth')}</th>
                  <th aria-label={c('sal.actions')} />
                </tr>
              </thead>
              <tbody>
                {salaries.map((s) => {
                  const x = staffNetAt(s, p.month);
                  const nx = staffNextChange(s, p.month);
                  const paid = s.paid?.[p.month];
                  const stopped = s.stoppedFrom !== null && s.stoppedFrom <= p.month;
                  return (
                    <tr key={s.id} data-testid="fc-sal-row">
                      <td>
                        <b>{s.name}</b>
                        {s.post ? <div className="a2-xs a2-mute">{s.post}</div> : null}
                      </td>
                      <td className="r">
                        {stopped ? <span className="a2-mute">{t(p.dict, 'moneyCosts.staff.stoppedFrom', { month: monthName(s.stoppedFrom!) })}</span> : m(x.base || staffAmountAt(s, p.month))}
                        {nx && !stopped ? (
                          <div className="a2-xs fc-warn">
                            {monthName(nx.from)}: {nx.minor === 0 ? t(p.dict, 'moneyCosts.staff.stops') : m(nx.minor)}
                          </div>
                        ) : null}
                      </td>
                      <td className="r">{s.payDay}</td>
                      <td className="r">{mv(x.adv, '−')}</td>
                      <td className="r">{mv(x.bonus, '+')}</td>
                      <td className="r">{mv(x.ded, '−')}</td>
                      <td className="r">{x.base ? <b data-testid="fc-net">{m(x.net)}</b> : <span className="a2-mute">—</span>}</td>
                      <td className="r">
                        {!x.base ? (
                          <span className="a2-pill line">{c('status.none')}</span>
                        ) : paid ? (
                          <>
                            <span className="a2-pill ok">✓ {c('status.paid')}</span>
                            <div className="a2-xs a2-mute">{paid.at}</div>
                          </>
                        ) : (
                          <>
                            {p.canPay && x.net > 0 ? (
                              <button type="button" className="a2-btn sm pri" onClick={() => startPay([s.id])} data-testid="fc-pay">
                                {c('status.pay')}
                              </button>
                            ) : null}
                            <div className={`a2-xs ${s.payDay < dayNow ? 'fc-bad' : 'a2-mute'}`}>{s.payDay < dayNow ? c('status.late', { n: dayNow - s.payDay }) : c('status.due', { d: s.payDay })}</div>
                          </>
                        )}
                      </td>
                      <td className="r">
                        <button type="button" className="a2-btn sm ghost" onClick={() => { setSaid(null); setCancel(null); setPanel({ kind: 'person', id: s.id }); }} aria-label={c('sal.edit')} data-testid="fc-edit">
                          <ShellIcon name="edit" size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12" data-testid="fc-sal-none">
            {c('sal.none')}
          </p>
        )}
        <div className="a2-between a2-mt12" style={{ flexWrap: 'wrap', gap: 6 }}>
          {p.canEdit ? (
            <button type="button" className="a2-btn sm" onClick={() => { setSaid(null); setPanel({ kind: 'add', what: 'person', name: '', post: '', cat: 'other', amount: '', payDay: '7', from: p.month }); }} data-testid="fc-add-staff">
              <ShellIcon name="plus" size={14} /> {c('addStaff')}
            </button>
          ) : (
            <span />
          )}
          <span className="a2-sm">
            <span className="a2-mute">{c('salCost')}</span> <b>{m(cur.salaryMinor)}</b>
          </span>
        </div>
      </section>

      <div className="fc-g a2-mt12">
        <section className="a2-card" data-testid="fc-heads" aria-labelledby="fc-oth-h">
          <h3 className="a2-h3" id="fc-oth-h">
            {c('oth.title')}
          </h3>
          <p className="a2-cs">{c('oth.sub')}</p>
          {heads.length ? (
            <div className="a2-tbl-wrap a2-mt12">
              <table className="a2-tbl" data-testid="fc-head-table">
                <thead>
                  <tr>
                    <th>{c('oth.head')}</th>
                    <th className="r">{c('oth.perMonth')}</th>
                    <th className="r">{c('oth.day')}</th>
                    <th>{c('oth.thisMonth')}</th>
                    <th aria-label={c('sal.actions')} />
                  </tr>
                </thead>
                <tbody>
                  {heads.map((h) => {
                    const amt = staffAmountAt(h, p.month);
                    const nx = staffNextChange(h, p.month);
                    return (
                      <tr key={h.id} data-testid="fc-head-row">
                        <td>
                          <b>{h.name}</b>
                          <div className="a2-xs a2-mute">{t(p.dict, `moneyCosts.staff.kind.${h.kind}`)}{h.post ? ` · ${h.post}` : ''}</div>
                        </td>
                        <td className="r">
                          <b>{m(amt)}</b>
                          {nx ? (
                            <div className="a2-xs fc-warn">
                              {monthName(nx.from)}: {nx.minor === 0 ? t(p.dict, 'moneyCosts.staff.stops') : m(nx.minor)}
                            </div>
                          ) : null}
                        </td>
                        <td className="r">{h.payDay}</td>
                        <td>{!amt ? <span className="a2-pill line">{c('status.none')}</span> : h.payDay <= dayNow ? <span className="a2-pill ok">✓ {c('status.recorded')}</span> : <span className="a2-xs a2-mute">{c('status.recordsOn', { d: h.payDay })}</span>}</td>
                        <td className="r">
                          <div className="fc-btns">
                            {p.canEdit ? (
                              <button type="button" className="a2-btn sm ghost" onClick={() => { setSaid(null); setPanel({ kind: 'change', id: h.id, amount: toMajor(amt || h.amounts.at(-1)!.minor, p.money), from: addMonth(p.month, 1), note: '' }); }} data-testid="fc-head-change">
                                {c('change')}
                              </button>
                            ) : null}
                            <button type="button" className="a2-btn sm ghost" onClick={() => void openHistory(h.id)} data-testid="fc-head-history">
                              {c('history')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt12">{c('oth.none')}</p>
          )}
          <div className="a2-between a2-mt12" style={{ flexWrap: 'wrap', gap: 6 }}>
            {p.canEdit ? (
              <button type="button" className="a2-btn sm" onClick={() => { setSaid(null); setPanel({ kind: 'add', what: 'head', name: '', post: '', cat: 'other', amount: '', payDay: '5', from: p.month }); }} data-testid="fc-add-head">
                <ShellIcon name="plus" size={14} /> {c('addHead')}
              </button>
            ) : (
              <span />
            )}
            <span className="a2-sm">
              {c('totalPerMonth')} <b>{m(cur.otherMinor)}</b>
            </span>
          </div>
        </section>

        <section className="a2-card" data-testid="fc-trend" aria-labelledby="fc-tr-h">
          <h3 className="a2-h3" id="fc-tr-h">
            {c('trend.title')}
          </h3>
          <div className="fc-bars" role="img" aria-label={c('trend.title')}>
            {p.trend.map((x) => (
              <div key={x.month} className="fc-col" data-testid="fc-trend-col" title={`${monthName(x.month)} · ${m(x.salaryMinor + x.otherMinor)}`}>
                <div className="fc-stack" style={{ height: `${Math.round(((x.salaryMinor + x.otherMinor) / maxBar) * 100)}%` }}>
                  <i className="fc-oth" style={{ flexGrow: x.otherMinor }} />
                  <i className="fc-sal" style={{ flexGrow: x.salaryMinor }} />
                </div>
                <span className="a2-xs a2-mute">{monthShort.format(new Date(`${x.month}-01T00:00:00Z`))}</span>
              </div>
            ))}
          </div>
          <p className="a2-xs a2-mute a2-mt6">{c('trend.legend')}</p>
          {p.changes.length ? (
            <div className="a2-mt12" data-testid="fc-recent">
              {p.changes.slice(0, 3).map((l) => (
                <div key={l.id} className="a2-xs fc-chg">
                  {l.headName}: {l.oldMinor === null ? c('hist.start') : m(l.oldMinor)} → <b>{m(l.newMinor)}</b> {c('hist.from')} {monthName(l.fromMonth)} <span className="a2-mute">· {l.by ?? '—'}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {panel ? (
        <div className="w4-modal" role="dialog" aria-modal="true" aria-label={c('dialog')} data-testid="fc-dialog">
          <div className="a2-card w4-modal-box fc-box">
            {panel.kind === 'person' && personPanel ? (
              <>
                <h3 className="a2-h3">
                  {personPanel.name}
                  {personPanel.post ? ` · ${personPanel.post}` : ''}
                </h3>
                {(() => {
                  const x = staffNetAt(personPanel, p.month);
                  const mine = p.rows.filter((r) => r.personId === personPanel.id && r.month === p.month);
                  const paid = personPanel.paid?.[p.month];
                  return (
                    <>
                      <div className="fc-sum a2-sm">
                        <span>{c('p.salary')}</span>
                        <b>{m(x.base)}</b>
                        <span>{c('p.payDay')}</span>
                        <b>{personPanel.payDay}</b>
                        <span>{c('p.net')}</span>
                        <b>{m(x.net)}</b>
                      </div>
                      <h4 className="a2-sm">{monthName(p.month)}</h4>
                      {mine.length ? (
                        <ul className="fc-rows" data-testid="fc-person-rows">
                          {mine.map((r) => (
                            <li key={r.id} className={r.cancelled || r.reversesId ? 'fc-struck' : ''} data-testid="fc-person-row">
                              <span>{c(`kind.${r.kind}`)}{r.reversesId ? ` (${c('p.cancelling')})` : ''}</span>
                              <b>{m(r.amountMinor)}</b>
                              <span className="a2-xs a2-mute">{r.note ?? ''}</span>
                              {p.canEdit && !paid && !r.cancelled && !r.reversesId && r.kind !== 'ADVANCE' ? (
                                <button type="button" className="a2-btn sm ghost" onClick={() => setCancel({ id: r.id, reason: '', pin: '' })} data-testid="fc-row-cancel">
                                  {c('p.cancelRow')}
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="a2-xs a2-mute">{c('p.noRows')}</p>
                      )}
                      {cancel ? (
                        <div className="ct-form" data-testid="fc-cancel-form">
                          <label className="a2-fld">
                            <span className="a2-lbl">{c('p.reason')}</span>
                            <input className="a2-inp" value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} />
                          </label>
                          <label className="a2-fld">
                            <span className="a2-lbl">{c('pin')}</span>
                            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={cancel.pin} onChange={(e) => setCancel({ ...cancel, pin: e.target.value })} />
                          </label>
                          <div className="a2-row" style={{ gap: 8 }}>
                            <button type="button" className="a2-btn pri" disabled={busy || !cancel.pin || cancel.reason.trim().length < 3} onClick={() => void cancelRow()} data-testid="fc-cancel-ok">
                              {c('p.cancelGo')}
                            </button>
                            <button type="button" className="a2-btn" onClick={() => setCancel(null)}>
                              {c('close')}
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {paid ? (
                        <p className="a2-note" data-testid="fc-person-locked">
                          {c('p.locked', { date: paid.at, amount: m(paid.minor) })}
                        </p>
                      ) : p.canEdit && x.base ? (
                        <div className="ct-form" data-testid="fc-row-form">
                          <h4 className="a2-sm">{c('p.newRow')}</h4>
                          <label className="a2-fld">
                            <span className="a2-lbl">{c('p.kind')}</span>
                            <select className="a2-inp" value={row.kind} onChange={(e) => setRow({ ...row, kind: e.target.value })} data-testid="fc-row-kind">
                              {['BONUS', 'DEDUCTION', ...(p.canPay ? ['ADVANCE'] : [])].map((k) => (
                                <option key={k} value={k}>
                                  {c(`kind.${k}`)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="a2-fld">
                            <span className="a2-lbl">{c('p.amount')}</span>
                            <input className="a2-inp" inputMode="decimal" value={row.amount} onChange={(e) => setRow({ ...row, amount: e.target.value })} data-testid="fc-row-amount" />
                          </label>
                          {row.kind === 'ADVANCE' ? (
                            <label className="a2-fld">
                              <span className="a2-lbl">{c('p.from')}</span>
                              <select className="a2-inp" value={row.account} onChange={(e) => setRow({ ...row, account: e.target.value })}>
                                {p.accounts.map((a) => (
                                  <option key={a.key} value={a.key}>
                                    {a.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          <label className="a2-fld">
                            <span className="a2-lbl">{c('p.note')}</span>
                            <input className="a2-inp" maxLength={120} value={row.note} onChange={(e) => setRow({ ...row, note: e.target.value })} />
                          </label>
                          <label className="a2-fld">
                            <span className="a2-lbl">{c('pin')}</span>
                            <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={row.pin} onChange={(e) => setRow({ ...row, pin: e.target.value })} data-testid="fc-row-pin" />
                          </label>
                          <p className="a2-xs a2-mute">{row.kind === 'ADVANCE' ? c('p.advanceHelp') : c('p.rowHelp')}</p>
                          <button type="button" className="a2-btn pri" disabled={busy || !row.pin || !row.amount} onClick={() => void addRow(personPanel.id)} data-testid="fc-row-add">
                            {c('p.addRow')}
                          </button>
                        </div>
                      ) : null}
                      {said ? (
                        <p className="a2-note" role="alert">
                          {said}
                        </p>
                      ) : null}
                      <div className="a2-row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        {p.canEdit ? (
                          <button type="button" className="a2-btn sm" onClick={() => { setSaid(null); setPanel({ kind: 'change', id: personPanel.id, amount: toMajor(staffAmountAt(personPanel, p.month) || personPanel.amounts.at(-1)!.minor, p.money), from: addMonth(p.month, 1), note: '' }); }} data-testid="fc-change-salary">
                            <ShellIcon name="edit" size={14} /> {c('p.changeSalary')}
                          </button>
                        ) : null}
                        <button type="button" className="a2-btn sm ghost" onClick={() => void openHistory(personPanel.id)}>
                          {c('history')}
                        </button>
                        {p.canEdit ? (
                          <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => stopFrom(personPanel.id, personPanel.stoppedFrom !== null)}>
                            {personPanel.stoppedFrom !== null ? t(p.dict, 'moneyCosts.staff.resume') : t(p.dict, 'moneyCosts.staff.stop')}
                          </button>
                        ) : null}
                        <button type="button" className="a2-btn" onClick={() => { setPanel(null); setCancel(null); setSaid(null); }}>
                          {c('close')}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </>
            ) : null}

            {panel.kind === 'change' ? (
              <>
                <h3 className="a2-h3">
                  {c('chg.title')} · {personOf(panel.id)?.name}
                </h3>
                <p className="a2-note">{c('chg.now', { amount: m(staffAmountAt(base(panel.id), p.month)) })}</p>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('chg.amount')}</span>
                  <input className="a2-inp" inputMode="decimal" value={panel.amount} onChange={(e) => setPanel({ ...panel, amount: e.target.value })} data-testid="fc-chg-amount" />
                </label>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('chg.from')}</span>
                  <input className="a2-inp" type="month" value={panel.from} onChange={(e) => setPanel({ ...panel, from: e.target.value })} data-testid="fc-chg-from" />
                </label>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('chg.reason')}</span>
                  <input className="a2-inp" maxLength={120} value={panel.note} onChange={(e) => setPanel({ ...panel, note: e.target.value })} data-testid="fc-chg-note" />
                </label>
                <p className="a2-xs a2-mute">{c('chg.help')}</p>
                {said ? (
                  <p className="a2-note" role="alert">
                    {said}
                  </p>
                ) : null}
                <div className="a2-row" style={{ gap: 8 }}>
                  <button type="button" className="a2-btn pri" disabled={busy} onClick={commitChange} data-testid="fc-chg-ok">
                    {c('chg.save')}
                  </button>
                  <button type="button" className="a2-btn" onClick={() => setPanel(null)}>
                    {c('cancel')}
                  </button>
                </div>
              </>
            ) : null}

            {panel.kind === 'history' ? (
              <>
                <h3 className="a2-h3">
                  {c('hist.title')} · {personOf(panel.id)?.name}
                </h3>
                <ul className="fc-hist" data-testid="fc-history">
                  {[...base(panel.id).amounts]
                    .sort((a, b) => (a.from < b.from ? 1 : -1))
                    .map((a) => {
                      const log = (hist ?? []).find((l) => l.fromMonth === a.from && l.newMinor === a.minor);
                      return (
                        <li key={a.from}>
                          <b>{m(a.minor)}</b> {c('hist.perMonthFrom')} {monthName(a.from)} {p.month < a.from ? <span className="a2-pill warn">{c('hist.coming')}</span> : null}
                          <div className="a2-xs a2-mute">{log ? `${c('hist.changed')} ${log.by ?? '—'} · ${log.at.slice(0, 10)}${log.note ? ` · ${log.note}` : ''}` : c('hist.start')}</div>
                        </li>
                      );
                    })}
                </ul>
                {base(panel.id).stoppedFrom ? <p className="a2-xs">{t(p.dict, 'moneyCosts.staff.stoppedFrom', { month: monthName(base(panel.id).stoppedFrom!) })}</p> : null}
                <p className="a2-xs a2-mute">{c('hist.help')}</p>
                <button type="button" className="a2-btn" onClick={() => setPanel(null)}>
                  {c('close')}
                </button>
              </>
            ) : null}

            {panel.kind === 'pay' ? (
              <>
                <h3 className="a2-h3">{t(p.dict, 'moneyCosts.staff.payTitle')}</h3>
                <ul className="a2-sm fc-rows">
                  {salaryPlan(people, p.month, panel.ids).map((x) => (
                    <li key={x.id}>
                      <span>{x.name}</span>
                      <b>{m(x.minor)}</b>
                    </li>
                  ))}
                </ul>
                <label className="a2-fld">
                  <span className="a2-lbl">{t(p.dict, 'moneyCosts.staff.payFrom')}</span>
                  <select className="a2-inp" value={panel.account} onChange={(e) => setPanel({ ...panel, account: e.target.value })} data-testid="fc-pay-account">
                    {p.accounts.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('pin')}</span>
                  <input className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={panel.pin} onChange={(e) => setPanel({ ...panel, pin: e.target.value })} data-testid="fc-pay-pin" />
                </label>
                <p className="a2-xs a2-mute">{t(p.dict, 'moneyCosts.staff.payNote')}</p>
                {said ? (
                  <p className="a2-note" role="alert">
                    {said}
                  </p>
                ) : null}
                <div className="a2-row" style={{ gap: 8 }}>
                  <button type="button" className="a2-btn pri" disabled={busy || !panel.pin || !panel.account} onClick={() => void payNow()} data-testid="fc-pay-go">
                    {t(p.dict, 'moneyCosts.staff.payGo')}
                  </button>
                  <button type="button" className="a2-btn" onClick={() => setPanel(null)}>
                    {c('cancel')}
                  </button>
                </div>
              </>
            ) : null}

            {panel.kind === 'add' ? (
              <>
                <h3 className="a2-h3">{panel.what === 'person' ? c('add.person') : c('add.head')}</h3>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('add.name')}</span>
                  <input className="a2-inp" value={panel.name} onChange={(e) => setPanel({ ...panel, name: e.target.value })} data-testid="fc-add-name" />
                </label>
                {panel.what === 'person' ? (
                  <label className="a2-fld">
                    <span className="a2-lbl">{c('add.post')}</span>
                    <input className="a2-inp" value={panel.post} onChange={(e) => setPanel({ ...panel, post: e.target.value })} />
                  </label>
                ) : (
                  <label className="a2-fld">
                    <span className="a2-lbl">{c('add.category')}</span>
                    <select className="a2-inp" value={panel.cat} onChange={(e) => setPanel({ ...panel, cat: e.target.value as StaffCostKind })}>
                      {STAFF_COST_KINDS.filter((k) => k !== 'salary').map((k) => (
                        <option key={k} value={k}>
                          {t(p.dict, `moneyCosts.staff.kind.${k}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="a2-fld">
                  <span className="a2-lbl">{c('add.amount')}</span>
                  <input className="a2-inp" inputMode="decimal" value={panel.amount} onChange={(e) => setPanel({ ...panel, amount: e.target.value })} data-testid="fc-add-amount" />
                </label>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('add.payDay')}</span>
                  <input className="a2-inp" type="number" min={1} max={28} value={panel.payDay} onChange={(e) => setPanel({ ...panel, payDay: e.target.value })} />
                </label>
                <label className="a2-fld">
                  <span className="a2-lbl">{c('add.from')}</span>
                  <input className="a2-inp" type="month" value={panel.from} onChange={(e) => setPanel({ ...panel, from: e.target.value })} />
                </label>
                {said ? (
                  <p className="a2-note" role="alert">
                    {said}
                  </p>
                ) : null}
                <div className="a2-row" style={{ gap: 8 }}>
                  <button type="button" className="a2-btn pri" disabled={busy} onClick={commitAdd} data-testid="fc-add-ok">
                    {c('add.save')}
                  </button>
                  <button type="button" className="a2-btn" onClick={() => setPanel(null)}>
                    {c('cancel')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
