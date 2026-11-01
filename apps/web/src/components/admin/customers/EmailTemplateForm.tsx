'use client';
// S14 · PR 290 — one e-mail template's form (Messages › E-mail › a template): its name, language, subject and words, with
// a preview on a sample customer. Saved with one POST (`messages.email.write`; the API checks the words again: only
// {customerName}, {storeName} and {link}). A new one goes to its own page after the save.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { EmailLocale } from '@extas/customers';
import { t, type Dict } from '@/lib/i18n';
import { AiCopyHelper } from './AiCopyHelper';
import { emailPost } from './emailPost';

export interface EmailTemplateFormProps {
  dict: Dict;
  id: string | null;
  version: string | null;
  name: string;
  locale: EmailLocale;
  subject: string;
  body: string;
  storeName: string;
  canWrite: boolean;
  /** PR 293: the AI campaign writer is on ("Write with AI"). */
  aiOn?: boolean;
}

/** The words as a sample customer would read them (the engine fills the same three words). */
export const sampleOf = (text: string, v: { customerName: string; storeName: string }) => text.replaceAll('{customerName}', v.customerName).replaceAll('{storeName}', v.storeName);

export function EmailTemplateForm(p: EmailTemplateFormProps) {
  const d = p.dict;
  const uid = useId();
  const router = useRouter();
  const x = (k: string) => t(d, `cus.mail.t.${k}`);
  const [name, setName] = useState(p.name);
  const [locale, setLocale] = useState<EmailLocale>(p.locale);
  const [subject, setSubject] = useState(p.subject);
  const [body, setBody] = useState(p.body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await emailPost(d, `/api/admin/messages/email/templates${p.id ? `/${p.id}` : ''}`, { name, locale, subject, body, ...(p.version ? { version: p.version } : {}) });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    setMsg({ ok: true, text: x('saved') });
    const id = (r.data.editor as { template?: { id: string } } | undefined)?.template?.id;
    if (!p.id && id) router.push(`/admin/messages/email/templates/${id}`);
    else router.refresh();
  };
  const sample = { customerName: x('sample'), storeName: p.storeName };

  return (
    <section className="a2-card a2-mt12 mail-form" data-testid="mail-template-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {x('name')}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} placeholder={x('namePh')} disabled={!p.canWrite} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-l`}>
          {t(d, 'cus.mail.s.language')}
        </label>
        <select id={`${uid}-l`} className="a2-sel" value={locale} disabled={!p.canWrite} onChange={(e) => setLocale(e.target.value as EmailLocale)}>
          <option value="bn">{t(d, 'cus.mail.lang.bn')}</option>
          <option value="en">{t(d, 'cus.mail.lang.en')}</option>
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-s`}>
          {t(d, 'cus.mail.s.subject')}
        </label>
        <input id={`${uid}-s`} className="a2-inp" value={subject} maxLength={150} disabled={!p.canWrite} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-b`}>
          {t(d, 'cus.mail.s.body')}
        </label>
        <textarea id={`${uid}-b`} className="a2-ta" value={body} maxLength={10_000} disabled={!p.canWrite} onChange={(e) => setBody(e.target.value)} />
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.mail.words')}</p>
      </div>
      {p.aiOn && p.canWrite ? (
        <AiCopyHelper
          dict={d}
          channel="email"
          locale={locale}
          disabled={busy}
          onPick={(v) => {
            if (v.subject) setSubject(v.subject);
            setBody(v.body);
          }}
        />
      ) : null}
      {subject || body ? (
        <div>
          <p className="a2-xs a2-mute">{x('preview')}</p>
          <div className="mail-preview a2-sm a2-mt6" data-testid="mail-preview">
            <b>{sampleOf(subject, sample)}</b>
            {'\n\n'}
            {sampleOf(body, sample)}
          </div>
        </div>
      ) : null}
      {p.canWrite ? (
        <span>
          <button type="button" className="a2-btn pri" onClick={save} disabled={busy} data-testid="mail-template-save">
            {busy ? x('saving') : x('save')}
          </button>
        </span>
      ) : (
        <p className="a2-xs a2-mute">{x('readOnly')}</p>
      )}
      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
