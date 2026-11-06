// PR 84 / 588 — a shop page's title and its two-language links. Both twins name each other (hreflang), and a Bengali
// page stays out of search engines until the owner marks it ready (`language.bengali.readyPages`, the translation gate
// of PR 588), so a half-translated page is never found.
// S11 · PR 220 — the URL and canonical rules (Blueprint C12.1): every page names itself, in its own language, as its
// canonical address on the shop's own domain (lib/seo/site: the store's primary domain, else the preview host); a page
// may be listed only when its kind is ticked in `seo.indexing` and the page itself does not say no (`index: false`: a
// filtered list, a preview, a pair that is not featured); the whole shop is listed only while the owner has opened it
// to search engines AND the request is on the primary domain, so the preview always stays out. hreflang (en, bn and
// x-default → English) names only twins that may be listed and whose Bengali page is ready; links are always followed.
// S11 · PR 221 — the search title and meta description (lib/seo/templates: the page's own text, then the kind's
// template `seo.titles`, then its body words), also given to link previews (Open Graph) with the canonical address.
// S12 · PR 249 — a journal article: its own description (the search description, else the one-line answer or the
// summary, cut to the limit) without a template, its twin's own address for hreflang (a Bengali article is written in
// Bengali and passed its review steps, so it needs no "ready" mark), and Open Graph as an article with its dates.
import type { Metadata } from 'next';
import { cache } from 'react';
import type { SeoTemplatePage } from '@extas/settings';
import { pageIndexable, pageTypeOf, languagesOf, robotsOf, twinLanguagesOf } from '../seo/indexing';
import { pageTexts, templateOf, type PageTexts } from '../seo/templates';
import { siteAddress } from '../seo/site';
import { readPageSettings, shopStoreId, type ShopContext } from './context';
import { hrefIn } from './lang';

/** Whether the Bengali twin of a page may be indexed. */
export function bengaliReady(pageKey: string, ready: readonly string[]): boolean {
  return ready.includes(pageKey);
}

const KEYS = ['seo.indexing', 'seo.titles', 'naming.seoTitleMaxChars', 'naming.metaDescriptionMaxChars'] as const;
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
  /**
   * PR 221: the page's search texts — its kind's template with the page's tokens ({shop} is added here), its own text
   * and body words; or texts already made (a product's, from Names & links). Without: the plain title, no description.
   */
  seo?: { kind: SeoTemplatePage; tokens?: Record<string, string>; own?: { title?: string | null; description?: string | null }; body?: string | null } | { texts: PageTexts };
  /** PR 249: no template — the page's own description, else its body words (a journal article). */
  own?: { description?: string | null; body?: string | null };
  /** PR 249: the page in each language at its own address (a journal article and its live twin; null = no twin). */
  twins?: { en: string | null; bn: string | null };
  /** PR 249: Open Graph as an article, with its dates (ISO) and topic. */
  article?: { publishedTime: string | null; modifiedTime: string | null; section: string | null };
}

export async function shopMetadata(c: ShopContext, pageKey: string, title: string | null, opts: PageSeo = {}): Promise<Metadata> {
  const [set, site] = await Promise.all([seoSettingsFor(c.storeId), siteAddress(c.storeId)]);
  const policy = set['seo.indexing'];
  const path = opts.path ?? c.path;
  const bnOn = c.s['language.bengali.enabled'];
  const bnReady = bnOn && (opts.twins ? true : bengaliReady(pageKey, c.s['language.bengali.readyPages']));
  const indexable = pageIndexable(policy, pageTypeOf(pageKey, c.s['naming.productPathPrefix']), opts.index ?? true);
  const languages = opts.twins ? twinLanguagesOf(opts.twins, { indexable, bnOn, xDefault: policy.xDefault }) : languagesOf(path, { indexable, bnReady, xDefault: policy.xDefault });
  const max = { title: set['naming.seoTitleMaxChars'], description: set['naming.metaDescriptionMaxChars'] };
  const texts = !opts.seo
    ? opts.own
      ? pageTexts({ own: { description: opts.own.description }, template: { title: '', description: '' }, tokens: {}, max, body: opts.own.body })
      : null
    : 'texts' in opts.seo
      ? opts.seo.texts
      : pageTexts({
          own: opts.seo.own,
          template: templateOf(set['seo.titles'], opts.seo.kind, c.lang),
          tokens: { ...opts.seo.tokens, shop: c.storeName },
          max,
          body: opts.seo.body,
        });
  const shown = texts?.title ?? (title ? c.t('meta.page', { page: title, store: c.storeName }) : c.t('meta.title', c.vars));
  const canonical = hrefIn(c.lang, path);
  const description = texts?.description ?? null;
  return {
    title: shown,
    ...(description ? { description } : {}),
    ...(site.origin ? { metadataBase: site.origin } : {}),
    alternates: { canonical, ...(languages ? { languages } : {}) },
    robots: robotsOf({ policy, indexable, lang: c.lang, bnReady, onPrimary: site.onPrimary }),
    openGraph: {
      title: shown,
      ...(description ? { description } : {}),
      url: canonical,
      ...(c.storeName ? { siteName: c.storeName } : {}),
      ...(opts.article
        ? {
            type: 'article' as const,
            ...(opts.article.publishedTime ? { publishedTime: opts.article.publishedTime } : {}),
            ...(opts.article.modifiedTime ? { modifiedTime: opts.article.modifiedTime } : {}),
            ...(opts.article.section ? { section: opts.article.section } : {}),
          }
        : { type: 'website' as const }),
    },
  };
}
