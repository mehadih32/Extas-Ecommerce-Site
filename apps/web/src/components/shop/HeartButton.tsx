'use client';
// PR 41 — the heart on a product card (demo 02-core.js ACT.wish): saves the product to this browser's wishlist or takes
// it out, with a short message. The list lives in this browser only until the wishlist page and the account's own list
// arrive (PR 71); a blocked or private browser simply does not remember it. The button is its own target, never inside
// the card's link (demo D-024), so a tap on it never opens the product.
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { showToast } from './toast';

const STORE_KEY = 'extas.wishlist';
const CHANGED = 'extas:wishlist';

function readList(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(list: string[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* not remembered in this browser */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export interface HeartWords {
  save: string;
  unsave: string;
  saved: string;
  removed: string;
}

/** `className` / `size`: the product page's heart after the title (PR 49, demo .pdp-wish, 22 px). */
export function HeartButton({ id, words, className = 'heart', size = 18, testId }: { id: string; words: HeartWords; className?: string; size?: number; testId?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readList().includes(id));
    sync();
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, [id]);
  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      aria-label={on ? words.unsave : words.save}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const list = readList();
        const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
        writeList(next);
        setOn(next.includes(id));
        showToast(e.currentTarget, next.includes(id) ? words.saved : words.removed);
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
