'use client';
// S13 · PR 279 — Marketing › SEO outreach's small forms: add a site, move a site along the pipeline (stage, contact,
// notes, the live link, the follow-up day), set aside or bring back (POST {action, …} to /api/admin/marketing/outreach;
// `marketing.campaigns.write`). The API checks everything again; nothing here sends anything to anyone.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/marketing/outreach';

/** The page's words for these forms (already in the viewer's language). */
export interface OutreachFormTexts {
  err: Record<string, string>;
  fields: Record<string, string>;
}

type Msg = { ok: boolean; text: string } | null;

async function post(texts: OutreachFormTexts, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; text: string }> {
  try {
    const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
    if (data.ok) return { ok: true };
    const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
    const fields = (data.details ?? []).map((f) => texts.fields[f] ?? f).join(', ');
    return { ok: false, text: (texts.err[code] ?? texts.err.other ?? code).replace('{fields}', fields) };
  } catch {
    return { ok: false, text: texts.err.network ?? 'network' };
  }
}

function Note({ msg, testId }: { msg: Msg; testId: string }) {
  if (!msg) return null;
  return (
    <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid={testId}>
      {msg.text}
    </p>
  );
}

/** One button that sends one action (set aside, bring back) and reloads the page. */
export function OutreachAct({ texts, body, label, testId }: { texts: OutreachFormTexts; body: Record<string, unknown>; label: string; testId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <span>
      <button
        type="button"
        className="a2-btn"
        disabled={busy}
        data-testid={testId}
        onClick={async () => {
          setBusy(true);
          const r = await post(texts, body);
          setBusy(false);
          if (!r.ok) return setMsg({ ok: false, text: r.text });
          router.refresh();
        }}
      >
        {label}
      </button>
      <Note msg={msg} testId={`${testId}-msg`} />
    </span>
  );
}

export interface AddFormWords {
  site: string;
  sitePh: string;
  contact: string;
  contactPh: string;
  notes: string;
  add: string;
  added: string;
}

/** Adds a site by its address, with the person to write to and notes. */
export function OutreachAddForm({ texts, w }: { texts: OutreachFormTexts; w: AddFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [site, setSite] = useState('');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="mail-form" data-testid="or-add-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-s`}>
          {w.site}
        </label>
        <input id={`${uid}-s`} className="a2-inp" value={site} maxLength={300} placeholder={w.sitePh} onChange={(e) => setSite(e.target.value)} data-testid="or-add-site" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {w.contact}
        </label>
        <input id={`${uid}-c`} className="a2-inp" value={contact} maxLength={200} placeholder={w.contactPh} onChange={(e) => setContact(e.target.value)} data-testid="or-add-contact" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.notes}
        </label>
        <textarea id={`${uid}-n`} className="a2-inp" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="or-add-notes" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="or-add"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(texts, { action: 'prospect.add', site, contact, notes });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.added, tone: 'ok' });
            setSite('');
            setContact('');
            setNotes('');
            router.refresh();
          }}
        >
          {w.add}
        </button>
      </span>
      <Note msg={msg} testId="or-add-msg" />
    </div>
  );
}

export interface EditFormWords {
  stage: string;
  contact: string;
  notes: string;
  linkUrl: string;
  linkUrlPh: string;
  linkHelp: string;
  nextStepOn: string;
  nextHelp: string;
  save: string;
  saved: string;
}

export interface EditFormValue {
  status: string;
  contact: string;
  notes: string;
  linkUrl: string;
  nextStepOn: string;
}

/** Moves a site along the pipeline and changes its contact, notes, live link and follow-up day. */
export function OutreachEditForm({ texts, id, value, stages, w }: { texts: OutreachFormTexts; id: string; value: EditFormValue; stages: { value: string; label: string }[]; w: EditFormWords }) {
  const uid = useId();
  const router = useRouter();
  const [v, setV] = useState<EditFormValue>(value);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const set = (k: keyof EditFormValue) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <div className="mail-form" data-testid="or-edit-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-st`}>
          {w.stage}
        </label>
        <select id={`${uid}-st`} className="a2-sel" value={v.status} onChange={set('status')} data-testid="or-edit-stage">
          {stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-c`}>
          {w.contact}
        </label>
        <input id={`${uid}-c`} className="a2-inp" value={v.contact} maxLength={200} onChange={set('contact')} data-testid="or-edit-contact" />
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-l`}>
          {w.linkUrl}
        </label>
        <input id={`${uid}-l`} className="a2-inp" value={v.linkUrl} maxLength={500} placeholder={w.linkUrlPh} onChange={set('linkUrl')} data-testid="or-edit-link" />
        <p className="a2-xs a2-mute">{w.linkHelp}</p>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-d`}>
          {w.nextStepOn}
        </label>
        <input id={`${uid}-d`} className="a2-inp" type="date" value={v.nextStepOn} onChange={set('nextStepOn')} data-testid="or-edit-day" />
        <p className="a2-xs a2-mute">{w.nextHelp}</p>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor={`${uid}-n`}>
          {w.notes}
        </label>
        <textarea id={`${uid}-n`} className="a2-inp" rows={3} maxLength={2000} value={v.notes} onChange={set('notes')} data-testid="or-edit-notes" />
      </div>
      <span>
        <button
          type="button"
          className="a2-btn pri"
          disabled={busy}
          data-testid="or-edit-save"
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const r = await post(texts, { action: 'prospect.update', id, ...v });
            setBusy(false);
            if (!r.ok) return setMsg({ ok: false, text: r.text });
            showToast({ text: w.saved, tone: 'ok' });
            router.refresh();
          }}
        >
          {w.save}
        </button>
      </span>
      <Note msg={msg} testId="or-edit-msg" />
    </div>
  );
}
