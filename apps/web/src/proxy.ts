// PR 84 / C12.1 — the shop's two languages on one set of pages. English lives at the root; Bengali at /bn with the
// same slug. A /bn/… request is served by the same page as /…, with the language (and the page's own path) handed to
// it in request headers; every other shop request gets the English header. Whatever a browser sends in these
// headers is overwritten, so a page can trust them. The admin, the API, the progress page and media are untouched.
// Also hands over `?theme=` (PR 82 preview link); the page decides whether previews are allowed (`theme.previewParam`).
// PR 602: every shop page answers with its cache headers (lib/cache-policy.ts): the bag, the checkout and the account
// are never kept anywhere; Cloudflare keeps a category or product page only while the owner has page caching at
// Cloudflare on, and never one asked for with a cookie of the visitor's own.
// S11 · PR 220: a public page asked for with capital letters moves permanently to its lower-case address (Blueprint
// C12.1: one address per page, lower case; the query is kept). The slash-free form is Next's own rule (a trailing
// slash is sent on to the address without it, permanently). No redirect by the browser's language, ever.
// S11 · PR 235: an old address in the redirect table (a renamed product or category, a link typed in by hand, a combo's
// colours in another order, the WordPress map once it is live) forwards permanently to its page, before any page draws
// (lib/seo/redirect-table: the table is kept in this process, so the proxy never waits on the database).
// S18 · PR 378: every API call passes the cross-site check and the request limits first (lib/security/edge-gate.ts),
// and every page (the shop's and the admin's) gets the page protection policy the settings say.
// S11 · PR 588: the Bengali translation gate — while the owner chose `english` (`language.bengali.gate`), a Bengali
// content page not marked ready goes to its English twin for now (lib/seo/bengali-gate).
// PR 84 follow-up (review R1): when Next sends the /bn rewrite on as a second request (the server's own address differs
// from the rewritten one, e.g. bound to 127.0.0.1), the proxy runs again on the English path and used to overwrite the
// language with English: every /bn page drew in English. The rewrite now carries this process's random mark, and a
// request with it keeps the Bengali language and path it was given (a browser cannot know the mark).
// S13 · PR 257 follow-up (go-live gate customer 360°): a shop page asked for with campaign tags or an ad click id keeps
// them in the shop's own cookie while `ads.attribution` is on (lib/tracking/attribution.ts); that answer is never cached.
// S02 · PR 83: while an A/B test runs, a visitor (not a bot) who has no random id yet gets one in the bag's own cookie
// before the page draws, so he sees the same version every time (the page reads it from a request header this once);
// `?abPreview=<test id>.a|b` hands a preview of one test's version to the page and keeps it from page to page until the
// browser closes (`?abPreview=off` stops it). Neither answer is ever cached.
// PR 40 follow-up (6 Nov): an address the shop has no page for at all (lib/shop/unknown-address: not under a folder of
// its own, not a product address, not "Coming soon") answers HTTP 404 from here, and the request carries this
// process's mark in NOT_FOUND_HEADER, so the catch-all page draws the shop's not-found page on the server (Next draws a
// page's own notFound() only in the browser). A browser's own copy of the header is always dropped.
// CN-043 (11 Nov 2026, owner) — on every answer, also expire any old WordPress/WooCommerce cookie the browser still
// carries from the shop that used to run on this same domain before go-live (lib/legacy-browser.ts). Name-matched
// only, so this never touches our own cookies; every branch below (the shop's and the admin's alike) goes through it.
import { NextResponse, type NextRequest } from 'next/server';
import { shopCacheHeaders } from './lib/cache-policy';
import { AB_PREVIEW_COOKIE, AB_PREVIEW_HEADER, AB_PREVIEW_PARAM, AB_VISITOR_HEADER, BOT, newVisitorId, previewCookie, previewOf, visitorIdOf } from './lib/experiments/edge';
import { liveTests, showing } from './lib/experiments/live';
import { expireLegacyCookies, legacyCookieNames, registrableDomain, RESET_CLEAR_SITE_DATA } from './lib/legacy-browser';
import { apiGate, pageCspHeader } from './lib/security/edge-gate';
import { bengaliGateSends } from './lib/seo/bengali-gate';
import { lowerCaseTarget } from './lib/seo/indexing';
import { countRedirectHit, forwardOf, redirectTable } from './lib/seo/redirect-table';
import { BAG_COOKIE, bagCookie } from './lib/shop/bag-model';
import { isShopPath, LANG_HEADER, PATH_HEADER, REWRITE_MARK_HEADER, THEME_HEADER } from './lib/shop/lang';
import { requestLang, rewriteMark } from './lib/shop/rewrite-mark';
import { shopStoreId } from './lib/shop/store-id';
import { NOT_FOUND_HEADER, unknownAddressNow } from './lib/shop/unknown-address';
import { ATTRIBUTION_COOKIE, fromElsewhere, hasTags, landingCookie } from './lib/tracking/attribution';

/** A permanent move (HTTP's own code for it; search engines carry the page's rank over). */
const PERMANENT = 301;
/** PR 588: a move for now (the Bengali page opens once it is marked ready). */
const TEMPORARY = 307;
/** PR 40 follow-up: HTTP's own code for "no page at this address". */
const NOT_FOUND = 404;

function withCacheHeaders(res: NextResponse, req: NextRequest): NextResponse {
  const h = shopCacheHeaders(req.nextUrl.pathname, req.cookies.getAll().map((c) => c.name));
  if (h['cache-control']) res.headers.set('cache-control', h['cache-control']);
  res.headers.set('cdn-cache-control', h['cdn-cache-control']);
  return res;
}

/** CN-043: expires any old WordPress/WooCommerce cookie this browser still carries, by name only. */
function withLegacyCookieCleanup(res: NextResponse, req: NextRequest): NextResponse {
  const names = legacyCookieNames(req.headers.get('cookie'));
  if (!names.length) return res;
  const domain = registrableDomain(req.headers.get('host'));
  for (const line of expireLegacyCookies(names, domain)) res.headers.append('set-cookie', line);
  return res;
}

/** PR 378: the cross-site check and the request limits in front of every API call (lib/security/edge-gate.ts). */
function gateApi(req: NextRequest): NextResponse {
  const a = apiGate({ method: req.method, path: req.nextUrl.pathname, url: req.url, headers: req.headers });
  if (a.kind === 'pass') return NextResponse.next();
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  // PR 378 follow-up: a report over its limit is dropped quietly (nothing stored, nothing for the page to show)
  if (a.kind === 'drop') return new NextResponse(null, { status: 204, headers });
  if (a.retryAfterSeconds) headers['retry-after'] = String(a.retryAfterSeconds);
  return NextResponse.json({ ok: false, error: a.error }, { status: a.status, headers });
}

/** PR 378: the page protection policy on every page (report only until the owner turns it on). */
function withPageCsp(res: NextResponse): NextResponse {
  const h = pageCspHeader();
  if (h) res.headers.set(h.name, h.value);
  return res;
}

/** PR 257 follow-up: the campaign tags of a tagged shop address, kept in the shop's own cookie (and never cached); PR 238: an untagged visit from a listed search engine or AI assistant too. */
async function withAttribution(res: NextResponse, req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'GET') return res;
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host).split(',')[0]!.trim();
  // PR 238: an untagged visit from another site is looked at too (kept only from a listed search engine or AI assistant)
  if (!hasTags(req.nextUrl.searchParams) && !fromElsewhere(req.headers.get('referer'), host)) return res;
  const line = await landingCookie({ storeId: shopStoreId(), params: req.nextUrl.searchParams, referer: req.headers.get('referer'), host, cookie: req.cookies.get(ATTRIBUTION_COOKIE)?.value ?? null });
  if (!line) return res;
  res.headers.append('set-cookie', line);
  res.headers.set('cache-control', 'private, no-store');
  res.headers.set('cdn-cache-control', 'no-store');
  return res;
}

/**
 * PR 83: the A/B test headers for a shop page. A rewrite's second pass (it carries this process's mark) keeps what the
 * first pass gave; otherwise whatever the browser sent is dropped, a preview link is handed on, and a new visitor gets
 * his random id while a test runs. Answers the cookie to send back (or null) and whether the answer must not be kept.
 */
async function abHeaders(req: NextRequest, h: Headers, marked: boolean): Promise<{ cookie: string | null; noStore: boolean }> {
  if (marked) return { cookie: null, noStore: !!(h.get(AB_VISITOR_HEADER) || h.get(AB_PREVIEW_HEADER)) };
  h.delete(AB_VISITOR_HEADER);
  h.delete(AB_PREVIEW_HEADER);
  const asked = req.nextUrl.searchParams.get(AB_PREVIEW_PARAM);
  if (asked === 'off') return { cookie: previewCookie(null), noStore: true };
  const fromLink = previewOf(asked);
  const preview = fromLink ?? previewOf(req.cookies.get(AB_PREVIEW_COOKIE)?.value);
  if (preview) {
    h.set(AB_PREVIEW_HEADER, `${preview.id}.${preview.version}`);
    return { cookie: fromLink ? previewCookie(`${preview.id}.${preview.version}`) : null, noStore: true };
  }
  if (req.method !== 'GET' || visitorIdOf(req.cookies.get(BAG_COOKIE)?.value) || BOT.test(req.headers.get('user-agent') ?? '')) return { cookie: null, noStore: false };
  const live = await liveTests(shopStoreId());
  if (!showing(live).length) return { cookie: null, noStore: false };
  const id = newVisitorId();
  h.set(AB_VISITOR_HEADER, id);
  return { cookie: bagCookie(BAG_COOKIE, id, live.cookieDays), noStore: true };
}

function withAb(res: NextResponse, ab: { cookie: string | null; noStore: boolean }): NextResponse {
  if (ab.cookie) res.headers.append('set-cookie', ab.cookie);
  if (ab.noStore) {
    res.headers.set('cache-control', 'private, no-store');
    res.headers.set('cdn-cache-control', 'no-store');
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith('/api/') || pathname.startsWith('/erp-api/')) return withLegacyCookieCleanup(gateApi(req), req);
  if (!isShopPath(pathname)) {
    const res = withLegacyCookieCleanup(withPageCsp(NextResponse.next()), req);
    // CN-045: the route's own Clear-Site-Data header was missing from the Docker-built image's answer in CI's own
    // "sign-in end to end" run; the proxy's own headers are proven to always reach the browser, so it answers the
    // same value too (lib/legacy-browser.ts RESET_CLEAR_SITE_DATA), never for any other path.
    if (pathname === '/reset') res.headers.set('clear-site-data', RESET_CLEAR_SITE_DATA);
    return res;
  }
  const lower = lowerCaseTarget(pathname);
  if (lower) {
    const url = req.nextUrl.clone();
    url.pathname = lower;
    return withLegacyCookieCleanup(NextResponse.redirect(url, PERMANENT), req);
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const fwd = forwardOf(await redirectTable(shopStoreId()), pathname, req.nextUrl.search);
    if (fwd) {
      countRedirectHit(fwd.id);
      return withLegacyCookieCleanup(NextResponse.redirect(new URL(fwd.location, req.nextUrl), fwd.status), req);
    }
  }
  const { lang, path } = requestLang(pathname, req.headers);
  if (!isShopPath(path)) return withLegacyCookieCleanup(NextResponse.next(), req); // /bn/admin is not the admin
  // PR 588: a Bengali page not marked ready goes to its English twin while the owner chose so (temporary, never cached)
  if (lang === 'bn' && (req.method === 'GET' || req.method === 'HEAD') && (await bengaliGateSends(shopStoreId(), path))) {
    const res = NextResponse.redirect(new URL(`${path}${req.nextUrl.search}`, req.nextUrl), TEMPORARY);
    res.headers.set('cache-control', 'no-store');
    return withLegacyCookieCleanup(res, req);
  }
  const h = new Headers(req.headers);
  h.set(LANG_HEADER, lang);
  h.set(PATH_HEADER, path);
  const theme = searchParams.get('theme');
  if (theme && /^[a-z]{1,20}$/.test(theme)) h.set(THEME_HEADER, theme);
  else h.delete(THEME_HEADER);
  const ab = await abHeaders(req, h, req.headers.get(REWRITE_MARK_HEADER) === rewriteMark());
  h.delete(REWRITE_MARK_HEADER);
  // PR 40 follow-up: an address with no page at all answers 404 here, marked for the catch-all page
  h.delete(NOT_FOUND_HEADER);
  const missing = (req.method === 'GET' || req.method === 'HEAD') && (await unknownAddressNow(shopStoreId(), path));
  if (missing) h.set(NOT_FOUND_HEADER, rewriteMark());
  const status = missing ? NOT_FOUND : undefined;
  if (lang === 'bn' && pathname !== path) {
    h.set(REWRITE_MARK_HEADER, rewriteMark());
    const url = req.nextUrl.clone();
    url.pathname = path;
    return withLegacyCookieCleanup(await withAttribution(withAb(withPageCsp(withCacheHeaders(NextResponse.rewrite(url, { request: { headers: h }, status }), req)), ab), req), req);
  }
  return withLegacyCookieCleanup(await withAttribution(withAb(withPageCsp(withCacheHeaders(NextResponse.next({ request: { headers: h }, status }), req)), ab), req), req);
}

export const config = {
  // Static files and the framework's own paths never reach the proxy. PR 378: the API (for the cross-site check and
  // the request limits) and the admin's pages (for the page protection policy) do.
  matcher: [
    '/((?!_next/|admin|api/|erp-api/|status|media/|favicon\\.ico|robots\\.txt|llms\\.txt|sitemap\\.xml|sitemaps/).*)',
    '/api/:path*',
    '/erp-api/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
