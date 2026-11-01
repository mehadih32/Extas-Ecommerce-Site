'use client';
// PR 144 follow-up (go-live gate customer 360°, 1 Nov; CN-020 (5), SIM-F-056) — "Cancel this order" on the order page.
// The cancel itself was built with PR 144 (POST /api/account/cancel, @extas/orders customerCancel); the page had no
// button. The card follows the owner's rule as it stands (`orders.cancel.customer`, by default one tap until the team
// confirms, then a request the team answers, never after booking): the server reads the mode for this order and the
// card shows the matching button, or the "you asked" line. A press asks for one of the owner's reasons
// (`orders.cancel.customerReasons`) and an optional note, then a second, clear "Yes" — nothing happens on the first tap.
// The order service checks the window again under the order's lock. A cancel never sends money back by itself: on a
// paid order it records a refund request that the team approves (PR 144 / 172, SIM-F-041), and the card says so.
// Every word comes from the shop dictionary (`account.cancel.*`); the reasons are the owner's, in the page's language.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../Icon';
import { showToast } from '../toast';

export type CancelMode = 'tap' | 'request' | 'requested';

export interface OrderCancelCardProps {
  words: Record<string, string>;
  number: string;
  mode: CancelMode;
  /** The owner's reasons in the page's language. */
  reasons: { key: string; label: string }[];
  /** The order has money paid in: the card says a refund is checked before it is sent. */
  paid: boolean;
}

/** The error codes after which the page is read again (the order moved on while he looked). */
const MOVED_ON = new Set(['CANCEL_NOT_ALLOWED', 'CANCEL_REQUESTED', 'ILLEGAL_TRANSITION', 'NOT_FOUND']);

export function OrderCancelCard(p: OrderCancelCardProps) {
  const w = (k: string) => p.words[k] ?? k;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const request = p.mode === 'request';

  const send = async (el: HTMLElement) => {
    if (!reason) return setErr(w('reasonErr'));
    setBusy(true);
    setErr(null);
    let payload: Record<string, unknown> = {};
    try {
      const res = await fetch('/api/account/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ number: p.number, reasonKey: reason, ...(note.trim() ? { note: note.trim() } : {}) }) });
      payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    setBusy(false);
    if (payload.ok === true) {
      showToast(el, w(payload.outcome === 'requested' ? 'doneRequest' : 'done'));
      setOpen(false);
      return router.refresh();
    }
    const code = String(payload.error ?? '');
    if (code === 'REASON_REQUIRED') return setErr(w('reasonErr'));
    if (MOVED_ON.has(code)) {
      setErr(w('err'));
      return router.refresh();
    }
    setErr(w('offline'));
  };

  return (
    <section className="card p20 ord-edit ord-cancel" aria-labelledby="oc-h" data-testid="order-cancel" data-mode={p.mode}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div className="ord-edit-t">
          <h2 className="h3" id="oc-h">
            {w('title')}
          </h2>
          <div className="small text2" style={{ marginTop: 3 }}>
            {w(p.mode === 'requested' ? 'requested' : request ? 'requestText' : 'tapText')}
          </div>
        </div>
        {p.mode !== 'requested' && !open ? (
          <button type="button" className="btn btn-secondary ord-edit-b" data-testid="order-cancel-open" onClick={() => setOpen(true)}>
            <Icon name="close" size={16} />
            {w(request ? 'openRequest' : 'open')}
          </button>
        ) : null}
      </div>
      {p.mode !== 'requested' && open ? (
        <form
          className="stack s12 mt12"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send(e.currentTarget);
          }}
        >
          <fieldset className="exc-fs">
            <legend className="small bold">{w('reasonAsk')}</legend>
            <div className="mt8">
              {p.reasons.map((r) => (
                <label key={r.key} className={`exc-opt${reason === r.key ? ' on' : ''}`} data-testid="order-cancel-reason">
                  <input type="radio" name="oc-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} />
                  <span className="grow small bold">{r.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="oc-note">
              {w('note')}
            </label>
            <textarea id="oc-note" className="input" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {p.paid ? (
            <div className="soft xs text2" data-testid="order-cancel-paid">
              {w('paid')}
            </div>
          ) : null}
          <div role="alert">{err ? <div className="acc-err">{err}</div> : null}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined} data-testid="order-cancel-confirm">
              {w(request ? 'confirmRequest' : 'confirm')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
            >
              {w('keep')}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
