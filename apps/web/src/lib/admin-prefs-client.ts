// CN-053 (14 Nov 2026) — the admin's small choices kept in the browser itself (the language and rail cookies, the
// "Later" lists), read and written so that a broken, missing or refused store can never blank a page: every access is
// inside try/catch, every value is checked, and the default is the fallback. "Reload" on an error screen clears them.
import { ADMIN_LANG_COOKIE } from './admin-nav';
import { RAIL_COOKIE } from './admin-shell/model';

/** The browser-storage keys the admin owns (never the shop's, never the session). */
export const ADMIN_STORAGE_KEYS: readonly string[] = ['extas-admin-later'];
/** The cookies the admin owns on the browser side (never the session cookie, never a shop or customer cookie). */
export const ADMIN_PREF_COOKIES: readonly string[] = [ADMIN_LANG_COOKIE, RAIL_COOKIE];

const YEAR_SECONDS = 365 * 24 * 60 * 60; // hardcode-ok: one year, the cookies' own age (a unit conversion)

const secureFlag = (): string => {
  try {
    return window.location.protocol === 'https:' ? '; Secure' : '';
  } catch {
    return '';
  }
};

/** Keeps one admin choice in a cookie for the whole site (Path=/, so the sign-in address sees it too); false if the browser refused. */
export function setAdminCookie(name: string, value: string): boolean {
  try {
    // an older copy under /admin would be sent first and win: expire it
    document.cookie = `${name}=; Path=/admin; Max-Age=0${secureFlag()}`;
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax${secureFlag()}`;
    return true;
  } catch {
    return false;
  }
}

/** Reads a stored text and checks it with `ok`; anything unreadable or not accepted is `fallback`. */
export function readChoice<T extends string>(read: () => string | null | undefined, ok: (v: string) => v is T, fallback: T): T {
  try {
    const v = read();
    return typeof v === 'string' && ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** Clears every admin choice kept in this browser (the "Reload" button of the error screens). Never throws. */
export function clearAdminPrefs(): void {
  for (const key of ADMIN_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage refused: nothing to clear
    }
  }
  for (const name of ADMIN_PREF_COOKIES) {
    for (const path of ['/', '/admin']) {
      try {
        document.cookie = `${name}=; Path=${path}; Max-Age=0${secureFlag()}`;
      } catch {
        // cookies refused
      }
    }
  }
}
