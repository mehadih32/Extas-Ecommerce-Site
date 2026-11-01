'use client';
// S13 · PR 254 (Blueprint MKT-05, demo 70-landing.js lp_form) — the order box on a landing page: the colour, the size
// (a size sold out in this colour is crossed out, never hidden: SIM-F-035's rule) and "Order now", which puts one
// in the bag with the page as its source (the order keeps the page, Order.landingPageId) and goes on to
// the checkout, where the number, name, phone and address are taken as for every order. The price is the product's own.
import { useState } from 'react';

export interface OrderVariant {
  id: string;
  colour: string | null;
  size: string | null;
  stock: number;
  price: string;
}

export function LandingOrder(p: {
  colours: { key: string; name: string; hex: string }[];
  sizes: { key: string; label: string }[];
  variants: OrderVariant[];
  source: string;
  checkoutHref: string;
  trial: string | null;
  words: { colour: string; size: string; soldOut: string; order: string; adding: string; failed: string; pick: string; sub: string };
}) {
  const inStock = (c: string | null, s: string | null) => p.variants.some((v) => v.colour === c && v.size === s && v.stock > 0);
  const firstColour = p.colours.find((c) => p.variants.some((v) => v.colour === c.key && v.stock > 0))?.key ?? p.colours[0]?.key ?? null;
  const [colour, setColour] = useState<string | null>(firstColour);
  const oneSize = p.sizes.length <= 1;
  const [size, setSize] = useState<string | null>(oneSize ? (p.sizes[0]?.key ?? null) : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const v = p.variants.find((x) => x.colour === colour && x.size === size) ?? null;
  const price = (v ?? p.variants.find((x) => x.colour === colour) ?? p.variants[0])?.price ?? '';

  async function order() {
    if (!v || v.stock <= 0) return setErr(p.words.pick);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/bag/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ variantId: v.id, source: p.source }), credentials: 'same-origin' });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean };
      if (!r.ok || !d.ok) throw new Error('add');
      window.location.assign(p.checkoutHref);
    } catch {
      setBusy(false);
      setErr(p.words.failed);
    }
  }

  return (
    <div className="lp-form card" data-testid="lp-form">
      <p className="small text2">{p.words.sub}</p>
      {p.colours.length > 1 ? (
        <fieldset className="lp-fld">
          <legend className="label">{p.words.colour}</legend>
          <div className="lp-pills">
            {p.colours.map((c) => (
              <button key={c.key} type="button" className={`lp-pill${colour === c.key ? ' on' : ''}`} aria-pressed={colour === c.key} onClick={() => setColour(c.key)}>
                <span className="swatch" style={{ background: c.hex }} aria-hidden="true" />
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      {!oneSize ? (
        <fieldset className="lp-fld">
          <legend className="label">{p.words.size}</legend>
          <div className="lp-pills">
            {p.sizes.map((s) => {
              const ok = inStock(colour, s.key);
              return (
                <button key={s.key} type="button" className={`lp-pill${size === s.key ? ' on' : ''}${ok ? '' : ' out'}`} aria-pressed={size === s.key} disabled={!ok} aria-label={ok ? s.label : `${s.label} · ${p.words.soldOut}`} onClick={() => setSize(s.key)} data-testid="lp-size">
                  {s.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <div className="lp-fld lp-qrow">
        <b className="lp-price" data-testid="lp-price">
          {price}
        </b>
      </div>
      <button type="button" className="btn btn-primary btn-block lp-go" disabled={busy} onClick={order} data-testid="lp-order">
        {busy ? p.words.adding : p.words.order}
      </button>
      {err ? (
        <p className="small lp-err" role="alert">
          {err}
        </p>
      ) : null}
      {p.trial ? (
        <p className="trial-ln small" data-testid="lp-trial-form">
          {p.trial}
        </p>
      ) : null}
    </div>
  );
}
