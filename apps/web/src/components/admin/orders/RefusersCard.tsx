'use client';
// S06 · PR 163 — the "Repeat refusers" card of Orders › Risk rules, under the Blocklist card: the switch (off as it
// ships) and how many refusals put a number on the list (empty until the owner sets it); the list (refused, delivered,
// orders, the last one, the terms now) with "Choose terms"; the terms now (who chose them, when, the refusals then)
// with "End" and its reason; terms for a number not on the list; and the newest ended terms. Choosing terms needs
// `risk.refuser.terms` (the owner's decision per case). The terms only become a proposal on a new order, which a person
// sends; nothing here changes COD by itself. After a change the page reads the list again.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { RefuserTerms, RiskRefusers } from '@extas/settings';
import type { RefusersCardScreen, RefusersCardTexts, RefuserTermScreen } from '@/lib/admin-orders/refusers-card';
import { minRefusedOf, REFUSER_TERM_CHOICES, sameRefusers } from '@/lib/admin-orders/refusers-draft';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/risk/refusers';

type Said = { text: string; bad: boolean } | null;
type Limits = RefusersCardScreen['reasonLimits'];

const errText = (x: RefusersCardTexts, a: { status: number; data: { error?: string } }) => x.err[a.status === 0 ? 'network' : (a.data.error ?? 'other')] ?? x.err.other!;
const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((acc, [k, val]) => acc.replace(`{${k}}`, String(val)), s);

export function RefusersCard({ screen, texts: x, canEdit, canDecide }: { screen: RefusersCardScreen; texts: RefusersCardTexts; canEdit: boolean; canDecide: boolean }) {
  const id = useId();
  const [base, setBase] = useState<RiskRefusers>(screen.value);
  const [enabled, setEnabled] = useState(screen.value.enabled);
  const [minText, setMinText] = useState(screen.value.minRefused === null ? '' : String(screen.value.minRefused));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const [listSaid, setListSaid] = useState<Said>(null);
  const min = minRefusedOf(minText);
  const draft: RiskRefusers | null = min.ok ? { enabled, minRefused: min.value } : null;
  const dirty = !draft || !sameRefusers(draft, base);
  const off = !canEdit || busy;
  const reset = (v: RiskRefusers) => {
    setEnabled(v.enabled);
    setMinText(v.minRefused === null ? '' : String(v.minRefused));
  };

  const router = useRouter();
  async function save() {
    if (!draft) return setSaid({ text: x.minBad, bad: true });
    setBusy(true);
    const a = await call('PUT', URL, { value: draft });
    setBusy(false);
    if (a.status === 200) {
      const v = (a.data as unknown as { value: RiskRefusers }).value;
      setBase(v);
      reset(v);
      setSaid({ text: x.saved, bad: false });
      return router.refresh();
    }
    setSaid({ text: errText(x, a), bad: true });
  }

  const minId = `${id}-min`;
  return (
    <section className="a2-sc a2-mt12" id="rr-refusers" aria-labelledby={`${id}-h`} data-testid="rr-refusers">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {x.h}
          </h2>
          <p className="a2-scd">{x.d}</p>
        </div>
      </div>
      {!canEdit ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{x.readOnly}</span>
        </div>
      ) : null}
      <div className="a2-scb">
        <div className="a2-swl">
          <span>
            {x.master}
            <span className="a2-xs a2-mute a2-blk">{x.masterHelp}</span>
          </span>
          <button
            type="button"
            className={`a2-sw${enabled ? ' on' : ''}`}
            role="switch"
            aria-checked={enabled}
            aria-label={x.master}
            disabled={off}
            onClick={() => {
              setEnabled(!enabled);
              setSaid(null);
            }}
            data-testid="rr-rf-master"
          />
        </div>
        {!enabled ? <div className="a2-xs a2-mute a2-mt6">{x.offNote}</div> : null}
      </div>
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={minId}>
            {x.min}
          </label>
          <input
            id={minId}
            className="a2-inp"
            inputMode="numeric"
            value={minText}
            placeholder={x.minPh}
            disabled={off}
            onChange={(e) => {
              setMinText(e.target.value);
              setSaid(null);
            }}
            data-testid="rr-rf-min"
          />
          <span className="a2-xs a2-mute">{min.ok ? x.minHelp : x.minBad}</span>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{x.never}</p>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="rr-rf-status">
          {said ? said.text : dirty ? x.unsaved : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => reset(base)}>
                {x.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty || !draft} onClick={save} data-testid="rr-rf-save">
              {busy ? x.saving : x.save}
            </button>
          </div>
        ) : null}
      </div>

      <p className={`a2-sm a2-mt6${listSaid?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="rr-rf-liststatus">
        {listSaid?.text ?? ''}
      </p>
      {!canDecide ? <p className="a2-xs a2-mute">{x.noDecide}</p> : null}

      <h3 className="a2-h4 a2-mt12">{fill(x.listH, { n: screen.candidates.length })}</h3>
      {base.minRefused === null ? (
        <p className="a2-xs a2-mute" data-testid="rr-rf-unset">
          {x.listUnset}
        </p>
      ) : screen.candidates.length ? (
        <ul className="a2-bl-list" data-testid="rr-rf-list">
          {screen.candidates.map((c) => (
            <li key={c.raw} className="a2-bl-row" data-testid="rr-rf-cand">
              <div className="a2-bl-main">
                <strong className="a2-bl-phone">{c.phone}</strong>
                <span className="a2-sm">{fill(x.counts, { refused: c.refused, delivered: c.delivered, orders: c.orders })}</span>
                <span className="a2-xs a2-mute">
                  {c.last ? fill(x.last, { when: c.last }) : null}
                  {c.terms ? ` · ${fill(x.now, { terms: x.termsShort[c.terms] })}` : null}
                </span>
              </div>
              {canDecide ? <TermsForm x={x} limits={screen.reasonLimits} phone={c.raw} start={c.terms} onDone={setListSaid} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-xs a2-mute">{x.listNone}</p>
      )}

      <h3 className="a2-h4 a2-mt12">{fill(x.activeH, { n: screen.active.length })}</h3>
      {screen.active.length ? (
        <ul className="a2-bl-list" data-testid="rr-rf-active">
          {screen.active.map((r) => (
            <ActiveRow key={r.id} row={r} x={x} limits={screen.reasonLimits} canDecide={canDecide} onDone={setListSaid} />
          ))}
        </ul>
      ) : (
        <p className="a2-xs a2-mute">{x.activeNone}</p>
      )}

      {canDecide ? (
        <>
          <h3 className="a2-h4 a2-mt12">{x.otherH}</h3>
          <TermsForm x={x} limits={screen.reasonLimits} phone={null} start={null} onDone={setListSaid} open />
        </>
      ) : null}

      {screen.ended.length ? (
        <details className="a2-mt12" data-testid="rr-rf-ended">
          <summary className="a2-sm">{fill(x.endedH, { n: screen.ended.length })}</summary>
          <ul className="a2-bl-list a2-mt6">
            {screen.ended.map((r) => (
              <li key={r.id} className="a2-bl-row is-undone">
                <div className="a2-bl-main">
                  <strong className="a2-bl-phone">{r.phone}</strong>
                  <span className="a2-sm">
                    {x.termsShort[r.terms]} · {r.reason}
                  </span>
                  <span className="a2-xs a2-mute">{fill(x.chosenBy, { who: r.who, when: r.when, n: r.refusedAtDecision })}</span>
                  <span className="a2-xs a2-mute">{fill(x.endedBy, { who: r.endedWho ?? '', when: r.endedWhen ?? '', why: r.endReason ?? '' })}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** "Choose terms" for a number on the list, or (open, no phone) for any number: the terms and a reason. */
function TermsForm({ x, limits, phone, start, onDone, open: always = false }: { x: RefusersCardTexts; limits: Limits; phone: string | null; start: RefuserTerms | null; onDone(s: Said): void; open?: boolean }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(always);
  const [typed, setTyped] = useState('');
  const [terms, setTerms] = useState<RefuserTerms>(start ?? 'delivery');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);
  const number = phone ?? typed.trim();

  async function send() {
    setBusy(true);
    const a = await call('POST', `${URL}/terms`, { phone: number, terms, reason: why.trim() });
    setBusy(false);
    if (a.status === 200) {
      setWhy('');
      setTyped('');
      setBad(null);
      if (!always) setOpen(false);
      onDone({ text: x.termsSaved, bad: false });
      return router.refresh();
    }
    setBad(errText(x, a));
  }

  if (!open)
    return (
      <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="rr-rf-choose">
        {x.choose}
      </button>
    );
  return (
    <div className={always ? 'a2-fg a2-rf-other' : 'a2-bl-undo'} data-testid={always ? 'rr-rf-other' : 'rr-rf-form'}>
      {phone === null ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-phone`}>
            {x.phone}
          </label>
          <input id={`${id}-phone`} className="a2-inp" inputMode="tel" autoComplete="off" maxLength={40} value={typed} placeholder={x.phonePh} disabled={busy} onChange={(e) => setTyped(e.target.value)} data-testid="rr-rf-phone" />
        </div>
      ) : null}
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${id}-terms`}>
          {x.termsLabel}
        </label>
        <select id={`${id}-terms`} className="a2-sel" value={terms} disabled={busy} onChange={(e) => setTerms(e.target.value as RefuserTerms)} data-testid="rr-rf-terms">
          {REFUSER_TERM_CHOICES.map((c) => (
            <option key={c} value={c}>
              {x.terms[c]}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${id}-why`}>
          {x.why}
        </label>
        <textarea id={`${id}-why`} className="a2-ta" rows={2} minLength={limits.min} maxLength={limits.max} value={why} placeholder={x.whyPh} disabled={busy} onChange={(e) => setWhy(e.target.value)} data-testid="rr-rf-why" />
        <span className="a2-xs a2-mute">{fill(x.whyHelp, { min: limits.min })}</span>
      </div>
      {bad ? (
        <span className="a2-sm" role="alert">
          {bad}
        </span>
      ) : null}
      <div className="a2-gap8">
        {!always ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(false)}>
            {x.cancel}
          </button>
        ) : null}
        <button type="button" className="a2-btn pri" disabled={busy || !number || why.trim().length < limits.min} onClick={send} data-testid="rr-rf-send">
          {x.saveTerms}
        </button>
      </div>
    </div>
  );
}

/** One number's terms now: what, why, who and when, the refusals then, and "End" with a reason. */
function ActiveRow({ row: r, x, limits, canDecide, onDone }: { row: RefuserTermScreen; x: RefusersCardTexts; limits: Limits; canDecide: boolean; onDone(s: Said): void }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);

  async function end() {
    setBusy(true);
    const a = await call('POST', `${URL}/terms/${r.id}/end`, { reason: why.trim() });
    setBusy(false);
    if (a.status === 200) {
      setOpen(false);
      onDone({ text: x.ended, bad: false });
      return router.refresh();
    }
    setBad(errText(x, a));
  }

  return (
    <li className="a2-bl-row" data-testid="rr-rf-row">
      <div className="a2-bl-main">
        <strong className="a2-bl-phone">{r.phone}</strong>
        <span className="a2-sm">
          <b>{x.termsShort[r.terms]}</b> · {r.reason}
        </span>
        <span className="a2-xs a2-mute">
          {fill(x.chosenBy, { who: r.who, when: r.when, n: r.refusedAtDecision })}
          {r.identity ? ` · ${x.identity}` : null}
        </span>
      </div>
      {canDecide ? (
        open ? (
          <div className="a2-bl-undo">
            <label className="a2-lbl" htmlFor={`${id}-why`}>
              {x.endWhy}
            </label>
            <textarea id={`${id}-why`} className="a2-ta" rows={2} minLength={limits.min} maxLength={limits.max} value={why} disabled={busy} onChange={(e) => setWhy(e.target.value)} data-testid="rr-rf-endwhy" />
            <span className="a2-xs a2-mute">{fill(x.whyHelp, { min: limits.min })}</span>
            {bad ? (
              <span className="a2-sm" role="alert">
                {bad}
              </span>
            ) : null}
            <div className="a2-gap8">
              <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(false)}>
                {x.cancel}
              </button>
              <button type="button" className="a2-btn pri" disabled={busy || why.trim().length < limits.min} onClick={end} data-testid="rr-rf-endok">
                {x.endOk}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="a2-btn"
            onClick={() => {
              setOpen(true);
              setBad(null);
            }}
            data-testid="rr-rf-end"
          >
            <ShellIcon name="undo" size={14} />
            {x.end}
          </button>
        )
      ) : null}
    </li>
  );
}
