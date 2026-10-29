'use client';
// S14 · PR 298 — the client parts of Messages → Consent: the stop words and their rules as one form (one Save with the
// screen's version; a stale screen is read again and said so), and the team's record of a customer's own stop or
// start, at his request. The API checks every value and the permission again. A person without
// `messages.consent.write` sees the form locked and no record form.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { ConsentSettings, MessageChannel } from '@extas/settings';
import { consentChanges, consentDraft, type ConsentDraft as Draft } from '@/lib/admin-messages/consent-draft';
import { msgError } from '@/lib/admin-messages/i18n';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/messages/consent';
export const CONSENT_ACTION_KEYS = ['stopAll', 'allowAll', 'stopOffers', 'allowOffers'] as const;

/** The choices, from the server page (the settings' own lists; a client part imports no settings code). */
export interface ConsentChoices {
  covers: readonly ConsentSettings['stopCovers'][];
  stopChannels: readonly ConsentSettings['stopChannels'][];
  steps: readonly ConsentSettings['offerSteps'][number][];
  channels: readonly MessageChannel[];
}

export function ConsentForm({ dict, config, version, canEdit, choices }: { dict: Dict; config: ConsentSettings; version: string; canEdit: boolean; choices: ConsentChoices }) {
  const id = useId();
  const [base, setBase] = useState({ config, version });
  const [draft, setDraft] = useState<Draft>(() => consentDraft(config));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.consent.${k}`, v);
  const off = !canEdit || busy;
  const changes = consentChanges(draft, base.config);
  const dirty = changes.consent !== undefined;
  const edit = (p: Partial<Draft>) => {
    setDraft({ ...draft, ...p });
    setSaid(null);
  };
  const fresh = (s: { config: ConsentSettings; version: string }) => {
    setBase({ config: s.config, version: s.version });
    setDraft(consentDraft(s.config));
  };
  async function save() {
    setBusy(true);
    const a = await call('PUT', URL, { ...changes, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data.consent as { config: ConsentSettings; version: string });
      return setSaid({ text: t(dict, 'msg.saved'), bad: false });
    }
    const code = a.status === 0 ? 'network' : a.data.error;
    if (code === 'STALE') {
      const g = await call('GET', URL);
      if (g.status === 200) fresh(g.data.consent as { config: ConsentSettings; version: string });
    }
    setSaid({ text: msgError(dict, code, (a.data.details ?? []).join(', ')), bad: true });
  }
  const toggleStep = (s: Draft['offerSteps'][number]) => edit({ offerSteps: draft.offerSteps.includes(s) ? draft.offerSteps.filter((x) => x !== s) : [...draft.offerSteps, s] });

  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="consent-form">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {x('rules')}
          </h2>
          <p className="a2-scd">{x('rulesHelp')}</p>
        </div>
      </div>
      {!canEdit ? (
        <div className="a2-note a2-mt12">
          <ShellIcon name="lock" size={15} />
          <span>{t(dict, 'msg.readOnly')}</span>
        </div>
      ) : null}
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-sw`}>
            {x('stopWords')}
          </label>
          <input id={`${id}-sw`} className="a2-inp" value={draft.stopWords} disabled={off} autoComplete="off" onChange={(e) => edit({ stopWords: e.target.value })} data-testid="cs-stop" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-st`}>
            {x('startWords')}
          </label>
          <input id={`${id}-st`} className="a2-inp" value={draft.startWords} disabled={off} autoComplete="off" onChange={(e) => edit({ startWords: e.target.value })} data-testid="cs-start" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-cv`}>
            {x('stopCovers')}
          </label>
          <select id={`${id}-cv`} className="a2-sel" value={draft.stopCovers} disabled={off} onChange={(e) => edit({ stopCovers: e.target.value as Draft['stopCovers'] })} data-testid="cs-covers">
            {choices.covers.map((c) => (
              <option key={c} value={c}>
                {x(`covers.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-ch`}>
            {x('stopChannels')}
          </label>
          <select id={`${id}-ch`} className="a2-sel" value={draft.stopChannels} disabled={off} onChange={(e) => edit({ stopChannels: e.target.value as Draft['stopChannels'] })} data-testid="cs-channels">
            {choices.stopChannels.map((c) => (
              <option key={c} value={c}>
                {x(`channels.${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="a2-xs a2-mute a2-mt6">{x('wordsHelp')}</p>
      <div className="a2-swl a2-mt12">
        <span>
          <b id={`${id}-cr`}>{x('confirmReply')}</b>
          <span className="a2-xs a2-mute a2-blk">{x('confirmReplyHelp')}</span>
        </span>
        <button type="button" className={`a2-sw${draft.confirmReply ? ' on' : ''}`} role="switch" aria-checked={draft.confirmReply} aria-labelledby={`${id}-cr`} disabled={off} onClick={() => edit({ confirmReply: !draft.confirmReply })} data-testid="cs-confirm" />
      </div>
      <fieldset className="a2-mt12" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="a2-lbl">{x('offerSteps')}</legend>
        <p className="a2-xs a2-mute">{x('offerStepsHelp')}</p>
        <div className="a2-stack a2-mt6" style={{ gap: 6 }}>
          {choices.steps.map((s) => (
            <label key={s} className="a2-chkl">
              <input type="checkbox" className="a2-chk" checked={draft.offerSteps.includes(s)} disabled={off} onChange={() => toggleStep(s)} data-testid="cs-offer" data-step={s} />
              <span>{t(dict, `msg.step.${s}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="a2-scbar a2-mt12">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="cs-status">
          {said ? said.text : dirty ? t(dict, 'msg.unsaved') : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => fresh(base)}>
                {t(dict, 'msg.discard')}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="cs-save">
              {busy ? t(dict, 'msg.saving') : t(dict, 'msg.save')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The team records a customer's own stop or start (he asked by phone, in the shop, by message). */
export function ConsentRecordForm({ dict, phone, channels: all }: { dict: Dict; phone: string; channels: readonly MessageChannel[] }) {
  const id = useId();
  const router = useRouter();
  const [number, setNumber] = useState(phone);
  const [channels, setChannels] = useState<MessageChannel[]>(() => all.filter((c) => c !== 'EMAIL'));
  const [action, setAction] = useState<(typeof CONSENT_ACTION_KEYS)[number]>('stopAll');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.consent.${k}`, v);
  const flip = (c: MessageChannel) => setChannels(channels.includes(c) ? channels.filter((y) => y !== c) : [...channels, c]);
  async function go() {
    if (!window.confirm(x('recordAsk'))) return;
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `${URL}/record`, { phone: number, channels, action });
    setBusy(false);
    if (a.status !== 200) return setSaid({ text: a.status === 0 ? msgError(dict, 'network') : msgError(dict, a.data.error, (a.data.details ?? []).join(', ')), bad: true });
    setSaid({ text: x('recorded'), bad: false });
    const p = (a.data.record as { screen: { lookup: { phone: string } | null } }).screen.lookup?.phone ?? number;
    router.push(`/admin/messages/consent?phone=${encodeURIComponent(p)}`);
    router.refresh();
  }
  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid="consent-record">
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {x('record')}
          </h2>
          <p className="a2-scd">{x('recordHelp')}</p>
        </div>
      </div>
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-p`}>
            {x('phone')}
          </label>
          <input id={`${id}-p`} className="a2-inp" inputMode="tel" autoComplete="off" value={number} disabled={busy} onChange={(e) => setNumber(e.target.value)} data-testid="cr-phone" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-a`}>
            {x('action')}
          </label>
          <select id={`${id}-a`} className="a2-sel" value={action} disabled={busy} onChange={(e) => setAction(e.target.value as (typeof CONSENT_ACTION_KEYS)[number])} data-testid="cr-action">
            {CONSENT_ACTION_KEYS.map((k) => (
              <option key={k} value={k}>
                {x(`actions.${k}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="a2-gap8 a2-mt6" role="group" aria-label={x('onChannels')}>
        {all.map((c) => (
          <label key={c} className="a2-chkl">
            <input type="checkbox" className="a2-chk" checked={channels.includes(c)} disabled={busy} onChange={() => flip(c)} data-testid="cr-channel" data-channel={c} />
            <span>{t(dict, `msg.channel.${c}`)}</span>
          </label>
        ))}
      </div>
      <div className="a2-scbar a2-mt12">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="cr-status">
          {said?.text ?? ''}
        </span>
        <button type="button" className="a2-btn pri" disabled={busy || !number.trim() || !channels.length} onClick={go} data-testid="cr-save">
          {busy ? t(dict, 'msg.saving') : x('recordButton')}
        </button>
      </div>
    </section>
  );
}
