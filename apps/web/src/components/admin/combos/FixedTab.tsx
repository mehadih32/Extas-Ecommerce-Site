'use client';
// S03 · PR 90, 99, 575 — "Fixed combos & customer sets" (demo acb_fixedHTML): the fixed combo cards (set photo, name, the
// pieces, the price box with its words, the Active / Auto-apply / same-colour switches, the combo's link), the
// "Make set photo" (PR 575: composed from the piece photos), the auto-apply note, and "What customers can combine": the set tiers, read from Smart Rules (PR 99) — changed there,
// never here, so the price in words and the price charged stay one decision.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ComboView } from '@extas/combos';
import { setPricing } from '@extas/combos/pure';
import { call, errorText } from '../api';
import { Icon } from '../Icon';
import { t, type Dict } from '@/lib/i18n';
import { COMBOS_API } from './ComboEditor';
import { nameIn, saveWords, toMajorText, toMinor, type Lang } from './model';
import { MoneyBox, Row, StatePill, Switch } from './parts';
import { SetArt, type ArtPiece } from './SetArt';

const TYPING_PAUSE_MS = 700;
/** A fixed set price is used as typed: no rounding step applies. */
const NO_ROUNDING = { stepMinor: 1, direction: 'down' as const };

export interface FixedTabProps {
  dict: Dict;
  lang: Lang;
  fmt(minor: number | null): string;
  symbol: string;
  combos: ComboView[];
  /** Colour hexes by id (the drawn set art). */
  hexes: Record<string, string>;
  photos: Record<string, string>;
  perms: { write: boolean; publish: boolean; prices: boolean };
  onChange(c: ComboView): void;
  onEdit(c: ComboView | null): void;
  say(text: string): void;
  /** PR 99 — "What customers can combine". */
  tiers?: ReactNode;
}

export function FixedTab(p: FixedTabProps) {
  const { dict: d, combos } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const active = combos.filter((c) => c.state === 'live').length;
  return (
    <div className="cb-fixed">
      <div className="cb-sec-hd">
        <div>
          <h2 className="cb-h2">{tt('fixed.title')}</h2>
          <p className="ad-intro">{tt('fixed.intro')}</p>
          <div className="cb-tags">
            <span className="cb-tag">{tt('fixed.activeCount', { n: active, total: combos.length })}</span>
          </div>
        </div>
        {p.perms.write ? (
          <button type="button" className="ad-btn ad-btn-primary" onClick={() => p.onEdit(null)} data-testid="cb-new-fixed">
            <Icon name="plus" size={16} />
            {tt('fixed.new')}
          </button>
        ) : null}
      </div>
      {combos.length ? (
        <div className="cb-grid">
          {combos.map((c) => (
            <ComboCard key={c.id} {...p} combo={c} />
          ))}
        </div>
      ) : (
        <div className="cb-empty">{tt('fixed.empty')}</div>
      )}
      <div className="cb-info">
        <Icon name="bolt" size={18} />
        <div>
          <b>{tt('fixed.autoTitle')}</b> {tt('fixed.autoText')}
        </div>
      </div>
      {p.tiers}
    </div>
  );
}

function ComboCard(p: FixedTabProps & { combo: ComboView }) {
  const { dict: d, lang, fmt, combo: c } = p;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const [price, setPrice] = useState(toMajorText(c.setPriceMinor));
  const [shown, setShown] = useState(c);
  const [err, setErr] = useState('');
  const [photo, setPhoto] = useState<string | null>(p.photos[c.id] ?? null);
  const [making, setMaking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  if (shown !== c) {
    setShown(c);
    setPrice(toMajorText(c.setPriceMinor));
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const post = async (what: string, bodyIn: Record<string, unknown>, done?: (v: ComboView) => void) => {
    setErr('');
    const a = await call('POST', `${COMBOS_API}/${c.id}/${what}`, bodyIn);
    if (!a.data.ok) {
      setErr(errorText(d, a));
      return;
    }
    const v = a.data.combo as ComboView;
    p.onChange(v);
    done?.(v);
  };
  const makePhoto = async () => {
    setErr('');
    setMaking(true);
    const a = await call('POST', `${COMBOS_API}/${c.id}/photo`, {});
    setMaking(false);
    if (!a.data.ok) {
      setErr(errorText(d, a));
      return;
    }
    setPhoto((a.data.photoUrl as string | null) ?? null);
    p.onChange(a.data.combo as ComboView);
    p.say(tt('toast.photoMade', { name: nameIn(lang, c.nameEn, c.nameBn) }));
  };
  const onPrice = (v: string) => {
    setPrice(v);
    clearTimeout(timer.current);
    const minor = toMinor(v);
    if (minor === null || Number.isNaN(minor) || minor === c.setPriceMinor) return;
    timer.current = setTimeout(() => void post('price', { setPriceMinor: minor, version: c.version }, () => p.say(tt('toast.priceSaved'))), TYPING_PAUSE_MS);
  };
  // The words follow what is typed at once, by the same price rule the server and the bag use.
  const typed = toMinor(price);
  const local = setPricing({ mode: 'FIXED', setMinor: typed === null || Number.isNaN(typed) ? null : typed }, c.items.map((i) => ({ priceMinor: i.priceMinor, quantity: i.quantity })), NO_ROUNDING);
  const words = saveWords(local, fmt);
  const art: ArtPiece[] = c.items.flatMap((i) => Array.from({ length: i.quantity }, (_, k) => ({ hex: p.hexes[i.colourIds[k % Math.max(1, i.colourIds.length)] ?? ''] ?? null, name: nameIn(lang, i.productNameEn, i.productNameBn) })));
  const live = c.state === 'live';
  const name = nameIn(lang, c.nameEn, c.nameBn);
  return (
    <article className={`ad-card cb-card${live ? '' : ' off'}`} data-testid={`cb-combo-${c.slug}`}>
      <SetArt photoUrl={photo} pieces={art} alt={tt('artAlt', { name })} />
      <div className="cb-card-bd">
        <div className="cb-card-hd">
          <h3 className="cb-h3">{name}</h3>
          {live ? <span className={`cb-tag${c.autoApply ? '' : ' plain'}`}>{c.autoApply ? tt('tag.auto') : tt('tag.manual')}</span> : <StatePill dict={d} state={c.state} />}
        </div>
        {c.descriptionEn ? <div className="ad-mini">{nameIn(lang, c.descriptionEn, c.descriptionBn)}</div> : null}
        <div className="cb-items">
          {c.items.map((i) => (
            <span key={i.position}>
              {i.quantity > 1 ? `${i.quantity} × ` : ''}
              {nameIn(lang, i.productNameEn, i.productNameBn)}
            </span>
          ))}
        </div>
        <div>
          <label className="ad-label" htmlFor={`cb-price-${c.id}`}>
            {tt('setPrice')}
          </label>
          <MoneyBox id={`cb-price-${c.id}`} symbol={p.symbol} value={price} label={tt('setPriceOf', { name })} disabled={!p.perms.prices} onChange={onPrice} testId={`cb-price-${c.slug}`} />
          <div className={`cb-save ${words.tone}`} data-testid={`cb-save-${c.slug}`}>
            {tt(words.key, words.vars)}
            {words.tone === 'ok' ? ` · ${tt('price.bagsFollow')}` : ''}
          </div>
          {!p.perms.prices ? <div className="ad-mini">{tt('editor.priceOwner')}</div> : null}
        </div>
        <div className="cb-card-ft">
          <Row label={<b>{tt('active')}</b>}>
            <Switch on={live} label={tt('activeOf', { name })} disabled={!p.perms.publish} onChange={(on) => void post('active', { on }, (v) => p.say(tt(on ? (v.state === 'live' ? 'toast.on' : 'toast.onNotLive') : 'toast.off', { name })))} />
          </Row>
          <Row label={tt('autoApply')}>
            <Switch on={c.autoApply} label={tt('autoApplyOf', { name })} disabled={!p.perms.write} onChange={(v) => void post('flags', { autoApply: v }, () => p.say(tt(v ? 'toast.autoOn' : 'toast.autoOff', { name })))} />
          </Row>
          {c.oneProduct ? (
            <Row label={tt('sameColour')}>
              <Switch on={c.sameColour} label={tt('sameColourOf', { name })} disabled={!p.perms.write} onChange={(v) => void post('flags', { sameColour: v }, () => p.say(tt(v ? 'toast.sameOn' : 'toast.sameOff', { name })))} />
            </Row>
          ) : null}
          <div className="cb-row cb-row-last">
            {p.perms.write ? (
              <span className="cb-acts">
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => p.onEdit(c)}>
                  <Icon name="edit" size={15} />
                  {tt('edit')}
                </button>
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => void makePhoto()} disabled={making} aria-busy={making} data-testid={`cb-photo-${c.slug}`}>
                  <Icon name="camera" size={15} />
                  {tt(making ? 'photo.making' : photo ? 'photo.again' : 'photo.make')}
                </button>
              </span>
            ) : (
              <span />
            )}
            <span className="ad-mini cb-path">{tt('comboPath', { slug: c.slug })}</span>
          </div>
          {err ? (
            <div className="ad-mini bad" role="alert">
              {err}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
