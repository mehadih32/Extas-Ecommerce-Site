'use client';
// S03 · PR 90 (with 571, 99) — the combos page (demo #/admin/combos, 85-admin-combos.js): the head in Bengali, the
// tabs, and the tab's body. Changes go to the server at once (a switch, a price box) or through the editor sheet; the
// list is the server's answer, so what the page shows is what the shop and the bag use.
import { useState, type ReactNode } from 'react';
import type { ComboView, ProductOption } from '@extas/combos';
import { t, type Dict } from '@/lib/i18n';
import { ComboEditor } from './ComboEditor';
import { FixedTab } from './FixedTab';
import { currencySymbol, money, type Lang } from './model';
import { useToast } from '../products/useToast';

export type CombosTab = 'fixed';

export interface CombosScreenProps {
  dict: Dict;
  lang: Lang;
  locale: string;
  currency: string;
  tab: CombosTab;
  combos: ComboView[];
  products: ProductOption[];
  photos: Record<string, string>;
  perms: { write: boolean; publish: boolean; prices: boolean };
  /** PR 99 — "What customers can combine" (drawn by the server from Smart Rules). */
  tiers?: ReactNode;
  /** The Combos pages' tabs (desktop), drawn under the head. */
  tabs?: ReactNode;
}

export function CombosScreen(props: CombosScreenProps) {
  const { dict: d, lang, locale, currency } = props;
  const tt = (k: string, vars?: Record<string, string | number>) => t(d, `combos.${k}`, vars);
  const [combos, setCombos] = useState(props.combos);
  const [fromServer, setFromServer] = useState(props.combos);
  if (fromServer !== props.combos) {
    setFromServer(props.combos);
    setCombos(props.combos);
  }
  const [editing, setEditing] = useState<{ combo: ComboView | null } | null>(null);
  const [toast, say] = useToast();
  const fmt = (minor: number | null) => money(minor, locale, currency);
  const symbol = currencySymbol(locale, currency);
  const hexes = Object.fromEntries(props.products.flatMap((p) => p.colours.map((c) => [c.id, c.hex])));
  const upsert = (c: ComboView) => setCombos((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));

  return (
    <div className="cb-page">
      <div className="cb-hd">
        <div className="cb-hd-text">
          <div className="ad-eyebrow">{tt('eyebrow')}</div>
          <h1 className="ad-h1">{tt('title')}</h1>
          <p className="cb-bn-sub">{tt('subtitle')}</p>
          <p className="ad-intro">{tt('intro')}</p>
        </div>
      </div>
      {props.tabs}
      <FixedTab dict={d} lang={lang} fmt={fmt} symbol={symbol} combos={combos} hexes={hexes} photos={props.photos} perms={props.perms} onChange={upsert} onEdit={(c) => setEditing({ combo: c })} say={say} tiers={props.tiers} />
      {editing ? (
        <ComboEditor
          dict={d}
          lang={lang}
          fmt={fmt}
          symbol={symbol}
          products={props.products}
          canPrice={props.perms.prices}
          combo={editing.combo}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            upsert(c);
            setEditing(null);
            say(tt(editing.combo ? 'toast.saved' : 'toast.created', { name: c.nameEn }));
          }}
        />
      ) : null}
      <div className="ad-toast-slot" aria-live="polite" role="status">
        {toast ? <div className="ad-toast">{toast}</div> : null}
      </div>
    </div>
  );
}
