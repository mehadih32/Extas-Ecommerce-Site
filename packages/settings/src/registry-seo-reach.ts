// S11 · CN-031 Launch lane A (reach and growth). Registry versions 71 (PR 235) and 72 (the lane's later rows). Labels: messages/seo.<lang>.json (group `seo`).
// The admin's place is Website → SEO (`/admin/website/seo` and its sub-pages, docs/ADMIN-ARCHITECTURE.md §4.9).
//
// PR 235 (`seo.redirects`, `seo.notFound`; Blueprint C12.2): the redirect manager and the 404 report.
// - Every enabled row of the Redirect table forwards permanently (the status code is `naming.redirectStatusCode`, 301 as
//   shipped): a renamed product or category (PR 590), a link typed in by hand, a combo asked for with its colours in
//   another order. The WordPress map (the old shop's links, imported by the owner on go-live day, PR 587) forwards only
//   while `wordpressMapLive` is on: off as shipped, so nothing of the old shop is answered before the switch.
// - `keepMonths`: an imported old link is kept at least this long (Blueprint C12.2: 12 months); nothing is ever deleted.
// - `seo.notFound`: a shop address that has no page is counted (path, how often, the last time, where the visitor came
//   from without its query), at most `maxRows` different addresses, so a scan cannot fill the database; the report
//   suggests the closest live page when the words of the address match it at least `suggestMatchAtLeast`.
//
// PR 527 (`seo.urlPolicy`; Blueprint C12.1, App. answers #8 "never 404 a page that has earned rankings"): a product,
// category or page that was on the shop keeps answering. A sold-out product page stays as it is (honest "sold out", the
// "tell me when it is back" form, and a row of what can be bought now from its category); a product taken off or
// archived the same; a category archived after it had products on the shop answers with a short "resting"
// page that sends people on, instead of "page not found". Whether such pages stay listed in search engines is a
// switch each (both listed as shipped: the page keeps its rank; a restock makes it a normal page again by itself).
//
// PR 586 (`seo.hashLinks`; Blueprint C12.2): links to the approved demo (`…/#/p/<product>`, `#/c/<category>` …) were
// shared while the shop was built. A browser never sends what follows `#`, so a tiny script in every shop page sends
// such a link on to its live address (lib/seo/hash-forward). On as shipped; off, the `#/…` part is simply ignored.
//
// PR 227 (`seo.filterPages`; Blueprint C12.1, App. answers #7 "indexed only where it genuinely earns traffic"): a
// filtered collection page (`/collections/polos?colour=navy`) is never a page of its own for search engines, except the
// few the owner names here because people search for them ("navy polo", "polo size XL"): one filter on one collection,
// with its own title words. Such a page is listed (and named in the sitemap) only while the switch is on and it shows at
// least `minProducts` styles; every other combination keeps pointing to the clean collection page. At most `maxPages`
// rows. Off and empty as shipped. A collection's or sub-collection's own SEO words (title, search line, heading, text)
// are `category.seo` (PR 45), edited on the same admin page.
//
// PR 228 (`seo.sitemaps`; Blueprint C12.1 "sitemaps split by type, regenerated automatically"): `/sitemap.xml` is an
// index of one file per kind (pages, collections, products, sets), each split at `perFile` addresses, made on request
// from the catalogue and kept `cacheMinutes` (a new product shows within that time; the admin can make them at once).
// Never more than `maxUrls` addresses in all. On as shipped: the sitemaps only list what the pages themselves let
// search engines list, and nothing is listed until the owner opens the shop to search engines (`seo.indexing`).
//
// PR 229 (`seo.robots`; App. answers #56 "AI crawlers default on so AI assistants can rank the shop"): /robots.txt
// keeps every robot out while the shop is closed to search engines; once open, robots read everything but the admin,
// the API and a customer's own pages, plus the owner's extra paths. `aiCrawlers` on (as shipped) lets the AI robots in
// with everyone else; off, each robot named in `aiBots` is kept out of the whole shop.
//
// PR 232 (`seo.altText`; App. answers #9 "auto-apply for alt text"): the shop writes the English description of each
// product photo that has none (from the product's name, the photo's colour and kind), as each photo is added while
// `autoApply` is on, or all at once from Website › SEO. A description the owner typed is never changed. Bengali is
// never written: a Bengali page builds it from the dictionary. `maxLength` is the longest one (cut at a whole word).
//
// PR 233 (`seo.verification`): the codes Google Search Console and Bing Webmaster Tools give to prove the shop is the
// owner's ("HTML tag" verification). Owner data: empty as shipped; each code the owner pastes is carried by every shop
// page as its meta tag. They are not secrets (every visitor's page shows them); the API keys live in the vault.
import { z } from 'zod';
import { setting } from './define';
import { categorySlugSchema } from './registry-storefront';
import { localizedTextSchema } from './schemas';

const V = 71;
const V2 = 72;

const base = { scope: 'store', valueType: 'JSON', isOwnerData: false, isPublic: false, group: 'seo', version: V } as const;

export const seoRedirectsSchema = z
  .object({
    /** The old shop's links (source `wordpress`) forward (go-live day, PR 587). */
    wordpressMapLive: z.boolean(),
    /** An imported old link is kept at least this many months. */
    keepMonths: z.int().min(1).max(120),
    /** How many rows each list of the redirects page shows. */
    listShown: z.int().min(10).max(500),
  })
  .strict();
export type SeoRedirects = z.output<typeof seoRedirectsSchema>;
export const SEO_REDIRECTS_DEFAULT: SeoRedirects = { wordpressMapLive: false, keepMonths: 12, listShown: 50 };

export const seoNotFoundSchema = z
  .object({
    /** Count the shop addresses that have no page. */
    record: z.boolean(),
    /** At most this many different addresses are kept (a new one beyond it is not counted; the kept ones go on counting). */
    maxRows: z.int().min(100).max(100_000),
    /** A suggestion is offered when this share (in %) of the address's words match a live page's link. */
    suggestMatchAtLeast: z.int().min(10).max(100),
  })
  .strict();
export type SeoNotFound = z.output<typeof seoNotFoundSchema>;
export const SEO_NOT_FOUND_DEFAULT: SeoNotFound = { record: true, maxRows: 5000, suggestMatchAtLeast: 50 };

export const seoUrlPolicySchema = z
  .object({
    /** A sold-out, taken-off or archived product page shows a row of what can be bought now from its category. */
    alternatives: z.boolean(),
    /** How many products that row shows. */
    alternativesMax: z.int().min(2).max(12),
    /** A sold-out product page stays listed in search engines (it keeps its rank until the restock). */
    soldOutIndexed: z.boolean(),
    /** A product taken off the shop or archived (and a resting category) stays listed in search engines. */
    retiredIndexed: z.boolean(),
    /** A category archived after it had products on the shop answers with a resting page, never a 404. */
    retiredCategoryPage: z.boolean(),
  })
  .strict();
export type SeoUrlPolicy = z.output<typeof seoUrlPolicySchema>;
export const SEO_URL_POLICY_DEFAULT: SeoUrlPolicy = { alternatives: true, alternativesMax: 4, soldOutIndexed: true, retiredIndexed: true, retiredCategoryPage: true };

export const seoHashLinksSchema = z
  .object({
    /** A shop page opened with a demo `#/…` link moves on to the live address. */
    forward: z.boolean(),
  })
  .strict();
export type SeoHashLinks = z.output<typeof seoHashLinksSchema>;
export const SEO_HASH_LINKS_DEFAULT: SeoHashLinks = { forward: true };

/** The filters a listed filter page may use (one of them, one value). */
export const SEO_FILTER_KINDS = ['size', 'colour', 'fit'] as const;
export type SeoFilterKind = (typeof SEO_FILTER_KINDS)[number];

/** The limits of a filter page row and of the policy (the admin screen shows the same). */
export const SEO_FILTER_LIMITS = { value: 40, label: 80, minProducts: { min: 1, max: 100 }, maxPages: { min: 1, max: 500 } } as const;

export const seoFilterPageSchema = z
  .object({
    /** The collection (or sub-collection) slug. */
    category: categorySlugSchema,
    filter: z.enum(SEO_FILTER_KINDS),
    /** The filter's value as the address carries it (`navy`, `XL`, `slim`). */
    value: z
      .string()
      .trim()
      .max(SEO_FILTER_LIMITS.value)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/),
    /** The page's own name in both languages ("Navy polos"), used for its title and heading. */
    label: localizedTextSchema(SEO_FILTER_LIMITS.label),
  })
  .strict();
export type SeoFilterPage = z.output<typeof seoFilterPageSchema>;

export const seoFilterPagesSchema = z
  .object({
    /** List the named filter pages. */
    enabled: z.boolean(),
    /** A named filter page is listed only while it shows at least this many styles. */
    minProducts: z.int().min(SEO_FILTER_LIMITS.minProducts.min).max(SEO_FILTER_LIMITS.minProducts.max),
    /** At most this many named pages. */
    maxPages: z.int().min(SEO_FILTER_LIMITS.maxPages.min).max(SEO_FILTER_LIMITS.maxPages.max),
    pages: z.array(seoFilterPageSchema).max(SEO_FILTER_LIMITS.maxPages.max),
  })
  .strict()
  .refine((v) => v.pages.length <= v.maxPages, { message: 'more pages than maxPages', path: ['pages'] })
  .refine((v) => new Set(v.pages.map((p) => `${p.category}|${p.filter}|${p.value.toLowerCase()}`)).size === v.pages.length, { message: 'the same page twice', path: ['pages'] });
export type SeoFilterPages = z.output<typeof seoFilterPagesSchema>;
export const SEO_FILTER_PAGES_DEFAULT: SeoFilterPages = { enabled: false, minProducts: 4, maxPages: 50, pages: [] };

/** The limits of the sitemaps' numbers (the admin screen shows the same). */
export const SEO_SITEMAP_LIMITS = { cacheMinutes: { min: 5, max: 1440 }, perFile: { min: 100, max: 50000 }, maxUrls: { min: 100, max: 200000 } } as const;

export const seoSitemapsSchema = z
  .object({
    /** Answer /sitemap.xml and its files. */
    enabled: z.boolean(),
    /** How long a made set is kept before it is made again. */
    cacheMinutes: z.int().min(SEO_SITEMAP_LIMITS.cacheMinutes.min).max(SEO_SITEMAP_LIMITS.cacheMinutes.max),
    /** The most addresses in one file (search engines read at most 50,000). */
    perFile: z.int().min(SEO_SITEMAP_LIMITS.perFile.min).max(SEO_SITEMAP_LIMITS.perFile.max),
    /** The most addresses in all the files together. */
    maxUrls: z.int().min(SEO_SITEMAP_LIMITS.maxUrls.min).max(SEO_SITEMAP_LIMITS.maxUrls.max),
  })
  .strict();
export type SeoSitemaps = z.output<typeof seoSitemapsSchema>;
export const SEO_SITEMAPS_DEFAULT: SeoSitemaps = { enabled: true, cacheMinutes: 60, perFile: 5000, maxUrls: 50000 };

/** The AI robots named in robots.txt when the AI switch is off (App. answers #56). */
export const SEO_AI_BOTS_DEFAULT = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'] as const;
/** The limits of the robots lists (the admin screen shows the same). */
export const SEO_ROBOTS_LIMITS = { bots: 30, botName: 60, paths: 50, path: 200 } as const;

export const seoRobotsSchema = z
  .object({
    /** AI robots may read the shop like any other robot. */
    aiCrawlers: z.boolean(),
    /** The AI robots kept out when `aiCrawlers` is off (their user-agent names). */
    aiBots: z
      .array(z.string().trim().min(1).max(SEO_ROBOTS_LIMITS.botName).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/))
      .max(SEO_ROBOTS_LIMITS.bots)
      .refine((l) => new Set(l.map((b) => b.toLowerCase())).size === l.length, { message: 'the same robot twice' }),
    /** More paths no robot reads (each starts with `/`; `*` and `$` as search engines read them). */
    disallow: z
      .array(z.string().trim().max(SEO_ROBOTS_LIMITS.path).regex(/^\/[A-Za-z0-9/._~*$?=&%-]*$/))
      .max(SEO_ROBOTS_LIMITS.paths),
  })
  .strict();
export type SeoRobots = z.output<typeof seoRobotsSchema>;
export const SEO_ROBOTS_DEFAULT: SeoRobots = { aiCrawlers: true, aiBots: [...SEO_AI_BOTS_DEFAULT], disallow: [] };

/** The limits of the photo descriptions (the admin screen shows the same). */
export const SEO_ALT_TEXT_LIMITS = { maxLength: { min: 40, max: 250 } } as const;
export const seoAltTextSchema = z
  .object({
    /** Write a photo's description as it is added to a product (when it has none). */
    autoApply: z.boolean(),
    /** The longest description, in letters. */
    maxLength: z.number().int().min(SEO_ALT_TEXT_LIMITS.maxLength.min).max(SEO_ALT_TEXT_LIMITS.maxLength.max),
  })
  .strict();
export type SeoAltText = z.output<typeof seoAltTextSchema>;
export const SEO_ALT_TEXT_DEFAULT: SeoAltText = { autoApply: true, maxLength: 125 };

/** The limits of the verification codes (the admin screen shows the same). */
export const SEO_VERIFICATION_LIMITS = { entries: 5, length: 100 } as const;
/** A verification code as the engines give it (letters, digits, `_`, `-`; never a quote or a space). */
export const SEO_VERIFICATION_CODE = /^[A-Za-z0-9_-]{8,100}$/;
const verificationCodes = z
  .array(z.string().trim().max(SEO_VERIFICATION_LIMITS.length).regex(SEO_VERIFICATION_CODE))
  .max(SEO_VERIFICATION_LIMITS.entries)
  .refine((l) => new Set(l).size === l.length, { message: 'the same code twice' });
export const seoVerificationSchema = z
  .object({
    /** Google Search Console's codes (`<meta name="google-site-verification">`). */
    google: verificationCodes,
    /** Bing Webmaster Tools' codes (`<meta name="msvalidate.01">`). */
    bing: verificationCodes,
  })
  .strict();
export type SeoVerification = z.output<typeof seoVerificationSchema>;
export const SEO_VERIFICATION_DEFAULT: SeoVerification = { google: [], bing: [] };

export const seoReachSettings = {
  // ---- PR 235 · redirects and the 404 report ----
  'seo.redirects': setting({
    ...base,
    schema: seoRedirectsSchema,
    default: SEO_REDIRECTS_DEFAULT,
    labelKey: 'seo.redirects.label',
    helpKey: 'seo.redirects.help',
    sortOrder: 40,
  }),
  'seo.notFound': setting({
    ...base,
    schema: seoNotFoundSchema,
    default: SEO_NOT_FOUND_DEFAULT,
    labelKey: 'seo.notFound.label',
    helpKey: 'seo.notFound.help',
    sortOrder: 41,
  }),
  // ---- PR 527 · the permanent URL policy ----
  'seo.urlPolicy': setting({
    ...base,
    version: V2,
    schema: seoUrlPolicySchema,
    default: SEO_URL_POLICY_DEFAULT,
    labelKey: 'seo.urlPolicy.label',
    helpKey: 'seo.urlPolicy.help',
    sortOrder: 42,
  }),
  // ---- PR 586 · old demo #/ links ----
  'seo.hashLinks': setting({
    ...base,
    version: V2,
    schema: seoHashLinksSchema,
    default: SEO_HASH_LINKS_DEFAULT,
    labelKey: 'seo.hashLinks.label',
    helpKey: 'seo.hashLinks.help',
    sortOrder: 43,
  }),
  // ---- PR 227 · the filter pages that may be listed ----
  'seo.filterPages': setting({
    ...base,
    version: V2,
    schema: seoFilterPagesSchema,
    default: SEO_FILTER_PAGES_DEFAULT,
    labelKey: 'seo.filterPages.label',
    helpKey: 'seo.filterPages.help',
    sortOrder: 44,
  }),
  // ---- PR 228 · the sitemaps ----
  'seo.sitemaps': setting({
    ...base,
    version: V2,
    schema: seoSitemapsSchema,
    default: SEO_SITEMAPS_DEFAULT,
    labelKey: 'seo.sitemaps.label',
    helpKey: 'seo.sitemaps.help',
    sortOrder: 45,
  }),
  // ---- PR 229 · robots.txt and the AI robots ----
  'seo.robots': setting({
    ...base,
    version: V2,
    schema: seoRobotsSchema,
    default: SEO_ROBOTS_DEFAULT,
    labelKey: 'seo.robots.label',
    helpKey: 'seo.robots.help',
    sortOrder: 46,
  }),
  // ---- PR 232 · the photo descriptions (alt text) ----
  'seo.altText': setting({
    ...base,
    version: V2,
    schema: seoAltTextSchema,
    default: SEO_ALT_TEXT_DEFAULT,
    labelKey: 'seo.altText.label',
    helpKey: 'seo.altText.help',
    sortOrder: 47,
  }),
  // ---- PR 233 · Search Console and Bing: the verification codes ----
  'seo.verification': setting({
    ...base,
    version: V2,
    schema: seoVerificationSchema,
    default: SEO_VERIFICATION_DEFAULT,
    labelKey: 'seo.verification.label',
    helpKey: 'seo.verification.help',
    sortOrder: 48,
  }),
};
