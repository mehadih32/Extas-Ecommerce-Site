// CN-053 (14 Nov 2026, owner) — stale or corrupt browser data must never again break a page, for a customer or for the
// admin, and nobody may have to clear cookies or cache. Everything this site keeps in a browser's own storage is
// checked once when a page loads: the stored data has a schema VERSION (`extas-store-v`); a value that is too big,
// is not what its key must hold, or cannot be read is silently dropped (the page then uses its default); a store written
// by a NEWER build (a rolled-back deploy) or a version no migration knows is dropped too. A migration keeps what it can:
// nothing is wiped on an upgrade (the shop's bag is a server record behind a cookie and is never touched here).
// Our own cookies that grew too big are expired the same way (they can push a request over a server's header limit).
// Pure rules over a `Storage`-like object so every case is tested without a browser.

/** The version of the stored data's shape. Raise it with a migration below whenever a stored value changes shape. */
export const STORAGE_VERSION = 1; // hardcode-ok: a schema version, not a business number
export const STORAGE_VERSION_KEY = 'extas-store-v';

export interface StoreLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/** A key this site owns (the shop's, the admin's and the checkout draft). Anything else in the browser is never read. */
export const OWNED_KEY = /^(extas[.:_-]|co-draft$)/;

/** The biggest stored value we keep (bytes of text); a bigger one is dropped, never parsed. */
export const MAX_VALUE_CHARS = 200_000; // hardcode-ok: a safety ceiling on a stored text

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What a known key must hold. A key not listed here only has to be readable (JSON when it looks like JSON). */
const SHAPES: ReadonlyArray<[RegExp, (v: unknown) => boolean]> = [
  [/^extas-admin-later$/, (v) => isRecord(v) && Object.values(v).every((n) => typeof n === 'number')],
  [/^extas\.wishlist$/, (v) => Array.isArray(v)],
  [/^extas\.campaign$/, (v) => isRecord(v)],
  [/^extas\.notice\.visit$/, (v) => isRecord(v)],
  [/^extas\.notice\./, (v) => Array.isArray(v)],
  [/^extas\.checkout\.details$/, (v) => isRecord(v) && isRecord(v.form) && typeof v.until === 'number'],
  [/^co-draft$/, (v) => isRecord(v)],
];

/** True when `raw` is a good value for `key`. */
export function storedValueOk(key: string, raw: string): boolean {
  if (raw.length > MAX_VALUE_CHARS) return false;
  const shape = SHAPES.find(([re]) => re.test(key));
  const looksJson = /^\s*[[{]/.test(raw);
  if (!shape && !looksJson) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    return shape ? shape[1](parsed) : true;
  } catch {
    return false;
  }
}

/** One step per version: moves the data of version n-1 to version n and keeps it. (None yet: version 1 only adds the check.) */
export const MIGRATIONS: Record<number, (store: StoreLike) => void> = {};

const keysOf = (store: StoreLike): string[] => {
  const out: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const k = store.key(i);
    if (k && OWNED_KEY.test(k)) out.push(k);
  }
  return out;
};

/** Checks and repairs one store. Returns the keys it dropped. Never throws. */
export function guardStore(store: StoreLike, version: number = STORAGE_VERSION): string[] {
  const dropped: string[] = [];
  const drop = (k: string) => {
    try {
      store.removeItem(k);
      dropped.push(k);
    } catch {
      // a store that refuses removal cannot be mended from here
    }
  };
  try {
    const raw = store.getItem(STORAGE_VERSION_KEY);
    const had = raw === null ? 0 : /^\d{1,4}$/.test(raw) ? Number(raw) : -1;
    // a newer build wrote this (a deploy was rolled back) or the marker is garbage: nothing here can be trusted
    if (had > version || had === -1) for (const k of keysOf(store)) drop(k);
    else for (let v = had + 1; v <= version; v += 1) {
      try {
        MIGRATIONS[v]?.(store);
      } catch {
        for (const k of keysOf(store)) drop(k); // a migration that fails drops the data it could not carry over
      }
    }
    for (const k of keysOf(store)) {
      if (k === STORAGE_VERSION_KEY) continue;
      let v: string | null = null;
      try {
        v = store.getItem(k);
      } catch {
        v = null;
      }
      if (v === null || !storedValueOk(k, v)) drop(k);
    }
    if (had !== version) store.setItem(STORAGE_VERSION_KEY, String(version));
  } catch {
    // storage is refused or broken: every reader already falls back to its default
  }
  return dropped;
}

// ---- cookies ----
/** The cookies this site sets (names begin like this); only these are ever expired by the guards. */
export const OWNED_COOKIE = /^(__Host-admin_|__Host-extas_|extas_|extas-|admin_lang$)/;
/** One of our cookies bigger than this (name and value, bytes) is expired. */
export const MAX_COOKIE_BYTES = 2048; // hardcode-ok: a header-size safety limit, far under the 4 KB a browser allows
/** When the whole Cookie header is bigger than this, our biggest cookies are expired until it fits. */
export const MAX_COOKIE_HEADER_BYTES = 6144; // hardcode-ok: a header-size safety limit, far under a server's header limit

/** The names of OUR cookies to expire so the Cookie header stays small. Pure: reads the header text only. */
export function oversizedOwnedCookies(header: string | null | undefined): string[] {
  if (!header) return [];
  const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
  const rows = parts.map((p) => ({ name: p.split('=')[0] ?? '', size: p.length }));
  const out = new Set(rows.filter((r) => OWNED_COOKIE.test(r.name) && r.size > MAX_COOKIE_BYTES).map((r) => r.name));
  let total = header.length - [...out].reduce((n, name) => n + (rows.find((r) => r.name === name)?.size ?? 0), 0);
  if (total > MAX_COOKIE_HEADER_BYTES) {
    for (const r of rows.filter((x) => OWNED_COOKIE.test(x.name) && !out.has(x.name)).sort((a, b) => b.size - a.size)) {
      if (total <= MAX_COOKIE_HEADER_BYTES) break;
      out.add(r.name);
      total -= r.size;
    }
  }
  return [...out];
}

/** Set-Cookie lines expiring `names` (host-only cookies need Secure and Path=/, so every line carries them). */
export function expiryLines(names: readonly string[]): string[] {
  return names.map((n) => `${n}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure`);
}

/** In the browser: run every guard once. Never throws. */
export function runStorageGuard(win: { localStorage?: StoreLike; sessionStorage?: StoreLike; document?: { cookie: string } } = window): string[] {
  const dropped: string[] = [];
  for (const get of [() => win.localStorage, () => win.sessionStorage]) {
    try {
      const s = get();
      if (s) dropped.push(...guardStore(s));
    } catch {
      // access to the storage itself can throw (blocked site data)
    }
  }
  try {
    if (win.document) for (const name of oversizedOwnedCookies(win.document.cookie)) for (const path of ['/', '/admin']) win.document.cookie = `${name}=; Path=${path}; Max-Age=0; Secure`;
  } catch {
    // cookies refused
  }
  return dropped;
}
