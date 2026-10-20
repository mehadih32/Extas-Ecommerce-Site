'use client';
// PR 40 — "Get new drops first" in the footer. The phone field raises the number pad (H8). The sign-up list itself
// is the CRM's (S12); until it exists the form runs on a mock (A1.3): it thanks the customer and keeps nothing.
// H14 / K10 (CN-008): ~~pattern="[0-9+\- ]*"~~ no pattern — a number typed in Bengali digits or with +880 must never be
// refused by the browser. The one shared cleaner (lib/phone-bd) runs when the field is left and on Join: the cleaned
// number is written back, and only an impossible number gets one plain line (the reference footer shows it under
// the field; the other footers show it as a toast, as the demo does).
import { useState } from 'react';
import { phoneNormalizeBD, type PhoneProblem } from '@/lib/phone-bd';
import { Icon } from './Icon';
import { showToast } from './toast';

export interface JoinWords {
  label: string;
  placeholder: string;
  button: string;
  note: string;
  /** "Thanks — new drops will come to {number}". */
  thanksTo: string;
  problems: Record<PhoneProblem, string>;
}

export function JoinForm({ id, variant, words }: { id: string; variant: 'phone' | 'desk' | 'ref'; words: JoinWords }) {
  const [msg, setMsg] = useState<{ text: string; bad: boolean }>({ text: '', bad: false });
  const inline = variant === 'ref';
  const say = (f: HTMLFormElement, text: string, bad: boolean) => {
    if (inline) setMsg({ text, bad });
    else if (text) showToast(f, text);
  };
  const clean = (e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const r = phoneNormalizeBD(el.value);
    if (r.reason === 'empty') {
      if (inline) setMsg({ text: '', bad: false });
      return;
    }
    el.value = r.digits;
    if (inline) setMsg({ text: r.ok ? '' : words.problems[r.reason!], bad: !r.ok });
  };
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const inp = f.querySelector<HTMLInputElement>('input[type="tel"]');
    const r = phoneNormalizeBD(inp?.value);
    if (!r.ok) {
      if (inp && r.reason !== 'empty') inp.value = r.digits;
      say(f, words.problems[r.reason!], true);
      inp?.focus();
      return;
    }
    say(f, '', false);
    showToast(f, words.thanksTo.replace('{number}', r.nice));
    f.reset();
  };
  const bad = inline && msg.bad;
  const input = (
    <input
      id={id}
      className="input"
      type="tel"
      inputMode={variant === 'phone' ? 'numeric' : 'tel'}
      autoComplete="tel"
      placeholder={words.placeholder}
      aria-label={words.placeholder}
      aria-describedby={inline ? `${id}-msg` : undefined}
      aria-invalid={bad ? 'true' : undefined}
      onBlur={clean}
    />
  );
  if (variant === 'ref') {
    return (
      <form data-submit="join" className="fdr-join" noValidate onSubmit={submit}>
        <label className="fdr-lbl" htmlFor={id}>
          {words.label}
        </label>
        <div className="fdr-row">
          {input}
          <button className="btn fdr-joinbtn">{words.button}</button>
        </div>
        <div className={`fdr-msg${msg.bad ? ' bad' : ''}`} id={`${id}-msg`} role="status" aria-live="polite">
          {msg.text}
        </div>
        <div className="fdr-note">{words.note}</div>
      </form>
    );
  }
  const btn = (
    <button className="btn ftr-joinbtn">
      {words.button}
      <Icon name="right" size={17} />
    </button>
  );
  if (variant === 'desk') {
    return (
      <form data-submit="join" className="ftr-d-form" noValidate onSubmit={submit}>
        <label className="ftr-d-lbl" htmlFor={id}>
          {words.label}
        </label>
        <div className="ftr-d-row">
          {input}
          {btn}
        </div>
        <div className="xs ftr-d-note">{words.note}</div>
      </form>
    );
  }
  return (
    <form data-submit="join" className="ftr-join" noValidate onSubmit={submit}>
      <label className="label" htmlFor={id}>
        {words.label}
      </label>
      <div className="row ftr-joinrow" style={{ gap: 8 }}>
        {input}
        {btn}
      </div>
      <div className="xs mt8 ftr-brand-note">{words.note}</div>
    </form>
  );
}
