// PR 602 — the web app's cache (server spec §5): one runtime per server process, started by the instrumentation hook
// (src/instrumentation.ts) and found again by the pages through globalThis. It keeps the category and product page
// data (`cache.pages`), the stock shown on a product page (`cache.stockDisplaySeconds`, display only), clears them by
// the purge rules when the catalogue, the stock or a setting changes, hears the other processes' clears over Redis
// (REDIS_CACHE_URL), and asks Cloudflare to drop pages while it keeps them (Keys & connections; the mock until the
// owner's token passes). It also leaves the page times where the proxy (src/proxy.ts) can read them without a database.
//
// Without a database (CI, `next build`) nothing is kept and nothing starts: the pages read through.
import { hostname } from "node:os";
import {
  cdnAdapters,
  createConnections,
  type CdnPurger,
} from "@extas/adapters";
import {
  createCacheRuntime,
  dayIn,
  emitCacheEvent,
  tags,
  type CacheRuntime,
  type Loaded,
} from "@extas/cache";
import { getPrisma } from "@extas/db/client";
import { registry } from "@extas/settings";
import { adminDeps } from "./admin-auth";
import {
  CATEGORY_PREFIX,
  proxyPolicy,
  setProxyPolicy,
  type ProxyCachePolicy,
} from "./cache-policy";
import { BN_PREFIX } from "./shop/lang";
import { SITEMAP_INDEX } from "./seo/sitemap";
import { onSettingsChanged, settingsResolver } from "./settings";

const G = globalThis as unknown as {
  __extasCache?: CacheRuntime;
  __extasCacheStop?: Promise<() => Promise<void>>;
};

/** The shop's addresses the purge needs. */
export const SHOP_PATHS = {
  categoryPrefix: CATEGORY_PREFIX,
  langPrefixes: [BN_PREFIX],
  sitemap: SITEMAP_INDEX,
} as const;

const timeZone = () => process.env.EXTAS_TIMEZONE || process.env.TZ || "UTC";

async function cdnLink() {
  const deps = adminDeps();
  if (!deps) throw new Error("no database");
  const [testS, cacheS] = await Promise.all([
    deps.resolver.value("system.integrationTestTimeoutSeconds"),
    deps.resolver.value("system.integrationKeyCacheSeconds"),
  ]);
  const c = createConnections({
    db: deps.db,
    vault: deps.vault ?? { get: async () => null },
    adapters: cdnAdapters,
    secretCacheMs: cacheS * 1000,
    testTimeoutMs: testS * 1000,
  });
  const link = await c.use<CdnPurger>("CDN");
  return { api: link.api, provider: link.provider, mode: link.mode };
}

/** This process's cache, or null without a database. */
export function cacheRuntime(): CacheRuntime | null {
  if (G.__extasCache) return G.__extasCache;
  const settings = settingsResolver();
  if (!settings) return null;
  G.__extasCache = createCacheRuntime({
    db: getPrisma(),
    settings,
    cdn: cdnLink,
    redisUrl: process.env.REDIS_CACHE_URL || null,
    origin: `web-${hostname()}-${process.env.EXTAS_COLOR ?? "dev"}-${process.pid}`,
    paths: SHOP_PATHS,
    day: () => dayIn(timeZone()),
  });
  return G.__extasCache;
}

/** Starts listening (once per process): the instrumentation hook calls it at boot. */
export function startCache(): void {
  const rt = cacheRuntime();
  if (!rt || G.__extasCacheStop) return;
  onSettingsChanged(settingsChanged);
  G.__extasCacheStop = rt.start();
  void pagePolicy();
}

/** Today's date for the hit counts. */
export const cacheDay = () => dayIn(timeZone());

/** A setting changed: a write here clears by the purge rules; another process's write clears this process's pages. */
export function settingsChanged(change: {
  keys: string[] | null;
  storeId: number | null;
}): void {
  if (change.keys)
    emitCacheEvent({
      kind: "settings",
      storeId: change.storeId,
      keys: change.keys,
    });
  else G.__extasCache?.page.clear();
  void pagePolicy();
}

/** The page times now (and leaves them for the proxy). */
export async function pagePolicy(storeId?: number): Promise<ProxyCachePolicy> {
  const r = settingsResolver();
  const fallback = {
    ...registry["cache.pages"].default,
    productPrefix: registry["naming.productPathPrefix"].default,
  };
  if (!r) return fallback;
  try {
    const [pages, productPrefix] = await Promise.all([
      r.value("cache.pages"),
      r.value(
        "naming.productPathPrefix",
        storeId === undefined ? {} : { storeId },
      ),
    ]);
    const p = { ...pages, productPrefix: productPrefix.replace(/\/+$/, "") };
    setProxyPolicy(p);
    return p;
  } catch {
    return proxyPolicy() ?? fallback;
  }
}

async function pageMillis(
  kind: "product" | "category",
  storeId: number,
): Promise<number> {
  const p = await pagePolicy(storeId);
  if (!p.server) return 0;
  return (kind === "product" ? p.productMinutes : p.categoryMinutes) * 60_000;
}

/** A product page's data, kept by the server for `cache.pages.productMinutes` (read through without a runtime). */
export async function cachedProductPage<T extends { id: string }>(
  storeId: number,
  slug: string,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const rt = cacheRuntime();
  if (!rt) return load();
  const ms = await pageMillis("product", storeId);
  return rt.page.get(
    "page",
    `pdp:${storeId}:${slug}`,
    ms,
    async (): Promise<Loaded<T> | null> => {
      const v = await load();
      return v
        ? { value: v, tags: [tags.store(storeId), tags.product(storeId, v.id)] }
        : null;
    },
  );
}

/** A category page's data, kept for `cache.pages.categoryMinutes`; every product on it tags it. */
export async function cachedCategoryPage<
  T extends { cards: readonly { id: string }[]; unavailable?: boolean },
>(
  storeId: number,
  key: string,
  load: () => Promise<T | undefined>,
): Promise<T | undefined> {
  const rt = cacheRuntime();
  if (!rt) return load();
  const ms = await pageMillis("category", storeId);
  let read: { d: T | undefined } | null = null;
  const v = await rt.page.get(
    "page",
    `cat:${storeId}:${key}`,
    ms,
    async (): Promise<Loaded<T> | null> => {
      const d = await load();
      read = { d };
      // nothing kept for "not found" or "could not be read just now"
      return d && !d.unavailable
        ? {
            value: d,
            tags: [
              tags.store(storeId),
              tags.listing(storeId),
              ...d.cards.map((c) => tags.product(storeId, c.id)),
            ],
          }
        : null;
    },
  );
  if (v) return v;
  return read ? (read as { d: T | undefined }).d : load();
}

/** The stock shown on a product page, kept for `cache.stockDisplaySeconds` (display only; the bag reads it live). */
export async function cachedStock(
  storeId: number,
  productId: string,
  load: () => Promise<Map<string, number>>,
): Promise<Map<string, number>> {
  const rt = cacheRuntime();
  const r = settingsResolver();
  if (!rt || !r) return load();
  const seconds = await r.value("cache.stockDisplaySeconds").catch(() => 0);
  const v = await rt.page.get(
    "stock",
    `stock:${storeId}:${productId}`,
    seconds * 1000,
    async () => ({
      value: await load(),
      tags: [tags.store(storeId), tags.product(storeId, productId)],
    }),
  );
  return v ?? (await load());
}
