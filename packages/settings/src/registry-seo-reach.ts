// S11 · CN-031 Launch lane A (reach and growth). Registry version 71. Labels: messages/seo.<lang>.json (group `seo`).
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
import { z } from 'zod';
import { setting } from './define';

const V = 71;

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
};
