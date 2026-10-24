'use client';
// S06 · PR 542 — the "Advance request" card of Orders › Risk rules, under the Levels card: "Send the proposal by itself"
// (off as it ships: a level's proposal waits for a person to press "Request advance" on the order), the ways ticked first
// when the order's dialog opens (SMS, WhatsApp, a call) and the payment service the pay link uses. Save with the screen's
// version (a stale screen is read again and said so). A person without `risk.rules.write` sees it switched off.
import { useId, useState } from 'react';
import type { AdvanceChannel, AdvanceProvider, AdvanceRequestSettings } from '@extas/settings';
import { ADVANCE_CHANNELS, advanceDraftProblem, sameAdvance, type AdvanceCardScreen, type AdvanceCardTexts } from '@/lib/admin-orders/advance-card';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/risk/advance';

export function AdvanceRequestCard({ screen, texts: x, canEdit }: { screen: AdvanceCardScreen; texts: AdvanceCardTexts; canEdit: boolean }) {
  const id = useId();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<AdvanceRequestSettings>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !canEdit || busy;
  const dirty = !sameAdvance(draft, base.value);
  const edit = (next: AdvanceRequestSettings) => {
    setDraft(next);
    setSaid(null);
  };
  const fresh = (v: { value: AdvanceRequestSettings; version: string; levelsOn: boolean }) => {
    const next = { ...base, value: v.value, version: v.version, levelsOn: v.levelsOn };
    setBase(next);
    setDraft(next.value);
  };

  async function save() {
    const problem = advanceDraftProblem(draft);
    if (problem) return setSaid({ text: x.noChannel, bad: true });
    setBusy(true);
    const a = await call('PUT', URL, { value: draft, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data as unknown as AdvanceCardScreen);
      return setSaid({ text: x.saved, bad: false });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', URL);
      if (g.status === 200) fresh(g.data as unknown as AdvanceCardScreen);
    }
    setSaid({ text: x.err[code] ?? x.err.other!, bad: true });
  }

  const provId = `${id}-prov`;
  return (
    <section className="a2-sc a2-mt12" id="rr-advance" aria-labelledby={`${id}-h`} data-testid="rr-advance">
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
            {x.auto}
            <span className="a2-xs a2-mute a2-blk">{x.autoHelp}</span>
          </span>
          <button type="button" className={`a2-sw${draft.auto ? ' on' : ''}`} role="switch" aria-checked={draft.auto} aria-label={x.auto} disabled={off} onClick={() => edit({ ...draft, auto: !draft.auto })} data-testid="rr-adv-auto" />
        </div>
        {!draft.auto ? <div className="a2-xs a2-mute a2-mt6">{x.autoOff}</div> : !base.levelsOn ? <div className="a2-xs a2-mute a2-mt6">{x.autoNoLevels}</div> : null}
      </div>
      <div className="a2-fg a2-mt12">
        <div className="a2-fld" role="group" aria-labelledby={`${id}-ch`}>
          <span className="a2-lbl" id={`${id}-ch`}>
            {x.channels}
          </span>
          {ADVANCE_CHANNELS.map((c: AdvanceChannel) => (
            <label key={c} className="a2-chkl">
              <input type="checkbox" className="a2-chk" checked={draft.channels[c]} disabled={off} onChange={(e) => edit({ ...draft, channels: { ...draft.channels, [c]: e.target.checked } })} data-testid={`rr-adv-ch-${c}`} />
              <span>{x.ch[c]}</span>
            </label>
          ))}
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={provId}>
            {x.provider}
          </label>
          <select id={provId} className="a2-sel" value={draft.provider} disabled={off} onChange={(e) => edit({ ...draft, provider: e.target.value as AdvanceProvider })} data-testid="rr-adv-provider">
            {base.providers.map((p) => (
              <option key={p} value={p}>
                {x.prov[p] ?? p}
              </option>
            ))}
          </select>
          <span className="a2-xs a2-mute">{x.providerHelp}</span>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{x.words}</p>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="rr-adv-status">
          {said ? said.text : dirty ? x.unsaved : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => edit(base.value)}>
                {x.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="rr-adv-save">
              {busy ? x.saving : x.save}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
