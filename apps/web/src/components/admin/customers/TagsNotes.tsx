'use client';
// S14 · PR 297 — "Tags & notes" on one customer's page (demo 97u-adm2-customers.js): his tags as chips, each with a
// take-off button; one box "Note or #tag" with Add (words starting with "#" put that tag on him, anything else is a note
// for the team; the store's tags are offered as suggestions); the notes pinned first, each with Pin / Unpin and Put
// away. Without `customers.notes` the card only shows them. Every change goes through the customers API (audited,
// archived, never deleted) and the page is read again.
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { call } from '@/components/admin/api';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';
import { showToast } from '@/components/admin/lumen/Toast';

export interface TagsNotesData {
  tags: { id: string; name: string }[];
  notes: { id: string; body: string; pinned: boolean; by: string | null; when: string }[];
  storeTags: string[];
  canWrite: boolean;
}

export function TagsNotes({ dict: d, customerId, data }: { dict: Dict; customerId: string; data: TagsNotesData }) {
  const router = useRouter();
  const uid = useId();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const base = `/api/admin/customers/${customerId}`;

  const run = async (path: string, payload: Record<string, unknown>, done?: string) => {
    setBusy(true);
    setMsg(null);
    const r = await call('POST', `${base}${path}`, payload);
    setBusy(false);
    if (!r.data.ok) {
      setMsg({ ok: false, text: r.status === 0 ? cusError(d, 'network') : cusError(d, r.data.error, (r.data.details ?? []).join(', ')) });
      return false;
    }
    if (done) showToast({ text: done, tone: 'ok' });
    router.refresh();
    return true;
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    if (await run('/notes', { text: v }, t(d, v.startsWith('#') ? 'cus.notes.tagged' : 'cus.notes.added'))) setText('');
  };

  return (
    <section className="a2-card" data-testid="cus-notes">
      <h2 className="a2-h3">{t(d, 'cus.notes.title')}</h2>
      <div className="a2-gap8 cn-tags" data-testid="cus-tags">
        {data.tags.length ? (
          data.tags.map((tag) => (
            <span key={tag.id} className="a2-pill g cn-tag" data-testid="cus-tag">
              {tag.name}
              {data.canWrite ? (
                <button type="button" className="cn-x" aria-label={t(d, 'cus.notes.untag', { tag: tag.name })} disabled={busy} onClick={() => run(`/tags/${tag.id}/remove`, {})}>
                  ×
                </button>
              ) : null}
            </span>
          ))
        ) : (
          <span className="a2-sm a2-mute">{t(d, 'cus.notes.noTags')}</span>
        )}
      </div>
      {data.canWrite ? (
        <form className="cn-add" onSubmit={add}>
          <label className="a2-xs a2-mute" htmlFor={`${uid}-t`}>
            {t(d, 'cus.notes.boxLabel')}
          </label>
          <span className="a2-gap8 cn-row">
            <input id={`${uid}-t`} className="a2-inp" list={`${uid}-l`} value={text} maxLength={2000} placeholder={t(d, 'cus.notes.placeholder')} onChange={(e) => setText(e.target.value)} data-testid="cus-note-input" />
            <button type="submit" className="a2-btn pri" disabled={busy || !text.trim()} data-testid="cus-note-add">
              {t(d, 'cus.notes.add')}
            </button>
          </span>
          <datalist id={`${uid}-l`}>
            {data.storeTags.map((n) => (
              <option key={n} value={`#${n}`} />
            ))}
          </datalist>
        </form>
      ) : null}
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
      {data.notes.length ? (
        <ul className="cn-notes" data-testid="cus-note-list">
          {data.notes.map((n) => (
            <li key={n.id} className={`cn-note${n.pinned ? ' pinned' : ''}`} data-testid="cus-note" data-pinned={n.pinned ? '1' : '0'}>
              <p className="a2-sm cn-body">{n.body}</p>
              <span className="a2-xs a2-mute">
                {n.pinned ? `${t(d, 'cus.notes.pinned')} · ` : ''}
                {n.by ?? t(d, 'cus.notes.someone')} · {n.when}
              </span>
              {data.canWrite ? (
                <span className="a2-gap8 cn-acts">
                  <button type="button" className="a2-btn" disabled={busy} onClick={() => run(`/notes/${n.id}`, { action: n.pinned ? 'unpin' : 'pin' })} data-testid="cus-note-pin">
                    {t(d, n.pinned ? 'cus.notes.unpin' : 'cus.notes.pin')}
                  </button>
                  <button type="button" className="a2-btn" disabled={busy} onClick={() => run(`/notes/${n.id}`, { action: 'archive' }, t(d, 'cus.notes.archived'))} data-testid="cus-note-archive">
                    {t(d, 'cus.notes.archive')}
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-sm a2-mute a2-mt6">{t(d, 'cus.notes.noNotes')}</p>
      )}
    </section>
  );
}
