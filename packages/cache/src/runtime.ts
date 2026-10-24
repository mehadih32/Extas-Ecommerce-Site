// PR 602 — one process's cache, wired: its page cache, the Redis link to the other processes (when REDIS_CACHE_URL is
// set), the service, and the listener that turns every change said with `emitCacheEvent` into a purge. The web app
// starts it from its instrumentation hook, the worker from its main; both stop it on shutdown.
import { registry } from "@extas/settings";
import { redisBus, type CacheBus } from "./bus";
import { onCacheEvent } from "./events";
import {
  createCacheService,
  type CacheLink,
  type CacheService,
  type Db,
  type SettingsReader,
  type ShopPaths,
} from "./service";
import { PageCache } from "./store";

export interface CacheRuntimeOptions {
  db: Db;
  settings: SettingsReader;
  cdn: () => Promise<CacheLink>;
  /** REDIS_CACHE_URL; null: this process clears and counts on its own. */
  redisUrl: string | null;
  /** This process's name (the host and the colour). */
  origin: string;
  paths: ShopPaths;
  /** Today's date (YYYY-MM-DD) in the shop's time zone, for the hit counts. */
  day: () => string;
}

export interface CacheRuntime {
  page: PageCache;
  bus: CacheBus | null;
  service: CacheService;
  /** Starts listening to changes and to the other processes; returns the stop function. */
  start(): Promise<() => Promise<void>>;
}

export function createCacheRuntime(o: CacheRuntimeOptions): CacheRuntime {
  let tuning = registry["cache.tuning"].default;
  const refresh = () =>
    o.settings.value("cache.tuning").then(
      (v) => void (tuning = v),
      () => undefined,
    );
  const bus = o.redisUrl
    ? redisBus({
        url: o.redisUrl,
        origin: o.origin,
        day: o.day,
        keepDays: () => tuning.statsDays,
      })
    : null;
  const page = new PageCache({
    maxEntries: () => tuning.maxEntries,
    onCount: (layer, hit) => bus?.count(layer, hit),
  });
  const service = createCacheService({
    db: o.db,
    settings: o.settings,
    page,
    bus,
    cdn: o.cdn,
    paths: o.paths,
  });
  return {
    page,
    bus,
    service,
    async start() {
      await refresh();
      const off = onCacheEvent(async (e) => {
        if (e.kind === "settings") await refresh();
        await service.handle(e);
      });
      let unsubscribe: (() => Promise<void>) | null = null;
      if (bus) {
        try {
          unsubscribe = await bus.subscribe((p) => service.applyRemote(p));
        } catch (e) {
          console.warn(
            `cache: not listening to the other processes (${e instanceof Error ? e.message : String(e)}); this one clears on its own`,
          );
        }
      }
      return async () => {
        off();
        await unsubscribe?.();
        await bus?.close();
      };
    },
  };
}

/** Today's date as YYYY-MM-DD in a time zone. */
export function dayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
