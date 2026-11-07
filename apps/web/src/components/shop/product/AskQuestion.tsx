'use client';
// S02 · PR 66 follow-up 183 — "Ask a question" under Questions & answers (drawn only while `pdp.qaAsk.on`). A button
// opens a short box; the words go to /api/shop/question and the answer says plainly that the question shows only once
// the team has answered it. Signed out while only signed-in customers may ask: a sign-in link that comes back here.
import { useId, useState, type FormEvent } from 'react';

export interface AskWords {
  open: string;
  label: string;
  send: string;
  sending: string;
  note: string;
  thanks: string;
  again: string;
  signIn: string;
  limit: string;
  invalid: string;
  closed: string;
  failed: string;
  chars: string;
}

export type AskSaid = { kind: 'ok' | 'bad' | 'signIn'; text: string } | null;

/** What the shop's answer means for the customer. */
export function askSaidOf(status: number, body: { error?: string; again?: boolean } | null, w: AskWords): AskSaid {
  if (status === 200) return { kind: 'ok', text: body?.again ? w.again : w.thanks };
  if (status === 401) return { kind: 'signIn', text: w.signIn };
  if (status === 429) return { kind: 'bad', text: w.limit };
  if (status === 403 && body?.error === 'ASK_OFF') return { kind: 'bad', text: w.closed };
  if (status === 400) return { kind: 'bad', text: w.invalid };
  return { kind: 'bad', text: w.failed };
}

export function AskQuestion({ productId, words: w, maxChars, loginHref }: { productId: string; words: AskWords; maxChars: number; loginHref: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<AskSaid>(null);
  const count = [...text].length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/shop/question', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ productId, question: text }) });
      const b = (await r.json().catch(() => null)) as { error?: string; again?: boolean } | null;
      const next = askSaidOf(r.status, b, w);
      setSaid(next);
      if (next?.kind === 'ok') setText('');
    } catch {
      setSaid({ kind: 'bad', text: w.failed });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-block pdp-qa-askbtn" onClick={() => setOpen(true)} aria-expanded={false} aria-controls={`${id}-f`} data-testid="qa-ask-open">
        {w.open}
      </button>
    );
  }
  const signIn = `${loginHref}?next=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.pathname)}`;
  return (
    <form id={`${id}-f`} className="pdp-qa-askf" onSubmit={submit} data-testid="qa-ask-form">
      <label className="label" htmlFor={`${id}-t`}>
        {w.label}
      </label>
      <textarea id={`${id}-t`} className="input pdp-qa-area" rows={3} maxLength={maxChars} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-c ${id}-n`} autoFocus />
      <span id={`${id}-c`} className="xs muted pdp-qa-count" aria-live="polite">
        {w.chars.replace('{n}', String(count)).replace('{max}', String(maxChars))}
      </span>
      <p id={`${id}-n`} className="xs muted">
        {w.note}
      </p>
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || count < 2} aria-busy={busy} data-testid="qa-ask-send">
        {busy ? w.sending : w.send}
      </button>
      {said ? (
        <p className={`small pdp-qa-said ${said.kind}`} role="status" data-testid="qa-ask-said">
          {said.kind === 'signIn' ? <a href={signIn}>{said.text}</a> : said.text}
        </p>
      ) : null}
    </form>
  );
}
