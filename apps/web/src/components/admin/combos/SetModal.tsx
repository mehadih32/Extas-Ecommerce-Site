'use client';
// PR 971 (prototype v5, Products › Sets, m-products.js setModal): "New set" / "Edit set" as the prototype has it — Set name, Top piece,
// Bottom piece, Colour link, the sizes line, One price for the set, Owner PIN, and under them the "was" price (both pieces added up)
// and "Your profit". It saves through the same combos API as every set (a top + bottom combo); the PIN is asked only while the switch
// "Ask for the owner PIN when a price changes" is on, and the server checks it. The price box needs the owner's price permission.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ComboView, ProductOption } from '@extas/combos';
import { call, errorText } from '../api';
import { Sheet } from '../rules/Sheet';
import { t, type Dict } from '@/lib/i18n';
import { COMBOS_API } from './ComboEditor';
import { formFromView, inputFromForm, nameIn, slugify, toMinor, type Lang } from './model';
import { MoneyBox } from './parts';

const PREVIEW_MS = 300;

export interface SetModalProps {
  dict: Dict;
  lang: Lang;
  fmt(minor: number | null): string;
  symbol: string;
  products: ProductOption[];
  canPrice: boolean;
  /** The ERP buying price of each product (minor units), only for someone who may see prices. */
  costs: Record<string, number>;
  requirePin: boolean;
  /** The set being changed; null = a new one. */
  combo: ComboView | null;
  onClose(): void;
  onSaved(c: ComboView): void;
}

export function SetModal({ dict: d, lang, fmt, symbol, products, canPrice, costs, requirePin, combo, onClose, onSaved }: SetModalProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `productSets.modal.${k}`, vars);
  const start = useMemo(() => (combo ? formFromView(combo) : null), [combo]);
  const first = start?.items[0];
  const second = start?.items[1];
  const [name, setName] = useState(start?.nameEn ?? '');
  const [top, setTop] = useState(first?.productId ?? '');
  const [bot, setBot] = useState(second?.productId ?? '');
  const [same, setSame] = useState(start ? start.sameColour : true);
  const [price, setPrice] = useState(start?.price ?? '');
  const [pin, setPin] = useState('');
  const [was, setWas] = useState<number | null>(combo?.pricing.regularMinor ?? null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const T = byId.get(top);
  const B = byId.get(bot);
  const autoName = T && B ? `${nameIn(lang, T.nameEn, T.nameBn).split(' ').slice(-1)[0] ?? ''} + ${nameIn(lang, B.nameEn, B.nameBn).split(' ').slice(-1)[0] ?? ''}` : '';
  const shared = T && B ? T.colours.filter((c) => B.colours.some((x) => x.id === c.id)) : [];

  const build = () => {
    const base = start ?? { slug: '', nameBn: '', descriptionEn: '', descriptionBn: '', type: 'TOP_BOTTOM', items: [], price: '', startsOn: '', endsOn: '', autoApply: false, sameColour: true, nameEn: '' };
    return inputFromForm({
      ...base,
      nameEn: name.trim() || autoName,
      slug: start ? start.slug : slugify(name.trim() || autoName),
      type: start ? start.type : 'TOP_BOTTOM',
      items: [
        { productId: top, colourIds: first?.colourIds ?? [], quantity: 1, labelEn: '', labelBn: '' },
        { productId: bot, colourIds: second?.colourIds ?? [], quantity: 1, labelEn: '', labelBn: '' },
      ],
      price,
      sameColour: same,
    });
  };

  // The "was" price: both pieces added up, from the same preview the combo editor uses
  useEffect(() => {
    clearTimeout(timer.current);
    if (!top || !bot) return;
    timer.current = setTimeout(async () => {
      const input = build();
      if (!input.nameEn) return;
      const a = await call('POST', `${COMBOS_API}/preview`, { combo: { ...input, slug: input.slug || 'preview' } });
      if (a.data.ok) setWas((a.data.combo as ComboView).pricing.regularMinor);
    }, PREVIEW_MS);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `build` reads exactly these
  }, [top, bot, same, price, name]);

  const cost = costs[top] !== undefined && costs[bot] !== undefined ? (costs[top] ?? 0) + (costs[bot] ?? 0) : null;
  const sell = toMinor(price);
  const priceBad = Number.isNaN(sell);
  const profit = cost !== null && typeof sell === 'number' ? sell - cost : null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!top || !bot) return setErr(tt('needPieces'));
    if (top === bot) return setErr(tt('samePiece'));
    if (priceBad) return setErr(t(d, 'combos.editor.priceBad'));
    if (same && !shared.length) return setErr(tt('noShared'));
    if (cost !== null && typeof sell === 'number' && sell <= cost) return setErr(tt('belowCost'));
    const input = build();
    const priced = combo ? input.setPriceMinor !== combo.setPriceMinor : input.setPriceMinor != null;
    if (requirePin && priced && !pin.trim()) return setErr(tt('needPin'));
    setBusy(true);
    const payload = { combo: input, ...(requirePin && priced ? { pin } : {}) };
    const a = combo ? await call('PUT', `${COMBOS_API}/${combo.id}`, { ...payload, version: combo.version }) : await call('POST', COMBOS_API, payload);
    setBusy(false);
    if (!a.data.ok) {
      const code = typeof a.data.error === 'string' ? a.data.error : '';
      return setErr(code.startsWith('PIN_') || code === 'WRONG_PIN' ? t(d, `products.v5.pin.err.${code}`) : errorText(d, a));
    }
    onSaved(a.data.combo as ComboView);
  };

  const opts = (list: ProductOption[]) =>
    list.map((o) => (
      <option key={o.id} value={o.id}>
        {nameIn(lang, o.nameEn, o.nameBn)}
        {o.priceMinor === null ? '' : ` · ${fmt(o.priceMinor)}`}
      </option>
    ));
  return (
    <Sheet title={combo ? tt('editTitle') : tt('newTitle')} closeLabel={t(d, 'combos.close')} onClose={onClose} onSubmit={save} wide>
      <div className="cb-ed-form" data-testid="set-modal">
        <div>
          <label className="ad-label" htmlFor="sm-name">
            {tt('name')}
          </label>
          <input id="sm-name" className="ad-input" value={name} placeholder={autoName} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="cb-f2">
          <div>
            <label className="ad-label" htmlFor="sm-top">
              {tt('top')}
            </label>
            <select id="sm-top" className="ad-input" value={top} onChange={(e) => setTop(e.target.value)}>
              <option value="">{t(d, 'combos.editor.pickProduct')}</option>
              {opts(products)}
            </select>
          </div>
          <div>
            <label className="ad-label" htmlFor="sm-bot">
              {tt('bottom')}
            </label>
            <select id="sm-bot" className="ad-input" value={bot} onChange={(e) => setBot(e.target.value)}>
              <option value="">{t(d, 'combos.editor.pickProduct')}</option>
              {opts(products)}
            </select>
          </div>
        </div>
        <div>
          <div className="ad-label" id="sm-link-l">
            {tt('link')}
          </div>
          <div className="cb-cols" role="group" aria-labelledby="sm-link-l">
            <button type="button" className="cb-col" aria-pressed={same} onClick={() => setSame(true)} data-testid="set-link-same">
              {t(d, 'productSets.colour.same')}
            </button>
            <button type="button" className="cb-col" aria-pressed={!same} onClick={() => setSame(false)} data-testid="set-link-any">
              {t(d, 'productSets.colour.free')}
            </button>
          </div>
          {same ? <div className="ad-mini">{tt('shared', { names: shared.map((c) => nameIn(lang, c.nameEn, c.nameBn)).join(', ') || tt('none') })}</div> : null}
        </div>
        {T && B ? (
          <div className="ad-mini">{tt('sizes', { top: T.sizes.map((z) => z.label).join('/'), bottom: B.sizes.map((z) => z.label).join('/') })}</div>
        ) : null}
        <div className="cb-f2">
          <div>
            <label className="ad-label" htmlFor="sm-price">
              {tt('price')}
            </label>
            <MoneyBox id="sm-price" symbol={symbol} value={price} label={tt('price')} placeholder={t(d, 'combos.editor.pricePlaceholder')} disabled={!canPrice} invalid={priceBad} onChange={setPrice} testId="set-price" />
            {!canPrice ? <div className="ad-mini">{t(d, 'combos.editor.priceOwner')}</div> : null}
          </div>
          {requirePin ? (
            <div>
              <label className="ad-label" htmlFor="sm-pin">
                {tt('pin')}
              </label>
              <input id="sm-pin" className="ad-input" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} />
            </div>
          ) : null}
        </div>
        <ul className="pa-hl" data-testid="set-sums">
          <li className="pa-hli">
            <span>{tt('was')}</span>
            <b>{was === null ? '—' : fmt(was)}</b>
          </li>
          {cost !== null ? (
            <li className="pa-hli">
              <span>{tt('profit')}</span>
              <b>{profit === null ? '—' : `${fmt(profit)} · ${typeof sell === 'number' && sell > 0 ? Math.round((profit / sell) * 100) : 0}%`}</b>
            </li>
          ) : null}
        </ul>
      </div>
      {err ? (
        <div className="ad-modal-err" role="alert">
          {err}
        </div>
      ) : null}
      <div className="ad-modal-acts">
        <button type="button" className="ad-btn ad-btn-ghost" onClick={onClose}>
          {t(d, 'combos.cancel')}
        </button>
        <button type="submit" className="ad-btn ad-btn-primary" disabled={busy} data-testid="set-save">
          {tt('save')}
        </button>
      </div>
    </Sheet>
  );
}
