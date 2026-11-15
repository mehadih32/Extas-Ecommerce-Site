'use client';
// S28 · PR 675 — the one button of Courier 360 › Money and the monthly statement: "Accept the courier figure" on a statement
// line whose only difference is a courier charge higher than ours. It asks first (the amount to be booked is named), then books
// the part above ours as a courier cost and resolves the line. A refusal is words from `cr.z.err.<code>` (the books' own answer
// when it did not take the cost), never the server's. Nothing is paid or moved.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { t, type Dict } from '@/lib/i18n';

export function AcceptFigure({ dict, lineId, amount }: { dict: Dict; lineId: string; amount: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    if (!window.confirm(t(dict, 'cr.z.confirm', { amount }))) return;
    setBusy(true);
    setMsg(null);
    let data: { ok?: boolean; error?: string; data?: { status?: string } } = { ok: false, error: 'other' };
    try {
      const res = await fetch(`/api/admin/delivery/statement-lines/${lineId}/accept`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      data = (await res.json().catch(() => data)) as typeof data;
    } catch {
      data = { ok: false, error: 'network' };
    }
    setBusy(false);
    if (!data.ok) {
      const k = data.error === 'COST_NOT_BOOKED' ? `cr.z.err.books.${data.data?.status ?? 'other'}` : `cr.z.err.${data.error ?? 'other'}`;
      const text = t(dict, k);
      return setMsg(text === k ? t(dict, 'cr.z.err.other') : text);
    }
    showToast({ text: t(dict, 'cr.z.done'), tone: 'ok' });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className="a2-btn sm" onClick={go} disabled={busy} data-testid="accept-figure">
        {t(dict, 'cr.z.accept')}
      </button>
      {msg ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {msg}
        </span>
      ) : null}
    </span>
  );
}

/** PR 838: "Mark resolved" — a statement line that does not match is closed with a short note (min 3 letters); nothing is paid or moved. */
export function ResolveLine({ dict, lineId }: { dict: Dict; lineId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async () => {
    const note = window.prompt(t(dict, 'cr.z.resolveAsk'));
    if (note === null) return;
    if (note.trim().length < 3) return setMsg(t(dict, 'cr.z.resolveNote'));
    setBusy(true);
    setMsg(null);
    let data: { ok?: boolean; error?: string } = { ok: false, error: 'other' };
    try {
      const res = await fetch(`/api/admin/payments/settlements/lines/${lineId}/resolve`, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: note.trim() }),
      });
      data = (await res.json().catch(() => data)) as typeof data;
    } catch {
      data = { ok: false, error: 'network' };
    }
    setBusy(false);
    if (!data.ok) {
      const k = `cr.z.err.${data.error ?? 'other'}`;
      const text = t(dict, k);
      return setMsg(text === k ? t(dict, 'cr.z.err.other') : text);
    }
    showToast({ text: t(dict, 'cr.z.resolved'), tone: 'ok' });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className="a2-btn sm" onClick={go} disabled={busy} data-testid="resolve-line">
        {t(dict, 'cr.z.resolve')}
      </button>
      {msg ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {msg}
        </span>
      ) : null}
    </span>
  );
}

/**
 * PR 849 (prototype "Raise claim"): a statement line that does not match becomes one claim against the courier, for the part we
 * are short (cash expected minus cash paid) or the charge above ours. It asks first, names the amount, and records the claim
 * (the claims page follows it; nothing is paid or moved). One request key per line, so a double tap is one claim.
 */
export function RaiseClaimLine({ dict, shipmentId, kind, amountMinor, amount, note }: { dict: Dict; shipmentId: string; kind: 'SHORT_COD' | 'OTHER'; amountMinor: number; amount: string; note: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [key] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`));
  const go = async () => {
    if (!window.confirm(t(dict, 'cr.z.claimConfirm', { amount }))) return;
    setBusy(true);
    setMsg(null);
    let data: { ok?: boolean; error?: string } = { ok: false, error: 'other' };
    try {
      const res = await fetch('/api/admin/delivery/claims', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify({ shipmentId, kind, amountMinor, note }),
      });
      data = (await res.json().catch(() => data)) as typeof data;
    } catch {
      data = { ok: false, error: 'network' };
    }
    setBusy(false);
    if (!data.ok) {
      const k = `cr.z.err.${data.error ?? 'other'}`;
      const text = t(dict, k);
      return setMsg(text === k ? t(dict, 'cr.z.err.other') : text);
    }
    showToast({ text: t(dict, 'cr.z.claimed'), tone: 'ok' });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className="a2-btn sm pri" onClick={go} disabled={busy} data-testid="raise-claim-line">
        {t(dict, 'cr.z.claim')}
      </button>
      {msg ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {msg}
        </span>
      ) : null}
    </span>
  );
}
