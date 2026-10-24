'use client';
// S14 · PR 291 — the settings of Messages → Channels & limits as one form: the master switch, the SMS sender name
// (masking) with its approval, what one SMS part costs, the caps per order and the quiet hours. One Save with the
// screen's version (a stale screen is read again and said so); the API checks every value again. Money is typed in
// taka and kept in paisa. A person without `messages.channels.write` sees it locked.
import { useId, useState } from 'react';
import type { ChannelsConfig } from '@extas/messages';
import { CAP_FIELDS, channelsChanges, channelsDraft, draftSender, MASK_STATES, type ChannelsDraft as Draft } from '@/lib/admin-messages/channels-draft';
import { msgError } from '@/lib/admin-messages/i18n';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

const URL = '/api/admin/messages/channels';

export function ChannelsForm({ dict, config, version, canEdit }: { dict: Dict; config: ChannelsConfig; version: string; canEdit: boolean }) {
  const id = useId();
  const [base, setBase] = useState({ config, version });
  const [draft, setDraft] = useState<Draft>(() => channelsDraft(config));
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.channels.${k}`, v);
  const off = !canEdit || busy;
  const changes = channelsChanges(draft, base.config);
  const dirty = Object.keys(changes).length > 0;
  const edit = (p: Partial<Draft>) => {
    setDraft({ ...draft, ...p });
    setSaid(null);
  };
  const fresh = (s: { config: ChannelsConfig; version: string }) => {
    setBase({ config: s.config, version: s.version });
    setDraft(channelsDraft(s.config));
  };
  async function save() {
    setBusy(true);
    const a = await call('PUT', URL, { ...changes, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data.channels as { config: ChannelsConfig; version: string });
      return setSaid({ text: t(dict, 'msg.saved'), bad: false });
    }
    const code = a.status === 0 ? 'network' : a.data.error;
    if (code === 'STALE') {
      const g = await call('GET', URL);
      if (g.status === 200) fresh(g.data.channels as { config: ChannelsConfig; version: string });
    }
    setSaid({ text: msgError(dict, code, (a.data.details ?? []).join(', ')), bad: true });
  }
  const maskFrom = draftSender(draft) ?? x('maskNumber');
  const num = (key: string, value: string, set: (v: string) => void, more: { min?: number; max?: number; step?: string } = {}) => (
    <input id={`${id}-${key}`} className="a2-inp" type="number" inputMode="decimal" min={more.min ?? 0} max={more.max} step={more.step ?? '1'} value={value} disabled={off} onChange={(e) => set(e.target.value)} data-testid={`ch-${key}`} />
  );

  return (
    <div className="a2-stack a2-mt12" style={{ gap: 12 }} data-testid="channels-form">
      {!canEdit ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{t(dict, 'msg.readOnly')}</span>
        </div>
      ) : null}
      <section className="a2-sc" aria-labelledby={`${id}-m`}>
        <div className="a2-swl">
          <span>
            <b id={`${id}-m`}>{x('master')}</b>
            <span className="a2-xs a2-mute a2-blk">{x('masterHelp')}</span>
          </span>
          <button type="button" className={`a2-sw${draft.enabled ? ' on' : ''}`} role="switch" aria-checked={draft.enabled} aria-labelledby={`${id}-m`} disabled={off} onClick={() => edit({ enabled: !draft.enabled })} data-testid="ch-master" />
        </div>
      </section>
      <section className="a2-sc" aria-labelledby={`${id}-k`}>
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-k`}>
              {x('masking')}
            </h2>
            <p className="a2-scd">{x('maskingHelp')}</p>
          </div>
        </div>
        <div className="a2-fg a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-mn`}>
              {x('maskName')}
            </label>
            <input id={`${id}-mn`} className="a2-inp" value={draft.maskName} maxLength={11} disabled={off} autoComplete="off" onChange={(e) => edit({ maskName: e.target.value })} data-testid="ch-mask-name" />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-ms`}>
              {x('maskState')}
            </label>
            <select id={`${id}-ms`} className="a2-sel" value={draft.maskState} disabled={off} onChange={(e) => edit({ maskState: e.target.value as Draft['maskState'] })} data-testid="ch-mask-state">
              {MASK_STATES.map((s) => (
                <option key={s} value={s}>
                  {x(`maskStates.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="a2-chkl a2-mt6">
          <input type="checkbox" className="a2-chk" checked={draft.maskUse} disabled={off} onChange={(e) => edit({ maskUse: e.target.checked })} data-testid="ch-mask-use" />
          <span>{x('maskUse')}</span>
        </label>
        <p className="a2-xs a2-mute a2-mt6" data-testid="ch-mask-now">
          {x('maskNow', { from: maskFrom })}
        </p>
      </section>
      <section className="a2-sc" aria-labelledby={`${id}-r`}>
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-r`}>
              {x('rates')}
            </h2>
            <p className="a2-scd">{x('ratesHelp')}</p>
          </div>
        </div>
        <div className="a2-fg a2-mt12">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-rateM`}>
              {x('rateMasked')}
            </label>
            {num('rateM', draft.rateMasked, (v) => edit({ rateMasked: v }), { step: '0.01' })}
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-rateN`}>
              {x('rateNonMasked')}
            </label>
            {num('rateN', draft.rateNonMasked, (v) => edit({ rateNonMasked: v }), { step: '0.01' })}
          </div>
        </div>
      </section>
      <section className="a2-sc" aria-labelledby={`${id}-c`}>
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-c`}>
              {x('caps')}
            </h2>
            <p className="a2-scd">{x('capsHelp')}</p>
          </div>
        </div>
        <div className="a2-fg a2-mt12">
          {CAP_FIELDS.map((k) => (
            <div key={k} className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-cap${k}`}>
                {k === 'total' ? x('capTotal') : t(dict, `msg.channel.${k}`)}
              </label>
              {num(`cap${k}`, draft.caps[k], (v) => edit({ caps: { ...draft.caps, [k]: v } }), { max: k === 'total' ? 100 : 50 })}
            </div>
          ))}
        </div>
      </section>
      <section className="a2-sc" aria-labelledby={`${id}-q`}>
        <div className="a2-sch">
          <div>
            <h2 className="a2-h3" id={`${id}-q`}>
              {x('quiet')}
            </h2>
            <p className="a2-scd">{x('quietHelp')}</p>
          </div>
        </div>
        <label className="a2-chkl a2-mt6">
          <input type="checkbox" className="a2-chk" checked={draft.quietOn} disabled={off} onChange={(e) => edit({ quietOn: e.target.checked })} data-testid="ch-quiet-on" />
          <span>{x('quietOn')}</span>
        </label>
        <div className="a2-fg a2-mt6">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-qf`}>
              {x('quietFrom')}
            </label>
            {num('qf', draft.quietFrom, (v) => edit({ quietFrom: v }), { max: 23 })}
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor={`${id}-qt`}>
              {x('quietTo')}
            </label>
            {num('qt', draft.quietTo, (v) => edit({ quietTo: v }), { max: 23 })}
          </div>
        </div>
      </section>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="ch-status">
          {said ? said.text : dirty ? t(dict, 'msg.unsaved') : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => fresh(base)}>
                {t(dict, 'msg.discard')}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="ch-save">
              {busy ? t(dict, 'msg.saving') : t(dict, 'msg.save')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
