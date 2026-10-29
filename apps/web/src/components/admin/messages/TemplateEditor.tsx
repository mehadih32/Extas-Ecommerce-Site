'use client';
// S14 · PR 505 — one template's words on Messages › Templates: its text (and an e-mail's subject), what is wrong with
// it, and its preview on the sample order (cash on delivery, prepaid, part-paid) while it is typed — the engine's own
// `render` (@extas/messages/pure), so the preview says exactly what a customer would get, or why nothing would go. Save
// sends the words with the template's version (a stale page is said so); Reset puts the default words back. The API
// checks everything again. A person without `messages.templates.write` sees it locked. TemplateAdd adds a missing one.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { BLOCKING_PROBLEMS, previewTemplate, templateProblems, waBodyProblems, type MessageChannel, type SampleSettings } from '@extas/messages/pure';
import { label, msgError } from '@/lib/admin-messages/i18n';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';

const URL = '/api/admin/messages/templates';
const WA_TONE: Record<string, string> = { APPROVED: 'ok', PENDING: 'warn', REJECTED: 'bad', PAUSED: 'warn', DISABLED: 'bad', none: 'line' };

export interface EditorRow {
  id: string;
  channel: MessageChannel;
  locale: string;
  body: string;
  subject: string | null;
  version: string;
  providerStatus: string | null;
  /** Differs from its default; null: there is no default. */
  edited: boolean | null;
}

function Words({ dict, channel, locale, body, subject, sample, hasHost }: { dict: Dict; channel: MessageChannel; locale: string; body: string; subject: string | null; sample: SampleSettings; hasHost: boolean }) {
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.tpl.${k}`, v);
  const words = { channel, locale, body, subject };
  // the editor's own words (a refusal in red, a warning in amber), then what WhatsApp's approval would refuse
  const problems = [
    ...templateProblems(words, hasHost).map((p) => ({ id: `t-${p}`, code: p, text: x(`problem.${p}`), bad: BLOCKING_PROBLEMS.has(p) })),
    ...(channel === 'WHATSAPP' ? waBodyProblems(body) : []).map((p) => ({ id: `w-${p}`, code: p, text: t(dict, `msg.wa.problem.${p}`), bad: false })),
  ];
  const previews = previewTemplate(words, sample);
  return (
    <>
      {problems.length ? (
        <ul className="a2-stack a2-mt6" style={{ gap: 2, paddingLeft: 18, margin: 0 }} data-testid="tpl-problems">
          {problems.map((p) => (
            <li key={p.id} className="a2-xs" style={{ color: p.bad ? 'var(--bad)' : 'var(--warn)' }} data-problem={p.code}>
              {p.text}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="a2-h4 a2-mt12">{x('preview')}</div>
      <div className="a2-pv3 a2-mt6" data-testid="tpl-previews">
        {previews.map((p) => (
          <div key={p.sample} data-testid="tpl-preview" data-sample={p.sample} data-ok={p.ok ? '1' : '0'}>
            <div className="a2-xs a2-mute" style={{ marginBottom: 4 }}>
              {x(`sample.${p.sample}`)}
              {p.ok && p.smsParts ? ` · ${x('parts', { n: String(p.smsParts) })}` : ''}
            </div>
            <div className="a2-phone">
              {p.ok ? (
                <div className={`a2-bub${channel === 'WHATSAPP' ? ' wa' : ''}`} lang={locale}>
                  {p.subject ? <b className="a2-blk">{p.subject}</b> : null}
                  {p.text}
                </div>
              ) : (
                <div className="a2-bub skip">{x('skipped', { why: label(dict, 'reason', p.reason) })}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function TemplateEditor({ dict, row, sample, hasHost, canEdit }: { dict: Dict; row: EditorRow; sample: SampleSettings; hasHost: boolean; canEdit: boolean }) {
  const id = useId();
  const router = useRouter();
  const [body, setBody] = useState(row.body);
  const [subject, setSubject] = useState(row.subject ?? '');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.tpl.${k}`, v);
  const off = !canEdit || busy;
  const subj = row.channel === 'EMAIL' ? subject : null;
  const dirty = body !== row.body || (row.channel === 'EMAIL' && subject !== (row.subject ?? ''));
  const lang = row.locale === 'en' ? 'en' : 'bn';
  const send = async (url: string, method: 'PUT' | 'POST', payload: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const a = await call(method, url, payload);
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: ok, bad: false });
      router.refresh();
      return;
    }
    setSaid({ text: msgError(dict, a.status === 0 ? 'network' : a.data.error, (a.data.details ?? []).join(', ')), bad: true });
  };
  const save = () => send(`${URL}/${row.id}`, 'PUT', { version: row.version, body, ...(row.channel === 'EMAIL' ? { subject } : {}) }, t(dict, 'msg.saved'));
  const reset = () => {
    if (!window.confirm(x('resetAsk'))) return;
    void send(`${URL}/${row.id}/reset`, 'POST', { version: row.version }, x('resetDone'));
  };
  const state = row.providerStatus ?? 'none';

  return (
    <div className="a2-stack" style={{ gap: 6, minWidth: 0 }} data-testid="tpl-editor" data-channel={row.channel} data-locale={row.locale}>
      <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="a2-lbl" htmlFor={`${id}-b`} style={{ margin: 0 }}>
          {x(`lang.${lang}`)}
        </label>
        {row.edited ? <span className="a2-pill gold">{x('edited')}</span> : null}
        {row.channel === 'WHATSAPP' ? (
          <span className={`a2-pill ${WA_TONE[state] ?? 'line'}`} title={x('approval')}>
            {t(dict, `msg.wa.state.${state}`)}
          </span>
        ) : null}
      </div>
      {row.channel === 'EMAIL' ? (
        <input className="a2-inp" aria-label={x('subject')} placeholder={x('subject')} value={subject} disabled={off} lang={lang} onChange={(e) => (setSubject(e.target.value), setSaid(null))} data-testid="tpl-subject" />
      ) : null}
      <textarea id={`${id}-b`} className="a2-ta tall" rows={5} value={body} disabled={off} lang={lang} onChange={(e) => (setBody(e.target.value), setSaid(null))} data-testid="tpl-body" />
      {row.channel === 'WHATSAPP' && row.providerStatus && dirty ? <p className="a2-xs a2-mute">{x('waEditNote')}</p> : null}
      <Words dict={dict} channel={row.channel} locale={row.locale} body={body} subject={subj} sample={sample} hasHost={hasHost} />
      <div className="a2-gap8 a2-mt6" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {canEdit ? (
          <button type="button" className="a2-btn pri sm" disabled={busy || !dirty} onClick={save} data-testid="tpl-save">
            {busy ? t(dict, 'msg.saving') : t(dict, 'msg.save')}
          </button>
        ) : null}
        {canEdit && dirty ? (
          <button type="button" className="a2-btn sm" disabled={busy} onClick={() => (setBody(row.body), setSubject(row.subject ?? ''), setSaid(null))}>
            {t(dict, 'msg.discard')}
          </button>
        ) : null}
        {canEdit && row.edited ? (
          <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={reset} data-testid="tpl-reset">
            {x('reset')}
          </button>
        ) : null}
        <span className={`a2-xs${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" style={said?.bad ? { color: 'var(--bad)' } : undefined} data-testid="tpl-status">
          {said ? said.text : dirty ? t(dict, 'msg.unsaved') : ''}
        </span>
      </div>
    </div>
  );
}

/** A language a template lacks on a channel: its draft words (the default, or the same language elsewhere), then Add. */
export function TemplateAdd({ dict, tplKey, channel, locale, draft, sample, hasHost, canEdit, langName, channelName }: { dict: Dict; tplKey: string; channel: MessageChannel; locale: string; draft: { body: string; subject: string | null }; sample: SampleSettings; hasHost: boolean; canEdit: boolean; langName: string; channelName: string }) {
  const router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const x = (k: string, v: Record<string, string> = {}) => t(dict, `msg.tpl.${k}`, v);
  const lang = locale === 'en' ? 'en' : 'bn';
  const add = async () => {
    setBusy(true);
    const a = await call('POST', URL, { key: tplKey, channel, locale, body, ...(channel === 'EMAIL' ? { subject } : {}) });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x('added'), bad: false });
      router.refresh();
      return;
    }
    setSaid({ text: msgError(dict, a.status === 0 ? 'network' : a.data.error, (a.data.details ?? []).join(', ')), bad: true });
  };
  return (
    <div className="a2-note a2-stack" style={{ gap: 6, alignItems: 'stretch' }} data-testid="tpl-missing" data-channel={channel} data-locale={locale}>
      <b>{x('add', { lang: langName, channel: channelName })}</b>
      <span className="a2-xs a2-mute">{x('addHelp', { lang: langName, channel: channelName })}</span>
      {canEdit ? (
        <>
          {channel === 'EMAIL' ? <input className="a2-inp" aria-label={x('subject')} placeholder={x('subject')} value={subject} lang={lang} onChange={(e) => setSubject(e.target.value)} /> : null}
          <textarea className="a2-ta" rows={4} aria-label={x('add', { lang: langName, channel: channelName })} value={body} lang={lang} onChange={(e) => setBody(e.target.value)} data-testid="tpl-add-body" />
          <Words dict={dict} channel={channel} locale={locale} body={body} subject={channel === 'EMAIL' ? subject : null} sample={sample} hasHost={hasHost} />
          <div className="a2-gap8" style={{ alignItems: 'center' }}>
            <button type="button" className="a2-btn sm pri" disabled={busy || !body.trim()} onClick={add} data-testid="tpl-add">
              {x('addButton')}
            </button>
            <span className="a2-xs" role="status" aria-live="polite" style={said?.bad ? { color: 'var(--bad)' } : undefined}>
              {said?.text ?? ''}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
