'use client';
// S28 · PR 730 (admin prototype v5, Orders › All orders › "Phone order"): the button at the right of the title and the drawer it
// opens. The caller's phone, name and address, the pieces asked for (found by name, SKU or colour), "Check price" (the shop's own
// checkout prices them: offers, delivery, total — nothing is typed) and "Create order" (Cash on Delivery, source Phone). Calls
// /api/admin/orders/phone (`orders.confirm`, lib/admin-orders/phone-order.ts); the words come from the page (`orders.phone.*`).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { call } from '../api';
import { formatMoney, moneyOf } from '../products/model';
import { Drawer } from '../shell/Drawer';
import { ShellIcon } from '../shell/ShellIcon';

export interface PhoneOrderTexts {
  button: string;
  title: string;
  sub: string;
  close: string;
  phone: string;
  name: string;
  address: string;
  known: string;
  newCaller: string;
  find: string;
  findPh: string;
  noProducts: string;
  soldOut: string;
  pieces: string;
  quantity: string;
  remove: string;
  noLines: string;
  check: string;
  create: string;
  back: string;
  items: string;
  delivery: string;
  deliveryFree: string;
  total: string;
  cod: string;
  needsPayment: string;
  created: string;
  open: string;
  again: string;
  err: Record<string, string>;
}

interface Variant {
  id: string;
  sku: string;
  colourEn: string | null;
  colourBn: string | null;
  size: string | null;
  priceMinor: number | null;
  inStock: boolean;
}
interface Product {
  id: string;
  nameEn: string;
  nameBn: string | null;
  variants: Variant[];
}
interface Line {
  variantId: string;
  name: string;
  detail: string;
  quantity: number;
}
interface Quote {
  itemsMinor: number;
  offers: { label: string; amountMinor: number }[];
  deliveryMinor: number | null;
  totalMinor: number;
  gate: 'cod' | 'advance' | 'closed';
  fingerprint: string;
}

const key = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');

export function PhoneOrder({ texts: x, lang, locale }: { texts: PhoneOrderTexts; lang: 'en' | 'bn'; locale: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [caller, setCaller] = useState<{ known: boolean; name: string; orders: number; refused: number } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Product[]>([]);
  const [currency, setCurrency] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ id: string; number: string } | null>(null);
  const requestKey = useRef(key());
  const search = useRef(0);

  const money = (minor: number) => (currency ? formatMoney(minor, moneyOf(currency, locale)) : String(minor));
  const nameOf = (p: { nameEn: string; nameBn: string | null }) => (lang === 'bn' && p.nameBn ? p.nameBn : p.nameEn);
  const fail = (a: { status: number; data: Record<string, unknown> }) => {
    const code = a.status === 0 ? 'network' : String(a.data.error ?? 'other');
    setErr(x.err[code] ?? x.err.other ?? code);
  };

  // products: the newest ones at first, then what is typed (a short wait so typing does not call on every letter)
  useEffect(() => {
    if (!open) return;
    const n = ++search.current;
    const t = setTimeout(async () => {
      const a = await call('GET', `/api/admin/orders/phone?q=${encodeURIComponent(q)}`);
      if (n !== search.current || a.status !== 200) return;
      setFound((a.data.products as Product[]) ?? []);
      setCurrency(String(a.data.currency ?? ''));
    }, 250);
    return () => clearTimeout(t);
  }, [open, q]);

  async function lookup(v: string) {
    setPhone(v);
    setQuote(null);
    if (v.replace(/\D/g, '').length < 11) return setCaller(null);
    const a = await call('GET', `/api/admin/orders/phone?phone=${encodeURIComponent(v)}`);
    if (a.status !== 200) return;
    const c = a.data.caller as { known: boolean; name: string; address: string; orders: number; refused: number };
    setCaller(c);
    if (c.known) {
      setName((cur) => cur || c.name);
      setAddress((cur) => cur || c.address);
    }
  }

  function add(p: Product, v: Variant) {
    setQuote(null);
    setLines((ls) => {
      const at = ls.findIndex((l) => l.variantId === v.id);
      if (at >= 0) return ls.map((l, i) => (i === at ? { ...l, quantity: Math.min(100, l.quantity + 1) } : l));
      const colour = lang === 'bn' && v.colourBn ? v.colourBn : v.colourEn;
      return [...ls, { variantId: v.id, name: nameOf(p), detail: [colour, v.size].filter(Boolean).join(' · '), quantity: 1 }];
    });
  }

  const payload = (action: 'quote' | 'create') => ({ action, requestKey: requestKey.current, name, phone, address, lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), ...(action === 'create' && quote ? { fingerprint: quote.fingerprint } : {}) });
  const ready = name.trim() !== '' && phone.trim() !== '' && address.trim() !== '' && lines.length > 0;

  async function check() {
    setBusy(true);
    setErr('');
    const a = await call('POST', '/api/admin/orders/phone', payload('quote'));
    setBusy(false);
    if (a.status !== 200) return fail(a);
    setQuote(a.data.quote as Quote);
  }
  async function create() {
    setBusy(true);
    setErr('');
    const a = await call('POST', '/api/admin/orders/phone', payload('create'));
    setBusy(false);
    if (a.status !== 200) {
      if (a.data.error === 'PRICE_CHANGED') setQuote(null);
      return fail(a);
    }
    const o = a.data.order as { orderId: string; number: string };
    setDone({ id: o.orderId, number: o.number });
    router.refresh();
  }
  function reset() {
    requestKey.current = key();
    setPhone('');
    setName('');
    setAddress('');
    setCaller(null);
    setLines([]);
    setQuote(null);
    setErr('');
    setDone(null);
  }

  return (
    <>
      <button type="button" className="a2-btn pri" onClick={() => setOpen(true)} data-testid="orders-phone">
        <ShellIcon name="phone" size={15} />
        {x.button}
      </button>
      {open ? (
        <Drawer title={x.title} sub={x.sub} closeLabel={x.close} onClose={() => setOpen(false)} testId="phone-order" wide>
          <div className="po" data-testid="po-body">
            {done ? (
              <div className="a2-note ok" data-testid="po-done">
                <ShellIcon name="check" size={15} />
                <span>{x.created.replace('{number}', done.number)}</span>
                <div className="po-acts">
                  <Link className="a2-btn" href={`/admin/orders/${done.id}`}>
                    {x.open}
                  </Link>
                  <button type="button" className="a2-btn pri" onClick={reset}>
                    {x.again}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="po-grid">
                  <label className="po-f">
                    <span className="a2-lbl">{x.phone}</span>
                    <input className="a2-inp" inputMode="tel" autoComplete="off" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => void lookup(e.target.value)} data-testid="po-phone" />
                    {caller ? <span className="a2-xs a2-mute">{caller.known ? x.known.replace('{name}', caller.name).replace('{orders}', String(caller.orders)).replace('{refused}', String(caller.refused)) : x.newCaller}</span> : null}
                  </label>
                  <label className="po-f">
                    <span className="a2-lbl">{x.name}</span>
                    <input className="a2-inp" value={name} onChange={(e) => (setName(e.target.value), setQuote(null))} data-testid="po-name" />
                  </label>
                  <label className="po-f po-wide">
                    <span className="a2-lbl">{x.address}</span>
                    <input className="a2-inp" value={address} onChange={(e) => (setAddress(e.target.value), setQuote(null))} data-testid="po-address" />
                  </label>
                </div>

                <label className="po-f">
                  <span className="a2-lbl">{x.find}</span>
                  <input className="a2-inp" value={q} placeholder={x.findPh} onChange={(e) => setQ(e.target.value)} data-testid="po-find" />
                </label>
                <div className="po-found" data-testid="po-found">
                  {found.length ? (
                    found.map((p) => (
                      <div className="po-prod" key={p.id}>
                        <b>{nameOf(p)}</b>
                        <div className="po-vars">
                          {p.variants.map((v) => {
                            const colour = lang === 'bn' && v.colourBn ? v.colourBn : v.colourEn;
                            return (
                              <button type="button" key={v.id} className="a2-btn sm po-var" disabled={!v.inStock} title={v.inStock ? undefined : x.soldOut} onClick={() => add(p, v)}>
                                {[colour, v.size].filter(Boolean).join(' · ') || v.sku}
                                {v.priceMinor !== null ? ` · ${money(v.priceMinor)}` : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="a2-xs a2-mute">{x.noProducts}</p>
                  )}
                </div>

                <div className="po-lines" data-testid="po-lines">
                  {lines.length ? (
                    lines.map((l) => (
                      <div className="po-line" key={l.variantId}>
                        <span className="po-ln">
                          <b>{l.name}</b>
                          <span className="a2-xs a2-mute">{l.detail}</span>
                        </span>
                        <label className="po-q">
                          <span className="a2-xs a2-mute">{x.quantity}</span>
                          <input
                            className="a2-inp"
                            type="number"
                            min={1}
                            max={100}
                            value={l.quantity}
                            onChange={(e) => (setQuote(null), setLines((ls) => ls.map((y) => (y.variantId === l.variantId ? { ...y, quantity: Math.max(1, Math.min(100, Number(e.target.value) || 1)) } : y))))}
                          />
                        </label>
                        <button type="button" className="a2-btn sm" onClick={() => (setQuote(null), setLines((ls) => ls.filter((y) => y.variantId !== l.variantId)))}>
                          {x.remove}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="a2-xs a2-mute">{x.noLines}</p>
                  )}
                </div>

                {quote ? (
                  <div className="po-sum" data-testid="po-quote">
                    <div className="po-row">
                      <span>{x.items}</span>
                      <b>{money(quote.itemsMinor)}</b>
                    </div>
                    {quote.offers.map((o) => (
                      <div className="po-row" key={o.label}>
                        <span>{o.label}</span>
                        <b>−{money(o.amountMinor)}</b>
                      </div>
                    ))}
                    <div className="po-row">
                      <span>{x.delivery}</span>
                      <b>{quote.deliveryMinor === null ? '—' : quote.deliveryMinor === 0 ? x.deliveryFree : money(quote.deliveryMinor)}</b>
                    </div>
                    <div className="po-row po-tot">
                      <span>{x.total}</span>
                      <b>{money(quote.totalMinor)}</b>
                    </div>
                    <p className="a2-xs a2-mute">{quote.gate === 'cod' ? x.cod : x.needsPayment}</p>
                  </div>
                ) : null}
                {err ? (
                  <div className="a2-note bad" role="alert" data-testid="po-err">
                    <ShellIcon name="alert" size={15} />
                    <span>{err}</span>
                  </div>
                ) : null}
                <div className="po-acts">
                  <button type="button" className="a2-btn" onClick={() => setOpen(false)}>
                    {x.back}
                  </button>
                  <button type="button" className="a2-btn" disabled={!ready || busy} onClick={() => void check()} data-testid="po-check">
                    {x.check}
                  </button>
                  <button type="button" className="a2-btn pri" disabled={!ready || busy || !quote || quote.gate !== 'cod'} onClick={() => void create()} data-testid="po-create">
                    {x.create}
                  </button>
                </div>
              </>
            )}
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
