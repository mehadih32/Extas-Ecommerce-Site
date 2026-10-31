// PR 503 + 84 — the shop's two languages and their addresses (Blueprint C12.1): English at the root, Bengali under
// /bn with the same slug. The language switch is a plain link to the twin page, so it works without JavaScript and a
// search engine sees both. The proxy (src/proxy.ts) serves /bn/… from the same pages and tells them the language in
// a request header.

export const SHOP_LANGS = ['en', 'bn'] as const;
export type ShopLang = (typeof SHOP_LANGS)[number];

/** The request header the proxy sets on every page request (never trusted from the browser: the proxy overwrites it). */
export const LANG_HEADER = 'x-extas-lang';
/** The page's own path (without /bn), set by the proxy, so server components can mark the current section. */
export const PATH_HEADER = 'x-extas-path';
/** `?theme=` from the address (PR 82 preview link), handed over by the proxy. */
export const THEME_HEADER = 'x-extas-theme';
/** The Bengali prefix. */
export const BN_PREFIX = '/bn';

export const isShopLang = (v: unknown): v is ShopLang => v === 'en' || v === 'bn';

/**
 * Paths the proxy never touches: the admin, the API, the ERP's signed calls (PR 620), the progress page, media and the
 * framework's own files.
 */
const NOT_SHOP = /^\/(admin|api|erp-api|status|media|_next|favicon\.ico|robots\.txt|sitemap\.xml|sitemaps)(\/|$)/;

export function isShopPath(path: string): boolean {
  return !NOT_SHOP.test(path);
}

/** Splits a request path into its language and the page path: `/bn/help/faq` → bn + `/help/faq`. */
export function splitLang(path: string): { lang: ShopLang; path: string } {
  if (path === BN_PREFIX || path.startsWith(`${BN_PREFIX}/`)) {
    const rest = path.slice(BN_PREFIX.length) || '/';
    return { lang: 'bn', path: rest };
  }
  return { lang: 'en', path: path || '/' };
}

/** The address of a shop path in a language: `/help/faq` → `/bn/help/faq`. Query and hash are kept. */
export function hrefIn(lang: ShopLang, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (lang === 'en') return p;
  if (p === '/') return BN_PREFIX;
  if (/^\/[?#]/.test(p)) return `${BN_PREFIX}${p.slice(1)}`;
  return `${BN_PREFIX}${p}`;
}

/** The same page in the other language (the switch). */
export function twinHref(lang: ShopLang, path: string): string {
  return hrefIn(lang === 'en' ? 'bn' : 'en', path);
}

const BN_ZERO = 0x09e6;

/** Western digits → Bengali digits (০–৯). Everything else stays. */
export function toBnDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => String.fromCharCode(BN_ZERO + Number(d)));
}

/** A number in the page's language: grouping commas, and Bengali digits on the Bengali shop when the setting says so. */
export function formatNumber(n: number, lang: ShopLang, bnDigits: boolean, locale = 'en'): string {
  const s = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
  return lang === 'bn' && bnDigits ? toBnDigits(s) : s;
}

/**
 * Money from minor units (paisa), as the demo writes it everywhere (02-core.js fmt()): a minus sign when below zero,
 * the currency's own symbol, a thin space, then the amount with grouping commas in the page's digits —
 * `৳ 1,500` / `৳ ১,৫০০` (D10: one format everywhere, never wrapped; the caller keeps it on one line). Inside a running
 * sentence (the announcement bar) the demo sets the symbol tight against the number: pass `gap` as an empty string.
 */
export function formatMoney(minor: number, currency: string, lang: ShopLang, bnDigits: boolean, locale = 'en', gap = '\u2009'): string {
  const neg = minor < 0;
  const major = Math.abs(minor) / 100;
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).formatToParts(major);
  const symbol = parts.filter((p) => p.type === 'currency').map((p) => p.value).join('');
  const amount = parts
    .filter((p) => p.type !== 'currency' && p.type !== 'literal' && p.type !== 'minusSign')
    .map((p) => p.value)
    .join('');
  const s = `${neg ? '\u2212' : ''}${symbol}${gap}${amount}`;
  return lang === 'bn' && bnDigits ? toBnDigits(s) : s;
}
