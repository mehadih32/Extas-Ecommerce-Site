// PR 12 (CN-032) — "Start fresh": one browser's saved data for this site, cleared by the site itself, so a stale cookie,
// a stale stored value or a stale cached file can never keep a page blank in one browser while it works in another.
// The owner never has to clear his whole browser: only this site's own data goes, everything else in it stays.
//   soft  the browser's cache and storage for this site (Clear-Site-Data "cache", "storage"); the sign-in stays. The
//         blank-page screen (app/global-error.tsx) does this once by itself and opens the page again.
//   full  soft, plus every cookie this site's request carries, expired on each path the site has used — except the
//         preview gate's own cookie (PR 7), so the preview login is not asked for again. The person signs in again.
// Clear-Site-Data "cookies" is not used: it would also clear the cookies of every other host under the same domain
// (the old shop on the main domain).

/** The preview gate's cookie (infra/stack/caddy/auth-block.sh): kept, it is the server's, not the app's. */
export const KEEP_COOKIES: readonly string[] = ['extas_preview'];
/** The paths the app's cookies have been set on (the admin's own choices live on /admin). */
const COOKIE_PATHS = ['/', '/admin'];
/** At most this many cookies are expired in one answer (a browser sends far fewer; a header has a size limit). */
const MAX_COOKIES = 60;

export type FreshLevel = 'soft' | 'full';

export const isFreshLevel = (v: unknown): v is FreshLevel => v === 'soft' || v === 'full';

/** The Clear-Site-Data value for both levels: this site's cache and storage (origin only). */
export const CLEAR_SITE_DATA = '"cache", "storage"';

/** Cookie names from a Cookie request header (names only; values are never read). */
export function cookieNames(header: string | null): string[] {
  if (!header) return [];
  const names = new Set<string>();
  for (const part of header.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name && /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) names.add(name);
  }
  return [...names];
}

/**
 * Set-Cookie lines that expire each cookie (but the kept ones) on every path the site uses. A `__Host-` cookie can only
 * be set, and so removed, with Secure, Path=/ and no Domain; a `__Secure-` one needs Secure.
 */
export function expireCookies(names: readonly string[], secure: boolean): string[] {
  const out: string[] = [];
  for (const name of names.filter((n) => !KEEP_COOKIES.includes(n)).slice(0, MAX_COOKIES)) {
    const host = name.startsWith('__Host-');
    const sec = host || name.startsWith('__Secure-') || secure ? '; Secure' : '';
    for (const path of host ? ['/'] : COOKIE_PATHS) out.push(`${name}=; Path=${path}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${sec}`);
  }
  return out;
}

/** The one-time automatic try (global-error): not again within this window, so a page that keeps failing never loops. */
export const AUTO_KEY = 'extas-fresh-auto';
export const AUTO_WINDOW_MS = 120_000;

/** Whether the blank-page screen may clear and reload by itself now (`last` = when it last did, from sessionStorage). */
export function mayAutoRecover(last: string | null, now: number): boolean {
  const at = last === null ? NaN : Number(last);
  return !Number.isFinite(at) || now - at > AUTO_WINDOW_MS || at > now;
}
