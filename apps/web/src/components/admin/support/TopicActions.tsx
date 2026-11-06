'use client';
// Follow-up 507 (PR 425) — the chat's subject and its linked order, set by a person who may reply: the subject edited
// (empty clears it), an order of this store linked by its number, or unlinked. Each press carries the conversation's
// version (a chat changed in between is read again and said so); a saved change shows the one toast, a refusal stays
// beside the field. The order itself is never changed; the who-did-what log keeps both changes.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export interface TopicTexts {
  subject: string;
  subjectHelp: string;
  subjectSave: string;
  order: string;
  orderNumber: string;
  orderHelp: string;
  orderLink: string;
  orderUnlink: string;
  savedSubject: string;
  savedOrder: string;
  savedUnlink: string;
  err: Record<string, string>;
}

export function TopicActions({ base, version, subject, order, max, texts: x }: { base: string; version: string; subject: string | null; order: { number: string } | null; max: number; texts: TopicTexts }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState(subject ?? '');
  const [number, setNumber] = useState('');
  const [said, setSaid] = useState<string | null>(null);

  async function post(payload: Record<string, unknown>, saved: string) {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', `${base}/topic`, { ...payload, version });
    setBusy(false);
    if (a.status === 200) {
      showToast({ text: saved, tone: 'ok' });
      setNumber('');
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') router.refresh();
    setSaid(x.err[code] ?? x.err.other ?? code);
  }

  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="support-topic">
      <div className="sp-acts">
        <label className="a2-lbl" htmlFor={`${id}-s`} style={{ flexBasis: '100%' }}>
          {x.subject}
        </label>
        <input id={`${id}-s`} className="a2-inp" value={words} maxLength={max} disabled={busy} onChange={(e) => setWords(e.target.value)} aria-describedby={`${id}-sh`} data-testid="support-subject" style={{ flex: '1 1 160px', minWidth: 0 }} />
        <button type="button" className="a2-btn" disabled={busy || words.trim() === (subject ?? '')} onClick={() => void post({ action: 'subject', subject: words }, x.savedSubject)} data-testid="support-subject-save">
          {x.subjectSave}
        </button>
        <span id={`${id}-sh`} className="a2-xs a2-mute" style={{ flexBasis: '100%' }}>
          {x.subjectHelp}
        </span>
      </div>
      <div className="sp-acts">
        <label className="a2-lbl" htmlFor={`${id}-o`} style={{ flexBasis: '100%' }}>
          {x.orderNumber}
        </label>
        <input id={`${id}-o`} className="a2-inp a2-mono" value={number} maxLength={60} disabled={busy} onChange={(e) => setNumber(e.target.value)} aria-describedby={`${id}-oh`} data-testid="support-order-number" style={{ flex: '1 1 140px', minWidth: 0 }} />
        <button type="button" className="a2-btn" disabled={busy || !number.trim()} onClick={() => void post({ action: 'order', orderNumber: number }, x.savedOrder)} data-testid="support-order-link">
          {x.orderLink}
        </button>
        {order ? (
          <button type="button" className="a2-btn ghost" disabled={busy} onClick={() => void post({ action: 'order', orderNumber: null }, x.savedUnlink)} data-testid="support-order-unlink">
            {x.orderUnlink}
          </button>
        ) : null}
        <span id={`${id}-oh`} className="a2-xs a2-mute" style={{ flexBasis: '100%' }}>
          {x.orderHelp}
        </span>
      </div>
      {said ? (
        <p className="a2-sm" role="alert">
          {said}
        </p>
      ) : null}
    </div>
  );
}
