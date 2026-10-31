// PR 84 follow-up (review R1) — the proxy's mark on its own /bn rewrite. Next sends a rewrite on as a second request
// when the server's own address and the rewritten one differ (a server bound to 127.0.0.1: Next calls it "localhost");
// the proxy then runs again on the English path. A request carrying this process's mark, with the Bengali language and
// the same path the proxy gave it, keeps them. The mark is random per process, never sent to a browser and overwritten
// on every request the proxy hands on, so a visitor can never ask for a Bengali page at an English address (which a
// cache would then keep).
import { LANG_HEADER, PATH_HEADER, REWRITE_MARK_HEADER, splitLang, type ShopLang } from './lang';

const marks = globalThis as unknown as { __extasRewriteMark?: string };

/** This process's mark (random, made once per process). */
export function rewriteMark(): string {
  return (marks.__extasRewriteMark ??= crypto.randomUUID());
}

/** The language and page path of a request; the proxy's own /bn rewrite seen again keeps its Bengali. */
export function requestLang(pathname: string, headers: Headers): { lang: ShopLang; path: string } {
  const split = splitLang(pathname);
  if (split.lang === 'en' && headers.get(REWRITE_MARK_HEADER) === rewriteMark() && headers.get(LANG_HEADER) === 'bn' && headers.get(PATH_HEADER) === pathname) {
    return { lang: 'bn', path: pathname };
  }
  return split;
}
