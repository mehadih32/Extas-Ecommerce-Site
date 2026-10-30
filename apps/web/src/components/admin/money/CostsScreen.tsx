'use client';
// CN-028 · PR 618 — the two cards of Money → Costs (/admin/money/costs): the month's fixed costs (pick a month, write
// salary, rent, utilities and other, save: a new version, sent to the ERP by the summary tick; the months below with
// their total, the ERP's by-day spread and how each was taken), and the daily cost lines (add a cost on a line for today
// or an open day; reverse a wrong one with a reason; "More options": the lines this shop never has). Nothing is copied
// from month to month by itself: a month not set yet is only filled in from the last one for the owner to check and
// save. Every write goes to /api/admin/costs/* and the page is read again. Without `fixedcosts.write` it is read-only.
// qa-gate: amounts are read like the Books pages (`typedMinor`: 1,000 and 1,00,000, Bengali digits, never a third
// decimal); a cost is sent with a request key kept until it is written, so a double tap or a retry writes it once; a
// month the server cannot add up is shown as unreadable; the list says when it shows only the latest entries.
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import type { CostEntryRow, FixedCostsView } from '@extas/inventory';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { typedMinor } from '@/lib/admin-books/money';
import { formatMoney, toMajor, type Money } from '../products/model';
import { ShellIcon } from '../shell/ShellIcon';

type Line = CostEntryRow['line'];
const FIELDS = ['salary', 'rent', 'utilities', 'other'] as const;
type Field = (typeof FIELDS)[number];

export interface CostsScreenProps {
  dict: Dict;
  locale: string;
  money: Money;
  fixed: FixedCostsView;
  entries: CostEntryRow[];
  /** Only the latest `entriesLimit` entries are shown: there are more. */
  entriesMore: boolean;
  entriesLimit: number;
  noCostLines: Line[];
  lines: readonly Line[];
  openFrom: string;
  canEdit: boolean;
}

/** A new request key for one cost entry (kept until the entry is written). */
const newKey = (): string => globalThis.crypto?.randomUUID?.() ?? `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

const daysIn = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

export function CostsScreen(p: CostsScreenProps) {
  const router = useRouter();
  const id = useId();
  const c = (key: string, vars?: Record<string, string | number>) => t(p.dict, `moneyCosts.${key}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(p.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' }), [p.locale]);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(p.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }), [p.locale]);
  const day = (ymd: string) => dayFmt.format(new Date(`${ymd}T00:00:00Z`));
  const month = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));
  const errText = (code: string | undefined) => {
    const key = `moneyCosts.err.${code ?? 'other'}`;
    const text = t(p.dict, key);
    return text === key ? c('err.other') : text;
  };
  const linked = p.fixed.linked;
  const off = !p.canEdit || !linked;
  /** A typed amount in minor units; null = empty; undefined = not an amount. */
  const typed = (text: string): number | null | undefined => (text.trim() ? (typedMinor(text, p.money.digits) ?? undefined) : null);

  // ---- fixed costs ----
  const openMonths = p.fixed.months.filter((x) => x.open);
  const thisMonth = p.fixed.today.slice(0, 7);
  const [pick, setPick] = useState(openMonths.find((x) => x.month === thisMonth)?.month ?? openMonths[0]?.month ?? '');
  const shownMonth = p.fixed.months.find((x) => x.month === pick) ?? null;
  const startOf = (mo: string) => {
    const v = p.fixed.months.find((x) => x.month === mo);
    if (v?.lines) return { from: null, form: Object.fromEntries(FIELDS.map((f) => [f, toMajor(v.lines![f], p.money)])) as Record<Field, string>, note: v.note ?? '' };
    const s = p.fixed.suggestion;
    if (s) return { from: s.from, form: { salary: toMajor(s.salaryMinor, p.money), rent: toMajor(s.rentMinor, p.money), utilities: toMajor(s.utilitiesMinor, p.money), other: toMajor(s.otherMinor, p.money) }, note: '' };
    return { from: null, form: { salary: '', rent: '', utilities: '', other: '' }, note: '' };
  };
  const [draft, setDraft] = useState(() => startOf(pick));
  const [fBusy, setFBusy] = useState(false);
  const [fSaid, setFSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const minor = FIELDS.map((f) => typed(draft.form[f]));
  const valid = minor.every((x) => typeof x === 'number');
  const sum = valid ? (minor as number[]).reduce((s, x) => s + x, 0) : null;
  const total = sum !== null && Number.isSafeInteger(sum) ? sum : null;
  const spread = total !== null && pick ? { each: Math.floor(total / daysIn(pick)), last: total - Math.floor(total / daysIn(pick)) * (daysIn(pick) - 1) } : null;

  function choose(mo: string) {
    setPick(mo);
    setDraft(startOf(mo));
    setFSaid(null);
  }
  async function saveFixed() {
    if (!valid) return setFSaid({ text: c('fixed.needAll'), bad: true });
    setFBusy(true);
    const [salaryMinor, rentMinor, utilitiesMinor, otherMinor] = minor as number[];
    const a = await call('PUT', '/api/admin/costs/fixed-costs', { month: pick, salaryMinor, rentMinor, utilitiesMinor, otherMinor, note: draft.note.trim() || null });
    setFBusy(false);
    if (a.status === 200) {
      const r = a.data.result as { changed: boolean; version: number };
      setFSaid({ text: r.changed ? c('fixed.saved', { n: r.version }) : c('fixed.same'), bad: false });
      setDraft((d) => ({ ...d, from: null }));
      return router.refresh();
    }
    setFSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }

  // ---- daily cost lines ----
  const [line, setLine] = useState<Line>(p.lines[0]!);
  const [eDay, setEDay] = useState(p.fixed.today);
  const [amount, setAmount] = useState('');
  const [eNote, setENote] = useState('');
  const [eBusy, setEBusy] = useState(false);
  const [eSaid, setESaid] = useState<{ text: string; bad: boolean } | null>(null);
  const [reqKey, setReqKey] = useState(newKey);
  const [undo, setUndo] = useState<{ id: string; reason: string } | null>(null);
  const [never, setNever] = useState<Line[]>(p.noCostLines);
  const [nSaid, setNSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function addEntry() {
    const amountMinor = typed(amount);
    if (typeof amountMinor !== 'number') return setESaid({ text: c('lines.badAmount'), bad: true });
    setEBusy(true);
    const a = await call('POST', '/api/admin/costs/cost-entries', { line, day: eDay, amountMinor, note: eNote.trim() || null, requestKey: reqKey });
    setEBusy(false);
    if (a.status === 201) {
      setReqKey(newKey());
      setAmount('');
      setENote('');
      setESaid({ text: (a.data.result as { resummarised: boolean }).resummarised ? c('lines.addedResent') : c('lines.added'), bad: false });
      return router.refresh();
    }
    setESaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  async function reverse() {
    if (!undo) return;
    if (!undo.reason.trim()) return setESaid({ text: c('err.REASON_REQUIRED'), bad: true });
    setEBusy(true);
    const a = await call('POST', `/api/admin/costs/cost-entries/${undo.id}/reverse`, { reason: undo.reason.trim() });
    setEBusy(false);
    if (a.status === 201) {
      setUndo(null);
      setESaid({ text: c('lines.reversedOk'), bad: false });
      return router.refresh();
    }
    setESaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }
  async function saveNever() {
    setEBusy(true);
    const a = await call('PUT', '/api/admin/costs/no-cost-lines', { value: never });
    setEBusy(false);
    if (a.status === 200) {
      setNSaid({ text: c('lines.neverSaved'), bad: false });
      return router.refresh();
    }
    setNSaid({ text: errText(a.status === 0 ? 'network' : a.data.error), bad: true });
  }

  const say = (s: { text: string; bad: boolean } | null, testId: string) =>
    s ? (
      <p className={`a2-sm a2-mt6 ${s.bad ? 'bk-warn' : 'a2-mute'}`} role={s.bad ? 'alert' : 'status'} data-testid={testId}>
        {s.text}
      </p>
    ) : null;
  const sendTone = (s: string) => (s === 'ACCEPTED' ? 'ok' : s === 'REFUSED' ? 'bad' : s === 'RETRYING' ? 'warn' : 'line');
  const stateText = (s: string) => t(p.dict, `moneyCosts.sendState.${s}`);

  return (
    <>
      {!linked ? (
        <div className="a2-note" data-testid="costs-not-linked">
          <ShellIcon name="info" size={15} />
          <span>{c('notLinked')}</span>
        </div>
      ) : !p.canEdit ? (
        <div className="a2-note" data-testid="costs-read-only">
          <ShellIcon name="lock" size={15} />
          <span>{c('readOnly')}</span>
        </div>
      ) : null}
      <section className="a2-card" data-testid="fc-card" aria-labelledby={`${id}-fh`}>
        <h2 className="a2-h3" id={`${id}-fh`}>
          {c('fixed.title')}
        </h2>
        <p className="a2-cs">{c('fixed.sub')}</p>
        {linked && openMonths.length ? (
          <div className="ct-form a2-mt12" data-testid="fc-form">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-month`}>
                {c('fixed.month')}
              </label>
              <select id={`${id}-month`} className="a2-sel" value={pick} disabled={fBusy} onChange={(e) => choose(e.target.value)} data-testid="fc-month">
                {openMonths.map((x) => (
                  <option key={x.month} value={x.month}>
                    {month(x.month)}
                  </option>
                ))}
              </select>
            </div>
            <p className="a2-xs a2-mute ct-hint" data-testid="fc-hint">
              {shownMonth?.entered ? `${c('fixed.version', { n: shownMonth.version ?? 0 })} · ${stateText(shownMonth.state)}` : draft.from ? c('fixed.fromLast', { month: month(draft.from) }) : c('fixed.empty')}
            </p>
            <div className="ct-grid">
              {FIELDS.map((f) => (
                <div className="a2-fld" key={f}>
                  <label className="a2-lbl" htmlFor={`${id}-${f}`}>
                    {c(`fixed.${f}`)} ({p.money.currency})
                  </label>
                  <input id={`${id}-${f}`} className="a2-inp" inputMode="decimal" autoComplete="off" value={draft.form[f]} disabled={off || fBusy} onChange={(e) => setDraft((d) => ({ ...d, form: { ...d.form, [f]: e.target.value } }))} data-testid={`fc-${f}`} />
                </div>
              ))}
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-note`}>
                {c('fixed.note')}
              </label>
              <input id={`${id}-note`} className="a2-inp" maxLength={500} placeholder={c('fixed.notePh')} value={draft.note} disabled={off || fBusy} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} data-testid="fc-note" />
            </div>
            <div className="ct-total" data-testid="fc-total">
              <span className="a2-kl">{c('fixed.total')}</span>
              <span className="bk-fv">{total === null ? '—' : m(total)}</span>
              {spread ? <span className="a2-xs a2-mute">{c('fixed.perDay', { day: m(spread.each), last: m(spread.last) })}</span> : null}
            </div>
            <div className="ct-actions">
              <button type="button" className="a2-btn pri" disabled={off || fBusy} onClick={saveFixed} data-testid="fc-save">
                {fBusy ? c('fixed.saving') : c('fixed.save')}
              </button>
            </div>
            {say(fSaid, 'fc-said')}
          </div>
        ) : null}
        <h3 className="a2-h4 a2-mt12">{c('fixed.monthsTitle')}</h3>
        <div className="a2-tblw a2-mt6">
          <table className="a2-tbl" data-testid="fc-months">
            <thead>
              <tr>
                <th>{c('fixed.col.month')}</th>
                <th className="r">{c('fixed.col.total')}</th>
                <th className="r">{c('fixed.col.perDay')}</th>
                <th>{c('fixed.col.state')}</th>
                <th>{c('fixed.col.version')}</th>
              </tr>
            </thead>
            <tbody>
              {p.fixed.months.length ? (
                [...p.fixed.months].reverse().map((x) => (
                  <tr key={x.month} data-testid="fc-month-row" data-entered={x.entered ? 'yes' : 'no'} data-state={x.state}>
                    <td className="a2-tdh">
                      <b>{month(x.month)}</b>
                      {!x.open && x.entered ? <span className="a2-xs a2-mute"> · {c('fixed.closed')}</span> : null}
                    </td>
                    <td className="r" data-l={c('fixed.col.total')}>
                      {x.unreadable ? (
                        <span className="a2-pill warn" data-testid="fc-unreadable">
                          {c('fixed.unreadable')}
                        </span>
                      ) : (
                        <span className="a2-num">{x.totalMinor === null ? c('fixed.notSet') : m(x.totalMinor)}</span>
                      )}
                    </td>
                    <td className="r" data-l={c('fixed.col.perDay')}>
                      <span className="a2-num">{x.perDay.length ? m(x.perDay[0]!.minor) : '—'}</span>
                    </td>
                    <td data-l={c('fixed.col.state')}>{x.entered ? <span className={`a2-pill ${sendTone(x.state)}`} title={x.lastError ?? undefined}>{stateText(x.state)}</span> : <span className="a2-xs a2-mute">—</span>}</td>
                    <td data-l={c('fixed.col.version')}>
                      <span className="a2-xs">{x.version ? c('fixed.version', { n: x.version }) : '—'}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="a2-xs a2-mute">
                    {c('notLinked')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a2-card" data-testid="cl-card" aria-labelledby={`${id}-lh`}>
        <h2 className="a2-h3" id={`${id}-lh`}>
          {c('lines.title')}
        </h2>
        <p className="a2-cs">{c('lines.sub')}</p>
        {linked ? (
          <>
            <div className="ct-form a2-mt12" data-testid="cl-form">
              <div className="ct-grid">
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-line`}>
                    {c('lines.line')}
                  </label>
                  <select id={`${id}-line`} className="a2-sel" value={line} disabled={off || eBusy} onChange={(e) => setLine(e.target.value as Line)} data-testid="cl-line">
                    {p.lines.map((l) => (
                      <option key={l} value={l}>
                        {c(`line.${l}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-day`}>
                    {c('lines.day')}
                  </label>
                  <input id={`${id}-day`} type="date" className="a2-inp" min={p.openFrom} max={p.fixed.today} value={eDay} disabled={off || eBusy} onChange={(e) => setEDay(e.target.value)} data-testid="cl-day" />
                </div>
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-amount`}>
                    {c('lines.amount')} ({p.money.currency})
                  </label>
                  <input id={`${id}-amount`} className="a2-inp" inputMode="decimal" autoComplete="off" value={amount} disabled={off || eBusy} onChange={(e) => setAmount(e.target.value)} data-testid="cl-amount" />
                </div>
                <div className="a2-fld">
                  <label className="a2-lbl" htmlFor={`${id}-enote`}>
                    {c('lines.note')}
                  </label>
                  <input id={`${id}-enote`} className="a2-inp" maxLength={500} value={eNote} disabled={off || eBusy} onChange={(e) => setENote(e.target.value)} data-testid="cl-note" />
                </div>
              </div>
              <p className="a2-xs a2-mute">{c('lines.openDays', { from: day(p.openFrom), to: day(p.fixed.today) })}</p>
              <div className="ct-actions">
                <button type="button" className="a2-btn pri" disabled={off || eBusy} onClick={addEntry} data-testid="cl-add">
                  {eBusy ? c('lines.adding') : c('lines.add')}
                </button>
              </div>
              {say(eSaid, 'cl-said')}
            </div>
            <h3 className="a2-h4 a2-mt12">{c('lines.entriesTitle')}</h3>
            {p.entriesMore ? (
              <p className="a2-xs a2-mute" data-testid="cl-limited">
                {c('lines.limited', { n: p.entriesLimit })}
              </p>
            ) : null}
            {p.entries.length ? (
              <div className="a2-tblw a2-mt6">
                <table className="a2-tbl" data-testid="cl-entries">
                  <thead>
                    <tr>
                      <th>{c('lines.col.day')}</th>
                      <th>{c('lines.col.line')}</th>
                      <th className="r">{c('lines.col.amount')}</th>
                      <th>{c('lines.col.note')}</th>
                      <th>
                        <span className="a2-sr">{c('lines.reverse')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.entries.map((e) => (
                      <tr key={e.id} data-testid="cl-entry" data-reversed={e.reversedBy ? 'yes' : 'no'}>
                        <td className="a2-tdh">
                          <b>{day(e.day)}</b>
                        </td>
                        <td data-l={c('lines.col.line')}>{c(`line.${e.line}`)}</td>
                        <td className="r" data-l={c('lines.col.amount')}>
                          <span className="a2-num">{m(e.amountMinor)}</span>
                        </td>
                        <td data-l={c('lines.col.note')}>
                          <span className="a2-xs">{e.note ?? ''}</span>
                          {e.reverses ? <span className="a2-pill line">{c('lines.reversal')}</span> : e.reversedBy ? <span className="a2-pill line">{c('lines.reversed')}</span> : !e.manual ? <span className="a2-pill line">{c('lines.fromStatement')}</span> : null}
                        </td>
                        <td>
                          {e.canReverse && p.canEdit ? (
                            undo?.id === e.id ? (
                              <div className="ct-undo">
                                <input className="a2-inp" aria-label={c('lines.reason')} placeholder={c('lines.reason')} maxLength={500} value={undo.reason} disabled={eBusy} onChange={(ev) => setUndo({ id: e.id, reason: ev.target.value })} data-testid="cl-reason" />
                                <button type="button" className="a2-btn" disabled={eBusy} onClick={reverse} data-testid="cl-confirm">
                                  {c('lines.confirm')}
                                </button>
                                <button type="button" className="a2-btn" disabled={eBusy} onClick={() => setUndo(null)}>
                                  {c('lines.cancel')}
                                </button>
                              </div>
                            ) : (
                              <button type="button" className="a2-btn" disabled={eBusy} onClick={() => setUndo({ id: e.id, reason: '' })} data-testid="cl-reverse">
                                {c('lines.reverse')}
                              </button>
                            )
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="a2-sm a2-mute a2-mt6" data-testid="cl-empty">
                {c('lines.none')}
              </p>
            )}
            <details className="ct-more a2-mt12" data-testid="cl-more">
              <summary>{c('lines.more')}</summary>
              <h4 className="a2-h4 a2-mt6">{c('lines.neverTitle')}</h4>
              <p className="a2-xs a2-mute">{c('lines.neverSub')}</p>
              <div className="ct-checks a2-mt6">
                {p.lines.map((l) => (
                  <label key={l} className="a2-chkl">
                    <input type="checkbox" className="a2-chk" checked={never.includes(l)} disabled={off || eBusy} onChange={(e) => setNever((n) => (e.target.checked ? [...n, l] : n.filter((x) => x !== l)))} data-testid={`cl-never-${l}`} />
                    <span>{c(`line.${l}`)}</span>
                  </label>
                ))}
              </div>
              <div className="ct-actions">
                <button type="button" className="a2-btn" disabled={off || eBusy} onClick={saveNever} data-testid="cl-never-save">
                  {c('lines.neverSave')}
                </button>
              </div>
              {say(nSaid, 'cl-never-said')}
            </details>
          </>
        ) : null}
        <div className="a2-note a2-mt12">
          <ShellIcon name="info" size={15} />
          <span>{c('never')}</span>
        </div>
      </section>
    </>
  );
}
