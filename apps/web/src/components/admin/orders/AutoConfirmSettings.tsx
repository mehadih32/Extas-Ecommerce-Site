'use client';
// S28 · PR 663 — Rules › Order flow › Auto-confirm (prototype m-rules.js "autoconfirm"): the switch, the Low / Normal / Strict
// presets that fill the table, nine cases each answered Confirm by itself / Call list / Red tag, and the trusted-customer
// counts and the big cash order limit. Saved whole to /api/admin/risk/auto-confirm with the card's version (STALE when
// someone else saved first). "Suspicious" cannot be answered "Confirm by itself". Nothing here moves money or blocks anyone.
import { useId, useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export const CASES = ['prepaid', 'delivery', 'trusted', 'goodScore', 'brandNew', 'refused', 'refusedPaid', 'bigCod', 'suspicious'] as const;
type Case = (typeof CASES)[number];
type Act = 'auto' | 'call' | 'person';
export interface AutoConfirmValue {
  enabled: boolean;
  preset: 'low' | 'normal' | 'strict' | 'custom';
  cases: Record<Case, Act>;
  trustedMinDelivered: number;
  trustedMaxRefused: number;
  /** Money in the shop's smallest unit; shown and typed in whole units (the page passes the factor). */
  bigCodMinor: number | null;
}
type Card = { key: string; value: AutoConfirmValue; version: string };

export interface AutoConfirmSettingsProps {
  url: string;
  screen: Card;
  canEdit: boolean;
  /** The three presets, from the setting's own constants. */
  presets: Record<'low' | 'normal' | 'strict', Record<Case, Act>>;
  /** Minor units per whole unit (100 for taka). */
  unit: number;
  t: Record<string, string>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function AutoConfirmSettings({ url, screen, canEdit, presets, unit, t }: AutoConfirmSettingsProps) {
  const id = useId();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<AutoConfirmValue>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const off = !canEdit || busy;
  const dirty = !same(draft, base.value);
  const count = (a: Act) => CASES.filter((c) => draft.cases[c] === a).length;

  const setCase = (c: Case, a: Act) => {
    setDraft({ ...draft, preset: 'custom', cases: { ...draft.cases, [c]: a } });
    setSaid(null);
  };
  const applyPreset = (k: 'low' | 'normal' | 'strict') => {
    setDraft({ ...draft, preset: k, cases: { ...presets[k] } });
    setSaid(null);
  };

  async function save() {
    setBusy(true);
    const a = await call('PUT', url, { key: base.key, value: draft, version: base.version });
    setBusy(false);
    const take = (data: Record<string, unknown>) => (data.cards as Record<string, Card> | undefined)?.autoConfirm;
    if (a.status === 200) {
      const c = take(a.data);
      if (c) {
        setBase(c);
        setDraft(c.value);
      }
      setSaid(null);
      return showToast({ text: t.saved ?? '', tone: 'ok' });
    }
    if (a.data.error === 'STALE') {
      const g = await call('GET', url);
      const c = g.status === 200 ? take(g.data) : undefined;
      if (c) {
        setBase(c);
        setDraft(c.value);
      }
    }
    setSaid(t[`err.${a.status === 0 ? 'network' : (a.data.error ?? 'other')}`] ?? t['err.other'] ?? '');
  }

  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="risk-auto-confirm">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {t.h}
          </h2>
          <p className="a2-scd">{t.d}</p>
        </div>
      </div>
      {!canEdit ? <div className="a2-note">{t.readOnly}</div> : null}
      <div className="a2-swl a2-mt12">
        <span>{t.enabled}</span>
        <button
          type="button"
          className={`a2-sw${draft.enabled ? ' on' : ''}`}
          role="switch"
          aria-checked={draft.enabled}
          aria-label={t.enabled}
          disabled={off}
          onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
          data-testid="risk-auto-confirm-enabled"
        />
      </div>
      <div className="a2-fld a2-mt12">
        <span className="a2-lbl">{t.presetH}</span>
        <div className="a2-gap8" role="group" aria-label={t.presetH}>
          {(['low', 'normal', 'strict'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`a2-btn${draft.preset === k ? ' pri' : ''}`}
              aria-pressed={draft.preset === k}
              disabled={off}
              onClick={() => applyPreset(k)}
              data-testid={`risk-auto-confirm-preset-${k}`}
            >
              {t[`preset.${k}`]}
            </button>
          ))}
          {draft.preset === 'custom' ? <span className="a2-pill info">{t['preset.custom']}</span> : null}
        </div>
        <span className="a2-xs a2-mute">{t.presetHelp}</span>
      </div>
      <p className="a2-sm a2-mt12" data-testid="risk-auto-confirm-summary">
        {(t.summary ?? '')
          .replace('{auto}', String(count('auto')))
          .replace('{call}', String(count('call')))
          .replace('{person}', String(count('person')))}
      </p>
      <div className="a2-tblw a2-mt6">
        <table className="a2-tbl">
          <thead>
            <tr>
              <th>{t.caseH}</th>
              <th>{t.answerH}</th>
            </tr>
          </thead>
          <tbody>
            {CASES.map((c) => (
              <tr key={c} data-case={c}>
                <td className="a2-tdh">{t[`case.${c}`]}</td>
                <td data-l={t.answerH}>
                  <select
                    className="a2-inp"
                    aria-label={t[`case.${c}`]}
                    value={draft.cases[c]}
                    disabled={off}
                    onChange={(e) => setCase(c, e.target.value as Act)}
                    data-testid={`risk-auto-confirm-case-${c}`}
                  >
                    {(['auto', 'call', 'person'] as const)
                      .filter((a) => !(c === 'suspicious' && a === 'auto'))
                      .map((a) => (
                        <option key={a} value={a}>
                          {t[`act.${a}`]}
                        </option>
                      ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-min`}>
            {t.trustedMin}
          </label>
          <input
            id={`${id}-min`}
            className="a2-inp"
            type="number"
            min={1}
            max={100}
            value={String(draft.trustedMinDelivered)}
            disabled={off}
            onChange={(e) => setDraft({ ...draft, trustedMinDelivered: Number(e.target.value) })}
            data-testid="risk-auto-confirm-trustedMinDelivered"
          />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-max`}>
            {t.trustedMax}
          </label>
          <input
            id={`${id}-max`}
            className="a2-inp"
            type="number"
            min={0}
            max={20}
            value={String(draft.trustedMaxRefused)}
            disabled={off}
            onChange={(e) => setDraft({ ...draft, trustedMaxRefused: Number(e.target.value) })}
            data-testid="risk-auto-confirm-trustedMaxRefused"
          />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-big`}>
            {t.bigCod}
          </label>
          <input
            id={`${id}-big`}
            className="a2-inp"
            type="number"
            min={1}
            value={draft.bigCodMinor === null ? '' : String(draft.bigCodMinor / unit)}
            disabled={off}
            onChange={(e) => setDraft({ ...draft, bigCodMinor: e.target.value === '' ? null : Math.round(Number(e.target.value) * unit) })}
            data-testid="risk-auto-confirm-bigCodMinor"
          />
          <span className="a2-xs a2-mute">{t.bigCodHelp}</span>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{t.never}</p>
      <div className="a2-scbar">
        <span className="a2-sm" role="status" aria-live="polite" data-testid="risk-auto-confirm-status">
          {said ?? (dirty ? t.unsaved : '')}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => setDraft(base.value)}>
                {t.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="risk-auto-confirm-save">
              {busy ? t.saving : t.save}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
