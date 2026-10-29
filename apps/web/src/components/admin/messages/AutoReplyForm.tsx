'use client';
// S14 · PR 505 — the auto-reply on Messages › Templates (`messages.autoReply`, off as it ships): whether a customer who
// writes to the shop on WhatsApp gets an answer, which template, once in how many hours for one number, and always or
// only while the shop is closed (its opening and closing hour). One Save with the setting's version; the API checks
// every value again. A person without `messages.templates.write` sees it locked.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { AutoReplyConfig } from '@extas/messages';
import { msgError } from '@/lib/admin-messages/i18n';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';

const URL = '/api/admin/messages/templates/auto-reply';
type A = AutoReplyConfig['autoReply'];

export function AutoReplyForm({ dict, config, version, templates, whenOptions, canEdit }: { dict: Dict; config: AutoReplyConfig; version: string; templates: string[]; whenOptions: readonly A['when'][]; canEdit: boolean }) {
  const id = useId();
  const router = useRouter();
  const a = config.autoReply;
  const [d, setD] = useState({ enabled: a.enabled, template: a.template, every: String(a.onceEveryHours), when: a.when, open: String(a.openHour), close: String(a.closeHour) });
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string) => t(dict, `msg.auto.${k}`);
  const off = !canEdit || busy;
  const next: A = { enabled: d.enabled, template: d.template, onceEveryHours: Number(d.every), when: d.when, openHour: Number(d.open), closeHour: Number(d.close) };
  const dirty = JSON.stringify(next) !== JSON.stringify(a);
  const edit = (p: Partial<typeof d>) => (setD({ ...d, ...p }), setSaid(null));
  const keys = templates.includes(a.template) ? templates : [a.template, ...templates];
  async function save() {
    setBusy(true);
    const r = await call('PUT', URL, { version, autoReply: next });
    setBusy(false);
    if (r.status === 200) {
      setSaid({ text: t(dict, 'msg.saved'), bad: false });
      router.refresh();
      return;
    }
    setSaid({ text: msgError(dict, r.status === 0 ? 'network' : r.data.error, (r.data.details ?? []).join(', ')), bad: true });
  }
  const num = (k: 'every' | 'open' | 'close', max: number) => (
    <input id={`${id}-${k}`} className="a2-inp" type="number" inputMode="numeric" min={k === 'every' ? 1 : 0} max={max} step="1" value={d[k]} disabled={off} onChange={(e) => edit({ [k]: e.target.value })} data-testid={`ar-${k}`} />
  );
  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-t`} data-testid="auto-reply">
      <div className="a2-swl">
        <span>
          <b id={`${id}-t`}>{x('title')}</b>
          <span className="a2-xs a2-mute a2-blk">{x('help')}</span>
        </span>
        <button type="button" className={`a2-sw${d.enabled ? ' on' : ''}`} role="switch" aria-checked={d.enabled} aria-label={x('on')} disabled={off} onClick={() => edit({ enabled: !d.enabled })} data-testid="ar-on" />
      </div>
      <div className="a2-fg a2-mt12">
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-tp`}>
            {x('template')}
          </label>
          <select id={`${id}-tp`} className="a2-sel" value={d.template} disabled={off} onChange={(e) => edit({ template: e.target.value })} data-testid="ar-template">
            {keys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-every`}>
            {x('every')}
          </label>
          {num('every', 720)}
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${id}-w`}>
            {x('when')}
          </label>
          <select id={`${id}-w`} className="a2-sel" value={d.when} disabled={off} onChange={(e) => edit({ when: e.target.value as A['when'] })} data-testid="ar-when">
            {whenOptions.map((w) => (
              <option key={w} value={w}>
                {x(`whenOpt.${w}`)}
              </option>
            ))}
          </select>
        </div>
        {d.when === 'outsideHours' ? (
          <>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-open`}>
                {x('open')}
              </label>
              {num('open', 23)}
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor={`${id}-close`}>
                {x('close')}
              </label>
              {num('close', 23)}
            </div>
          </>
        ) : null}
      </div>
      <p className="a2-xs a2-mute a2-mt6">{x('note')}</p>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="ar-status">
          {said ? said.text : dirty ? t(dict, 'msg.unsaved') : ''}
        </span>
        {canEdit ? (
          <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid="ar-save">
            {busy ? t(dict, 'msg.saving') : t(dict, 'msg.save')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
