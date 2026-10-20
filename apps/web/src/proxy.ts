// PR 84 / C12.1 — the shop's two languages on one set of pages. English lives at the root; Bengali at /bn with the
// same slug. A /bn/… request is served by the same page as /…, with the language (and the page's own path) handed to
// it in request headers; every other shop request gets the English header. Whatever a browser sends in these
// headers is overwritten, so a page can trust them. The admin, the API, the progress page and media are untouched.
// Also hands over `?theme=` (PR 82 preview link); the page decides whether previews are allowed (`theme.previewParam`).
import { NextResponse, type NextRequest } from 'next/server';
import { isShopPath, LANG_HEADER, PATH_HEADER, splitLang, THEME_HEADER } from './lib/shop/lang';

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!isShopPath(pathname)) return NextResponse.next();
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
    return NextResponse.rewrite(url, { request: { headers: h } });
  }
  return NextResponse.next({ request: { headers: h } });
}

export const config = {
  // Static files and the framework's own paths never reach the proxy.
  matcher: ['/((?!_next/|admin|api/|status|media/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)'],
};
