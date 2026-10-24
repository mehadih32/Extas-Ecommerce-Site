// PR 602 — which address may be kept, where, and for how long (server spec §5, the four layers). Pure: the web app's
// proxy and the tests call it; Caddy's own copy of the "never" list (infra/stack/caddy/Caddyfile, `cache_headers`) is
// checked against the app's routing table by a test, so the two never drift.
//
//   browser     images, CSS, JS and fonts: a year, because a changed file gets a new name (the framework does it);
//   Cloudflare  the same files; category and product pages for the minutes in `cache.pages`, only while the owner has
//               switched page caching at Cloudflare on (`cache.pages.cdn`, off by default) and the visitor carries no
//               cookie of his own;
//   server      category and product page data for those minutes, cleared the moment something on them changes
//               (rules.ts); the stock number on a product page for `cache.stockDisplaySeconds` (display only);
//   never       the bag, the checkout, the account, the admin and the API — every customer always sees his own, fresh.

/** What kind of address it is, for the cache. */
export type PathClass = "never" | "product" | "category" | "page";

/** The shop's addresses the policy needs, from the routing table and the settings (nothing is written here). */
export interface PathTable {
  /** Addresses never kept (each with everything under it): the bag, the checkout, the account, the admin, the API. */
  never: readonly string[];
  /** The product page's prefix (`naming.productPathPrefix`, e.g. `/p`). */
  productPrefix: string;
  /** The category pages' prefix (the routing table's `/collections`). */
  categoryPrefix: string;
  /** The language prefixes in front of a shop address (`/bn`). */
  langPrefixes: readonly string[];
}

/** The page settings the policy reads (`cache.pages`). */
export interface PagePolicy {
  /** The server keeps category and product page data. */
  server: boolean;
  /** Cloudflare may keep category and product pages. */
  cdn: boolean;
  categoryMinutes: number;
  productMinutes: number;
}

const under = (path: string, base: string) =>
  base !== "" && base !== "/" && (path === base || path.startsWith(`${base}/`));

/** The address without its language prefix (`/bn/bag` → `/bag`). */
export function withoutLang(
  path: string,
  langPrefixes: readonly string[],
): string {
  for (const p of langPrefixes)
    if (under(path, p)) return path.slice(p.length) || "/";
  return path;
}

export function classify(rawPath: string, table: PathTable): PathClass {
  const path = withoutLang(
    rawPath.replace(/\/+$/, "") || "/",
    table.langPrefixes,
  );
  if (table.never.some((b) => under(path, b))) return "never";
  if (under(path, table.productPrefix) && path !== table.productPrefix)
    return "product";
  if (under(path, table.categoryPrefix) && path !== table.categoryPrefix)
    return "category";
  return "page";
}

/** Seconds a class of page may be kept by the server or Cloudflare (0: not at all). */
export function pageSeconds(
  cls: PathClass,
  policy: Pick<PagePolicy, "categoryMinutes" | "productMinutes">,
): number {
  if (cls === "product") return policy.productMinutes * 60;
  if (cls === "category") return policy.categoryMinutes * 60;
  return 0;
}

export interface CacheHeaders {
  /** For the browser (and any shared cache that reads it). Null: leave the page's own. */
  "cache-control": string | null;
  /** For Cloudflare only (it reads CDN-Cache-Control before Cache-Control). */
  "cdn-cache-control": string;
}

/**
 * The headers a shop page answers with. `personal`: the visitor carries a cookie of his own (his bag, his sign-in,
 * his font choice), so his page is never kept for anyone else.
 */
export function cacheHeaders(
  cls: PathClass,
  policy: PagePolicy,
  personal: boolean,
): CacheHeaders {
  if (cls === "never")
    return {
      "cache-control": "private, no-store",
      "cdn-cache-control": "no-store",
    };
  const s = pageSeconds(cls, policy);
  if (!policy.cdn || personal || s === 0)
    return { "cache-control": null, "cdn-cache-control": "no-store" };
  return { "cache-control": null, "cdn-cache-control": `public, max-age=${s}` };
}

/**
 * Whether a request carries a cookie of the visitor's own (anything the shop set, by its name prefix). `shared`: the
 * shop's cookies that say nothing about the visitor (the staging password gate's), which never count.
 */
export function isPersonal(
  cookieNames: Iterable<string>,
  ownPrefixes: readonly string[],
  shared: readonly string[] = [],
): boolean {
  for (const n of cookieNames)
    if (!shared.includes(n) && ownPrefixes.some((p) => n.startsWith(p)))
      return true;
  return false;
}
