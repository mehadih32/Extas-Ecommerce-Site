// PR 602 — the cache's events: what changed, said once by the code that changed it. The catalogue (a price, a
// product's text or photos, publishing), the stock (a size sold out or back) and the settings call `emitCacheEvent`;
// whoever keeps a copy of a page listens with `onCacheEvent` (the web app's page cache, the worker's purge to the other
// processes and to Cloudflare). This file has no dependencies, so any package can say "this changed" without knowing
// who keeps what. Emitting never throws and never waits: a listener's error is reported, never passed back to the
// change itself (a sale must never fail because a cache could not be cleared).

/** What changed. `reason` is for the log and the rules only; every product event clears that product everywhere. */
export type CacheEvent =
  | {
      kind: "product";
      storeId: number;
      productIds: readonly string[];
      reason: ProductChange;
    }
  | { kind: "category"; storeId: number; categoryIds: readonly string[] }
  | { kind: "settings"; storeId: number | null; keys: readonly string[] }
  | { kind: "all"; storeId: number | null };

/**
 * - `price`, `stock`: the product's summary changed (its "from" price, or a size sold out / came back);
 * - `content`: its words, photos, colours or category;
 * - `publish`: it went on the shop or off it (its categories and the sitemap change too).
 */
export type ProductChange = "price" | "stock" | "content" | "publish";

export type CacheListener = (event: CacheEvent) => void | Promise<void>;

// One list per process, shared even when a bundler loads this file twice (the web app's server and its proxy).
const G = globalThis as unknown as {
  __extasCacheListeners?: Set<CacheListener>;
};
const listeners = (): Set<CacheListener> =>
  (G.__extasCacheListeners ??= new Set());

/** Starts listening; returns the function that stops it. */
export function onCacheEvent(fn: CacheListener): () => void {
  listeners().add(fn);
  return () => {
    listeners().delete(fn);
  };
}

/** Says that something changed. Returns at once; listeners run on their own. */
export function emitCacheEvent(event: CacheEvent): void {
  for (const fn of [...listeners()]) {
    try {
      const r = fn(event);
      if (r && typeof (r as Promise<void>).catch === "function")
        (r as Promise<void>).catch((e) => report(e));
    } catch (e) {
      report(e);
    }
  }
}

/** How many listeners are on (the cache page shows whether the purge is wired in this process). */
export const cacheListenerCount = (): number => listeners().size;

function report(e: unknown): void {
  console.warn(
    `cache: a purge failed (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`,
  );
}
