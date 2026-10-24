// PR 602 — the cache over Redis (REDIS_CACHE_URL, the cache store of the server setup): what one process cleared is
// cleared in every other (the web app's copies and the worker), and the hits and misses of all of them are counted
// together for the Cache page's hit rate. Without Redis (a laptop, CI) each process clears its own and counts its own;
// the pages' short lifetimes bound what another process may still show.
//
// A message carries the purge already worked out (tags, or everything), never the change itself, so the other
// processes do not ask the database again. A process ignores its own messages. Redis being away never fails a page or
// a change: a publish or a count that cannot be sent is dropped with one warning.
import { Redis } from "ioredis";
import type { CacheCounts } from "./store";

/** What every process clears. */
export interface BusPurge {
  tags: readonly string[];
  everything: boolean;
}

export interface CacheBus {
  publish(purge: BusPurge): Promise<void>;
  /** Starts receiving the other processes' purges; returns the function that stops it. */
  subscribe(fn: (purge: BusPurge) => void): Promise<() => Promise<void>>;
  /** Counts one hit or miss (sent in the background). */
  count(layer: string, hit: boolean): void;
  /** Today's hits and misses of every process, by layer (the server's time zone decides "today"). */
  counts(day: string): Promise<Record<string, CacheCounts>>;
  close(): Promise<void>;
}

export interface BusOptions {
  url: string;
  /** This process's own name (its messages are ignored on the way back). */
  origin: string;
  /** Today's date as YYYY-MM-DD, for the counters' key. */
  day: () => string;
  /** How many days of counters Redis keeps (`cache.tuning.statsDays`). */
  keepDays: () => number;
}

const CHANNEL = "extas:cache:purge";
const COUNTS = (day: string) => `extas:cache:counts:${day}`;

export function redisBus(o: BusOptions): CacheBus {
  const redis = new Redis(o.url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  let sub: Redis | null = null;
  let warned = false;
  const warn = (what: string, e: unknown) => {
    if (warned) return;
    warned = true;
    console.warn(
      `cache: Redis ${what} failed; each process clears its own until it is back (${e instanceof Error ? e.message : String(e)})`,
    );
  };
  redis.on("error", (e) => warn("connection", e));
  // one connect at a time: every caller waits for the same one (a second connect() while connecting throws)
  let connecting: Promise<void> | null = null;
  const ready = async (r: Redis) => {
    if (r.status === "ready") return;
    connecting ??= r.connect().finally(() => {
      connecting = null;
    });
    await connecting;
  };

  return {
    async publish(purge) {
      try {
        await ready(redis);
        await redis.publish(
          CHANNEL,
          JSON.stringify({
            origin: o.origin,
            tags: purge.tags,
            everything: purge.everything,
          }),
        );
      } catch (e) {
        warn("publish", e);
      }
    },
    async subscribe(fn) {
      sub = new Redis(o.url, { lazyConnect: true, maxRetriesPerRequest: null });
      sub.on("error", (e) => warn("subscribe", e));
      sub.on("message", (_ch: string, raw: string) => {
        try {
          const m = JSON.parse(raw) as {
            origin?: string;
            tags?: unknown;
            everything?: unknown;
          };
          if (m.origin === o.origin) return;
          const tags = Array.isArray(m.tags)
            ? m.tags.filter((t): t is string => typeof t === "string")
            : [];
          fn({ tags, everything: m.everything === true });
        } catch {
          // a message that is not ours: nothing to clear
        }
      });
      await sub.connect();
      await sub.subscribe(CHANNEL);
      const s = sub;
      return async () => {
        await s.quit().catch(() => undefined);
      };
    },
    count(layer, hit) {
      const key = COUNTS(o.day());
      ready(redis)
        .then(() =>
          redis
            .multi()
            .hincrby(key, `${layer}:${hit ? "hits" : "misses"}`, 1)
            .expire(key, o.keepDays() * 86_400)
            .exec(),
        )
        .catch((e) => warn("count", e));
    },
    async counts(day) {
      try {
        await ready(redis);
        const raw = await redis.hgetall(COUNTS(day));
        const out: Record<string, CacheCounts> = {};
        for (const [field, v] of Object.entries(raw)) {
          const [layer, which] = field.split(":");
          if (!layer || (which !== "hits" && which !== "misses")) continue;
          const c = (out[layer] ??= { hits: 0, misses: 0 });
          c[which] = Number(v) || 0;
        }
        return out;
      } catch (e) {
        warn("read", e);
        return {};
      }
    },
    async close() {
      await Promise.all([
        redis.quit().catch(() => undefined),
        sub?.quit().catch(() => undefined),
      ]);
    },
  };
}
