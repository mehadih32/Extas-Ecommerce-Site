'use client';
// S14 · PR 295 — one review's buttons on Products › Reviews: publish, hide, refuse, back to the queue, and the verified
// mark. Each calls the reviews API (PR 65), which checks `reviews.moderate` again; publishing a photo review pays the
// owner's photo reward only while he has switched it on with his own amount, and the answer says what went to the
// wallet. Shown only to someone with `reviews.moderate`.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';

type State = 'PENDING' | 'APPROVED' | 'HIDDEN' | 'REJECTED';
type Action = 'approve' | 'hide' | 'reject' | 'restore';

/** The moves that make sense from each state (the API itself allows any). */
export const ACTIONS: Record<State, Action[]> = {
  PENDING: ['approve', 'hide', 'reject'],
  APPROVED: ['hide'],
  HIDDEN: ['approve', 'restore'],
  REJECTED: ['restore'],
};

export interface ReviewActionsProps {
  dict: Dict;
  id: string;
  state: State;
  verified: boolean;
  /** The store's money format for the reward line. */
  currency: string;
  locale: string;
}

export function ReviewActions({ dict: d, id, state, verified, currency, locale }: ReviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2, numberingSystem: 'latn' }).format(minor / 100);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/${path}`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; reward?: { amountMinor: number } | null };
      if (!data.ok) return setMsg({ ok: false, text: t(d, 'rev.act.failed', { code: data.error ?? String(res.status) }) });
      setMsg({ ok: true, text: data.reward ? t(d, 'rev.act.paid', { amount: money(data.reward.amountMinor) }) : t(d, 'rev.act.saved') });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: t(d, 'rev.act.failed', { code: 'network' }) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rev-acts" data-testid="review-actions">
      {ACTIONS[state].map((a) => (
        <button key={a} type="button" className={`a2-btn${a === 'approve' ? ' pri' : ''}`} disabled={busy} onClick={() => post('moderate', { action: a })} data-action={a}>
          {t(d, `rev.act.${a}`)}
        </button>
      ))}
      <button type="button" className="a2-btn" disabled={busy} onClick={() => post('verified', { verified: !verified })} data-action={verified ? 'unverify' : 'verify'}>
        {t(d, verified ? 'rev.act.unverify' : 'rev.act.verify')}
      </button>
      {msg ? (
        <p className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
