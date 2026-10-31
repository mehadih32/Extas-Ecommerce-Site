'use client';
// S06 · PR 162 — the "Blocklist" card of Orders › Risk rules, under the Advance request card: the switch (off as it
// ships), what a listed number's new order gets (a mark for the team, or a hold with the owner's hold reason for a person
// to decide), the form that lists a number with a reason (`risk.block`), the listed numbers (reason, who, when, the order
// it came from, the same person) each with "Undo" and its reason (`risk.unblock`), and the newest undone ones. Nothing
// here cancels an order or tells the customer. After a change the page reads the list again.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { RiskBlocklist, RiskBlocklistEffect } from '@extas/settings';
import type { BlocklistCardScreen, BlocklistCardTexts, BlocklistRowScreen } from '@/lib/admin-orders/blocklist-card';
import { BLOCKLIST_EFFECTS, blocklistDraftProblem, sameBlocklist } from '@/lib/admin-orders/blocklist-draft';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/risk/blocklist';

type Said = { text: string; bad: boolean } | null;

export function BlocklistCard({ screen, texts: x, canEdit, canBlock, canUnblock }: { screen: BlocklistCardScreen; texts: BlocklistCardTexts; canEdit: boolean; canBlock: boolean; canUnblock: boolean }) {
  const id = useId();
  const router = useRouter();
  const [base, setBase] = useState<RiskBlocklist>(screen.value);
  const [draft, setDraft] = useState<RiskBlocklist>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const [phone, setPhone] = useState('');
  const [why, setWhy] = useState('');
  const [listSaid, setListSaid] = useState<Said>(null);
  const off = !canEdit || busy;
  const dirty = !sameBlocklist(draft, base);
  const errOf = (a: { status: number; data: { error?: string } }) => x.err[a.status === 0 ? 'network' : (a.data.error ?? 'other')] ?? x.err.other!;
  const edit = (next: RiskBlocklist) => {
    setDraft(next);
    setSaid(null);
  };

  async function save() {
    if (blocklistDraftProblem(draft, screen.reasons)) return setSaid({ text: x.err.INVALID_INPUT!, bad: true });
    setBusy(true);
    const a = await call('PUT', URL, { value: draft });
    setBusy(false);
    if (a.status === 200) {
      const v = (a.data as unknown as { value: RiskBlocklist }).value;
      setBase(v);
      setDraft(v);
      return setSaid({ text: x.saved, bad: false });
    }
    setSaid({ text: errOf(a), bad: true });
  }

  async function add() {
    setBusy(true);
    const a = await call('POST', URL, { phone: phone.trim(), reason: why.trim() });
    setBusy(false);
    if (a.status === 200) {
      setPhone('');
      setWhy('');
      setListSaid({ text: x.added, bad: false });
      return router.refresh();
    }
    setListSaid({ text: errOf(a), bad: true });
  }

  const phoneId = `${id}-phone`;
  const whyId = `${id}-why`;
  const reasonId = `${id}-reason`;
  return (
    <section className="a2-sc a2-mt12" id="rr-blocklist" aria-labelledby={`${id}-h`} data-testid="rr-blocklist">
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
          <button type="button" className={`a2-sw${draft.enabled ? ' on' : ''}`} role="switch" aria-checked={draft.enabled} aria-label={x.master} disabled={off} onClick={() => edit({ ...draft, enabled: !draft.enabled })} data-testid="rr-bl-master" />
        </div>
        {!draft.enabled ? <div className="a2-xs a2-mute a2-mt6">{x.offNote}</div> : null}
      </div>
      <div className="a2-fg a2-mt12">
        <div className="a2-fld" role="radiogroup" aria-labelledby={`${id}-on`}>
          <span className="a2-lbl" id={`${id}-on`}>
            {x.onOrder}
          </span>
          {BLOCKLIST_EFFECTS.map((e: RiskBlocklistEffect) => (
            <label key={e} className="a2-chkl">
              <input type="radio" name={`${id}-on`} className="a2-chk" checked={draft.onOrder === e} disabled={off} onChange={() => edit({ ...draft, onOrder: e })} data-testid={`rr-bl-on-${e}`} />
              <span>{x.on[e]}</span>
            </label>
          ))}
        </div>
        {draft.onOrder === 'hold' ? (
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={reasonId}>
              {x.reason}
            </label>
            <select id={reasonId} className="a2-sel" value={draft.holdReasonKey} disabled={off} onChange={(e) => edit({ ...draft, holdReasonKey: e.target.value })} data-testid="rr-bl-reason">
              {screen.reasons.some((r) => r.key === draft.holdReasonKey) ? null : <option value={draft.holdReasonKey}>{draft.holdReasonKey}</option>}
              {screen.reasons.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="a2-xs a2-mute">{x.reasonHelp}</span>
          </div>
        ) : null}
      </div>
      <p className="a2-xs a2-mute a2-mt6">{x.never}</p>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="rr-bl-status">
          {said ? said.text : dirty ? x.unsaved : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => edit(base)}>
                {x.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="rr-bl-save">
              {busy ? x.saving : x.save}
            </button>
          </div>
        ) : null}
      </div>

      <h3 className="a2-h4 a2-mt12">{x.addH}</h3>
      {canBlock ? (
        <form
          className="a2-fg"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          data-testid="rr-bl-add"
        >
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={phoneId}>
              {x.phone}
            </label>
            <input id={phoneId} className="a2-inp" inputMode="tel" autoComplete="off" maxLength={40} value={phone} placeholder={x.phonePh} disabled={busy} onChange={(e) => setPhone(e.target.value)} data-testid="rr-bl-phone" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={whyId}>
              {x.why}
            </label>
            <textarea id={whyId} className="a2-ta" rows={2} minLength={screen.reasonLimits.min} maxLength={screen.reasonLimits.max} value={why} placeholder={x.whyPh} disabled={busy} onChange={(e) => setWhy(e.target.value)} data-testid="rr-bl-why" />
            <span className="a2-xs a2-mute">{x.whyHelp.replace('{min}', String(screen.reasonLimits.min))}</span>
          </div>
          <div>
            <button type="submit" className="a2-btn pri" disabled={busy || !phone.trim() || why.trim().length < screen.reasonLimits.min} data-testid="rr-bl-addbtn">
              {busy ? x.adding : x.add}
            </button>
          </div>
        </form>
      ) : (
        <p className="a2-xs a2-mute">{x.noBlock}</p>
      )}
      <p className={`a2-sm a2-mt6${listSaid?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="rr-bl-liststatus">
        {listSaid?.text ?? ''}
      </p>

      <h3 className="a2-h4 a2-mt12">{x.activeH.replace('{n}', String(screen.active.length))}</h3>
      {screen.active.length ? (
        <ul className="a2-bl-list" data-testid="rr-bl-active">
          {screen.active.map((r) => (
            <Row key={r.id} row={r} x={x} limits={screen.reasonLimits} canUnblock={canUnblock} onDone={(s) => setListSaid(s)} />
          ))}
        </ul>
      ) : (
        <p className="a2-xs a2-mute" data-testid="rr-bl-none">
          {x.none}
        </p>
      )}
      {screen.undone.length ? (
        <details className="a2-mt12" data-testid="rr-bl-undone">
          <summary className="a2-sm">{x.undoneH.replace('{n}', String(screen.undone.length))}</summary>
          <ul className="a2-bl-list a2-mt6">
            {screen.undone.map((r) => (
              <li key={r.id} className="a2-bl-row is-undone" data-testid="rr-bl-undone-row">
                <div className="a2-bl-main">
                  <strong className="a2-bl-phone">{r.phone}</strong>
                  <span className="a2-sm">{r.reason}</span>
                  <span className="a2-xs a2-mute">{x.by.replace('{who}', r.who).replace('{when}', r.when)}</span>
                  <span className="a2-xs a2-mute">{x.undoneBy.replace('{who}', r.undoneWho ?? '').replace('{when}', r.undoneWhen ?? '').replace('{why}', r.undoReason ?? '')}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** One listed number: its reason, who and when, the order it came from, and "Undo" with a reason. */
function Row({ row: r, x, limits, canUnblock, onDone }: { row: BlocklistRowScreen; x: BlocklistCardTexts; limits: BlocklistCardScreen['reasonLimits']; canUnblock: boolean; onDone(s: Said): void }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    const a = await call('POST', `${URL}/${r.id}/unblock`, { reason: why.trim() });
    setBusy(false);
    if (a.status === 200) {
      setOpen(false);
      onDone({ text: x.undone, bad: false });
      return router.refresh();
    }
    setBad(x.err[a.status === 0 ? 'network' : (a.data.error ?? 'other')] ?? x.err.other!);
  }

  return (
    <li className="a2-bl-row" data-testid="rr-bl-row">
      <div className="a2-bl-main">
        <strong className="a2-bl-phone">{r.phone}</strong>
        <span className="a2-sm">{r.reason}</span>
        <span className="a2-xs a2-mute">
          {x.by.replace('{who}', r.who).replace('{when}', r.when)}
          {r.order ? (
            <>
              {' · '}
              <a href={r.order.href}>{x.fromOrder.replace('{n}', r.order.number)}</a>
            </>
          ) : null}
          {r.identity ? ` · ${x.identity}` : null}
        </span>
      </div>
      {canUnblock ? (
        open ? (
          <div className="a2-bl-undo">
            <label className="a2-lbl" htmlFor={`${id}-why`}>
              {x.undoWhy}
            </label>
            <textarea id={`${id}-why`} className="a2-ta" rows={2} minLength={limits.min} maxLength={limits.max} value={why} disabled={busy} onChange={(e) => setWhy(e.target.value)} data-testid="rr-bl-undowhy" />
            <span className="a2-xs a2-mute">{x.whyHelp.replace('{min}', String(limits.min))}</span>
            {bad ? (
              <span className="a2-sm" role="alert">
                {bad}
              </span>
            ) : null}
            <div className="a2-gap8">
              <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(false)}>
                {x.cancel}
              </button>
              <button type="button" className="a2-btn pri" disabled={busy || why.trim().length < limits.min} onClick={undo} data-testid="rr-bl-undook">
                {x.undoOk}
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
            data-testid="rr-bl-undo"
          >
            <ShellIcon name="undo" size={14} />
            {x.undo}
          </button>
        )
      ) : null}
    </li>
  );
}
