'use client';
// S02 · PR 599 — Help & Build › Feature requests, in the Lumen look: "Ask for a new feature" (a short name, what it
// should do in the person's own words, the section it belongs to, soon or later) and, for the build team, a status per
// request (in the register with its PR number, built, already possible with where, or not built with why). It never
// edits the shop or its code: a request goes into the PR register flow and is built by the agent team. POST
// /api/admin/build/requests (`build.report`; the API checks again).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';

const API = '/api/admin/build/requests';
const STATUSES = ['NEW', 'REGISTERED', 'BUILT', 'POSSIBLE', 'DECLINED'] as const;
// hardcode-ok: the input's own bounds (lib/feature-requests.ts)
const TITLE_MAX = 120;
const NEED_MAX = 4000;

type Dict = { [k: string]: string | Dict };

const post = async (body: unknown): Promise<{ ok?: boolean; error?: string; status: number }> => {
  try {
    const res = await fetch(API, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
    return { ...data, status: res.status };
  } catch {
    return { ok: false, error: 'network', status: 0 };
  }
};

function useWords(w: Dict) {
  return (k: string): string => {
    const v = k.split('.').reduce<string | Dict | undefined>((o, part) => (o && typeof o === 'object' ? o[part] : undefined), w);
    return typeof v === 'string' ? v : k;
  };
}

/** The "Ask for a new feature" form. */
export function AskFeature(p: { sections: { id: string; name: string }[]; page?: string; w: Dict }) {
  const router = useRouter();
  const uid = useId();
  const g = useWords(p.w);
  const [title, setTitle] = useState('');
  const [need, setNeed] = useState('');
  const [section, setSection] = useState('');
  const [when, setWhen] = useState<'SOON' | 'LATER'>('LATER');
  const [busy, setBusy] = useState(false);
  const ready = title.trim().length >= 3 && need.trim().length >= 10;
  const send = async () => {
    setBusy(true);
    const r = await post({ action: 'ask', title, need, when, ...(section ? { section } : {}), ...(p.page ? { page: p.page } : {}) });
    setBusy(false);
    if (r.ok) {
      showToast({ text: g('ask.sent'), tone: 'ok' });
      setTitle('');
      setNeed('');
      setSection('');
      setWhen('LATER');
      router.refresh();
    } else {
      const code = r.error ?? (r.status === 403 ? 'forbidden' : 'other');
      showToast({ text: g(`err.${code}`) === `err.${code}` ? g('err.other') : g(`err.${code}`), tone: 'bad' });
    }
  };
  return (
    <form
      className="frx-form"
      data-testid="fr-ask"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void send();
      }}
    >
      <div className="lm-fl">
        <label htmlFor={`${uid}-t`}>{g('ask.title')}</label>
        <input id={`${uid}-t`} className="lm-inp" maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="fr-title" />
      </div>
      <div className="lm-fl">
        <label htmlFor={`${uid}-n`}>{g('ask.need')}</label>
        <textarea id={`${uid}-n`} className="lm-inp frx-area" rows={5} maxLength={NEED_MAX} value={need} onChange={(e) => setNeed(e.target.value)} data-testid="fr-need" />
        <span className="lm-hint">{g('ask.needHint')}</span>
      </div>
      <div className="frx-two">
        <div className="lm-fl">
          <label htmlFor={`${uid}-s`}>{g('ask.section')}</label>
          <select id={`${uid}-s`} className="lm-inp" value={section} onChange={(e) => setSection(e.target.value)} data-testid="fr-section">
            <option value="">{g('ask.sectionAny')}</option>
            {p.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="lm-fl">
          <label htmlFor={`${uid}-w`}>{g('ask.when')}</label>
          <select id={`${uid}-w`} className="lm-inp" value={when} onChange={(e) => setWhen(e.target.value as 'SOON' | 'LATER')} data-testid="fr-when">
            <option value="LATER">{g('when.LATER')}</option>
            <option value="SOON">{g('when.SOON')}</option>
          </select>
        </div>
      </div>
      <p className="lm-hint">{g('ask.note')}</p>
      <div className="frx-bar">
        <button type="submit" className="lm-btn pri" disabled={!ready || busy} data-testid="fr-send">
          {busy ? g('ask.sending') : g('ask.send')}
        </button>
      </div>
    </form>
  );
}

/** The build team's status for one request. */
export function RequestStatusForm(p: { id: string; status: string; pr: number | null; w: Dict; testId: string }) {
  const router = useRouter();
  const uid = useId();
  const g = useWords(p.w);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(p.status);
  const [pr, setPr] = useState(p.pr ? String(p.pr) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const r = await post({ action: 'status', id: p.id, status, ...(pr ? { pr: Number(pr) } : {}), ...(note.trim() ? { note } : {}) });
    setBusy(false);
    if (r.ok) {
      showToast({ text: g('st.saved'), tone: 'ok' });
      setOpen(false);
      router.refresh();
    } else {
      const code = r.error ?? (r.status === 403 ? 'forbidden' : 'other');
      showToast({ text: g(`err.${code}`) === `err.${code}` ? g('err.other') : g(`err.${code}`), tone: 'bad' });
    }
  };
  if (!open)
    return (
      <button type="button" className="lm-btn sm frx-stbtn" onClick={() => setOpen(true)} data-testid={p.testId}>
        {g('st.change')}
      </button>
    );
  return (
    <div className="frx-st lm-in" role="group" aria-label={g('st.change')}>
      <div className="lm-fl">
        <label htmlFor={`${uid}-st`}>{g('st.status')}</label>
        <select id={`${uid}-st`} className="lm-inp" value={status} onChange={(e) => setStatus(e.target.value)} data-testid={`${p.testId}-sel`}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {g(`status.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {status === 'REGISTERED' || status === 'BUILT' ? (
        <div className="lm-fl">
          <label htmlFor={`${uid}-pr`}>{g('st.pr')}</label>
          <input id={`${uid}-pr`} className="lm-inp" type="number" inputMode="numeric" min={1} value={pr} onChange={(e) => setPr(e.target.value.replace(/\D/g, ''))} data-testid={`${p.testId}-pr`} />
        </div>
      ) : null}
      <div className="lm-fl frx-wide">
        <label htmlFor={`${uid}-no`}>{status === 'POSSIBLE' ? g('st.where') : status === 'DECLINED' ? g('st.why') : g('st.note')}</label>
        <input id={`${uid}-no`} className="lm-inp" maxLength={NEED_MAX} value={note} onChange={(e) => setNote(e.target.value)} data-testid={`${p.testId}-note`} />
      </div>
      <div className="frx-bar">
        <button type="button" className="lm-btn pri sm frx-stbtn" disabled={busy} onClick={() => void save()} data-testid={`${p.testId}-save`}>
          {g('st.save')}
        </button>
        <button type="button" className="lm-btn gh sm frx-stbtn" disabled={busy} onClick={() => setOpen(false)}>
          {g('st.cancel')}
        </button>
      </div>
    </div>
  );
}
