'use client';
// S28 · PR 671 — the small client parts of Courier 360 › Payouts: "Ask the courier to pay" (the owner's PIN, one request key
// per press so a double press never asks the courier twice), and on a request "Check now", "Mark orders settled" and
// "Close this request". Every refusal is shown in words from the page's messages (`cr.y.err.<code>`), never the server's own.
// The PIN is typed in a password box, sent once and never kept.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { t, type Dict } from '@/lib/i18n';

const API = '/api/admin/delivery/payouts';

async function send(url: string, body: unknown, key?: string): Promise<{ status: number; data: { ok?: boolean; error?: string } }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => ({ ok: false, error: 'other' }))) as { ok?: boolean; error?: string } };
  } catch {
    return { status: 0, data: { ok: false, error: 'other' } };
  }
}

const refusal = (dict: Dict, code: string | undefined) => {
  const k = `cr.y.err.${code ?? 'other'}`;
  const text = t(dict, k);
  return text === k ? t(dict, 'cr.y.err.other') : text;
};

export function AskPayout({ dict, courierId, label }: { dict: Dict; courierId: string; label: string }) {
  const router = useRouter();
  const id = useId();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // one key per press of this form: a retry after a timeout is the same request, a new one after it worked
  const key = useRef<string>('');
  const go = async () => {
    setBusy(true);
    setMsg(null);
    if (!key.current) key.current = crypto.randomUUID();
    const a = await send(API, { courierAccountId: courierId, pin }, key.current);
    setBusy(false);
    if (!a.data.ok) {
      // a refusal that asked nothing may be tried again with a new key; a network failure keeps the key (the same request)
      if (a.status !== 0) key.current = '';
      setMsg(refusal(dict, a.data.error));
      return;
    }
    key.current = '';
    setPin('');
    showToast({ text: t(dict, 'cr.y.asked'), tone: 'ok' });
    router.refresh();
  };
  return (
    <form
      className="a2-stack a2-mt12"
      style={{ gap: 6, maxWidth: 360 }}
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <label className="a2-xs a2-mute" htmlFor={`${id}-pin`}>
        {t(dict, 'cr.y.pin')}
      </label>
      <input id={`${id}-pin`} className="a2-inp" type="password" inputMode="numeric" autoComplete="off" value={pin} maxLength={40} onChange={(e) => setPin(e.target.value)} data-testid="payout-pin" />
      <button type="submit" className="a2-btn pri" disabled={busy || !pin.trim()} data-testid="payout-ask">
        {busy ? t(dict, 'cr.y.asking') : label}
      </button>
      {msg ? (
        <span className="a2-note bad" role="alert" data-testid="payout-error">
          {msg}
        </span>
      ) : null}
    </form>
  );
}

export function PayoutRowActions({ dict, payoutId, canCheck, canSettle, canClose }: { dict: Dict; payoutId: string; canCheck: boolean; canSettle: boolean; canClose: boolean }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (action: 'check' | 'settle' | 'close', body: unknown, done: string) => {
    setBusy(true);
    setMsg(null);
    const a = await send(`${API}/${payoutId}/${action}`, body);
    setBusy(false);
    if (!a.data.ok) {
      setMsg(refusal(dict, a.data.error));
      return;
    }
    setClosing(false);
    showToast({ text: done, tone: 'ok' });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      <span className="a2-gap8" style={{ flexWrap: 'wrap' }}>
        {canCheck ? (
          <button type="button" className="a2-btn sm" disabled={busy} onClick={() => void run('check', {}, t(dict, 'cr.y.checked'))} data-testid="payout-check">
            {t(dict, 'cr.y.check')}
          </button>
        ) : null}
        {canSettle ? (
          <button type="button" className="a2-btn sm pri" disabled={busy} onClick={() => void run('settle', {}, t(dict, 'cr.y.settled'))} data-testid="payout-settle">
            {t(dict, 'cr.y.settle')}
          </button>
        ) : null}
        {canClose && !closing ? (
          <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => setClosing(true)} data-testid="payout-close">
            {t(dict, 'cr.y.close')}
          </button>
        ) : null}
      </span>
      {closing ? (
        <span className="a2-stack" style={{ gap: 4 }}>
          <label className="a2-xs a2-mute" htmlFor={`${id}-n`}>
            {t(dict, 'cr.y.closeNote')}
          </label>
          <input id={`${id}-n`} className="a2-inp" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="a2-btn sm" disabled={busy || note.trim().length < 5} onClick={() => void run('close', { note: note.trim() }, t(dict, 'cr.y.closed'))}>
            {t(dict, 'cr.y.closeGo')}
          </button>
        </span>
      ) : null}
      {msg ? (
        <span className="a2-note bad" role="alert">
          {msg}
        </span>
      ) : null}
    </span>
  );
}
