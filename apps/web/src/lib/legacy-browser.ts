// CN-043 (11 Nov 2026, owner) — a browser that used the old WordPress/WooCommerce shop on this same domain before
// go-live can still hold that shop's cookies, cached files and a registered service worker; the old service worker can
// intercept every request (including /admin) and answer from its own stale cache before our app ever loads, which
// shows a white page with no error our own code can catch. Pure helpers only (proxy.ts and the route handlers use
// these); nothing here reads a cookie's value, only its name.

/** Old WordPress/WooCommerce cookie name prefixes (never one of ours: our own cookies are `__Host-admin_*`/`extas_*`). */
const LEGACY_COOKIE_RE = /^(wordpress_|wp-settings-|wp_woocommerce_session_|woocommerce_)/i;

/** At most this many cookies are expired in one answer (a header has a size limit; a browser rarely sends this many). */
const MAX_LEGACY_COOKIES = 40;

/** Legacy cookie names from a Cookie request header (names only). */
export function legacyCookieNames(header: string | null): string[] {
  const names: string[] = [];
  if (!header) return names;
  for (const part of header.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name && LEGACY_COOKIE_RE.test(name)) names.push(name);
  }
  return names.slice(0, MAX_LEGACY_COOKIES);
}

/**
 * Set-Cookie lines that expire each legacy cookie, both for this exact host and for the whole registrable domain
 * (`Domain=.<domain>`), since WooCommerce sets some cookies host-only and some domain-wide. `domain` is the bare
 * registrable domain (e.g. "extas.com.bd"), from the request's own host — never hardcoded.
 */
export function expireLegacyCookies(names: readonly string[], domain: string | null): string[] {
  const out: string[] = [];
  for (const name of names) {
    out.push(`${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`);
    if (domain) out.push(`${name}=; Path=/; Domain=.${domain}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`);
  }
  return out;
}

/** The bare registrable domain of a host (strips a leading "www." and any port); null for an IP or a bare word. */
export function registrableDomain(host: string | null): string | null {
  if (!host) return null;
  const bare = host.split(':')[0]!.replace(/^www\./, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare)) return null; // an IPv4 literal, never a domain to scope a cookie to
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(bare) ? bare : null;
}

/** The well-known paths old WordPress plugins (and push SDKs it carried) registered a service worker at. */
export const LEGACY_SERVICE_WORKER_PATHS = ['/sw.js', '/service-worker.js', '/OneSignalSDKWorker.js', '/firebase-messaging-sw.js'] as const;

/**
 * CN-045 (12 Nov, qa-gate): `/reset`'s own Clear-Site-Data value. The route handler (route.ts) already answers this
 * header itself, but the CI "sign-in end to end" run against the built Docker image (standalone output) showed the
 * header missing from the browser's own answer even though `next dev` always returns it correctly — a production-build
 * difference in exactly this one Route Handler's headers that this repo could not pin down further without a live
 * Docker rebuild. The proxy (proxy.ts) answers it too, from this same constant, as a second, always-reliable path: its
 * own headers (the page CSP, the legacy cookie cleanup) are proven to reach the browser in every build mode.
 */
export const RESET_CLEAR_SITE_DATA = '"cache", "cookies", "storage"';

/** A service worker that removes itself and every cache it owned, so an old registration stops intercepting requests. */
export const LEGACY_SERVICE_WORKER_SCRIPT =
  "self.addEventListener('install',()=>self.skipWaiting());" +
  "self.addEventListener('activate',(e)=>e.waitUntil(Promise.all([caches.keys().then((ks)=>Promise.all(ks.map((k)=>caches.delete(k)))),self.registration.unregister()]).then(()=>self.clients.matchAll().then((cs)=>cs.forEach((c)=>c.navigate(c.url))))));";

/** The `/reset` page's text, in Bengali — a plain string so the route needs no React render and no client script. */
export function resetPageHtml(): string {
  return `<!doctype html>
<html lang="bn" translate="no">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="1;url=/admin/login">
<title>ব্রাউজার পরিষ্কার হচ্ছে…</title>
<body style="font-family:system-ui,sans-serif;padding:48px 20px;text-align:center;color:#111;background:#fff">
<p style="font-size:18px">ব্রাউজার পরিষ্কার হচ্ছে…</p>
</body>
</html>
`;
}
