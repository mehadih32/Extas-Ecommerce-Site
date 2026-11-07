// PR 602 follow-up 400 — the Server page's cache card: the two cache layers the shop counts (the built pages and the
// stock numbers), each with today's reuse, its hits and misses and how many entries this process keeps now; Cloudflare's
// mode, whether it keeps pages, and the last clear. Read through the cache service's own status (`system.read`, the same
// as the page); the times and "Clear all" stay on Settings › System › Cache. Null when the cache cannot be read (no
// database, Redis down, or the read refused): the page says so and still opens.
import type { Actor } from '@extas/auth';
import { cacheDay, cacheRuntime } from '../cache';

/** The layers the card shows, in its order (the cache service counts these two). */
export const CACHE_CARD_LAYERS = ['page', 'stock'] as const;
export type CacheCardLayer = (typeof CACHE_CARD_LAYERS)[number];

export interface CacheCardLayerRow {
  layer: CacheCardLayer;
  hits: number;
  misses: number;
  /** Reused out of every read, in whole percent (null: no read yet). */
  percent: number | null;
  /** Entries this process keeps now. */
  kept: number;
}

export interface ServerCacheCard {
  layers: CacheCardLayerRow[];
  /** Counted over Redis by every copy (true), or this process's own since it started. */
  shared: boolean;
  cdn: string | null;
  /** Cloudflare keeps pages too (`cache.pages.cdn`), or files only. */
  cdnPages: boolean;
  lastCleared: string | null;
}

/** The status the card is drawn from (the cache service's `status`, only what the card reads). */
export interface CacheStatusLike {
  counts: Record<string, { hits: number; misses: number } | undefined>;
  hitRate: Partial<Record<CacheCardLayer, number | null>>;
  entries: Record<string, number | undefined>;
  shared: boolean;
  cdn: { mode: string } | null;
  values: { 'cache.pages': { cdn: boolean } };
  lastCleared: { at: string } | null;
}

/** The card from the cache's status. Pure. */
export function cacheCardOf(s: CacheStatusLike): ServerCacheCard {
  return {
    layers: CACHE_CARD_LAYERS.map((layer) => {
      const c = s.counts[layer] ?? { hits: 0, misses: 0 };
      return { layer, hits: c.hits, misses: c.misses, percent: s.hitRate[layer] ?? null, kept: s.entries[layer] ?? 0 };
    }),
    shared: s.shared,
    cdn: s.cdn?.mode ?? null,
    cdnPages: s.values['cache.pages'].cdn,
    lastCleared: s.lastCleared?.at ?? null,
  };
}

/** The card for the person on the page, or null when the cache cannot be read now (never fails the page). */
export async function serverCacheCard(who: { actor: Actor; storeId: number }): Promise<ServerCacheCard | null> {
  const rt = cacheRuntime();
  if (!rt) return null;
  try {
    return cacheCardOf(await rt.service.status(who, cacheDay()));
  } catch (e) {
    console.warn(`admin: the Server page's cache card is unavailable (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return null;
  }
}
