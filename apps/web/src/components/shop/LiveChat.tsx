'use client';
// S22 · PR 426 — the shop's live chat button and window (Blueprint B4.2). The store layout draws it only while the owner
// has the chat switched on (`support.liveChat.enabled`, off as it ships), so the shop's pages are as designed until then.
// The visitor writes; the team answers from the Support inbox; the window asks for answers every `pollSeconds` while
// it is open and the tab is in view (never in the background). One press of Send carries a key, so a second press, or
// a retry after a lost answer, is the same message. Words come from the shop's dictionary (props).
import { useCallback, useEffect, useRef, useState } from 'react';

export interface LiveChatTexts {
  open: string;
  title: string;
  sub: string;
  close: string;
  placeholder: string;
  send: string;
  sending: string;
  empty: string;
  me: string;
  shop: string;
  err: Record<'RATE_LIMITED' | 'TOO_LONG' | 'EMPTY' | 'LIVE_CHAT_OFF' | 'network' | 'other', string>;
}

interface Line {
  id: string;
  from: 'me' | 'shop';
  text: string;
  at: string;
}

const API = '/api/shop/support-chat';
const newKey = () => `lc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export function LiveChat({ texts, side, pollSeconds, maxChars }: Readonly<{ texts: LiveChatTexts; side: 'left' | 'right'; pollSeconds: number; maxChars: number }>) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [on, setOn] = useState(true);
  const key = useRef(newKey());
  const list = useRef<HTMLOListElement>(null);

  const read = useCallback(async () => {
    try {
      const r = await fetch(API, { cache: 'no-store', credentials: 'same-origin' });
      const d = (await r.json()) as { ok?: boolean; on?: boolean; lines?: Line[] };
      if (d.ok) {
        setOn(d.on !== false);
        setLines(d.lines ?? []);
      }
    } catch {
      // a lost read is tried again on the next turn
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // the first read right after opening, then every `pollSeconds` while the tab is in view
    const first = window.setTimeout(() => void read(), 0);
    const every = Math.max(2, pollSeconds) * 1000;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void read();
    }, every);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [open, pollSeconds, read]);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end' });
  }, [lines, open]);

  async function send() {
    if (busy) return;
    const words = text.trim();
    if (!words) return setSaid(texts.err.EMPTY);
    if (words.length > maxChars) return setSaid(texts.err.TOO_LONG);
    setBusy(true);
    setSaid('');
    try {
      const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: words, requestKey: key.current }) });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (d.ok) {
        setText('');
        key.current = newKey();
        await read();
      } else {
        const code = (d.error ?? 'other') as keyof LiveChatTexts['err'];
        if (code === 'LIVE_CHAT_OFF') setOn(false);
        setSaid(texts.err[code] ?? texts.err.other);
      }
    } catch {
      setSaid(texts.err.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={`lc-btn${side === 'left' ? ' lc-left' : ''}`} aria-expanded={open} aria-controls="lc-win" aria-label={texts.open} data-testid="live-chat-open" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M4 5h16v11H8l-4 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <section id="lc-win" className={`lc-win${side === 'left' ? ' lc-left' : ''}`} role="dialog" aria-label={texts.title} data-testid="live-chat">
          <header className="lc-head">
            <div>
              <h2>{texts.title}</h2>
              <p>{texts.sub}</p>
            </div>
            <button type="button" className="lc-x" aria-label={texts.close} onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          <ol className="lc-list" ref={list} aria-live="polite">
            {lines.length ? (
              lines.map((l) => (
                <li key={l.id} className={l.from === 'me' ? 'lc-me' : 'lc-shop'}>
                  <span className="lc-who">{l.from === 'me' ? texts.me : texts.shop}</span>
                  {l.text}
                </li>
              ))
            ) : (
              <li className="lc-empty">{texts.empty}</li>
            )}
          </ol>
          <form
            className="lc-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea value={text} maxLength={maxChars} rows={2} placeholder={texts.placeholder} aria-label={texts.placeholder} disabled={!on} onChange={(e) => setText(e.target.value)} data-testid="live-chat-text" />
            <button type="submit" disabled={busy || !on} data-testid="live-chat-send">
              {busy ? texts.sending : texts.send}
            </button>
          </form>
          {said || !on ? (
            <p className="lc-said" role="status">
              {on ? said : texts.err.LIVE_CHAT_OFF}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
