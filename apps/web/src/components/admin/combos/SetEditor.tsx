'use client';
// PR 786 (lane D1, prototype v5 parity, m-products.js setModal): "New set" and a set's "Edit" open the set editor right on the Sets
// tab (the same editor Combos & sets uses: pieces, colour link, one price with its live preview; a price needs the owner's price
// permission, which the API checks again), instead of sending the owner to another page. One host holds the product list once;
// every "New set" / "Edit" button asks it to open. A set's data is fetched when Edit is pressed.
import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ComboView, ProductOption } from '@extas/combos';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';
import type { Dict } from '@/lib/i18n';
import { COMBOS_API, ComboEditor } from './ComboEditor';
import { currencySymbol, money, type Lang } from './model';

const Open = createContext<((id: string | null) => Promise<string | null>) | null>(null); // hardcode-ok: a type, not text

export function SetEditorHost({
  dict,
  lang,
  locale,
  currency,
  products,
  canPrice,
  failed,
  children,
}: {
  dict: Dict;
  lang: Lang;
  locale: string;
  currency: string;
  products: ProductOption[];
  canPrice: boolean;
  failed: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [combo, setCombo] = useState<ComboView | null>(null);
  const start = async (id: string | null): Promise<string | null> => {
    if (id) {
      const a = await call('GET', `${COMBOS_API}/${id}`);
      if (!a.data.ok || !a.data.combo) return failed;
      setCombo(a.data.combo as ComboView);
    } else setCombo(null);
    setOpen(true);
    return null;
  };
  return (
    <Open.Provider value={start}>
      {children}
      {open ? (
        <ComboEditor
          dict={dict}
          lang={lang}
          fmt={(m) => money(m, locale, currency)}
          symbol={currencySymbol(locale, currency)}
          products={products}
          canPrice={canPrice}
          combo={combo}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </Open.Provider>
  );
}

/** A button that opens the set editor: a new set (id null) or one set. */
export function SetEditorButton({ id, label, primary }: { id: string | null; label: string; primary?: boolean }) {
  const start = useContext(Open);
  const [msg, setMsg] = useState('');
  return (
    <>
      <button type="button" className={`a2-btn${primary ? ' primary' : ' sm'}`} disabled={!start} onClick={async () => setMsg((await start?.(id)) ?? '')} data-testid={id ? 'set-edit' : 'sets-new'}>
        {primary ? <ShellIcon name="plus" size={16} /> : null} {label}
      </button>
      {msg ? (
        <span className="a2-xs" role="alert" style={{ color: 'var(--bad)' }}>
          {msg}
        </span>
      ) : null}
    </>
  );
}
