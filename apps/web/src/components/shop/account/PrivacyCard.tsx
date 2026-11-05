'use client';
// S18 · PR 623 (CN-034) — "Your data" on My account › Profile, only while the owner's `privacy.customerRequests` (and
// PR 382's erasure requests) are on: the owner's plain notice of what erasure keeps, then one row per offered kind —
// a button to ask (with an optional note), or the latest request's state: received, a copy ready to download until a
// date, closed. Asking changes nothing: the request files into the staff list (POST /api/account/privacy-request); a
// copy is downloaded as a file only after staff approve it (POST /api/account/privacy-copy). The notice and the two
// buttons are the owner's words; the rest is `account.profile.priv*`.
import { useId, useState } from 'react';
import { showToast } from '../toast';
import { Icon } from '../Icon';

export interface PrivacyRequestView {
  id: string;
  kind: 'COPY' | 'ERASURE';
  status: string;
  createdAt: string;
  readyUntil: string | null;
}

type Words = Record<string, string>;
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

async function post(action: string, payload: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`/api/account/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { status: 0, data: {} };
  }
}

/** `owner`: the owner's words in the page's language (title, notice, copy, erasure). */
export function PrivacyCard({ words, owner, kinds, latest: first, noteMax, lang, timeZone }: { words: Words; owner: Record<'title' | 'notice' | 'copy' | 'erasure', string>; kinds: readonly ('COPY' | 'ERASURE')[]; latest: Partial<Record<'COPY' | 'ERASURE', PrivacyRequestView>>; noteMax: number; lang: 'en' | 'bn'; timeZone: string }) {
  const w = (k: string) => words[k] ?? k;
  const id = useId();
  const [latest, setLatest] = useState(first);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const day = (iso: string) => new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeZone }).format(new Date(iso));
  const refused = (status: number, data: Record<string, unknown>) =>
    setErr(w(status === 401 ? 'err.signedOut' : data.error === 'SWITCHED_OFF' ? 'err.privOff' : data.error === 'NOT_FOUND' ? 'err.privGone' : data.error === 'INVALID_INPUT' ? 'err.privNote' : 'err.offline'));

  const ask = async (el: HTMLElement, kind: 'COPY' | 'ERASURE') => {
    setBusy(true);
    setErr(null);
    const r = await post('privacy-request', { kind, note: note.trim() || null });
    setBusy(false);
    if (r.status !== 200) return refused(r.status, r.data);
    const q = r.data.request as PrivacyRequestView;
    setLatest((l) => ({ ...l, [kind]: { ...q, kind } }));
    setNote('');
    showToast(el, w(r.data.again ? 'profile.privAgain' : 'profile.privSent'));
  };
  const download = async () => {
    setBusy(true);
    setErr(null);
    const r = await post('privacy-copy', {});
    setBusy(false);
    if (r.status !== 200) return refused(r.status, r.data);
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data.copy, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${w('profile.privFile')}.json`; // the name in the page's language; the file is always JSON
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  const open = (q: PrivacyRequestView | undefined) => !!q && (q.status === 'REQUESTED' || q.status === 'READY');
  const canAsk = kinds.some((k) => !open(latest[k]));

  const state = (q: PrivacyRequestView) => {
    if (q.status === 'REQUESTED') return fill(w('profile.privReceived'), { date: day(q.createdAt) });
    if (q.status === 'READY' && q.readyUntil) return fill(w('profile.privReady'), { date: day(q.readyUntil) });
    if (q.status === 'EXPIRED') return w('profile.privExpired');
    if (q.status === 'DONE') return w('profile.privDone');
    return fill(w('profile.privClosed'), { date: day(q.createdAt) });
  };

  return (
    <section className="card p20" aria-labelledby={`${id}-h`} data-testid="acc-privacy">
      <h2 className="h3" id={`${id}-h`}>
        {owner.title}
      </h2>
      <p className="small muted acc-priv-note" data-testid="acc-privacy-notice">
        {owner.notice}
      </p>
      <div className="stack s12 mt12">
        {kinds.map((k) => {
          const q = latest[k];
          return (
            <div key={k} className="acc-priv-row" data-testid={`acc-privacy-${k.toLowerCase()}`} data-status={q?.status ?? 'none'}>
              <div className="small bold">{w(k === 'COPY' ? 'profile.privCopy' : 'profile.privErase')}</div>
              {q ? (
                <p className="xs muted" role="status" data-testid={`acc-privacy-${k.toLowerCase()}-state`}>
                  {state(q)}
                </p>
              ) : null}
              {k === 'COPY' && q?.status === 'READY' ? (
                <button type="button" className="btn btn-secondary acc-start" disabled={busy} onClick={() => void download()} data-testid="acc-privacy-download">
                  <Icon name="doc" size={16} />
                  {w('profile.privDownload')}
                </button>
              ) : !open(q) ? (
                <button type="button" className="btn btn-secondary acc-start" disabled={busy} aria-busy={busy || undefined} onClick={(e) => void ask(e.currentTarget, k)} data-testid={`acc-privacy-ask-${k.toLowerCase()}`}>
                  {k === 'COPY' ? owner.copy : owner.erasure}
                </button>
              ) : null}
            </div>
          );
        })}
        {canAsk ? (
          <div>
            <label className="label" htmlFor={`${id}-n`}>
              {w('profile.privNoteLabel')}
            </label>
            <textarea id={`${id}-n`} className="input" rows={2} maxLength={noteMax} value={note} onChange={(e) => setNote(e.target.value)} data-testid="acc-privacy-note" />
          </div>
        ) : null}
        <div role="alert">
          {err ? (
            <div className="acc-err">
              <Icon name="info" size={16} />
              <span>{err}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
