'use client';
// SIM-F-035 (PR 56, with PR 36's request) — "tell me when it is back" for a size crossed out in the chosen colour, or
// for a product off sale: the shopper leaves a mobile number and the request lands in the admin's back-in-stock list
// (`/api/back-in-stock`, PR 36). Off by default (`pdp.size.notifyBack`): the message that answers it is sent once the
// back-in-stock alerts exist (PR 71), and the words promise only that the shop will tell him. The one shared cleaner
// (lib/phone-bd) reads the number, as every phone box does.
import { useState } from 'react';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import { usePdp } from './PdpRoot';

export function PdpNotify({ variantId, what, onClose }: { variantId: string | null; what: string; onClose?: () => void }) {
  const { m, w } = usePdp();
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `pdp-notify-${variantId ?? 'p'}`;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inp = e.currentTarget.querySelector<HTMLInputElement>('input[type="tel"]');
    const r = phoneNormalizeBD(inp?.value);
    if (!r.ok) {
      if (inp && r.reason !== 'empty') inp.value = r.digits;
      setMsg({ text: w(`notify.${r.reason}`), bad: true });
      inp?.focus();
      return;
    }
    if (inp) inp.value = r.digits;
    setBusy(true);
    try {
      const res = await fetch('/api/back-in-stock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: m.productId, variantId, phone: r.e164 }),
      });
      setMsg(res.ok ? { text: w('notify.done', { number: r.nice }), bad: false } : { text: w('notify.error'), bad: true });
    } catch {
      setMsg({ text: w('notify.error'), bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pdp-notify" data-testid="pdp-notify" noValidate onSubmit={submit}>
      <label className="pdp-notify-l" htmlFor={id}>
        {w('notify.title', { what })}
      </label>
      <div className="pdp-notify-row">
        <input
          id={id}
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={w('notify.placeholder')}
          aria-describedby={`${id}-msg`}
          aria-invalid={msg?.bad || undefined}
          onBlur={(e) => {
            const r = phoneNormalizeBD(e.currentTarget.value);
            if (r.reason !== 'empty') e.currentTarget.value = r.digits;
          }}
        />
        <button className="btn btn-primary" aria-busy={busy || undefined} disabled={busy}>
          {w('notify.button')}
        </button>
        {onClose ? (
          <button type="button" className="btn btn-ghost pdp-notify-x" onClick={onClose}>
            {w('notify.close')}
          </button>
        ) : null}
      </div>
      <div className={`pdp-notify-msg small${msg?.bad ? ' bad' : ''}`} id={`${id}-msg`} role="status" aria-live="polite">
        {msg?.text ?? ''}
      </div>
    </form>
  );
}
