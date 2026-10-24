// PR 602 — what the proxy needs to answer a shop page's cache headers, with no database and no heavy imports: the
// shop's never-kept addresses from the routing table, the cookie names that make a page the visitor's own, and the
// page times the server last read from the settings (left on globalThis by lib/cache.ts). Until the server has read
// them once, Cloudflare keeps no page (the safe answer).
import {
  cacheHeaders,
  classify,
  isPersonal,
  type CacheHeaders,
  type PagePolicy,
  type PathTable,
} from "@extas/cache/policy";
import { BN_PREFIX } from "./shop/lang";
import { ROUTES } from "./shop/routes";

/** The page times and the product prefix as the proxy reads them. */
export interface ProxyCachePolicy extends PagePolicy {
  productPrefix: string;
}

const G = globalThis as unknown as { __extasCachePolicy?: ProxyCachePolicy };

export const setProxyPolicy = (p: ProxyCachePolicy): void => {
  G.__extasCachePolicy = p;
};
export const proxyPolicy = (): ProxyCachePolicy | null =>
  G.__extasCachePolicy ?? null;

/** The category pages' prefix, from the routing table (`/collections`). */
export const CATEGORY_PREFIX = ROUTES.category("").replace(/\/+$/, "");

/**
 * Never kept anywhere: the bag, the checkout, the account (the shop's own pages), and the admin and the API (which
 * the proxy never sees; Caddy answers their headers, infra/stack/caddy/Caddyfile `cache_headers`).
 */
export const NEVER_CACHED: readonly string[] = [
  ROUTES.bag,
  ROUTES.checkout,
  ROUTES.account,
  "/admin",
  "/api",
];

/** The cookie names the shop sets for one visitor (his bag, his sign-in, his font choice …). */
export const PERSONAL_COOKIE_PREFIXES: readonly string[] = [
  "extas_",
  "extas.",
  "__Host-extas",
  "__Secure-extas",
  "__Host-admin",
];
/** The staging password gate's cookie: the same for everyone who passed it, so not the visitor's own. */
export const SHARED_COOKIES: readonly string[] = ["extas_preview"];

const OFF: PagePolicy = {
  server: false,
  cdn: false,
  categoryMinutes: 0,
  productMinutes: 0,
};

/** A shop page's cache headers for this request. */
export function shopCacheHeaders(
  path: string,
  cookieNames: Iterable<string>,
): CacheHeaders {
  const p = proxyPolicy();
  const table: PathTable = {
    never: NEVER_CACHED,
    productPrefix: p?.productPrefix ?? "",
    categoryPrefix: CATEGORY_PREFIX,
    langPrefixes: [BN_PREFIX],
  };
  return cacheHeaders(
    classify(path, table),
    p ?? OFF,
    isPersonal(cookieNames, PERSONAL_COOKIE_PREFIXES, SHARED_COOKIES),
  );
}
