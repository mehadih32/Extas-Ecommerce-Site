'use client';
// S14 · PR 284 — the one client part of the Customers pages that changes something: a button that, when it needs it,
// first opens a small panel in place (what will happen, and a note — optional or required), then sends one command to
// the customers API with a fresh Idempotency-Key (a double tap is one merge, §7.7) and reloads the page's data. Every
// refusal is shown in words from the page's messages (`cus.err.<code>`), never the server's own wording.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';

export interface CustomerActProps {
  dict: Dict;
  url: string;
  body?: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  /** The panel's question and what will happen (shown before sending). */
  ask?: { title: string; effects: string[]; confirm: string };
  /** A note field in the panel, sent as `body[field]`; `min` letters required (0 = optional). */
  note?: { field: string; label: string; min: number };
  tone?: 'pri' | 'bad' | 'ghost' | '';
  testId?: string;
  /** Words shown after it worked. */
  done?: string;
}

const freshKey = () => `cus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function CustomerAct({ dict, url, body, label, busyLabel, ask, note, tone = '', testId, done }: CustomerActProps) {
  const router = useRouter();
  const id = useId();
  const key = useRef(freshKey());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const panel = !!(ask || note);

  const send = async () => {
    if (note && text.trim().length < note.min) {
      setMsg({ ok: false, text: cusError(dict, 'INVALID_INPUT', note.label) });
      return;
    }
    setBusy(true);
    setMsg(null);
    let status = 0;
    let data: { ok?: boolean; error?: string; details?: string[] } = {};
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'idempotency-key': key.current },
        body: JSON.stringify({ ...(body ?? {}), ...(note && text.trim() ? { [note.field]: text.trim() } : {}) }),
      });
      status = res.status;
      data = (await res.json().catch(() => ({ ok: false, error: 'default' }))) as typeof data;
    } catch {
      status = 0;
    }
    setBusy(false);
    if (!data.ok) {
      setMsg({ ok: false, text: status === 0 ? cusError(dict, 'network') : cusError(dict, data.error, (data.details ?? []).join(', ')) });
      return;
    }
    key.current = freshKey();
    setOpen(false);
    setText('');
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
  };

  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      {open && panel ? (
        <span className="a2-stack" style={{ gap: 6 }} data-testid={testId ? `${testId}-panel` : undefined}>
          {ask ? (
            <>
              <b className="a2-sm">{ask.title}</b>
              <ul className="a2-eff">
                {ask.effects.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : null}
          {note ? (
            <span className="a2-stack" style={{ gap: 4 }}>
              <label className="a2-xs a2-mute" htmlFor={`${id}-n`}>
                {note.label}
              </label>
              <input id={`${id}-n`} className="a2-inp" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="a2-gap8">
        {open && panel ? (
          <>
            <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={send} disabled={busy} data-testid={testId ? `${testId}-yes` : undefined}>
              {busy ? (busyLabel ?? label) : (ask?.confirm ?? label)}
            </button>
            <button type="button" className="a2-btn sm ghost" onClick={() => setOpen(false)} disabled={busy}>
              {t(dict, 'cus.merge.cancel')}
            </button>
          </>
        ) : (
          <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={() => (panel ? setOpen(true) : void send())} disabled={busy} data-testid={testId}>
            {busy ? (busyLabel ?? label) : label}
          </button>
        )}
      </span>
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
