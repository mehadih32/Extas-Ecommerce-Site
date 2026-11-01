'use client';
// S14 · PR 296 — "Turn N points into ৳X": the customer's own press in My account › Rewards (POST /api/account/points with
// this press's own key, so a double press is one turn-in). The words come filled from the server; on success the page
// is read again, so the balance, the history and the wallet show the new figures.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface RedeemWords {
  button: string;
  busy: string;
  done: string;
  NOT_ENOUGH_POINTS: string;
  SWITCHED_OFF: string;
  error: string;
}

export function RedeemPoints({ words }: { words: RedeemWords }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const press = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch('/api/account/points', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setMsg({ ok: false, text: data.error === 'NOT_ENOUGH_POINTS' ? words.NOT_ENOUGH_POINTS : data.error === 'SWITCHED_OFF' ? words.SWITCHED_OFF : words.error });
        return;
      }
      setMsg({ ok: true, text: words.done });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: words.error });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt12">
      <button type="button" className="btn btn-primary" onClick={press} disabled={busy} aria-busy={busy || undefined} data-testid="acc-redeem">
        {busy ? words.busy : words.button}
      </button>
      {msg ? (
        <p className={`small${msg.ok ? '' : ' err'}`} role={msg.ok ? 'status' : 'alert'} style={{ margin: '8px 0 0' }} data-testid="acc-redeem-msg">
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
