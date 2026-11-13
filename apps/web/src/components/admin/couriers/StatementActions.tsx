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
