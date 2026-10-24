'use client';
// PR 606 — the bulk / corporate enquiry form: name, mobile, company, e-mail, what and how many, "with our logo", needed
// by and a note. It checks with the same pure rules as the server (checkBulk) before it sends, puts the problem under
// its own box, and on success shows the enquiry's number in place of the form. Words come from the page (shop-bulk
// dictionary), already filled with the owner's numbers in the visitor's digits.
import { useRef, useState } from 'react';
import { checkBulk, type BulkField, type BulkLimits, type BulkProblem, type BulkSource } from '@extas/checkout/pure';
import { Icon } from '../Icon';

export type BulkWords = Record<string, string>;

interface Props {
  words: BulkWords;
  limits: BulkLimits;
  lang: 'en' | 'bn';
  source: BulkSource;
  withBag: boolean;
  logoOffered: boolean;
  homeHref: string;
}

type Form = { name: string; phone: string; company: string; email: string; itemsText: string; quantity: string; logo: boolean; neededBy: string; note: string };
const EMPTY: Form = { name: '', phone: '', company: '', email: '', itemsText: '', quantity: '', logo: false, neededBy: '', note: '' };

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

export function BulkForm({ words: w, limits, lang, source, withBag, logoOffered, homeHref }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [bad, setBad] = useState<{ field: BulkField | 'form'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ref: string; name: string; phone: string } | null>(null);
  const root = useRef<HTMLFormElement>(null);

  const say = (problem: BulkProblem): string => {
    if (problem === 'few') return limits.minQuantity !== null ? w['err.fewMin']! : w['err.few']!;
    return w[`err.${problem}`] ?? w['err.empty']!;
  };
  const show = (field: BulkField | 'form', text: string) => {
    setBad({ field, text });
    if (field !== 'form') requestAnimationFrame(() => (root.current?.querySelector(`[name="${field}"]`) as HTMLElement | null)?.focus());
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (bad && bad.field === k) setBad(null);
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const check = checkBulk(form, limits);
    if (!check.ok) return show(check.field, say(check.problem));
    setBusy(true);
    setBad(null);
    try {
      const r = await fetch('/api/shop/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, lang, source, withBag }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; ref?: string; error?: string; field?: BulkField; problem?: BulkProblem };
      if (r.ok && j.ok && j.ref) {
        setDone({ ref: j.ref, name: check.value.name, phone: form.phone.trim() });
        requestAnimationFrame(() => root.current?.parentElement?.scrollIntoView({ block: 'start' }));
        return;
      }
      if (j.error === 'FORM' && j.field && j.problem) return show(j.field, say(j.problem));
      show('form', j.error === 'TOO_MANY' ? w['err.tooMany']! : j.error === 'NOT_OPEN' ? w['err.closed']! : w['err.offline']!);
    } catch {
      show('form', w['err.offline']!);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card bk-done" role="status" data-testid="bulk-done">
        <span className="bk-done-ic">
          <Icon name="check" size={22} />
        </span>
        <h2 className="h2">{fill(w.doneTitle!, { ref: done.ref })}</h2>
        <p className="small text2">{fill(w.doneText!, { name: done.name, phone: done.phone })}</p>
        <a className="btn btn-secondary bk-done-back" href={homeHref}>
          {w.doneBack}
        </a>
      </div>
    );
  }

  const err = (f: BulkField) =>
    bad?.field === f ? (
      <p className="bk-err" id={`bk-err-${f}`} role="alert" data-testid={`bulk-err-${f}`}>
        {bad.text}
      </p>
    ) : null;
  const aria = (f: BulkField, hint?: string) => ({
    'aria-invalid': bad?.field === f ? true : undefined,
    'aria-describedby': [hint, bad?.field === f ? `bk-err-${f}` : null].filter(Boolean).join(' ') || undefined,
  });

  return (
    <form ref={root} className="card bk-form" noValidate onSubmit={send} data-testid="bulk-form">
      <div className="bk-f">
        <label className="label" htmlFor="bk-name">
          {w.name}
        </label>
        <input
          id="bk-name"
          name="name"
          className="input"
          autoComplete="name"
          enterKeyHint="next"
          maxLength={limits.textMax}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          {...aria('name')}
        />
        {err('name')}
      </div>
      <div className="bk-f">
        <label className="label" htmlFor="bk-phone">
          {w.phone}
        </label>
        <input
          id="bk-phone"
          name="phone"
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          maxLength={24}
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          {...aria('phone', 'bk-phone-hint')}
        />
        <span className="xs muted bk-hint" id="bk-phone-hint">
          {w.phoneHint}
        </span>
        {err('phone')}
      </div>
      <div className="bk-two">
        <div className="bk-f">
          <label className="label" htmlFor="bk-company">
            {w.company}
          </label>
          <input
            id="bk-company"
            name="company"
            className="input"
            autoComplete="organization"
            maxLength={limits.textMax}
            value={form.company}
            onChange={(e) => set('company', e.target.value)}
            {...aria('company')}
          />
          {err('company')}
        </div>
        <div className="bk-f">
          <label className="label" htmlFor="bk-email">
            {w.email}
          </label>
          <input
            id="bk-email"
            name="email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            {...aria('email')}
          />
          {err('email')}
        </div>
      </div>
      <div className="bk-f">
        <label className="label" htmlFor="bk-items">
          {limits.hasBagLines ? w.itemsOptional : w.items}
        </label>
        <textarea
          id="bk-items"
          name="itemsText"
          className="input bk-area"
          rows={3}
          maxLength={limits.textMax}
          placeholder={w.itemsHint}
          value={form.itemsText}
          onChange={(e) => set('itemsText', e.target.value)}
          {...aria('itemsText')}
        />
        {err('itemsText')}
      </div>
      <div className="bk-two">
        <div className="bk-f">
          <label className="label" htmlFor="bk-qty">
            {w.quantity}
          </label>
          <input
            id="bk-qty"
            name="quantity"
            className="input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={12}
            value={form.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            {...aria('quantity', limits.minQuantity !== null ? 'bk-qty-hint' : undefined)}
            data-testid="bulk-qty"
          />
          {limits.minQuantity !== null ? (
            <span className="xs muted bk-hint" id="bk-qty-hint">
              {w.quantityMin}
            </span>
          ) : null}
          {err('quantity')}
        </div>
        <div className="bk-f">
          <label className="label" htmlFor="bk-date">
            {w.neededBy}
          </label>
          <input id="bk-date" name="neededBy" className="input" type="date" min={limits.today} value={form.neededBy} onChange={(e) => set('neededBy', e.target.value)} {...aria('neededBy')} />
          {err('neededBy')}
        </div>
      </div>
      {logoOffered ? (
        <label className="bk-check" data-testid="bulk-logo">
          <input type="checkbox" name="logo" checked={form.logo} onChange={(e) => set('logo', e.target.checked)} />
          <span>{w.logo}</span>
        </label>
      ) : null}
      <div className="bk-f">
        <label className="label" htmlFor="bk-note">
          {w.note}
        </label>
        <textarea id="bk-note" name="note" className="input bk-area" rows={2} maxLength={limits.noteMax} value={form.note} onChange={(e) => set('note', e.target.value)} {...aria('note')} />
        {err('note')}
      </div>
      {bad?.field === 'form' ? (
        <p className="bk-err bk-err-form" role="alert" data-testid="bulk-err-form">
          {bad.text}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy || undefined} data-testid="bulk-send">
        {busy ? w.sending : w.send}
      </button>
    </form>
  );
}
