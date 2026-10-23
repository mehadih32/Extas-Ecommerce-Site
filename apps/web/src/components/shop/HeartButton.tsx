'use client';
// PR 41 — the heart on a product card (demo 02-core.js ACT.wish): saves the product to the wishlist or takes it out,
// with a short message. The button is its own target, never inside the card's link (demo D-024), so a tap on it never
// opens the product.
// PR 71: the list lives on the server for this browser (lib/shop/wishlist.ts); the browser keeps a copy so the heart is
// drawn at once (lib/shop/wish-client.ts), and the first heart on a page brings the copy in step, once.
// ~~The list lives in this browser only until the wishlist page and the account's own list arrive (PR 71).~~
import { useEffect, useState } from 'react';
import { readWishes, syncWishes, toggleWish } from '@/lib/shop/wish-client';
import { WISH_CHANGED } from '@/lib/shop/wish-model';
import { Icon } from './Icon';
import { showToast } from './toast';

export interface HeartWords {
  save: string;
  unsave: string;
  saved: string;
  removed: string;
  /** PR 71: the list has no room left (`wish.list.max`). */
  full?: string;
  /** PR 71: the server did not take it. */
  error?: string;
}

/** `className` / `size`: the product page's heart after the title (PR 49, demo .pdp-wish, 22 px). */
export function HeartButton({ id, words, className = 'heart', size = 18, testId }: { id: string; words: HeartWords; className?: string; size?: number; testId?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readWishes().includes(id));
    sync();
    void syncWishes();
    window.addEventListener(WISH_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WISH_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, [id]);
  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      data-wish={id}
      aria-label={on ? words.unsave : words.save}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const el = e.currentTarget;
        const next = !on;
        setOn(next);
        showToast(el, next ? words.saved : words.removed);
        void toggleWish(id, next).then((r) => {
          if (r === 'ok') return;
          setOn(readWishes().includes(id));
          const say = r === 'full' ? words.full : words.error;
          if (say) showToast(el, say);
        });
      }}
    >
      {on ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--sale)" aria-hidden="true">
          <path d="M12 20s-7-4.6-7-9.5A3.8 3.8 0 0112 7a3.8 3.8 0 017 3.5c0 4.9-7 9.5-7 9.5z" />
        </svg>
      ) : (
        <Icon name="heart" size={size} />
      )}
    </button>
  );
}
