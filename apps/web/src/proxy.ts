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
import { NextResponse, type NextRequest } from 'next/server';
import { shopCacheHeaders } from './lib/cache-policy';
import { apiGate, pageCspHeader } from './lib/security/edge-gate';
import { lowerCaseTarget } from './lib/seo/indexing';
import { countRedirectHit, forwardOf, redirectTable } from './lib/seo/redirect-table';
import { isShopPath, LANG_HEADER, PATH_HEADER, splitLang, THEME_HEADER } from './lib/shop/lang';
import { shopStoreId } from './lib/shop/store-id';

/** A permanent move (HTTP's own code for it; search engines carry the page's rank over). */
const PERMANENT = 301;

function withCacheHeaders(res: NextResponse, req: NextRequest): NextResponse {
  const h = shopCacheHeaders(req.nextUrl.pathname, req.cookies.getAll().map((c) => c.name));
  if (h['cache-control']) res.headers.set('cache-control', h['cache-control']);
  res.headers.set('cdn-cache-control', h['cdn-cache-control']);
  return res;
}

/** PR 378: the cross-site check and the request limits in front of every API call (lib/security/edge-gate.ts). */
function gateApi(req: NextRequest): NextResponse {
  const a = apiGate({ method: req.method, path: req.nextUrl.pathname, url: req.url, headers: req.headers });
  if (a.kind === 'pass') return NextResponse.next();
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (a.retryAfterSeconds) headers['retry-after'] = String(a.retryAfterSeconds);
  return NextResponse.json({ ok: false, error: a.error }, { status: a.status, headers });
}

/** PR 378: the page protection policy on every page (report only until the owner turns it on). */
function withPageCsp(res: NextResponse): NextResponse {
  const h = pageCspHeader();
  if (h) res.headers.set(h.name, h.value);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname.startsWith('/api/') || pathname.startsWith('/erp-api/')) return gateApi(req);
  if (!isShopPath(pathname)) return withPageCsp(NextResponse.next());
  const lower = lowerCaseTarget(pathname);
  if (lower) {
    const url = req.nextUrl.clone();
    url.pathname = lower;
    return NextResponse.redirect(url, PERMANENT);
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    const fwd = forwardOf(await redirectTable(shopStoreId()), pathname, req.nextUrl.search);
    if (fwd) {
      countRedirectHit(fwd.id);
      return NextResponse.redirect(new URL(fwd.location, req.nextUrl), fwd.status);
    }
  }
  const { lang, path } = splitLang(pathname);
  if (!isShopPath(path)) return NextResponse.next(); // /bn/admin is not the admin
  const h = new Headers(req.headers);
  h.set(LANG_HEADER, lang);
  h.set(PATH_HEADER, path);
  const theme = searchParams.get('theme');
  if (theme && /^[a-z]{1,20}$/.test(theme)) h.set(THEME_HEADER, theme);
  else h.delete(THEME_HEADER);
  if (lang === 'bn') {
    const url = req.nextUrl.clone();
    url.pathname = path;
    return withPageCsp(withCacheHeaders(NextResponse.rewrite(url, { request: { headers: h } }), req));
  }
  return withPageCsp(withCacheHeaders(NextResponse.next({ request: { headers: h } }), req));
}

export const config = {
  // Static files and the framework's own paths never reach the proxy. PR 378: the API (for the cross-site check and
  // the request limits) and the admin's pages (for the page protection policy) do.
  matcher: [
    '/((?!_next/|admin|api/|erp-api/|status|media/|favicon\\.ico|robots\\.txt|sitemap\\.xml|sitemaps/).*)',
    '/api/:path*',
    '/erp-api/:path*',
    '/admin',
    '/admin/:path*',
  ],
};
