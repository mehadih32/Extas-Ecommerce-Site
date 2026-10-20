'use client';
// S03 · PR 90 — make or change a fixed combo, with the live preview beside the form: every change asks the server for
// the combo as it would be saved, priced by the same rule as the bag (regular total, set price, the saving, or the
// warning when the price is not lower). A price needs `combos.prices` (the owner's decision): without it the price
// box is read-only and says so.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ComboView, ProductOption } from '@extas/combos';
import { call, errorText } from '../api';
import { Icon } from '../Icon';
import { Sheet } from '../rules/Sheet';
import { t, type Dict } from '@/lib/i18n';
import { emptyForm, emptyItem, formFromView, inputFromForm, nameIn, oneProductForm, saveWords, slugify, toMinor, type ComboForm, type Lang } from './model';
import { MoneyBox, Row, Switch } from './parts';

export const COMBOS_API = '/api/admin/combos';
const PREVIEW_MS = 300;
const TYPES = ['FIXED_SET', 'TOP_BOTTOM', 'MIXED_SET', 'FIXED_COLOUR_PACK', 'COLOUR_PAIR'] as const;
const MAX_ITEMS = 8;
const MAX_QTY = 10;

export interface EditorProps {
  dict: Dict;
  lang: Lang;
  fmt(minor: number | null): string;
  symbol: string;
  products: ProductOption[];
  canPrice: boolean;
  /** The combo being changed; null = a new one. */
  combo: ComboView | null;
  onClose(): void;
  onSaved(c: ComboView): void;
}

export function ComboEditor({ dict: d, lang, fmt, symbol, products, canPrice, combo, onClose, onSaved }: EditorProps) {
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const [form, setForm] = useState<ComboForm>(() => (combo ? formFromView(combo) : emptyForm()));
  const [slugEdited, setSlugEdited] = useState(Boolean(combo));
  const [preview, setPreview] = useState<ComboView | null>(combo);
  const [previewErr, setPreviewErr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const set = (patch: Partial<ComboForm>) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (i: number, patch: Partial<ComboForm['items'][number]>) => setForm((f) => ({ ...f, items: f.items.map((it, n) => (n === i ? { ...it, ...patch } : it)) }));

  // The live preview, a moment after the last change.
  useEffect(() => {
    clearTimeout(timer.current);
    const input = inputFromForm(form);
    if (!input.nameEn || !input.items.length) return;
    timer.current = setTimeout(async () => {
      const a = await call('POST', `${COMBOS_API}/preview`, { combo: { ...input, slug: input.slug || 'preview' } });
      if (a.data.ok) {
        setPreview(a.data.combo as ComboView);
        setPreviewErr('');
      } else setPreviewErr(errorText(d, a));
    }, PREVIEW_MS);
    return () => clearTimeout(timer.current);
  }, [form, d]);

  const priceBad = Number.isNaN(toMinor(form.price));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (priceBad) return setErr(tt('editor.priceBad'));
    const input = inputFromForm(form);
    setBusy(true);
    const a = combo ? await call('PUT', `${COMBOS_API}/${combo.id}`, { combo: input, version: combo.version }) : await call('POST', COMBOS_API, { combo: input });
    setBusy(false);
    if (!a.data.ok) return setErr(errorText(d, a));
    onSaved(a.data.combo as ComboView);
  };

  const words = preview ? saveWords(preview.pricing, fmt) : null;
  return (
    <Sheet title={combo ? tt('editor.editTitle') : tt('editor.newTitle')} closeLabel={tt('close')} onClose={onClose} onSubmit={save} wide>
      <div className="cb-ed">
        <div className="cb-ed-form">
          <div className="cb-f2">
            <div>
              <label className="ad-label" htmlFor="cb-name">
                {tt('editor.nameEn')}
              </label>
              <input
                id="cb-name"
                className="ad-input"
                value={form.nameEn}
                maxLength={120}
                onChange={(e) => set({ nameEn: e.target.value, ...(slugEdited ? {} : { slug: slugify(e.target.value) }) })}
              />
            </div>
            <div>
              <label className="ad-label" htmlFor="cb-name-bn">
                {tt('editor.nameBn')} <span className="opt">{tt('optional')}</span>
              </label>
              <input id="cb-name-bn" className="ad-input" value={form.nameBn} maxLength={120} onChange={(e) => set({ nameBn: e.target.value })} />
            </div>
          </div>
          <div className="cb-f2">
            <div>
              <label className="ad-label" htmlFor="cb-slug">
                {tt('editor.slug')}
              </label>
              <input
                id="cb-slug"
                className="ad-input"
                value={form.slug}
                maxLength={80}
                onChange={(e) => {
                  setSlugEdited(true);
                  set({ slug: e.target.value });
                }}
              />
              <div className="ad-mini">{tt('editor.slugHelp')}</div>
            </div>
            <div>
              <label className="ad-label" htmlFor="cb-type">
                {tt('editor.type')}
              </label>
              <select id="cb-type" className="ad-input" value={form.type} onChange={(e) => set({ type: e.target.value })}>
                {TYPES.map((k) => (
                  <option key={k} value={k}>
                    {tt(`types.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="ad-label" htmlFor="cb-desc">
              {tt('editor.description')} <span className="opt">{tt('optional')}</span>
            </label>
            <input id="cb-desc" className="ad-input" value={form.descriptionEn} maxLength={300} onChange={(e) => set({ descriptionEn: e.target.value })} />
          </div>

          <fieldset className="cb-pieces">
            <legend className="ad-label">{tt('editor.pieces')}</legend>
            {form.items.map((it, i) => {
              const p = byId.get(it.productId);
              return (
                <div className="cb-piece" key={i}>
                  <div className="cb-piece-hd">
                    <span className="cb-piece-n">{i + 1}</span>
                    <select className="ad-input" aria-label={tt('editor.pieceProduct', { n: i + 1 })} value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value, colourIds: [] })}>
                      <option value="">{tt('editor.pickProduct')}</option>
                      {products.map((o) => (
                        <option key={o.id} value={o.id}>
                          {nameIn(lang, o.nameEn, o.nameBn)}
                          {o.published ? '' : ` · ${tt('editor.notPublished')}`}
                        </option>
                      ))}
                    </select>
                    <div className="cb-qty" role="group" aria-label={tt('editor.quantity', { n: i + 1 })}>
                      <button type="button" className="ad-iconbtn" aria-label={tt('editor.less')} disabled={it.quantity <= 1} onClick={() => setItem(i, { quantity: it.quantity - 1 })}>
                        −
                      </button>
                      <span aria-live="polite">{it.quantity}</span>
                      <button type="button" className="ad-iconbtn" aria-label={tt('editor.more')} disabled={it.quantity >= MAX_QTY} onClick={() => setItem(i, { quantity: it.quantity + 1 })}>
                        +
                      </button>
                    </div>
                    <button type="button" className="ad-iconbtn" aria-label={tt('editor.removePiece', { n: i + 1 })} disabled={form.items.length <= 1} onClick={() => set({ items: form.items.filter((_, n) => n !== i) })}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  {p && p.colours.length > 1 ? (
                    <div className="cb-cols" role="group" aria-label={tt('editor.colours')}>
                      <span className="ad-mini">{it.colourIds.length ? tt('editor.coloursSome') : tt('editor.coloursAny')}</span>
                      {p.colours.map((c) => {
                        const on = it.colourIds.includes(c.id);
                        return (
                          <button
                            type="button"
                            key={c.id}
                            className="cb-col"
                            aria-pressed={on}
                            onClick={() => setItem(i, { colourIds: on ? it.colourIds.filter((x) => x !== c.id) : [...it.colourIds, c.id] })}
                          >
                            <i style={{ background: c.hex }} aria-hidden="true" />
                            {nameIn(lang, c.nameEn, c.nameBn)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {form.items.length < MAX_ITEMS ? (
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => set({ items: [...form.items, emptyItem()] })}>
                <Icon name="plus" size={15} />
                {tt('editor.addPiece')}
              </button>
            ) : null}
          </fieldset>

          <div>
            <label className="ad-label" htmlFor="cb-price">
              {tt('setPrice')}
            </label>
            <MoneyBox id="cb-price" symbol={symbol} value={form.price} label={tt('setPrice')} placeholder={tt('editor.pricePlaceholder')} disabled={!canPrice} invalid={priceBad} onChange={(v) => set({ price: v })} testId="cb-ed-price" />
            {!canPrice ? <div className="ad-mini">{tt('editor.priceOwner')}</div> : null}
          </div>
          <div className="cb-f2">
            <div>
              <label className="ad-label" htmlFor="cb-start">
                {tt('dates.starts')} <span className="opt">{tt('optional')}</span>
              </label>
              <input id="cb-start" type="date" className="ad-input" value={form.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
            </div>
            <div>
              <label className="ad-label" htmlFor="cb-end">
                {tt('dates.ends')} <span className="opt">{tt('optional')}</span>
              </label>
              <input id="cb-end" type="date" className="ad-input" value={form.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
            </div>
          </div>
          <div className="ad-mini">{form.startsOn || form.endsOn ? tt('dates.endsHelp') : tt('dates.alwaysHelp')}</div>
          <Row label={tt('autoApply')}>
            <Switch on={form.autoApply} label={tt('autoApply')} onChange={(v) => set({ autoApply: v })} />
          </Row>
          {oneProductForm(form) ? (
            <Row label={tt('sameColour')}>
              <Switch on={form.sameColour} label={tt('sameColour')} onChange={(v) => set({ sameColour: v })} />
            </Row>
          ) : null}
        </div>

        <aside className="cb-ed-prev" aria-live="polite" aria-label={tt('editor.preview')}>
          <div className="ad-eyebrow">{tt('editor.preview')}</div>
          {preview ? (
            <>
              <div className="cb-prev-name">{form.nameEn || preview.nameEn}</div>
              <ul className="cb-prev-items">
                {preview.items.map((i) => (
                  <li key={i.position}>
                    <span>
                      {i.quantity > 1 ? `${i.quantity} × ` : ''}
                      {nameIn(lang, i.productNameEn, i.productNameBn) || tt('editor.pickProduct')}
                    </span>
                    <span>{i.priceMinor === null ? tt('price.noPrice') : fmt(i.priceMinor * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              {preview.pricing.regularMinor !== null ? (
                <div className="cb-prev-total">
                  {preview.pricing.offer ? <s>{fmt(preview.pricing.regularMinor)}</s> : null}
                  <b>{fmt(preview.pricing.payMinor ?? preview.pricing.regularMinor)}</b>
                </div>
              ) : null}
              {words ? <div className={`cb-save ${words.tone}`}>{tt(words.key, words.vars)}</div> : null}
              {preview.blocking.length ? (
                <ul className="cb-block">
                  {preview.blocking.map((b) => (
                    <li key={b}>{tt(`blocking.${b.split('@')[0]}`, { n: b.split('@')[1] ?? '' })}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="ad-mini">{tt('editor.previewEmpty')}</div>
          )}
          {previewErr ? <div className="ad-mini bad">{previewErr}</div> : null}
        </aside>
      </div>
      {err ? (
        <div className="ad-modal-err" role="alert">
          {err}
        </div>
      ) : null}
      <div className="ad-modal-acts">
        <button type="button" className="ad-btn ad-btn-ghost" onClick={onClose}>
          {tt('cancel')}
        </button>
        <button type="submit" className="ad-btn ad-btn-primary" disabled={busy} data-testid="cb-ed-save">
          <Icon name="check" size={16} />
          {combo ? tt('editor.saveChanges') : tt('editor.saveNew')}
        </button>
      </div>
    </Sheet>
  );
}
