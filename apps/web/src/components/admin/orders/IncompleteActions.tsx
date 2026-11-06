'use client';
// S13 · PR 274 — Orders › Incomplete, one row's actions for a person with `orders.confirm`: "Give to" a teammate (or
// nobody), "Mark handled" with a short optional note, and "Open again" on a handled one (POST to
// /api/admin/orders/incomplete). The page refreshes after each; nothing is deleted, nobody is messaged.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';

export interface IncompleteActionTexts {
  assign: string;
  nobody: string;
  assignSave: string;
  assigned: string;
  markHandled: string;
  noteLabel: string;
  notePlaceholder: string;
  save: string;
  cancel: string;
  reopen: string;
  done: string;
  err: Record<string, string>;
}

export function IncompleteActions({ url, id, handled, assignedToId, staff, noteMax, texts: x }: { url: string; id: string; handled: boolean; assignedToId: string | null; staff: { id: string; name: string }[]; noteMax: number; texts: IncompleteActionTexts }) {
  const router = useRouter();
  const uid = useId();
  const [to, setTo] = useState(assignedToId ?? '');
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  async function go(payload: Record<string, unknown>, ok: string) {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { id, ...payload });
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
      return setOut({ text: x.err[code] ?? x.err.other ?? code, bad: true });
    }
    setNoting(false);
    setNote('');
    setOut({ text: ok, bad: false });
    router.refresh();
  }
  return (
    <div className="inc-act">
      {handled ? (
        <button type="button" className="a2-btn" disabled={busy} onClick={() => void go({ action: 'reopen' }, x.done)} data-testid="inc-reopen">
          {x.reopen}
        </button>
      ) : (
        <>
          <div className="inc-give">
            <label className="a2-lbl" htmlFor={`${uid}-to`}>
              {x.assign}
            </label>
            <select id={`${uid}-to`} className="a2-sel" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} data-testid="inc-to">
              <option value="">{x.nobody}</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="button" className="a2-btn" disabled={busy || to === (assignedToId ?? '')} onClick={() => void go({ action: 'assign', staffUserId: to || null }, x.assigned)} data-testid="inc-give">
              {x.assignSave}
            </button>
          </div>
          {noting ? (
            <div className="inc-note" data-testid="inc-note">
              <label className="a2-lbl" htmlFor={`${uid}-note`}>
                {x.noteLabel}
              </label>
              <textarea id={`${uid}-note`} className="a2-ta" rows={2} maxLength={noteMax} value={note} placeholder={x.notePlaceholder} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid="inc-note-text" />
              <div className="inc-row">
                <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void go({ action: 'handled', note }, x.done)} data-testid="inc-handled-save">
                  {x.save}
                </button>
                <button type="button" className="a2-btn" disabled={busy} onClick={() => setNoting(false)}>
                  {x.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => (setOut(null), setNoting(true))} data-testid="inc-handled">
              {x.markHandled}
            </button>
          )}
        </>
      )}
      {out ? (
        <span className={`a2-sm${out.bad ? ' inc-bad' : ''}`} role="status" aria-live="polite" data-testid="inc-said">
          {out.text}
        </span>
      ) : null}
    </div>
  );
}
