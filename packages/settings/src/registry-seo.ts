// S11 · the SEO engine (PR 220). Registry version 64. Labels: messages/seo.<lang>.json. The admin's place is
// Website → SEO (`/admin/website/seo`, docs/ADMIN-ARCHITECTURE.md §4.9).
//
// PR 220 (`seo.indexing`; Blueprint C12.1, review GOOGLE-TRAFFIC-PLAN §1.2–1.4): which shop pages search engines may
// list. English at `/`, Bengali at `/bn` with the same slug; each language names itself as its canonical page on the
// shop's own address (the store's primary domain, else the preview host, never code). `searchEngines` is the one switch
// that opens the shop to search engines: off until go-live, and even on it only counts on the store's primary domain —
// the preview (new.…) always stays out. `pages` says which kinds of page may be listed once the shop is open (the
// blueprint's map: home, categories, products, the owner's featured sets, the set lists, help; the set builder and
// search results not).
// `xDefault`: which twin a searcher with another language is sent to (the English one), or none.
import { z } from 'zod';
import { setting } from './define';

const V = 64;

/** The kinds of shop page the SEO rules know (lib/seo in the web app maps every page to one). */
export const SEO_PAGE_TYPES = ['home', 'category', 'product', 'combo', 'comboList', 'combosHub', 'setBuilder', 'help', 'search'] as const;
export type SeoPageType = (typeof SEO_PAGE_TYPES)[number];

export const seoIndexingSchema = z
  .object({
    /** Open the shop to search engines (only ever on the store's primary domain). */
    searchEngines: z.boolean(),
    /** Which kinds of page may be listed once the shop is open. */
    pages: z.object(Object.fromEntries(SEO_PAGE_TYPES.map((k) => [k, z.boolean()])) as Record<SeoPageType, z.ZodBoolean>).strict(),
    /** hreflang x-default: the English twin, or none. */
    xDefault: z.enum(['en', 'none']),
  })
  .strict();
export type SeoIndexing = z.output<typeof seoIndexingSchema>;

export const SEO_INDEXING_DEFAULT: SeoIndexing = {
  searchEngines: false,
  pages: { home: true, category: true, product: true, combo: true, comboList: true, combosHub: true, setBuilder: false, help: true, search: false },
  xDefault: 'en',
};

const base = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: false, group: 'seo', version: V } as const;

export const seoSettings = {
  'seo.indexing': setting({
    ...base,
    schema: seoIndexingSchema,
    default: SEO_INDEXING_DEFAULT,
    labelKey: 'seo.indexing.label',
    helpKey: 'seo.indexing.help',
    sortOrder: 10,
  }),
};
