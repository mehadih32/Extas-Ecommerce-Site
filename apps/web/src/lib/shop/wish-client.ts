// PR 71 — the browser side of the wishlist: a copy of the list in this browser (so every heart is drawn at once, as in
// PR 41) kept in step with the server's list (lib/shop/wishlist.ts). Once per page: the old browser-only list is
// handed to the server the first time, and after that the copy is refreshed only when the count cookie says it is out
// of step. A blocked or private browser store still works: the server's list is the truth, the copy is a convenience.
import { WISH_CHANGED, WISH_STORE_KEY, WISH_SYNCED_KEY, wishCountOf } from './wish-model';

const API = '/api/wishlist';

export function readWishes(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(WISH_STORE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// PR 88 · one copy per page for the hearts: a page of cards drew 20–40 hearts, and each read and parsed the stored list
// and added two window listeners while the page hydrated (~8 ms of a slow phone's main thread on the product page).
// Now the hearts share one parsed copy and one pair of listeners; a change (this tab or another) drops the copy.
let shared: ReadonlySet<string> | null = null;
const hearts = new Set<() => void>();

function dropShared(): void {
  shared = null;
  hearts.forEach((f) => f());
}

/** Whether the product is in this browser's copy (the shared copy while hearts are listening). */
export function hasWish(id: string): boolean {
  if (!hearts.size) return readWishes().includes(id);
  shared ??= new Set(readWishes());
  return shared.has(id);
}

/** Calls `fn` whenever the list changes (here or in another tab); returns the unsubscribe. */
export function onWishes(fn: () => void): () => void {
  if (!hearts.size) {
    shared = null;
    window.addEventListener(WISH_CHANGED, dropShared);
    window.addEventListener('storage', dropShared);
  }
  hearts.add(fn);
  return () => {
    hearts.delete(fn);
    if (hearts.size) return;
    shared = null;
    window.removeEventListener(WISH_CHANGED, dropShared);
    window.removeEventListener('storage', dropShared);
  };
}

function writeWishes(list: string[], user: boolean): void {
  try {
    localStorage.setItem(WISH_STORE_KEY, JSON.stringify(list));
  } catch {
    /* not remembered in this browser */
  }
  window.dispatchEvent(new CustomEvent(WISH_CHANGED, { detail: { user } }));
}

function flag(key: string, set?: boolean): boolean {
  try {
    if (set) localStorage.setItem(key, '1');
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

type Answer = { ok: boolean; ids?: string[]; added?: string[]; full?: boolean };

async function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown): Promise<Answer | null> {
  try {
    const r = await fetch(API, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const a = (await r.json()) as Answer;
    return r.ok && a.ok ? a : null;
  } catch {
    return null;
  }
}

let syncing: Promise<void> | null = null;

/** Brings this browser's copy in step with the server, once per page (every heart calls it; one request at most). */
export function syncWishes(): Promise<void> {
  syncing ??= (async () => {
    const mine = readWishes();
    const n = wishCountOf(document.cookie);
    if (!flag(WISH_SYNCED_KEY)) {
      // the list this browser kept before the server had one (PR 41) goes to the server once
      const a = mine.length ? await call('POST', { ids: mine }) : n ? await call('GET') : { ok: true, ids: [] };
      if (!a) return;
      flag(WISH_SYNCED_KEY, true);
      if (a.ids) writeWishes(a.ids, false);
      return;
    }
    if ((n ?? 0) === mine.length) return;
    const a = await call('GET');
    if (a?.ids) writeWishes(a.ids, false);
  })();
  return syncing;
}

/** A heart tapped: the copy changes at once, the server follows; `full` when the list has no room. */
export async function toggleWish(id: string, on: boolean): Promise<'ok' | 'full' | 'error'> {
  const before = readWishes();
  // the copy changes at once (every heart redraws); `user` is said once the server has it (the list page redraws then)
  writeWishes(on ? [id, ...before.filter((x) => x !== id)] : before.filter((x) => x !== id), false);
  const a = on ? await call('POST', { ids: [id] }) : await call('DELETE', { productId: id });
  if (!a?.ids) {
    writeWishes(before, true);
    return 'error';
  }
  writeWishes(a.ids, true);
  return on && !a.ids.includes(id) ? (a.full ? 'full' : 'error') : 'ok';
}
