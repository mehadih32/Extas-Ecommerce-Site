'use client';
// PR 106 — the shop's "Add to bag" button: adds one item through the bag's API, then does what `bag.addBehaviour`
// says — opens the added-to-bag panel (`?added=<line>`, drawn by the page's <AddedPanel>), shows a short message, or
// goes to the bag. A double tap is one add (the server's repeat guard); "already in your bag" says so and opens the
// panel on that line. The product page (PR 49) uses this same button.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { showToast } from '../toast';
import { rememberOpener } from './opener';

export interface AddWords {
  label: string;
  added: string;
  already: string;
  error: string;
  stock: string;
  tooMany: string;
  notForSale: string;
}

export function AddToBag({ variantId, behaviour, bagHref, words, source = 'product', className = 'btn btn-primary' }: { variantId: string; behaviour: 'sheet' | 'toast' | 'page'; bagHref: string; words: AddWords; source?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const open = (lineId: string) => {
    const q = new URLSearchParams(window.location.search);
    q.set('added', lineId);
    router.push(`${window.location.pathname}?${q.toString()}`, { scroll: false });
  };
  const onClick = async (ev: React.MouseEvent<HTMLButtonElement>) => {
    const el = ev.currentTarget;
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/bag/lines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ variantId, source }), credentials: 'same-origin' });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; added?: boolean; reason?: string; lineId?: string; error?: string };
      if (!r.ok || !d.ok || !d.lineId) {
        showToast(el, d.error === 'OUT_OF_STOCK' ? words.stock : d.error === 'TOO_MANY' ? words.tooMany : d.error === 'NOT_FOR_SALE' ? words.notForSale : words.error);
        return;
      }
      if (d.added === false && d.reason === 'REPEAT') return;
      if (d.added === false) showToast(el, words.already);
      if (behaviour === 'page') return void window.location.assign(bagHref);
      if (behaviour === 'toast') {
        if (d.added !== false) showToast(el, words.added);
        return void router.refresh();
      }
      rememberOpener(el);
      open(d.lineId);
    } catch {
      showToast(el, words.error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={onClick} aria-busy={busy || undefined} data-testid="add-to-bag">
      {words.label}
    </button>
  );
}
