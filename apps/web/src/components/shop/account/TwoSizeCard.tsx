'use client';
// Follow-up 261 (PR 146, SIM-F-036) — the two-size question on the order page: his order has two (or more) neighbouring
// sizes of one piece in one colour and he did not say in the bag that they are for different people, so the page asks
// which he wants before packing — "Keep all", or "Only M" (the other sizes are taken out through the one order service:
// the stock let go, the total and the amount to collect lowered by exactly those pieces). With no answer, every piece
// goes. The answer goes through POST /api/account/two-size-answer and the page then reads the order again. Shown only
// while the owner has the follow-up on (`orders.twoSize`, off by default) and the order is not with a courier.
// Every word comes from the shop dictionary (`account.twoSize.*`).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '../Icon';
import { showToast } from '../toast';

export interface TwoSizeQuestion {
  key: string;
  /** "Essential Polo · Navy: S and M. Do you want them all, or only one size?", in the page's words. */
  text: string;
  sizes: { sizeId: string; label: string }[];
}

export function TwoSizeCard({ words, number, questions }: { words: Record<string, string>; number: string; questions: TwoSizeQuestion[] }) {
  const w = (k: string) => words[k] ?? k;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const answer = async (el: HTMLElement, key: string, keep: string) => {
    setBusy(`${key}|${keep}`);
    setErr(null);
    let payload: Record<string, unknown> = {};
    try {
      const res = await fetch('/api/account/two-size-answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ number, key, keep }) });
      payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    setBusy(null);
    if (payload.ok === true) {
      showToast(el, w('done'));
      return router.refresh();
    }
    const code = String(payload.error ?? '');
    if (code === 'EDIT_CLOSED' || code === 'NOTHING_CHANGED' || code === 'BOOKED' || code === 'ILLEGAL_TRANSITION') {
      setErr(w('err'));
      return router.refresh();
    }
    setErr(w('offline'));
  };

  return (
    <section className="card p20 ord-two" aria-labelledby="o2-h" data-testid="order-two-size">
      <div className="row top" style={{ gap: 12 }}>
        <span className="ord-two-i">
          <Icon name="ruler" size={20} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 className="h3" id="o2-h">
            {w('title')}
          </h2>
          <div className="xs muted" style={{ marginTop: 3 }}>
            {w('noAnswer')}
          </div>
        </div>
      </div>
      {questions.map((q) => (
        <div className="ord-two-q" key={q.key} data-testid="order-two-size-q">
          <p className="small" style={{ margin: 0 }}>
            {q.text}
          </p>
          <div className="row wrap mt12" style={{ gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} data-testid="order-two-size-all" onClick={(e) => answer(e.currentTarget, q.key, 'all')}>
              {w('keepAll')}
            </button>
            {q.sizes.map((s) => (
              <button key={s.sizeId} type="button" className="btn btn-secondary btn-sm" disabled={!!busy} data-testid="order-two-size-only" onClick={(e) => answer(e.currentTarget, q.key, s.sizeId)}>
                {w('only').replace('{size}', s.label)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div role="alert">{err ? <div className="acc-err mt12">{err}</div> : null}</div>
    </section>
  );
}
