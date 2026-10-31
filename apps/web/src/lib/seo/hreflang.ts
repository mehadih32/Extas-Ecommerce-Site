// S11 · PR 236 — the language pairs (hreflang, Blueprint C12.1, GOOGLE-TRAFFIC-PLAN §1.2), pure. Each page names
// itself and its twin in the HTML head (`en`, `bn`, and `x-default` → the English one while the owner keeps it); the
// pair is named only when both twins may be listed and the Bengali one passed the translation gate (lib/seo/indexing
// `languagesOf`, used by every shop page through lib/shop/meta). The sitemaps carry the pairs only when
// `seo.hreflang.inSitemaps` is on (one method as shipped). This file says which pages have a pair, for the admin.
import type { SeoIndexing } from '@extas/settings';
import { ROUTES } from '../shop/routes';
import { languagesOf, pageIndexable, pageTypeOf } from './indexing';

/** The address of a page key (the key every page gives `shopMetadata`): `home` → `/`, `help-faq` → `/help/faq`. */
export function pathOfPageKey(key: string): string {
  if (key === 'home') return ROUTES.home;
  if (key.startsWith('help-')) return ROUTES.help(key.slice('help-'.length));
  return `/${key.replace(/^\/+/, '')}`;
}

export interface LanguagePair {
  key: string;
  /** The English address (the Bengali one is the same under /bn). */
  path: string;
  /** Both twins may be listed: the page names its pair. False: its kind is not shown to search engines. */
  named: boolean;
}

/** Every page marked Bengali-ready, and whether it names its pair (none while Bengali is off). */
export function languagePairs(o: { bengaliOn: boolean; ready: readonly string[]; policy: SeoIndexing; productPathPrefix: string }): LanguagePair[] {
  if (!o.bengaliOn) return [];
  return [...new Set(o.ready)].map((key) => ({ key, path: pathOfPageKey(key), named: pageIndexable(o.policy, pageTypeOf(key, o.productPathPrefix)) }));
}

/** The tags a page with a pair carries, absolute on the shop's address (its path alone with no address yet). */
export function hreflangTags(origin: URL | null, path: string, xDefault: SeoIndexing['xDefault']): { code: string; href: string }[] {
  const langs = languagesOf(path, { indexable: true, bnReady: true, xDefault }) ?? {};
  return Object.entries(langs).map(([code, href]) => ({ code, href: origin ? new URL(href, origin).toString() : href }));
}
