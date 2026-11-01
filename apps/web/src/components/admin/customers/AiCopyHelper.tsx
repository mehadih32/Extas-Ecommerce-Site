'use client';
// S14 · PR 293 — "Write with AI" on an offer e-mail's form (Messages › E-mail: a template, a send): the owner says in a
// line or two what the message is about, the AI campaign writer gives 2–3 versions in his voice (Customers › Customer
// settings › AI campaign writer), and "Use this" puts one into the form's subject and words. Nothing is saved: the
// person checks it, changes it and saves it himself. Shown only while the writer is on (`ai.enabled` and
// `customers.aiWriter`); the API checks again. The practice writer's versions say so.
import { useId, useState } from 'react';
import type { AiCopy, AiCopyChannel } from '@extas/customers';
import { t, type Dict } from '@/lib/i18n';
import { emailPost } from './emailPost';

export interface AiCopyHelperProps {
  dict: Dict;
  channel: AiCopyChannel;
  locale: 'bn' | 'en';
  disabled?: boolean;
  onPick: (v: { subject: string | null; body: string }) => void;
}

export function AiCopyHelper({ dict: d, channel, locale, disabled, onPick }: AiCopyHelperProps) {
  const uid = useId();
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.ai.${k}`, v);
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState<AiCopy | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const write = async () => {
    setBusy(true);
    setMsg(null);
    const r = await emailPost(d, '/api/admin/messages/ai-copy', { channel, locale, brief });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    setCopy(r.data.copy as AiCopy);
  };

  if (!open)
    return (
      <span>
        <button type="button" className="a2-btn" onClick={() => setOpen(true)} disabled={disabled} data-testid="ai-copy-open">
          {x('open')}
        </button>
      </span>
    );

  return (
    <div className="ai-copy" data-testid="ai-copy">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-b`}>
          {x('brief')}
        </label>
        <textarea id={`${uid}-b`} className="a2-ta ai-copy-brief" value={brief} maxLength={500} placeholder={x('briefPh')} lang={locale} onChange={(e) => setBrief(e.target.value)} data-testid="ai-copy-brief" />
        <p className="a2-xs a2-mute a2-mt6">{x('briefHelp', { lang: t(d, `cus.mail.lang.${locale}`) })}</p>
      </div>
      <span className="a2-gap8">
        <button type="button" className="a2-btn pri" onClick={write} disabled={busy || !brief.trim()} data-testid="ai-copy-write">
          {busy ? x('writing') : x('write')}
        </button>
        <button type="button" className="a2-btn" onClick={() => (setOpen(false), setCopy(null), setMsg(null))} disabled={busy}>
          {x('close')}
        </button>
      </span>
      {copy ? (
        <div className="a2-stack" style={{ gap: 8 }}>
          {copy.practice ? <p className="a2-xs a2-mute">{x('practice')}</p> : null}
          {copy.versions.map((v, i) => (
            <div key={i} className="ai-copy-v" data-testid="ai-copy-version">
              <p className="a2-xs a2-mute">{x('version', { n: String(i + 1) })}</p>
              <div className="mail-preview a2-sm a2-mt6" lang={locale}>
                {v.subject ? (
                  <>
                    <b>{v.subject}</b>
                    {'\n\n'}
                  </>
                ) : null}
                {v.body}
              </div>
              <span className="a2-mt6">
                <button
                  type="button"
                  className="a2-btn"
                  onClick={() => {
                    onPick(v);
                    setMsg({ ok: true, text: x('used') });
                  }}
                  data-testid="ai-copy-use"
                >
                  {x('use')}
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
