'use client';
// S22 · PR 430 (Blueprint B4.6; SIM-F-024) — the chat's bag beside a conversation: the products the employee dropped in
// from the Products drawer, priced by the shop's own engines (its combos and offers, exactly as on the site), a line's
// quantity and "Take out"; the name, phone and address (filled from the customer, or typed); "Check" prices it for those
// details and shows what the owner's own rule decides: "Create order" (Cash on Delivery), "Take advance" (the order
// waits for the advance the rule asks and its pay link goes into the chat), or no order when Cash on Delivery is closed.
// One press carries one key: pressed twice, it is one order. The server checks the gate, the stock and the price again.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { ChatBag as Bag, ChatQuote } from '@extas/support';
import { call } from '../api';
import { formatMoney, nameIn, type Lang, type Money } from '../products/model';
import { ShellIcon } from '../shell/ShellIcon';

export interface ChatBagTexts {
  h: string;
  d: string;
  empty: string;
  less: string;
  more: string;
  remove: string;
  set: string;
  /** "{amount}" is filled in. */
  saves: string;
  soldOut: string;
  items: string;
  offers: string;
  delivery: string;
  deliveryFree: string;
  deliveryUnknown: string;
  total: string;
  due: string;
  name: string;
  phone: string;
  address: string;
  check: string;
  checking: string;
  create: string;
  creating: string;
  advance: string;
  /** "{amount}" is filled in. */
  advanceLine: string;
  closed: string;
  addressAsk: string;
  /** "{number}" is filled in. */
  made: string;
  madeAdvance: string;
  last: string;
  openOrder: string;
  problem: Record<string, string>;
  err: Record<string, string>;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`);

export function ChatBag({ url, bag: first, lang, money, texts: x }: { url: string; bag: Bag; lang: Lang; money: Money; texts: ChatBagTexts }) {
  const id = useId();
  const router = useRouter();
  const [bag, setBag] = useState<Bag>(first);
  const [form, setForm] = useState(first.prefill);
  const [quote, setQuote] = useState<ChatQuote | null>(null);
  // the page read the bag again (a product added from the drawer, an order made): take the server's bag, keep what was said
  const [seen, setSeen] = useState<Bag>(first);
  if (first !== seen) {
    setSeen(first);
    setBag(first);
    setQuote(null);
  }
  const [busy, setBusy] = useState<'line' | 'check' | 'order' | null>(null);
  const [key, setKey] = useState(newKey);
  const [made, setMade] = useState<{ id: string; number: string; advance: boolean } | null>(null);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const price = (minor: number) => formatMoney(minor, money);
  const err = (a: { status: number; data: Record<string, unknown> }) => {
    if (a.status === 0) return x.err.network ?? '';
    const code = String(a.data.error ?? 'other');
    const inner = (a.data.data as { code?: string } | undefined)?.code;
    return (inner && x.err[`CHECKOUT_${inner}`]) || x.err[code] || x.err.other || '';
  };

  async function line(payload: Record<string, unknown>) {
    setBusy('line');
    setSaid(null);
    const a = await call('POST', url, { ...payload, lang });
    setBusy(null);
    if (a.status === 200) {
      setBag(a.data.bag as Bag);
      setQuote(null);
      return;
    }
    setSaid({ text: err(a), bad: true });
  }

  async function check() {
    setBusy('check');
    setSaid(null);
    const a = await call('POST', url, { action: 'quote', lang, form });
    setBusy(null);
    if (a.status === 200) {
      const q = a.data.quote as ChatQuote;
      setQuote(q);
      setBag(q.bag);
      if (q.problem) setSaid({ text: x.problem[q.problem.field] ?? x.problem.other ?? '', bad: true });
      return;
    }
    setSaid({ text: err(a), bad: true });
  }

  async function order() {
    if (!quote || busy) return;
    setBusy('order');
    setSaid(null);
    const a = await call('POST', url, { action: 'order', lang, form, fingerprint: quote.fingerprint, requestKey: key });
    setBusy(null);
    if (a.status === 200) {
      const o = a.data.order as { orderId: string; number: string; gate: string };
      setMade({ id: o.orderId, number: o.number, advance: o.gate === 'advance' });
      setSaid({ text: (o.gate === 'advance' ? x.madeAdvance : x.made).replace('{number}', o.number), bad: false });
      setQuote(null);
      setKey(newKey());
      setBag({ ...bag, lines: [], count: 0, subtotalMinor: 0, offers: [], itemsMinor: 0, order: { id: o.orderId, number: o.number } });
      router.refresh();
      return;
    }
    const inner = (a.data.data as { code?: string } | undefined)?.code;
    // the price or the stock moved: priced again, the employee checks and presses again
    if (inner === 'PRICE_CHANGED' || inner === 'OUT_OF_STOCK') setQuote(null);
    if (a.data.error === 'IDEMPOTENCY_MISMATCH') setKey(newKey());
    setSaid({ text: err(a), bad: true });
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setQuote(null);
  };
  const t = quote?.totals;
  const delivery = quote ? (quote.charge.state === 'free' ? x.deliveryFree : t?.deliveryMinor != null ? price(t.deliveryMinor) : x.deliveryUnknown) : null;

  return (
    <section className="a2-card" aria-labelledby={`${id}-h`} data-testid="support-bag">
      <h2 className="a2-h4" id={`${id}-h`}>
        {x.h}
      </h2>
      <p className="a2-xs a2-mute" style={{ margin: '4px 0 12px' }}>
        {x.d}
      </p>
      {bag.order && !made ? (
        <Link className="sp-same-row a2-mt6" href={`/admin/orders/${bag.order.id}`} data-testid="support-bag-last" style={{ marginBottom: 10 }}>
          <span className="a2-mute">{x.last}</span>
          <b>{bag.order.number}</b>
        </Link>
      ) : null}
      {bag.lines.length ? (
        <ul className="sp-bag" aria-busy={busy === 'line'}>
          {bag.lines.map((l) => (
            <li key={l.lineId} className="sp-bag-row" data-testid="support-bag-line">
              <div className="sp-grow">
                <b className="a2-sm">{nameIn(lang, l.name)}</b>
                {l.kind === 'set' ? (
                  <span className="a2-xs a2-mute sp-bag-sub">
                    {x.set} · {l.pieces.map((p) => [nameIn(lang, p.name), p.colour, p.size].filter(Boolean).join(' ')).join(' + ')}
                  </span>
                ) : (
                  <span className="a2-xs a2-mute sp-bag-sub">{[l.colour ? nameIn(lang, l.colour) : null, l.size].filter(Boolean).join(' · ')}</span>
                )}
                {l.savingMinor > 0 ? <span className="a2-xs sp-bag-sub">{x.saves.replace('{amount}', price(l.savingMinor))}</span> : null}
                {l.blocked ? <span className="a2-pill bad">{x.soldOut}</span> : null}
              </div>
              <div className="sp-bag-qty">
                {l.kind === 'item' ? (
                  <>
                    <button type="button" className="a2-btn sm" aria-label={x.less} disabled={!!busy || l.quantity <= 1} onClick={() => void line({ action: 'quantity', lineId: l.lineId, quantity: l.quantity - 1 })} data-testid="support-bag-less">
                      −
                    </button>
                    <span className="a2-sm" aria-live="polite">
                      {l.quantity}
                    </span>
                    <button type="button" className="a2-btn sm" aria-label={x.more} disabled={!!busy || l.quantity >= l.maxQuantity} onClick={() => void line({ action: 'quantity', lineId: l.lineId, quantity: l.quantity + 1 })} data-testid="support-bag-more">
                      +
                    </button>
                  </>
                ) : null}
                <span className="a2-sm sp-bag-amt">{price(l.amountMinor)}</span>
                <button type="button" className="a2-btn sm" aria-label={`${x.remove}: ${nameIn(lang, l.name)}`} disabled={!!busy} onClick={() => void line({ action: 'remove', lineId: l.lineId })} data-testid="support-bag-remove">
                  <ShellIcon name="x" size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="a2-sm a2-mute" data-testid="support-bag-empty">
          {x.empty}
        </p>
      )}
      {bag.lines.length ? (
        <>
          <div className="sp-kv a2-mt12">
            <span>{x.items}</span>
            <span>{price(bag.subtotalMinor)}</span>
            {bag.offers.map((o, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <span>{(lang === 'bn' ? o.label.bn : o.label.en) ?? o.label.en ?? x.offers}</span>
                <span>− {price(o.amountMinor)}</span>
              </span>
            ))}
            {quote && t ? (
              <>
                <span>{x.delivery}</span>
                <span>{delivery}</span>
                <span>
                  <b>{x.total}</b>
                </span>
                <span>
                  <b data-testid="support-bag-total">{price(t.totalMinor)}</b>
                </span>
                {quote.gate === 'cod' ? (
                  <>
                    <span>{x.due}</span>
                    <span>{price(t.dueMinor)}</span>
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="sp-bag-form a2-mt12">
            <label className="a2-xs a2-mute" htmlFor={`${id}-n`}>
              {x.name}
            </label>
            <input id={`${id}-n`} className="a2-inp" value={form.name} maxLength={200} autoComplete="off" onChange={set('name')} data-testid="support-bag-name" />
            <label className="a2-xs a2-mute" htmlFor={`${id}-p`}>
              {x.phone}
            </label>
            <input id={`${id}-p`} className="a2-inp" value={form.phone} maxLength={40} inputMode="tel" autoComplete="off" onChange={set('phone')} data-testid="support-bag-phone" />
            <label className="a2-xs a2-mute" htmlFor={`${id}-a`}>
              {x.address}
            </label>
            <textarea id={`${id}-a`} className="a2-inp" rows={2} value={form.address} maxLength={500} onChange={set('address')} data-testid="support-bag-address" />
          </div>
          {quote?.address === 'ask' ? <p className="a2-note warn a2-mt6">{x.addressAsk}</p> : null}
          {quote?.gate === 'advance' && quote.advance ? (
            <p className="a2-note warn a2-mt6" data-testid="support-bag-advance">
              <ShellIcon name="info" size={15} />
              <span>{x.advanceLine.replace('{amount}', price(quote.advance.amountMinor))}</span>
            </p>
          ) : null}
          {quote?.gate === 'closed' ? (
            <p className="a2-note warn a2-mt6" data-testid="support-bag-closed">
              <ShellIcon name="info" size={15} />
              <span>{x.closed}</span>
            </p>
          ) : null}
          <div className="sp-cbar a2-mt12">
            <button type="button" className="a2-btn" disabled={!!busy} onClick={() => void check()} data-testid="support-bag-check">
              {busy === 'check' ? x.checking : x.check}
            </button>
            {quote && !quote.problem && quote.gate !== 'closed' ? (
              <button type="button" className="a2-btn pri" disabled={!!busy} onClick={() => void order()} data-testid="support-bag-create" data-gate={quote.gate}>
                {busy === 'order' ? x.creating : quote.gate === 'advance' ? x.advance : x.create}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {made ? (
        <Link className="sp-same-row a2-mt6" href={`/admin/orders/${made.id}`} data-testid="support-bag-order">
          <span>{x.openOrder}</span>
          <b>{made.number}</b>
        </Link>
      ) : null}
      <p className={`a2-sm a2-mt6${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="support-bag-said">
        {said?.text ?? ''}
      </p>
    </section>
  );
}
