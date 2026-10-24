// S02 · PR 602 — the four-layer cache (registry version 53). Labels: messages/settings.<lang>.json (`cache.*`, the
// System group; the admin's place is Settings → System → Cache, SET-08b of docs/BACKEND-ARCHITECTURE.md, on the new
// admin shell). Server spec §5; demo V12.3 SET-08b "How long each layer keeps a page" (the choices below are the demo's).
//
// The layers: the browser keeps images, CSS and JS for a year (a changed file gets a new name, so this is not a
// setting); Cloudflare keeps the same files and — only while `cache.pages.cdn` is on — the category and product pages;
// the server keeps the category and product page data; the stock number shown on a product page is kept
// `cache.stockDisplaySeconds` (display only: adding to the bag and the checkout always read the live stock with a row
// lock, PR 198). The purge rules are always on (a wrong cache shows a wrong price): a price or stock change clears that
// product, its categories and Cloudflare at once; a setting clears every page; a new product its categories and the
// sitemap. The bag, the checkout, the account and the admin are never kept.
//
// Nothing here moves money or changes a price, a discount or COD: a shorter or longer time only decides how soon a
// change shows.
import { z } from "zod";
import { setting } from "./define";

const V = 53;

const base = {
  scope: "installation",
  isOwnerData: false,
  isPublic: false,
  group: "system",
  version: V,
} as const;

/** The choices the Cache page offers (demo V12.3 SET-08b). */
export const CACHE_CHOICES = {
  pageMinutes: [1, 2, 5, 10, 15],
  stockSeconds: [10, 15, 30],
  maxEntries: [250, 500, 1_000, 2_000, 5_000],
  repeatSeconds: [0, 1, 2, 5, 10],
  statsDays: [1, 7, 30],
} as const;

const oneOf = <T extends readonly number[]>(choices: T) =>
  z
    .int()
    .refine((v) => (choices as readonly number[]).includes(v), {
      message: `one of ${choices.join(", ")}`,
    });

/**
 * `server`: the server keeps category and product page data (cleared by the purge rules the moment something on them
 * changes). `categoryMinutes` / `productMinutes`: how long a category or product page is kept (the server and, while
 * `cdn` is on, Cloudflare). `cdn`: Cloudflare may keep those pages for visitors with no cookie of their own — off by
 * default, because it also needs a cache rule at Cloudflare (docs/admin-guide/cache.md).
 */
export const cachePagesSchema = z
  .object({
    server: z.boolean(),
    cdn: z.boolean(),
    categoryMinutes: oneOf(CACHE_CHOICES.pageMinutes),
    productMinutes: oneOf(CACHE_CHOICES.pageMinutes),
  })
  .strict();
export type CachePages = z.output<typeof cachePagesSchema>;

/**
 * The rare options. `maxEntries`: how many pages one server process keeps at most (the least used goes first).
 * `repeatSeconds`: a purge is done again this many seconds later (a page read while the change was being saved is not
 * kept; 0: once). `statsDays`: how many days of hit counts are kept for the Cache page.
 */
export const cacheTuningSchema = z
  .object({
    maxEntries: oneOf(CACHE_CHOICES.maxEntries),
    repeatSeconds: oneOf(CACHE_CHOICES.repeatSeconds),
    statsDays: oneOf(CACHE_CHOICES.statsDays),
  })
  .strict();
export type CacheTuning = z.output<typeof cacheTuningSchema>;

export const cacheSettings = {
  "cache.pages": setting({
    ...base,
    schema: cachePagesSchema,
    default: {
      server: true,
      cdn: false,
      categoryMinutes: 5,
      productMinutes: 5,
    },
    valueType: "JSON",
    labelKey: "cache.pages.label",
    helpKey: "cache.pages.help",
    sortOrder: 900,
  }),
  "cache.stockDisplaySeconds": setting({
    ...base,
    schema: oneOf(CACHE_CHOICES.stockSeconds),
    default: 15,
    valueType: "DURATION_SECONDS",
    labelKey: "cache.stockDisplaySeconds.label",
    helpKey: "cache.stockDisplaySeconds.help",
    sortOrder: 901,
  }),
  "cache.tuning": setting({
    ...base,
    schema: cacheTuningSchema,
    default: { maxEntries: 1_000, repeatSeconds: 2, statsDays: 7 },
    valueType: "JSON",
    labelKey: "cache.tuning.label",
    helpKey: "cache.tuning.help",
    sortOrder: 902,
  }),
};
