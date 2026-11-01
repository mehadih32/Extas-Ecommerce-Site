'use client';
// S22 · PR 429 (Blueprint B4.6) — the catalogue drawer inside the reply box: "Products" (or "/" typed in an empty box)
// opens a search of the shop's live products by name, SKU or colour; a product opens its colours and sizes (a sold-out
// size cannot be picked); one press sends the card — its photos, the name, the price and the product's link with this
// chat's reference — and the conversation is read again. One press carries one key: pressed twice, it is one card.
// PR 430: with orders from the chat on (`addUrl`), "Add to bag" puts the picked colour and size into the chat's bag.
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { ChatProduct } from '@extas/support';
import { call } from '../api';
import { formatMoney, nameIn, type Lang, type Money } from '../products/model';
import { ShellIcon } from '../shell/ShellIcon';

export interface ProductDrawerTexts {
  h: string;
  search: string;
  searchPh: string;
  searching: string;
  none: string;
  close: string;
  colour: string;
  size: string;
  soldOut: string;
  pickSize: string;
  /** "{n}" is filled in: how many photos go with the card. */
  photos: string;
  send: string;
  sending: string;
  sent: string;
  back: string;
  /** PR 430: "Add to bag" and its answer. */
  add: string;
  added: string;
  err: Record<string, string>;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);
/** Wait this long after the last key before searching. */
const TYPE_PAUSE_MS = 250; // hardcode-ok: a typing pause, not a business number

export function ProductDrawer({
  searchUrl,
  shareUrl,
  version,
  lang,
  money,
  photos,
  addUrl,
  autoFocus,
  onClose,
  texts: x,
}: {
  searchUrl: string;
  shareUrl: string;
  version: string;
  lang: Lang;
  money: Money;
  /** How many photos go with a card (settings: `support.catalogue.photos`, within the chat's file rules). */
  photos: number;
  /** PR 430: the chat bag's address (null: orders from the chat are off, or not this person's). */
  addUrl?: string | null;
  autoFocus: boolean;
  onClose: () => void;
  texts: ProductDrawerTexts;
}) {
  const id = useId();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ChatProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<ChatProduct | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  const err = (code: string | undefined) => x.err[code ?? 'other'] ?? x.err.other ?? '';
  const price = (minor: number | null) => (minor == null ? '' : formatMoney(minor, money));

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const n = ++asked.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      const a = await call('GET', `${searchUrl}${searchUrl.includes('?') ? '&' : '?'}q=${encodeURIComponent(q.trim())}`);
      if (n !== asked.current) return;
      setLoading(false);
      if (a.status === 200) setRows((a.data.products as ChatProduct[]) ?? []);
      else setSaid({ text: err(a.status === 0 ? 'network' : a.data.error), bad: true });
    }, TYPE_PAUSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new search only when the words change
  }, [q, searchUrl]);

  function pick(p: ChatProduct) {
    setOpen(p);
    setColour(p.colours.length === 1 ? p.colours[0]!.key : null);
    const only = p.variants.filter((v) => v.inStock);
    setVariant(p.variants.length === 1 && only.length === 1 ? only[0]!.id : null);
    setSaid(null);
  }

  const sizes = open ? open.variants.filter((v) => (open.colours.length ? v.colour === colour : true)) : [];
  const chosen = open?.variants.find((v) => v.id === variant) ?? null;
  const needsSize = !!open && sizes.length > 0 && !chosen;

  async function send() {
    if (!open || busy) return;
    if (needsSize) return setSaid({ text: x.pickSize, bad: true });
    setBusy(true);
    const a = await call('POST', shareUrl, { productId: open.id, ...(chosen ? { variantId: chosen.id } : colour ? { colour } : {}), lang, requestKey: key, version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.sent, bad: false });
      setKey(newKey());
      setOpen(null);
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : a.data.error;
    if (code === 'STALE') router.refresh();
    if (code === 'IDEMPOTENCY_MISMATCH') setKey(newKey());
    setSaid({ text: err(code), bad: true });
  }

  /** PR 430: the picked colour and size into the chat's bag. */
  async function add() {
    if (!open || busy || !addUrl) return;
    if (!chosen) return setSaid({ text: x.pickSize, bad: true });
    setBusy(true);
    const a = await call('POST', addUrl, { action: 'add', variantId: chosen.id, lang });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.added, bad: false });
      router.refresh();
      return;
    }
    setSaid({ text: err(a.status === 0 ? 'network' : a.data.error), bad: true });
  }

  return (
    <div className="sp-drawer" role="region" aria-labelledby={`${id}-h`} data-testid="support-products">
      <div className="sp-drawer-top">
        <h3 className="a2-h4" id={`${id}-h`}>
          {x.h}
        </h3>
        <button type="button" className="a2-btn sm" onClick={onClose} aria-label={x.close} data-testid="support-products-close">
          <ShellIcon name="x" size={14} />
        </button>
      </div>
      {open ? (
        <div className="sp-pick" data-testid="support-product-open">
          <button type="button" className="a2-btn sm" onClick={() => setOpen(null)} data-testid="support-product-back">
            <ShellIcon name="cl" size={14} />
            {x.back}
          </button>
          <p className="a2-sm a2-mt6">
            <b>{nameIn(lang, open)}</b> · <span className="a2-mute">{price(chosen?.priceMinor ?? open.priceMinor)}</span>
          </p>
          {open.colours.length ? (
            <div className="sp-opts" role="group" aria-label={x.colour}>
              <span className="a2-xs a2-mute">{x.colour}</span>
              {open.colours.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`sp-opt${colour === c.key ? ' on' : ''}`}
                  aria-pressed={colour === c.key}
                  onClick={() => {
                    setColour(c.key);
                    setVariant(null);
                  }}
                  data-testid="support-product-colour"
                >
                  <i className="sp-dot" style={{ background: c.hex }} aria-hidden="true" />
                  {nameIn(lang, c)}
                </button>
              ))}
            </div>
          ) : null}
          {sizes.length && (colour || !open.colours.length) ? (
            <div className="sp-opts" role="group" aria-label={x.size}>
              <span className="a2-xs a2-mute">{x.size}</span>
              {sizes.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`sp-opt${variant === v.id ? ' on' : ''}`}
                  aria-pressed={variant === v.id}
                  disabled={!v.inStock}
                  title={v.inStock ? v.sku : `${v.sku} · ${x.soldOut}`}
                  onClick={() => setVariant(v.id)}
                  data-testid="support-product-size"
                >
                  {v.size?.label ?? v.sku}
                  {!v.inStock ? <span className="a2-xs"> · {x.soldOut}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          <div className="sp-cbar">
            <span className="sp-grow a2-xs a2-mute">{x.photos.replace('{n}', String(photos))}</span>
            {addUrl ? (
              <button type="button" className="a2-btn" disabled={busy || !chosen} onClick={() => void add()} data-testid="support-product-add">
                {x.add}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || needsSize} onClick={() => void send()} data-testid="support-product-send">
              {busy ? x.sending : x.send}
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={input}
            className="a2-inp"
            type="search"
            value={q}
            maxLength={80}
            placeholder={x.searchPh}
            aria-label={x.search}
            onChange={(e) => {
              setQ(e.target.value);
              setSaid(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            data-testid="support-products-q"
          />
          {rows === null || (loading && !rows.length) ? (
            <p className="a2-sm a2-mute a2-mt6">{x.searching}</p>
          ) : rows.length ? (
            <ul className="sp-same sp-prods a2-mt6" aria-busy={loading}>
              {rows.map((p) => (
                <li key={p.id}>
                  <button type="button" className="sp-same-row sp-prod" onClick={() => pick(p)} data-testid="support-product">
                    <span>{nameIn(lang, p)}</span>
                    <span className="sp-dots" aria-hidden="true">
                      {p.colours.slice(0, 6).map((c) => (
                        <i key={c.key} className="sp-dot" style={{ background: c.hex }} />
                      ))}
                    </span>
                    <span className="a2-mute">{price(p.priceMinor)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6" data-testid="support-products-none">
              {x.none}
            </p>
          )}
        </>
      )}
      <p className={`a2-sm a2-mt6${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="support-products-said">
        {said?.text ?? ''}
      </p>
    </div>
  );
}
