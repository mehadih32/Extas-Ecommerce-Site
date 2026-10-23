'use client';
// PR 71 — the wishlist page's one small script (no markup of its own): "Add to bag" puts the saved size in the bag
// (the bag's own API, PR 105) and takes it off the list, as the demo's bag_unsave does; "Remove" takes it off the list
// (archived on the server). Either way the page is drawn again from the server, and so is a heart tapped on this page.
// The cards fit their tight spots after the first paint (CARD_FIT, as the category grid does).
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CARD_FIT, fitAll } from '@/lib/shop/fit';
import { afterPaint } from '@/lib/shop/later';
import { toggleWish } from '@/lib/shop/wish-client';
import { WISH_CHANGED } from '@/lib/shop/wish-model';
import { showToast } from '../toast';

export interface WishWords {
  toBag: string;
  removed: string;
  error: string;
  stock: string;
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

export function WishActions({ words }: { words: WishWords }) {
  const router = useRouter();
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-wish-root]');
    if (!root) return;
    const cancel = afterPaint(() => fitAll(root, CARD_FIT));
    let busy = false;

    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as Element).closest<HTMLElement>('[data-wish-act]');
      if (!el || !root.contains(el) || busy) return;
      const pid = el.dataset.pid ?? '';
      busy = true;
      root.setAttribute('aria-busy', 'true');
      void (async () => {
        try {
          if (el.dataset.wishAct === 'bag') {
            const r = await fetch('/api/bag/lines', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ variantId: el.dataset.variant, source: 'wishlist' }),
              credentials: 'same-origin',
            });
            const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            if (!r.ok || !d.ok) return showToast(el, d.error === 'OUT_OF_STOCK' ? words.stock : words.error);
            await toggleWish(pid, false);
            showToast(el, fill(words.toBag, { name: el.dataset.name ?? '' }));
          } else {
            const r = await toggleWish(pid, false);
            showToast(el, r === 'ok' ? words.removed : words.error);
          }
        } catch {
          showToast(el, words.error);
        } finally {
          busy = false;
          root.removeAttribute('aria-busy');
          router.refresh();
        }
      })();
    };
    // a heart tapped on this page changes the list: draw it again
    const onChanged = (ev: Event) => {
      if ((ev as CustomEvent<{ user?: boolean }>).detail?.user && !busy) router.refresh();
    };
    root.addEventListener('click', onClick);
    window.addEventListener(WISH_CHANGED, onChanged);
    return () => {
      cancel();
      root.removeEventListener('click', onClick);
      window.removeEventListener(WISH_CHANGED, onChanged);
    };
  }, [router, words]);
  return null;
}
