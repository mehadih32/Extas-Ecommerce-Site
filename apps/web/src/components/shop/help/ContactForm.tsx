'use client';
// PR 75 follow-up (go-live gate customer 360°, 1 Nov) — "Send us a message" on the contact page (demo 71-pages.js
// pg_contact: name, phone, order number, "How can we help?", "Send message" and the reply line). Shown only when the
// shop switched it on (`pages.contactForm`); the message lands in the Support inbox (POST /api/shop/contact). The phone
// box uses the one shared cleaner (lib/phone-bd) and writes back what it read. One id per filled-in form, so a double tap
// or a retry is one message. Switched off meanwhile, or too many today: a calm line, never an error screen.
import { useRef, useState } from 'react';
import { phoneNormalizeBD } from '@/lib/phone-bd';
import type { ContactFormWords } from '@/lib/shop/contact-form-words';
import { fillWords } from '@/lib/shop/product-model';

const PHONE_WORD = { empty: 'phoneEmpty', short: 'phoneShort', prefix: 'phonePrefix' } as const;

/** One id for a filled-in form (kept across a retry of the same message). */
function newKey(): string {
  const c = globalThis.crypto;
  return c?.randomUUID ? c.randomUUID() : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function ContactForm({ words, lang, maxChars }: { words: ContactFormWords; lang: string; maxChars: number }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; field: 'phone' | 'msg' | null } | null>(null);
  const key = useRef<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const field = (id: string) => f.elements.namedItem(id) as HTMLInputElement | HTMLTextAreaElement | null;
    const phoneBox = field('ct-phone');
    const textBox = field('ct-msg');
    const p = phoneNormalizeBD(phoneBox?.value);
    if (!p.ok) {
      if (phoneBox && p.reason !== 'empty') phoneBox.value = p.digits;
      setMsg({ text: words[PHONE_WORD[p.reason ?? 'empty']], field: 'phone' });
      phoneBox?.focus();
      return;
    }
    if (phoneBox) phoneBox.value = p.digits;
    const text = (textBox?.value ?? '').trim();
    if (!text) {
      setMsg({ text: words.msgEmpty, field: 'msg' });
      textBox?.focus();
      return;
    }
    if (text.length > maxChars) {
      setMsg({ text: fillWords(words.tooLong, { max: String(maxChars) }), field: 'msg' });
      textBox?.focus();
      return;
    }
    key.current ??= newKey();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/shop/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: field('ct-name')?.value ?? '', phone: p.e164, orderNumber: field('ct-order')?.value ?? '', text, requestKey: key.current, lang }),
      });
      const r = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (r?.ok) {
        key.current = null;
        setSent(fillWords(words.done, { number: p.nice }));
      } else if (r?.error === 'CONTACT_FORM_OFF') setMsg({ text: words.off, field: null });
      else if (r?.error === 'TOO_MANY') setMsg({ text: words.tooMany, field: null });
      else setMsg({ text: words.err, field: null });
    } catch {
      setMsg({ text: words.err, field: null });
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="card pg-form" data-testid="help-contact-form" data-state="sent">
        <div className="h3">{words.title}</div>
        <p className="small" role="status" aria-live="polite" data-testid="help-contact-done">
          {sent}
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            setSent(null);
            setMsg(null);
          }}
        >
          {words.again}
        </button>
      </div>
    );
  }

  return (
    <div className="card pg-form" data-testid="help-contact-form">
      <div className="h3">{words.title}</div>
      <form className="pg-form-f" noValidate onSubmit={submit}>
        <div>
          <label className="label" htmlFor="ct-name">
            {words.name}
          </label>
          <input id="ct-name" className="input" autoComplete="name" maxLength={120} />
        </div>
        <div>
          <label className="label" htmlFor="ct-phone">
            {words.phone}
          </label>
          <input
            id="ct-phone"
            className="input"
            type="tel"
            inputMode="tel"
            placeholder={words.phonePh}
            autoComplete="tel"
            aria-describedby="ct-phone-msg"
            aria-invalid={msg?.field === 'phone' || undefined}
            onBlur={(e) => {
              const r = phoneNormalizeBD(e.currentTarget.value);
              if (r.reason !== 'empty') e.currentTarget.value = r.digits;
            }}
          />
          <div id="ct-phone-msg" className="xs pg-form-bad" aria-live="polite">
            {msg?.field === 'phone' ? msg.text : ''}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ct-order">
            {words.order}
          </label>
          <input id="ct-order" className="input" autoComplete="off" maxLength={40} />
        </div>
        <div>
          <label className="label" htmlFor="ct-msg">
            {words.msg}
          </label>
          <textarea id="ct-msg" className="input" rows={4} maxLength={maxChars} aria-describedby="ct-msg-msg" aria-invalid={msg?.field === 'msg' || undefined} />
          <div id="ct-msg-msg" className="xs pg-form-bad" aria-live="polite">
            {msg?.field === 'msg' ? msg.text : ''}
          </div>
        </div>
        <button className="btn btn-primary btn-block" type="submit" aria-busy={busy || undefined} disabled={busy}>
          {busy ? words.sending : words.send}
        </button>
        <div className="xs muted" role="status" aria-live="polite" data-testid="help-contact-note">
          {msg && msg.field === null ? msg.text : words.note}
        </div>
      </form>
    </div>
  );
}
