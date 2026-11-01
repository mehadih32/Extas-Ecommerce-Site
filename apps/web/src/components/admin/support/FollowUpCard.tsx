'use client';
// S22 · PR 433 — the follow-up waiting on a chat that did not become an order (Blueprint B4.7 bullet 3): why it is due
// (the bag left, products sent, the order cancelled), until when the channel still takes an answer, and the store's own
// words in a box the person may change. "Send follow-up" sends it as this person's own reply (one press carries a key:
// pressed twice, one message); "Skip" puts it away until the chat moves. Nothing is sent by itself. The server checks
// every permission, the chat's version and whether the follow-up is still waiting.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';

export interface FollowUpTexts {
  h: string;
  why: string;
  window: string | null;
  offer: string | null;
  label: string;
  send: string;
  sending: string;
  skip: string;
  note: string;
  sent: string;
  skipped: string;
  err: Record<string, string>;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

export function FollowUpCard({ url, id, body, version, maxChars, texts: x }: { url: string; id: string; body: string; version: string; maxChars: number; texts: FollowUpTexts }) {
  const router = useRouter();
  const fid = useId();
  const [text, setText] = useState(body.slice(0, maxChars));
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState<'' | 'send' | 'skip'>('');
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function post(action: 'send' | 'skip') {
    setBusy(action);
    const a = await call('POST', url, action === 'send' ? { action, followUpId: id, body: text, requestKey: key, version } : { action, followUpId: id, version });
    setBusy('');
    if (a.status === 200) {
      setSaid({ text: action === 'send' ? x.sent : x.skipped, bad: false });
      setKey(newKey());
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE' || code === 'FOLLOW_UP_GONE') router.refresh();
    if (code === 'IDEMPOTENCY_MISMATCH') setKey(newKey());
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
  }

  return (
    <section className="sp-fu a2-mt12" aria-labelledby={`${fid}-h`} data-testid="support-followup">
      <div className="a2-between" style={{ flexWrap: 'wrap', gap: 6 }}>
        <h2 className="a2-h4" id={`${fid}-h`}>
          {x.h}
        </h2>
        <span className="a2-pill info" data-testid="support-followup-why">
          {x.why}
        </span>
      </div>
      {x.window ? <p className="a2-xs a2-mute a2-mt6">{x.window}</p> : null}
      <label className="a2-xs a2-mute sp-fu-lbl" htmlFor={`${fid}-t`}>
        {x.label}
      </label>
      <textarea id={`${fid}-t`} className="a2-inp a2-ta" value={text} maxLength={maxChars} rows={3} onChange={(e) => setText(e.target.value)} data-testid="support-followup-body" />
      {x.offer ? (
        <p className="a2-xs a2-mute a2-mt6" data-testid="support-followup-offer">
          {x.offer}
        </p>
      ) : null}
      <div className="sp-cbar">
        <button type="button" className="a2-btn pri" disabled={busy !== '' || !text.trim()} onClick={() => void post('send')} data-testid="support-followup-send">
          {busy === 'send' ? x.sending : x.send}
        </button>
        <button type="button" className="a2-btn" disabled={busy !== ''} onClick={() => void post('skip')} data-testid="support-followup-skip">
          {x.skip}
        </button>
        <span className="a2-xs a2-mute sp-grow">{x.note}</span>
      </div>
      {said ? (
        <p className={`a2-sm a2-mt6${said.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="support-followup-said">
          {said.text}
        </p>
      ) : null}
    </section>
  );
}
