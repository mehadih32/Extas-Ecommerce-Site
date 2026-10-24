// PR 602 — the purge rules (server spec §5, always on): what one change clears, in the server's page cache (by tag)
// and at Cloudflare (by address). Pure: the service (service.ts) looks the slugs up and hands them in.
//
//   a price or stock change  → that product's page, every category list that shows it, and Cloudflare — at once;
//   a product's words/photos → the same;
//   a product published/hidden → its page, every category list (its categories, "New in") and the sitemap;
//   a category changed       → every category list of the store;
//   a setting changed        → every page of that store (a setting can be used anywhere), Cloudflare entirely;
//   "Clear all"              → everything, everywhere.
import type { CacheEvent } from "./events";

/** The server cache's tags. A page carries the tags of everything it shows. */
export const tags = {
  /** Every page of a store. */
  store: (storeId: number) => `s:${storeId}`,
  /** Every page that shows this product (its own page, each category list it is on). */
  product: (storeId: number, productId: string) => `p:${storeId}:${productId}`,
  /** Every category list of a store (and "New in"). */
  listing: (storeId: number) => `l:${storeId}`,
};

export interface PurgeFacts {
  /** The products' own slugs (their pages). */
  productSlugs: readonly string[];
  /** The slugs of the categories that list them, with every parent (a parent's page lists its children's products). */
  categorySlugs: readonly string[];
  productPrefix: string;
  categoryPrefix: string;
  /** '' (English, the root) and each language prefix ('/bn'). */
  langPrefixes: readonly string[];
  /** The sitemap's address, when the shop has one. */
  sitemap: string | null;
}

export interface PurgePlan {
  /** The server cache's tags to clear. */
  tags: string[];
  /** Clear the whole server cache (a setting of every store, or "Clear all"). */
  everything: boolean;
  /** Addresses Cloudflare drops (paths; the service puts the shop's hosts in front). */
  paths: string[];
  /** Cloudflare drops everything it keeps for the shop. */
  cdnEverything: boolean;
}

const inLangs = (path: string, langs: readonly string[]) =>
  ["", ...langs].map((l) => `${l}${path}`);

/** The plan for one event. */
export function planFor(event: CacheEvent, facts: PurgeFacts): PurgePlan {
  const pages = (slugs: readonly string[], prefix: string) =>
    slugs.flatMap((s) => inLangs(`${prefix}/${s}`, facts.langPrefixes));
  switch (event.kind) {
    case "product": {
      const publish = event.reason === "publish";
      return {
        tags: [
          ...event.productIds.map((id) => tags.product(event.storeId, id)),
          ...(publish ? [tags.listing(event.storeId)] : []),
        ],
        everything: false,
        paths: unique([
          ...pages(facts.productSlugs, facts.productPrefix),
          ...pages(facts.categorySlugs, facts.categoryPrefix),
          ...(publish && facts.sitemap ? [facts.sitemap] : []),
        ]),
        cdnEverything: false,
      };
    }
    case "category":
      return {
        tags: [tags.listing(event.storeId)],
        everything: false,
        paths: unique(pages(facts.categorySlugs, facts.categoryPrefix)),
        cdnEverything: false,
      };
    case "settings":
      return event.storeId === null
        ? { tags: [], everything: true, paths: [], cdnEverything: true }
        : {
            tags: [tags.store(event.storeId)],
            everything: false,
            paths: [],
            cdnEverything: true,
          };
    case "all":
      return event.storeId === null
        ? { tags: [], everything: true, paths: [], cdnEverything: true }
        : {
            tags: [tags.store(event.storeId)],
            everything: false,
            paths: [],
            cdnEverything: true,
          };
  }
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}
