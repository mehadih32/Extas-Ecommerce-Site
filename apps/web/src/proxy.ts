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
import { NextResponse, type NextRequest } from 'next/server';
import { shopCacheHeaders } from './lib/cache-policy';
import { lowerCaseTarget } from './lib/seo/indexing';
import { isShopPath, LANG_HEADER, PATH_HEADER, splitLang, THEME_HEADER } from './lib/shop/lang';

/** A permanent move (HTTP's own code for it; search engines carry the page's rank over). */
const PERMANENT = 301;

function withCacheHeaders(res: NextResponse, req: NextRequest): NextResponse {
  const h = shopCacheHeaders(req.nextUrl.pathname, req.cookies.getAll().map((c) => c.name));
  if (h['cache-control']) res.headers.set('cache-control', h['cache-control']);
  res.headers.set('cdn-cache-control', h['cdn-cache-control']);
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!isShopPath(pathname)) return NextResponse.next();
  const lower = lowerCaseTarget(pathname);
  if (lower) {
    const url = req.nextUrl.clone();
    url.pathname = lower;
    return NextResponse.redirect(url, PERMANENT);
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
    return withCacheHeaders(NextResponse.rewrite(url, { request: { headers: h } }), req);
  }
  return withCacheHeaders(NextResponse.next({ request: { headers: h } }), req);
}

export const config = {
  // Static files and the framework's own paths never reach the proxy.
  matcher: ['/((?!_next/|admin|api/|status|media/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)'],
};
