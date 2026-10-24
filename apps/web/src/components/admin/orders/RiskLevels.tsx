'use client';
// S06 · PR 161 — the Levels card of Orders › Risk rules (demo V12.3 #/admin/orders/risk-rules "Levels"): the master
// switch, then one card per risk band with its watch, hold and call switches and the advance it proposes, the percent a
// partial ask uses (empty until the owner fills it), the hold reason, "Use the suggested set" and "Reset to default" (both
// only drafts) and Save with the screen's version (a stale screen is read again and said so). A person without
// `risk.rules.write` sees it all, switched off. Nothing here blocks anyone or asks a customer for money.
import { useId, useState } from 'react';
import type { RiskLevelActions, RiskLevelAsk, RiskLevels } from '@extas/settings';
import { asDefault, draftProblem, forBands, LEVEL_ASKS, percentOf, sameLevels, withSuggested, type LevelsScreen, type LevelsTexts } from '@/lib/admin-orders/risk-levels';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/risk/levels';

function Switch({ on, label, disabled, onChange, testId }: { on: boolean; label: string; disabled: boolean; onChange(v: boolean): void; testId?: string }) {
  return <button type="button" className={`a2-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} data-testid={testId} />;
}

function SwitchRow({ label, help, on, disabled, onChange, testId }: { label: string; help: string; on: boolean; disabled: boolean; onChange(v: boolean): void; testId?: string }) {
  return (
    <div className="a2-swl">
      <span>
        {label}
        <span className="a2-xs a2-mute a2-blk">{help}</span>
      </span>
      <Switch on={on} label={label} disabled={disabled} onChange={onChange} testId={testId} />
    </div>
  );
}

export function RiskLevels({ screen, texts: x, canEdit }: { screen: LevelsScreen; texts: LevelsTexts; canEdit: boolean }) {
  const id = useId();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<RiskLevels>(screen.value);
  const [percent, setPercent] = useState(screen.value.partialPercent === null ? '' : String(screen.value.partialPercent));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !canEdit || busy;
  const dirty = !sameLevels(draft, base.value);

  const edit = (next: RiskLevels) => {
    setDraft(next);
    setSaid(null);
  };
  const setLevel = (band: string, patch: Partial<RiskLevelActions>) => edit({ ...draft, levels: { ...draft.levels, [band]: { ...draft.levels[band]!, ...patch } } });
  const setPercentText = (text: string) => {
    setPercent(text);
    const n = percentOf(text);
    edit({ ...draft, partialPercent: n === null || Number.isNaN(n) ? null : n });
  };
  const load = (v: LevelsScreen['value'], keepPercent = false) => {
    setDraft(v);
    if (!keepPercent) setPercent(v.partialPercent === null ? '' : String(v.partialPercent));
  };

  async function save() {
    const n = percentOf(percent);
    if (Number.isNaN(n) || (n !== null && (n < 1 || n > 99))) return setSaid({ text: x.err.INVALID_INPUT!, bad: true });
    const problem = draftProblem(draft);
    if (problem) return setSaid({ text: x.err[problem]!, bad: true });
    setBusy(true);
    const a = await call('PUT', URL, { value: draft, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      const v = a.data as unknown as { value: RiskLevels; version: string };
      const fresh = { ...base, value: forBands(v.value, base.bands), version: v.version };
      setBase(fresh);
      load(fresh.value);
      return setSaid({ text: x.saved, bad: false });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', URL);
      if (g.status === 200) {
        const v = g.data as unknown as { value: RiskLevels; version: string };
        const fresh = { ...base, value: forBands(v.value, base.bands), version: v.version };
        setBase(fresh);
        load(fresh.value);
      }
    }
    setSaid({ text: x.err[code] ?? x.err.other!, bad: true });
  }

  const reasonId = `${id}-reason`;
  const pctId = `${id}-pct`;
  return (
    <section className="a2-sc" id="rr-levels" aria-labelledby={`${id}-h`} data-testid="rr-levels">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {x.levelsH}
          </h2>
          <p className="a2-scd">{x.levelsD}</p>
        </div>
      </div>
      {!canEdit ? (
        <div className="a2-note" data-testid="rr-readonly">
          <ShellIcon name="lock" size={15} />
          <span>{x.readOnly}</span>
        </div>
      ) : null}
      <div className="a2-scb">
        <SwitchRow label={x.master} help={x.masterHelp} on={draft.enabled} disabled={off} onChange={(v) => edit({ ...draft, enabled: v })} testId="rr-master" />
        {!draft.enabled ? <div className="a2-xs a2-mute a2-mt6">{x.offNote}</div> : null}
      </div>
      {base.bands.length ? (
        <div className="a2-row a2-r3 a2-mt12">
          {base.bands.map((b) => {
            const l = draft.levels[b.key] ?? { watch: false, hold: false, call: false, ask: 'none' as RiskLevelAsk };
            const askId = `${id}-ask-${b.key}`;
            return (
              <div key={b.key} className="a2-card tight" data-testid="rr-band" data-band={b.key}>
                <div className="a2-between">
                  <b className="a2-h4">{b.name}</b>
                  <span className={`a2-pill ${b.tone}`}>{b.from}</span>
                </div>
                <div className="a2-mt6">
                  <SwitchRow label={x.watch} help={x.watchHelp} on={l.watch} disabled={off} onChange={(v) => setLevel(b.key, { watch: v })} />
                  <SwitchRow label={x.hold} help={x.holdHelp} on={l.hold} disabled={off} onChange={(v) => setLevel(b.key, { hold: v })} testId={`rr-hold-${b.key}`} />
                  <SwitchRow label={x.call} help={x.callHelp} on={l.call} disabled={off} onChange={(v) => setLevel(b.key, { call: v })} />
                </div>
                <div className="a2-fld a2-mt6">
                  <label className="a2-lbl" htmlFor={askId}>
                    {x.ask}
                  </label>
                  <select id={askId} className="a2-sel" value={l.ask} disabled={off} onChange={(e) => setLevel(b.key, { ask: e.target.value as RiskLevelAsk })} data-testid={`rr-ask-${b.key}`}>
                    {LEVEL_ASKS.map((a) => (
                      <option key={a} value={a}>
                        {x.askOpt[a]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="a2-sm a2-mute a2-mt12">{x.noBands}</p>
      )}
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={pctId}>
            {x.partial}
          </label>
          <input id={pctId} className="a2-inp" inputMode="numeric" value={percent} placeholder={x.partialPh} disabled={off} onChange={(e) => setPercentText(e.target.value)} maxLength={2} data-testid="rr-percent" />
          <span className="a2-xs a2-mute">{x.partialHelp}</span>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={reasonId}>
            {x.reason}
          </label>
          <select id={reasonId} className="a2-sel" value={draft.holdReasonKey} disabled={off} onChange={(e) => edit({ ...draft, holdReasonKey: e.target.value })} data-testid="rr-reason">
            {base.reasons.some((r) => r.key === draft.holdReasonKey) ? null : <option value={draft.holdReasonKey}>{draft.holdReasonKey}</option>}
            {base.reasons.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="a2-xs a2-mute">{x.reasonHelp}</span>
        </div>
      </div>
      <div className="a2-note">
        <ShellIcon name="shield" size={15} />
        <span>{x.never}</span>
      </div>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="rr-status">
          {said ? said.text : dirty ? x.unsaved : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            <button type="button" className="a2-btn" disabled={busy} title={x.suggestHelp} onClick={() => edit(withSuggested(draft, base.suggested))} data-testid="rr-suggest">
              {x.suggest}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => {
                edit(asDefault(base.byDefault, base.bands));
                setPercent('');
              }} data-testid="rr-reset">
              {x.reset}
            </button>
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => {
                  load(base.value);
                  setSaid(null);
                }}>
                {x.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="rr-save">
              {busy ? x.saving : x.save}
            </button>
          </div>
        ) : null}
      </div>
      {canEdit ? <p className="a2-xs a2-mute a2-mt6">{x.suggestHelp}</p> : null}
    </section>
  );
}
