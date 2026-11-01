'use client';
// S14 · PR 290 — a draft e-mail send's form (Messages › E-mail › a send): its name, who gets it (a saved segment, or
// everyone with a yes for offer e-mails), its words (started from a template or typed), the language; "Save draft"
// (`messages.email.write`). Once saved, "Schedule" (now or at a time; `messages.email.send`) asks first, with how many it
// reaches. The API checks everything again; a send is never sent from here, only scheduled for the engine.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { EmailLocale, EmailTemplateRow } from '@extas/customers';
import { t, type Dict } from '@/lib/i18n';
import { emailPost } from './emailPost';

export interface EmailSendFormProps {
  dict: Dict;
  id: string | null;
  version: string | null;
  name: string;
  segmentId: string | null;
  templateId: string | null;
  locale: EmailLocale;
  subject: string;
  body: string;
  templates: EmailTemplateRow[];
  segments: { id: string; name: string }[];
  segmentsOn: boolean;
  /** How many it reaches now (the saved draft's audience), or null when not counted. */
  reachable: number | null;
  canWrite: boolean;
  canSend: boolean;
}

export function EmailSendForm(p: EmailSendFormProps) {
  const d = p.dict;
  const uid = useId();
  const router = useRouter();
  const x = (k: string, v?: Record<string, string>) => t(d, `cus.mail.s.${k}`, v);
  const [name, setName] = useState(p.name);
  const [segmentId, setSegmentId] = useState(p.segmentId ?? '');
  const [templateId, setTemplateId] = useState(p.templateId ?? '');
  const [locale, setLocale] = useState<EmailLocale>(p.locale);
  const [subject, setSubject] = useState(p.subject);
  const [body, setBody] = useState(p.body);
  const [later, setLater] = useState(false);
  const [at, setAt] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = name !== p.name || segmentId !== (p.segmentId ?? '') || templateId !== (p.templateId ?? '') || locale !== p.locale || subject !== p.subject || body !== p.body;

  const pick = (id: string) => {
    setTemplateId(id);
    const tp = p.templates.find((x) => x.id === id);
    if (tp) {
      setSubject(tp.subject);
      setBody(tp.body);
      setLocale(tp.locale);
    }
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const r = await emailPost(d, `/api/admin/messages/email/sends${p.id ? `/${p.id}` : ''}`, { name, segmentId: segmentId || null, templateId: templateId || null, locale, subject, body, ...(p.version ? { version: p.version } : {}) });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    setMsg({ ok: true, text: x('saved') });
    const id = (r.data.editor as { send?: { id: string } } | undefined)?.send?.id;
    if (!p.id && id) router.push(`/admin/messages/email/${id}`);
    else router.refresh();
  };

  const schedule = async () => {
    if (!p.id) return;
    const when = later && at ? new Date(at) : null;
    if (later && (!when || Number.isNaN(when.getTime()))) return setMsg({ ok: false, text: t(d, 'cus.err.INVALID_INPUT', { fields: x('time') }) });
    setBusy(true);
    setMsg(null);
    const r = await emailPost(d, `/api/admin/messages/email/sends/${p.id}/state`, { action: 'schedule', at: when ? when.toISOString() : null, ...(p.version ? { version: p.version } : {}) });
    setBusy(false);
    setAsking(false);
    if (!r.ok) return setMsg({ ok: false, text: r.text });
    router.refresh();
  };

  return (
    <section className="a2-card a2-mt12 mail-form" data-testid="mail-send-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {x('name')}
        </label>
        <input id={`${uid}-n`} className="a2-inp" value={name} maxLength={80} placeholder={x('namePh')} disabled={!p.canWrite} onChange={(e) => setName(e.target.value)} />
      </div>
      <h2 className="a2-h3">{x('audience')}</h2>
      {p.segmentsOn ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-g`}>
            {x('segment')}
          </label>
          <select id={`${uid}-g`} className="a2-sel" value={segmentId} disabled={!p.canWrite} onChange={(e) => setSegmentId(e.target.value)} data-testid="mail-segment">
            <option value="">{t(d, 'cus.mail.everyone')}</option>
            {p.segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="a2-xs a2-mute">{x('segmentsOff')}</p>
      )}
      {p.templates.length ? (
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor={`${uid}-t`}>
            {x('fromTemplate')}
          </label>
          <select id={`${uid}-t`} className="a2-sel" value={templateId} disabled={!p.canWrite} onChange={(e) => pick(e.target.value)} data-testid="mail-template">
            <option value="">{x('pickTemplate')}</option>
            {p.templates.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-l`}>
          {x('language')}
        </label>
        <select id={`${uid}-l`} className="a2-sel" value={locale} disabled={!p.canWrite} onChange={(e) => setLocale(e.target.value as EmailLocale)}>
          <option value="bn">{t(d, 'cus.mail.lang.bn')}</option>
          <option value="en">{t(d, 'cus.mail.lang.en')}</option>
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-s`}>
          {x('subject')}
        </label>
        <input id={`${uid}-s`} className="a2-inp" value={subject} maxLength={150} disabled={!p.canWrite} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-b`}>
          {x('body')}
        </label>
        <textarea id={`${uid}-b`} className="a2-ta" value={body} maxLength={10_000} disabled={!p.canWrite} onChange={(e) => setBody(e.target.value)} />
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.mail.words')}</p>
      </div>
      {p.canWrite ? (
        <span>
          <button type="button" className="a2-btn" onClick={save} disabled={busy} data-testid="mail-send-save">
            {busy ? x('saving') : x('save')}
          </button>
        </span>
      ) : (
        <p className="a2-xs a2-mute">{x('readOnly')}</p>
      )}
      {p.id ? (
        <>
          <div className="a2-hr" />
          <h2 className="a2-h3">{x('when')}</h2>
          {p.canSend ? (
            <>
              <div className="mail-when">
                <label className="a2-ckb">
                  <input type="radio" name={`${uid}-w`} checked={!later} onChange={() => setLater(false)} />
                  {x('now')}
                </label>
                <label className="a2-ckb">
                  <input type="radio" name={`${uid}-w`} checked={later} onChange={() => setLater(true)} />
                  {x('later')}
                </label>
                {later ? <input type="datetime-local" className="a2-inp" aria-label={x('time')} value={at} onChange={(e) => setAt(e.target.value)} /> : null}
              </div>
              {asking ? (
                <div className="mail-ask" role="alertdialog" aria-label={x('scheduleAsk')} data-testid="mail-schedule-ask">
                  <p className="a2-sm a2-b">{x('scheduleAsk')}</p>
                  <ul className="a2-sm a2-mt6">
                    <li>{x('scheduleEff1', { n: String(p.reachable ?? 0) })}</li>
                    <li>{x('scheduleEff2')}</li>
                    <li>{x('scheduleEff3')}</li>
                  </ul>
                  <span className="a2-gap8 a2-mt12">
                    <button type="button" className="a2-btn pri" onClick={schedule} disabled={busy} data-testid="mail-schedule-yes">
                      {x('scheduleYes')}
                    </button>
                    <button type="button" className="a2-btn" onClick={() => setAsking(false)} disabled={busy}>
                      {t(d, 'cus.merge.cancel')}
                    </button>
                  </span>
                </div>
              ) : (
                <span>
                  <button type="button" className="a2-btn pri" onClick={() => setAsking(true)} disabled={busy || changed || !p.reachable} data-testid="mail-schedule">
                    {x('schedule')}
                  </button>
                </span>
              )}
            </>
          ) : (
            <p className="a2-xs a2-mute">{x('noSendRight')}</p>
          )}
        </>
      ) : null}
      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
