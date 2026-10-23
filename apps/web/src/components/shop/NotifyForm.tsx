'use client';
// SIM-F-035 (PR 56, with PR 36's request) — "tell me when it is back": the shopper leaves a mobile number and the request
// lands in the admin's back-in-stock list (`/api/back-in-stock`, PR 36). The one shared cleaner (lib/phone-bd) reads the
// number, as every phone box does. PR 71: one form for the product page (PdpNotify) and the wishlist's sold-out items;
// whether it shows is `pdp.size.notifyBack` (off until the answer is sent, PROGRESS follow-up 63).
import './notify.css';
import { useState } from 'react';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import { fillWords } from '@/lib/shop/product-model';

/** The form's words (the shop dictionary's `pdp.notify.*`). */
export type NotifyWords = Record<'title' | 'placeholder' | 'button' | 'close' | 'done' | 'error' | 'empty' | 'short' | 'prefix', string>;

export function NotifyForm({ productId, variantId, what, words, onClose }: { productId: string; variantId: string | null; what: string; words: NotifyWords; onClose?: () => void }) {
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = `pdp-notify-${variantId ?? productId}`;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inp = e.currentTarget.querySelector<HTMLInputElement>('input[type="tel"]');
    const r = phoneNormalizeBD(inp?.value);
    if (!r.ok) {
      if (inp && r.reason !== 'empty') inp.value = r.digits;
      setMsg({ text: words[r.reason ?? 'empty'], bad: true });
      inp?.focus();
      return;
    }
    if (inp) inp.value = r.digits;
    setBusy(true);
    try {
      const res = await fetch('/api/back-in-stock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, variantId, phone: r.e164 }),
      });
      setMsg(res.ok ? { text: fillWords(words.done, { number: r.nice }), bad: false } : { text: words.error, bad: true });
    } catch {
      setMsg({ text: words.error, bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pdp-notify" data-testid="pdp-notify" noValidate onSubmit={submit}>
      <label className="pdp-notify-l" htmlFor={id}>
        {fillWords(words.title, { what })}
      </label>
      <div className="pdp-notify-row">
        <input
          id={id}
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder={words.placeholder}
          aria-describedby={`${id}-msg`}
          aria-invalid={msg?.bad || undefined}
          onBlur={(e) => {
            const r = phoneNormalizeBD(e.currentTarget.value);
            if (r.reason !== 'empty') e.currentTarget.value = r.digits;
          }}
        />
        <button className="btn btn-primary" aria-busy={busy || undefined} disabled={busy}>
          {words.button}
        </button>
        {onClose ? (
          <button type="button" className="btn btn-ghost pdp-notify-x" onClick={onClose}>
            {words.close}
          </button>
        ) : null}
      </div>
      <div className={`pdp-notify-msg small${msg?.bad ? ' bad' : ''}`} id={`${id}-msg`} role="status" aria-live="polite">
        {msg?.text ?? ''}
      </div>
    </form>
  );
}
