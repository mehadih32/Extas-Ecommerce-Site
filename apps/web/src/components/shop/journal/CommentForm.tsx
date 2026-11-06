'use client';
// S12 · PR 251 — the reader's comment box under an article (drawn only while `blog.comments.on`). It sends the words to
// /api/shop/journal-comment and says plainly that the comment shows only after the shop's team has checked it; signed
// out (while only signed-in customers may write): a sign-in link that comes back to the article. Nothing is shown here
// before a person presses Show on Website › Blog & journal › Comments.
import { useId, useState, type FormEvent } from 'react';

export interface CommentFormWords {
  write: string;
  label: string;
  name: string;
  send: string;
  sending: string;
  note: string;
  thanks: string;
  again: string;
  signIn: string;
  limit: string;
  invalid: string;
  needName: string;
  closed: string;
  failed: string;
  chars: string;
}

type Said = { kind: 'ok' | 'bad' | 'signIn'; text: string } | null;

/** What the shop's answer means for the reader. */
export function saidOf(status: number, body: { error?: string; again?: boolean; details?: string[] } | null, w: CommentFormWords): Said {
  if (status === 200) return { kind: 'ok', text: body?.again ? w.again : w.thanks };
  if (status === 401) return { kind: 'signIn', text: w.signIn };
  if (status === 429) return { kind: 'bad', text: w.limit };
  if (status === 403 && body?.error === 'COMMENTS_OFF') return { kind: 'bad', text: w.closed };
  if (status === 400 && body?.details?.includes('name')) return { kind: 'bad', text: w.needName };
  if (status === 400) return { kind: 'bad', text: w.invalid };
  return { kind: 'bad', text: w.failed };
}

export function CommentForm({ postId, words: w, maxChars, askName, signInHref }: { postId: string; words: CommentFormWords; maxChars: number; askName: boolean; signInHref: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const count = [...text].length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/shop/journal-comment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ postId, body: text, ...(askName ? { name } : {}) }),
      });
      const b = (await r.json().catch(() => null)) as { error?: string; again?: boolean; details?: string[] } | null;
      const next = saidOf(r.status, b, w);
      setSaid(next);
      if (next?.kind === 'ok') setText('');
    } catch {
      setSaid({ kind: 'bad', text: w.failed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="jn-cm-form" onSubmit={submit} data-testid="jn-comment-form">
      <h3 className="h4">{w.write}</h3>
      {askName ? (
        <div className="jn-cm-f">
          <label className="label" htmlFor={`${id}-n`}>
            {w.name}
          </label>
          <input id={`${id}-n`} className="input" autoComplete="given-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}
      <div className="jn-cm-f">
        <label className="label" htmlFor={`${id}-t`}>
          {w.label}
        </label>
        <textarea id={`${id}-t`} className="input jn-cm-area" rows={4} maxLength={maxChars} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-c ${id}-note`} />
        <span id={`${id}-c`} className="small text2 jn-cm-count" aria-live="polite">
          {w.chars.replace('{n}', String(count)).replace('{max}', String(maxChars))}
        </span>
      </div>
      <p id={`${id}-note`} className="small text2">
        {w.note}
      </p>
      <button type="submit" className="btn btn-primary jn-cm-send" disabled={busy || count < 2} aria-busy={busy}>
        {busy ? w.sending : w.send}
      </button>
      {said ? (
        <p className={`jn-cm-said ${said.kind}`} role="status" data-testid="jn-comment-said">
          {said.kind === 'signIn' ? <a href={signInHref}>{said.text}</a> : said.text}
        </p>
      ) : null}
    </form>
  );
}
