'use client';
// S21 · PR 423 (CN-015) — a customer problem's status on Reports › Site health › Customer problems › <problem>:
// POST {status, note, version} to the problem's API, then the page reloads its data. The words and the choices come
// from the page; the API checks `health.problems.manage` (and `health.problems.approve` for the owner's steps) again.
// Changing a status only records who is doing what: it never blocks anyone or changes the shop.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

export interface ProblemStatusTexts {
  pick: string;
  note: string;
  save: string;
  saving: string;
  saved: string;
  err: Record<string, string>;
}

export function ProblemStatusForm({
  url,
  status,
  note,
  version,
  options,
  needsNote,
  noteMax,
  texts: x,
}: {
  url: string;
  status: string;
  note: string;
  version: string;
  options: { value: string; label: string }[];
  needsNote: readonly string[];
  noteMax: number;
  texts: ProblemStatusTexts;
}) {
  const router = useRouter();
  const [next, setNext] = useState(status);
  const [text, setText] = useState(note);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaid(null);
    // the same rule as the API: a status that says how, why or what is asked needs its note (asked here first)
    if (needsNote.includes(next) && !text.trim()) {
      setBusy(false);
      setSaid({ text: x.err.NOTE_NEEDED ?? x.err.other ?? '', bad: true });
      return;
    }
    const a = await call('POST', url, { status: next, note: text, version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.saved, bad: false });
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
    if (code === 'STALE') router.refresh();
  }

  return (
    <form className="a2-stack a2-mt12" onSubmit={save} data-testid="problem-status-form">
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="prb-status">
          {x.pick}
        </label>
        <select id="prb-status" className="a2-sel" value={next} disabled={busy} onChange={(e) => setNext(e.target.value)} data-testid="problem-status">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="a2-fld">
        <label className="a2-lbl" htmlFor="prb-note">
          {x.note}
        </label>
        <textarea id="prb-note" className="a2-inp" rows={3} maxLength={noteMax} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} data-testid="problem-note" />
      </div>
      <div className="a2-gap8">
        <button type="submit" className="a2-btn pri" disabled={busy} data-testid="problem-status-save">
          {busy ? x.saving : x.save}
        </button>
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="problem-status-said">
          {said?.text ?? ''}
        </span>
      </div>
    </form>
  );
}
