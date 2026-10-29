// PR 84 / 588 — a shop page's title and its two-language links. Both twins name each other (hreflang), and a Bengali
// page stays out of search engines until the owner marks it ready (`language.bengali.readyPages`, the translation gate
// of PR 588), so a half-translated page is never found.
// S11 · PR 220 — the URL and canonical rules (Blueprint C12.1): every page names itself, in its own language, as its
// canonical address on the shop's own domain (lib/seo/site: the store's primary domain, else the preview host); a page
// may be listed only when its kind is ticked in `seo.indexing` and the page itself does not say no (`index: false`: a
// filtered list, a preview, a pair that is not featured); the whole shop is listed only while the owner has opened it
// to search engines AND the request is on the primary domain, so the preview always stays out. hreflang (en, bn and
// x-default → English) names only twins that may be listed and whose Bengali page is ready; links are always followed.
import type { Metadata } from 'next';
import { cache } from 'react';
import { pageIndexable, pageTypeOf, languagesOf, robotsOf } from '../seo/indexing';
import { siteAddress } from '../seo/site';
import { readPageSettings, shopStoreId, type ShopContext } from './context';
import { hrefIn } from './lang';

/** Whether the Bengali twin of a page may be indexed. */
export function bengaliReady(pageKey: string, ready: readonly string[]): boolean {
  return ready.includes(pageKey);
}

const KEYS = ['seo.indexing'] as const;
const seoSettingsFor = cache((storeId: number) => readPageSettings(KEYS, storeId));

/** The shop's own origin for absolute links (canonical, hreflang, JSON-LD): a setting of the store, never code. */
export async function shopOrigin(storeId?: number): Promise<URL | undefined> {
  return (await siteAddress(storeId ?? shopStoreId())).origin;
}

export interface PageSeo {
  /** The page's canonical path without /bn (default: the address asked for, without its query). */
  path?: string;
  /** false: this page is never a search result, whatever its kind (filtered, preview, not on sale …). */
  index?: boolean;
}

export async function shopMetadata(c: ShopContext, pageKey: string, title: string | null, opts: PageSeo = {}): Promise<Metadata> {
  const [set, site] = await Promise.all([seoSettingsFor(c.storeId), siteAddress(c.storeId)]);
  const policy = set['seo.indexing'];
  const path = opts.path ?? c.path;
  const bnReady = c.s['language.bengali.enabled'] && bengaliReady(pageKey, c.s['language.bengali.readyPages']);
  const indexable = pageIndexable(policy, pageTypeOf(pageKey, c.s['naming.productPathPrefix']), opts.index ?? true);
  const languages = languagesOf(path, { indexable, bnReady, xDefault: policy.xDefault });
  return {
    title: title ? c.t('meta.page', { page: title, store: c.storeName }) : c.t('meta.title', c.vars),
    ...(site.origin ? { metadataBase: site.origin } : {}),
    alternates: { canonical: hrefIn(c.lang, path), ...(languages ? { languages } : {}) },
    robots: robotsOf({ policy, indexable, lang: c.lang, bnReady, onPrimary: site.onPrimary }),
  };
}
