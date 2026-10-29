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
//
// PR 221 (`seo.titles`, `seo.aiDrafts`; review GOOGLE-TRAFFIC-PLAN §1.5): the search title and meta description of
// every kind of shop page, as a template per kind and language with `{tokens}` read from the page itself (the product
// page keeps its own templates in Names & links, PR 590: `naming.seoTitleTemplate` …; the length limits are
// `naming.seoTitleMaxChars` and `naming.metaDescriptionMaxChars` for every kind). A page's own text (the owner's, or
// an AI draft a person accepted) always comes before the template; an empty description template leaves the page's
// own words or none. `seo.aiDrafts`: drafts for products and categories without their own text — off, and it also
// needs AI on for the whole shop (`ai.enabled`, CN-026); a draft is shown on a page only after a person accepts it.
import { z } from 'zod';
import { setting } from './define';
import { messages, pair } from './messages';
import { tokensOf } from './schemas';

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

/** The kinds of page with their own title templates (products: Names & links; search and private pages: none). */
export const SEO_TEMPLATE_PAGES = ['home', 'category', 'combo', 'comboList', 'combosHub', 'help'] as const;
export type SeoTemplatePage = (typeof SEO_TEMPLATE_PAGES)[number];

/** The `{tokens}` each kind of page fills in (the page's own facts; never a number typed into the text). */
export const SEO_TEMPLATE_TOKENS: Record<SeoTemplatePage, readonly string[]> = {
  home: ['shop'],
  category: ['name', 'count', 'intro', 'shop'],
  combo: ['name', 'pieces', 'price', 'shop'],
  comboList: ['name', 'shop'],
  combosHub: ['name', 'shop'],
  help: ['name', 'shop'],
};

/** The longest template the admin takes (a page is cut to the naming limits when shown). */
export const SEO_TEMPLATE_MAX = { title: 300, description: 500 } as const;

const tokensOnly = (allowed: readonly string[]) => (v: { en: string; bn: string }) => [...tokensOf(v.en), ...tokensOf(v.bn)].every((t) => allowed.includes(t));
const oneTemplate = (page: SeoTemplatePage) => {
  const msg = { message: `only these {tokens} may be used: ${SEO_TEMPLATE_TOKENS[page].join(', ')}` };
  const text = (max: number, min: number) =>
    z
      .object({ en: z.string().trim().min(min).max(max), bn: z.string().trim().min(min).max(max) })
      .strict()
      .refine(tokensOnly(SEO_TEMPLATE_TOKENS[page]), msg);
  return z.object({ title: text(SEO_TEMPLATE_MAX.title, 1), description: text(SEO_TEMPLATE_MAX.description, 0) }).strict();
};

export const seoTitlesSchema = z
  .object(Object.fromEntries(SEO_TEMPLATE_PAGES.map((k) => [k, oneTemplate(k)])) as Record<SeoTemplatePage, ReturnType<typeof oneTemplate>>)
  .strict();
export type SeoTitles = z.output<typeof seoTitlesSchema>;

export const SEO_TITLES_DEFAULT: SeoTitles = Object.fromEntries(
  SEO_TEMPLATE_PAGES.map((k) => [k, { title: pair(messages, `defaults.seo.titles.${k}.title`), description: pair(messages, `defaults.seo.titles.${k}.description`) }]),
) as SeoTitles;

export const seoAiDraftsSchema = z
  .object({
    /** Offer AI drafts for pages without their own text (also needs `ai.enabled`). */
    enabled: z.boolean(),
    /** At most this many pages in one "Draft" press. */
    batchMax: z.int().min(1).max(100),
    /** Which kinds of page get drafts. */
    subjects: z.object({ product: z.boolean(), category: z.boolean() }).strict(),
  })
  .strict();
export type SeoAiDrafts = z.output<typeof seoAiDraftsSchema>;

export const SEO_AI_DRAFTS_DEFAULT: SeoAiDrafts = { enabled: false, batchMax: 20, subjects: { product: true, category: true } };

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
  'seo.titles': setting({
    ...base,
    schema: seoTitlesSchema,
    default: SEO_TITLES_DEFAULT,
    labelKey: 'seo.titles.label',
    helpKey: 'seo.titles.help',
    sortOrder: 20,
  }),
  'seo.aiDrafts': setting({
    ...base,
    schema: seoAiDraftsSchema,
    default: SEO_AI_DRAFTS_DEFAULT,
    labelKey: 'seo.aiDrafts.label',
    helpKey: 'seo.aiDrafts.help',
    sortOrder: 30,
  }),
};
