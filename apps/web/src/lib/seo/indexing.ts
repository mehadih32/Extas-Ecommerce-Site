// S11 · PR 220 — which shop pages search engines may list, and how each names its own address (Blueprint C12.1, review
// GOOGLE-TRAFFIC-PLAN §1.2–1.4). Pure: the page passes what it knows, the settings (`seo.indexing`) say the rest.
// - Every page belongs to one kind (`pageTypeOf`, from the page key the page already gives `shopMetadata`). Private
//   pages (bag, checkout, account, login, an order, the pay link) and "Coming soon" have no kind: never listed.
// - A page may be listed when its kind is ticked and the page itself does not say otherwise (a filtered list, a preview,
//   a pair that is not featured …): `pageIndexable`. A Bengali twin only once it is marked ready (PR 588 gate).
// - The shop as a whole is open only while `searchEngines` is on AND the request came in on the store's primary domain
//   (`robotsOf`). The preview host is never open, whatever the switch says.
// - hreflang names both twins (and x-default → the English one) only for a page that may be listed and whose Bengali
//   twin is ready; it does not wait for the whole shop to open, so the pairs can be checked on the preview.
import type { SeoIndexing, SeoPageType } from '@extas/settings';
import { hrefIn, type ShopLang } from '../shop/lang';
import { ROUTES } from '../shop/routes';

/** The first segment of each private address family (from the routing table): never listed, never lower-cased. */
export const PRIVATE_FAMILIES: readonly string[] = [...new Set([ROUTES.bag, ROUTES.checkout, ROUTES.account, ROUTES.payLink('x'), ROUTES.bulkOrder].map((p) => p.split('/')[1]!))];

/**
 * The kind of a page from its page key (`home`, `collections/<slug>`, `<product prefix>/<slug>`, `combo/<slug>`,
 * `combos`, `combos/build-your-own`, `combos/<rule>`, `help-<slug>`, `search`); null = a page that is never listed.
 */
export function pageTypeOf(pageKey: string, productPathPrefix: string): SeoPageType | null {
  const prefix = productPathPrefix.replace(/^\/+|\/+$/g, '');
  const category = ROUTES.category('x').split('/')[1];
  const combo = ROUTES.combo('x').split('/')[1];
  const combos = ROUTES.combos.slice(1);
  const builder = ROUTES.buildSet.slice(1);
  const search = ROUTES.search.slice(1);
  if (pageKey === 'home') return 'home';
  if (pageKey === search) return 'search';
  if (pageKey === combos) return 'combosHub';
  if (pageKey === builder || pageKey.startsWith(`${builder}/`)) return 'setBuilder';
  if (pageKey.startsWith(`${combos}/`)) return 'comboList';
  if (pageKey.startsWith(`${combo}/`)) return 'combo';
  if (pageKey.startsWith(`${category}/`)) return 'category';
  if (pageKey.startsWith('help-')) return 'help';
  if (prefix && pageKey.startsWith(`${prefix}/`)) return 'product';
  return null;
}

/** Whether this page may be listed once the shop is open: its kind is ticked and the page does not say no. */
export function pageIndexable(policy: SeoIndexing, type: SeoPageType | null, own = true): boolean {
  return own && type !== null && policy.pages[type];
}

export interface RobotsInput {
  policy: SeoIndexing;
  /** `pageIndexable` for this page. */
  indexable: boolean;
  lang: ShopLang;
  /** The Bengali twin passed the translation gate (and Bengali is on). */
  bnReady: boolean;
  /** The request came in on the store's primary domain. */
  onPrimary: boolean;
}

/** The page's robots: listed only while the shop is open on its own domain; links are always followed. */
export function robotsOf(i: RobotsInput): { index: boolean; follow: true } {
  const open = i.policy.searchEngines && i.onPrimary;
  return { index: open && i.indexable && (i.lang === 'en' || i.bnReady), follow: true };
}

/** The language twins (hreflang) of a page path, or undefined when the pair must not be named. */
export function languagesOf(path: string, o: { indexable: boolean; bnReady: boolean; xDefault: SeoIndexing['xDefault'] }): Record<string, string> | undefined {
  if (!o.indexable || !o.bnReady) return undefined;
  return { en: hrefIn('en', path), bn: hrefIn('bn', path), ...(o.xDefault === 'en' ? { 'x-default': hrefIn('en', path) } : {}) };
}

/**
 * PR 220 · lower case only (C12.1): a public page asked for with capital letters is the same page; the proxy sends it
 * on to the lower-case address (one permanent redirect, the query kept). Private families keep their case (an order
 * number or a pay token can hold capitals), and an address with %-escapes is left as it is.
 */
export function lowerCaseTarget(pathname: string): string | null {
  if (!/[A-Z]/.test(pathname) || pathname.includes('%')) return null;
  const first = pathname.split('/')[1] ?? '';
  const family = first.toLowerCase() === 'bn' ? (pathname.split('/')[2] ?? '') : first;
  if (PRIVATE_FAMILIES.includes(family.toLowerCase())) return null;
  return pathname.toLowerCase();
}
