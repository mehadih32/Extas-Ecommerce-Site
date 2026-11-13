'use client';
// S28 · PR 668 — Orders › Incomplete, one row's contact tools for a person with `orders.confirm`: "Log a call" (what the
// call found), the four ready messages (opened in WhatsApp or SMS with the words in the box: a person presses send; the
// offer one needs the offer words typed and `rules.approve`), and "Confirm as order" (the same checkout as the website,
// Cash on Delivery only). POST to /api/admin/orders/incomplete. Nothing is sent from here and no money moves.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';

export interface IncompleteContactTexts {
  logCall: string;
  outcomeLabel: string;
  outcomes: Record<string, string>;
  noteLabel: string;
  save: string;
  cancel: string;
  message: string;
  templates: Record<string, string>;
  offerLabel: string;
  offerPlaceholder: string;
  warn: string;
  openWhatsApp: string;
  openSms: string;
  confirmOrder: string;
  confirmAsk: string;
  confirmYes: string;
  done: string;
  ordered: string;
  err: Record<string, string>;
}

type Open = null | 'call' | 'message' | 'order';

export function IncompleteContact({
  url,
  id,
  outcomes,
  templates,
  canOffer,
  noteMax,
  texts: x,
}: {
  url: string;
  id: string;
  outcomes: readonly string[];
  templates: readonly string[];
  canOffer: boolean;
  noteMax: number;
  texts: IncompleteContactTexts;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState<Open>(null);
  const [outcome, setOutcome] = useState(outcomes[0] ?? '');
  const [note, setNote] = useState('');
  const [tpl, setTpl] = useState(templates[0] ?? '');
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ whatsapp: string; sms: string } | null>(null);
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  async function go(payload: Record<string, unknown>, ok: string): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setOut(null);
    const a = await call('POST', url, { id, ...payload });
    setBusy(false);
    if (a.status !== 200) {
      const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
      setOut({ text: x.err[code] ?? x.err.other ?? code, bad: true });
      return null;
    }
    setOut({ text: ok, bad: false });
    router.refresh();
    return a.data as Record<string, unknown>;
  }
  const choices = templates.filter((k) => k !== 'offer' || canOffer);
  return (
    <div className="inc-act" data-testid="inc-contact">
      <div className="inc-row">
        <button type="button" className="a2-btn" disabled={busy} onClick={() => (setOut(null), setOpen(open === 'call' ? null : 'call'))} data-testid="inc-logcall">
          {x.logCall}
        </button>
        <button type="button" className="a2-btn" disabled={busy} onClick={() => (setOut(null), setLinks(null), setOpen(open === 'message' ? null : 'message'))} data-testid="inc-message">
          {x.message}
        </button>
        <button type="button" className="a2-btn pri" disabled={busy} onClick={() => (setOut(null), setOpen(open === 'order' ? null : 'order'))} data-testid="inc-confirm-order">
          {x.confirmOrder}
        </button>
      </div>
      {open === 'call' ? (
        <div className="inc-note">
          <label className="a2-lbl" htmlFor={`${uid}-o`}>
            {x.outcomeLabel}
          </label>
          <select id={`${uid}-o`} className="a2-sel" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {outcomes.map((k) => (
              <option key={k} value={k}>
                {x.outcomes[k] ?? k}
              </option>
            ))}
          </select>
          <label className="a2-lbl" htmlFor={`${uid}-n`}>
            {x.noteLabel}
          </label>
          <textarea id={`${uid}-n`} className="a2-ta" rows={2} maxLength={noteMax} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="inc-row">
            <button
              type="button"
              className="a2-btn pri"
              disabled={busy}
              onClick={async () => {
                if (await go({ action: 'call', outcome, note }, x.done)) (setOpen(null), setNote(''));
              }}
              data-testid="inc-call-save"
            >
              {x.save}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(null)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {open === 'message' ? (
        <div className="inc-note">
          <p className="a2-sm a2-mute" role="note">
            {x.warn}
          </p>
          <label className="a2-lbl" htmlFor={`${uid}-t`}>
            {x.message}
          </label>
          <select id={`${uid}-t`} className="a2-sel" value={tpl} onChange={(e) => (setTpl(e.target.value), setLinks(null))}>
            {choices.map((k) => (
              <option key={k} value={k}>
                {x.templates[k] ?? k}
              </option>
            ))}
          </select>
          {tpl === 'offer' ? (
            <>
              <label className="a2-lbl" htmlFor={`${uid}-f`}>
                {x.offerLabel}
              </label>
              <input id={`${uid}-f`} className="a2-in" maxLength={120} value={offer} placeholder={x.offerPlaceholder} onChange={(e) => setOffer(e.target.value)} />
            </>
          ) : null}
          {links ? (
            <div className="inc-row">
              <a className="a2-btn pri" href={links.whatsapp} target="_blank" rel="noopener noreferrer" data-testid="inc-open-wa">
                {x.openWhatsApp}
              </a>
              <a className="a2-btn" href={links.sms} data-testid="inc-open-sms">
                {x.openSms}
              </a>
            </div>
          ) : (
            <button
              type="button"
              className="a2-btn pri"
              disabled={busy || (tpl === 'offer' && !offer.trim())}
              onClick={async () => {
                const r = await go({ action: 'message', template: tpl, offer }, x.done);
                if (r && typeof r.whatsapp === 'string' && typeof r.sms === 'string') setLinks({ whatsapp: r.whatsapp, sms: r.sms });
              }}
              data-testid="inc-message-make"
            >
              {x.save}
            </button>
          )}
        </div>
      ) : null}
      {open === 'order' ? (
        <div className="inc-note" data-testid="inc-order-ask">
          <p className="a2-sm">{x.confirmAsk}</p>
          <div className="inc-row">
            <button
              type="button"
              className="a2-btn pri"
              disabled={busy}
              onClick={async () => {
                if (await go({ action: 'confirmOrder' }, x.ordered)) setOpen(null);
              }}
              data-testid="inc-order-yes"
            >
              {x.confirmYes}
            </button>
            <button type="button" className="a2-btn" disabled={busy} onClick={() => setOpen(null)}>
              {x.cancel}
            </button>
          </div>
        </div>
      ) : null}
      {out ? (
        <span className={`a2-sm${out.bad ? ' inc-bad' : ''}`} role="status" aria-live="polite" data-testid="inc-contact-said">
          {out.text}
        </span>
      ) : null}
    </div>
  );
}
