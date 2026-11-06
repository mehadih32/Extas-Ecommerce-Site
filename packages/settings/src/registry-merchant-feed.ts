// S13 · PR 589 (register "Merchant Center feed + Bangladesh test — feed from the catalogue, brand EXTAS, BDT; test
// Bangladesh as target country after go-live, result logged; free listings and Shopping ads only if available") —
// registry version 256, lane C.
//   `ads.merchantFeed` — the product feed for Google Merchant Center, off as it ships: /feeds/merchant.xml answers "not
//   found" until it is on (and, like robots.txt, only on the shop's own domain). On: every published product of a shown
//   category, up to `maxItems`, as one item — its feed title (else its name), description, link, main photo, price in the
//   shop's currency (a struck price only where the shop itself shows one, PR 38), stock, brand (the product's brand, else
//   the shop's name) and category. Sold-out products stay in as "out of stock" while `outOfStock` is on. `country` is the
//   target country the owner sets in Merchant Center (the Bangladesh test, after go-live); the feed carries it as the
//   shipping country. Merchant Center fetches the address on its own schedule: no key, nothing is sent from the shop,
//   and no ad spend starts from here.
// PR 589 follow-up (registry v259) — `variants`: one item per live size and colour of a product instead of one per
//   product (Google's own way for clothes: the items of one product share `item_group_id` and each carries its colour,
//   size, price, photo of that colour and stock). Off as it ships (one item per product, as before); a value saved
//   before has no `variants` and reads as off.
import { z } from 'zod';
import { setting } from './define';

// const V256 = 256; — replaced by V589F below (PR 589 follow-up)
const V589F = 259;

export const merchantFeedSchema = z
  .object({
    /** The feed answers at /feeds/merchant.xml. */
    on: z.boolean(),
    /** The target country (two capital letters, as Merchant Center writes it). */
    country: z.string().regex(/^[A-Z]{2}$/),
    /** At most this many products in the feed. */
    maxItems: z.int().min(1).max(100_000),
    /** Keep sold-out products in the feed as "out of stock". */
    outOfStock: z.boolean(),
    /** PR 589 follow-up: one item per live size and colour (grouped by product), not one per product. */
    variants: z.boolean().default(false),
  })
  .strict();
export type MerchantFeedSettings = z.output<typeof merchantFeedSchema>;

/** The shipped defaults (off); the owner changes every value on the page's card. */
export const MERCHANT_FEED_DEFAULT: MerchantFeedSettings = { on: false, country: 'BD', maxItems: 5000, outOfStock: true, variants: false }; // hardcode-ok: the setting's shipped default

export const merchantFeedSettings = {
  'ads.merchantFeed': setting({
    scope: 'store',
    schema: merchantFeedSchema,
    default: MERCHANT_FEED_DEFAULT,
    valueType: 'JSON',
    group: 'ads',
    labelKey: 'ads.merchantFeed.label',
    helpKey: 'ads.merchantFeed.help',
    isOwnerData: false,
    isPublic: false,
    sortOrder: 96,
    version: V589F,
  }),
};
