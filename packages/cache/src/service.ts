// PR 602 — the cache service: it hears every change (events.ts), works out what to clear (rules.ts), clears it in this
// process's page cache (store.ts), tells the other processes (bus.ts) and, while Cloudflare keeps pages, Cloudflare
// (the CDN adapter through Keys & connections; the mock until the owner's token passes its test). It also answers the
// Cache page (SET-08b): what is kept and for how long, the hit rate, the last clear; saving the times; and "Clear all".
//
// Reading needs `system.read`; saving and "Clear all" need `system.cache` and each writes one audit row. Clearing a
// cache loses nothing — orders, products and settings are not touched — and nothing here moves money or changes a
// price, a discount or COD.
import { audit, requirePermission, type Actor } from "@extas/auth";
import type { CdnPurger, CdnResult, Mode } from "@extas/adapters";
import type { Prisma, PrismaClient } from "@extas/db/client";
import {
  CACHE_CHOICES,
  cachePagesSchema,
  cacheTuningSchema,
  INSTALLATION,
  type Key,
  type Value,
} from "@extas/settings";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { BusPurge, CacheBus } from "./bus";
import type { CacheEvent } from "./events";
import { planFor, type PurgePlan } from "./rules";
import { hitPercent, type CacheCounts, type PageCache } from "./store";

export type Db = PrismaClient | Prisma.TransactionClient;

export interface SettingsReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}

/** The settings resolver's write side (the app passes its SettingsResolver). */
export interface SettingsWriter extends SettingsReader {
  set<K extends Key>(
    key: K,
    value: Value<K>,
    target: typeof INSTALLATION,
    opts?: { actorId?: string | null; reason?: string | null },
  ): Promise<unknown>;
  invalidate?(): void;
}

export interface CacheLink {
  api: CdnPurger;
  provider: string;
  mode: Mode;
}

/** The shop's addresses the purge needs (the web app's routing table; the product prefix is a setting). */
export interface ShopPaths {
  categoryPrefix: string;
  /** Language prefixes in front of a shop address ('/bn'). */
  langPrefixes: readonly string[];
  sitemap: string | null;
}

/**
 * The shop's addresses for a process without the web app's routing table (the worker). They mirror
 * apps/web/src/lib/shop/routes.ts and lang.ts; apps/web/src/lib/cache.test.ts fails when the two drift.
 */
export const SHOP_PATHS: ShopPaths = {
  categoryPrefix: "/collections",
  langPrefixes: ["/bn"],
  sitemap: null,
};

export interface CacheServiceDeps {
  db: Db;
  settings: SettingsReader;
  page: PageCache;
  bus: CacheBus | null;
  /** The CDN connection now (Keys & connections; the mock until the owner's token passes). */
  cdn: () => Promise<CacheLink>;
  paths: ShopPaths;
  /** Runs `fn` after `ms` (the repeated purge); tests pass their own. */
  later?: (fn: () => void, ms: number) => void;
  now?: () => Date;
}

export interface Who {
  actor: Actor;
  /** The store whose admin is open (the cache itself is installation-wide). */
  storeId: number;
  ctx?: { ip?: string | null; userAgent?: string | null };
}

export type CacheErrorCode = "INVALID_INPUT" | "STALE";

export class CacheError extends Error {
  constructor(
    readonly code: CacheErrorCode,
    message: string,
    readonly details: string[] = [],
    readonly data?: Record<string, unknown>,
  ) {
    super(`${code}: ${message}`);
    this.name = "CacheError";
  }

  get status(): number {
    return this.code === "STALE" ? 409 : 400;
  }
}

export const isCacheError = (e: unknown): e is CacheError =>
  e instanceof CacheError;

export interface PurgeOutcome {
  plan: PurgePlan;
  /** Server cache entries cleared in this process. */
  cleared: number;
  /** What Cloudflare answered (null: not asked — it keeps no pages now). */
  cdn: (CdnResult & { mode: Mode }) | null;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function createCacheService(deps: CacheServiceDeps) {
  const later = deps.later ?? ((fn, ms) => void setTimeout(fn, ms).unref?.());

  /** The slugs one change touches: the products' own, and every category that lists them with its parents. */
  async function factsOf(event: CacheEvent) {
    if (event.kind !== "product" && event.kind !== "category")
      return { productSlugs: [] as string[], categorySlugs: [] as string[] };
    const storeId = event.storeId;
    const cats = await deps.db.category.findMany({
      where: { storeId },
      select: { id: true, parentId: true, slug: true },
    });
    const byId = new Map(cats.map((c) => [c.id, c]));
    const withParents = (ids: Iterable<string>) => {
      const out = new Set<string>();
      for (let id of ids) {
        for (let guard = 0; guard < 64 && id && !out.has(id); guard++) {
          out.add(id);
          id = byId.get(id)?.parentId ?? "";
        }
      }
      return [...out].flatMap((id) =>
        byId.get(id) ? [byId.get(id)!.slug] : [],
      );
    };
    if (event.kind === "category")
      return {
        productSlugs: [],
        categorySlugs: withParents(event.categoryIds),
      };
    const ids = [...event.productIds];
    const [products, listed] = await Promise.all([
      deps.db.product.findMany({
        where: { storeId, id: { in: ids } },
        select: { slug: true, categoryId: true },
      }),
      deps.db.categoryProduct.findMany({
        where: { storeId, productId: { in: ids } },
        select: { categoryId: true },
      }),
    ]);
    return {
      productSlugs: products.map((p) => p.slug),
      categorySlugs: withParents(
        uniq([
          ...products.flatMap((p) => (p.categoryId ? [p.categoryId] : [])),
          ...listed.map((l) => l.categoryId),
        ]),
      ),
    };
  }

  function applyLocal(purge: BusPurge): number {
    return purge.everything
      ? deps.page.clear()
      : deps.page.purgeTags(purge.tags);
  }

  async function toCdn(
    plan: PurgePlan,
    force: boolean,
  ): Promise<PurgeOutcome["cdn"]> {
    const pages = await deps.settings.value("cache.pages");
    if (!pages.cdn && !force) return null;
    if (!plan.cdnEverything && !plan.paths.length) return null;
    const link = await deps.cdn();
    const r = plan.cdnEverything
      ? await link.api.purgeEverything()
      : await link.api.purgePaths(plan.paths);
    if (!r.ok) console.warn(`cache: Cloudflare purge failed (${r.error})`);
    return { ...r, mode: link.mode };
  }

  /** One change: clear here, in the other processes and at Cloudflare; once more after the repeat time. */
  async function handle(
    event: CacheEvent,
    opts: { forceCdn?: boolean } = {},
  ): Promise<PurgeOutcome> {
    const storeForPrefix =
      event.kind === "product" || event.kind === "category"
        ? event.storeId
        : undefined;
    const [facts, productPrefix, tuning] = await Promise.all([
      factsOf(event),
      deps.settings.value(
        "naming.productPathPrefix",
        storeForPrefix === undefined ? {} : { storeId: storeForPrefix },
      ),
      deps.settings.value("cache.tuning"),
    ]);
    const plan = planFor(event, {
      ...facts,
      productPrefix: productPrefix.replace(/\/+$/, ""),
      categoryPrefix: deps.paths.categoryPrefix,
      langPrefixes: deps.paths.langPrefixes,
      sitemap: deps.paths.sitemap,
    });
    const purge: BusPurge = { tags: plan.tags, everything: plan.everything };
    const cleared = applyLocal(purge);
    await deps.bus?.publish(purge);
    const cdn = await toCdn(plan, opts.forceCdn === true);
    if (tuning.repeatSeconds > 0) {
      later(() => {
        applyLocal(purge);
        void deps.bus?.publish(purge);
        if (cdn)
          void toCdn(plan, opts.forceCdn === true).catch(() => undefined);
      }, tuning.repeatSeconds * 1000);
    }
    return { plan, cleared, cdn };
  }

  return {
    handle,
    /** A purge another process worked out (from the bus). */
    applyRemote: (purge: BusPurge) => applyLocal(purge),

    /** "Clear all" (`system.cache`): the page cache of every process, the settings memory, then Cloudflare. */
    async clearAll(who: Who, reason: string | null = null) {
      await requirePermission(
        deps.db as PrismaClient,
        who.actor,
        "system.cache",
        { storeId: who.storeId },
      );
      const before = deps.page.sizes();
      const outcome = await handle(
        { kind: "all", storeId: null },
        { forceCdn: true },
      );
      await audit(
        deps.db as PrismaClient,
        who.actor,
        {
          storeId: who.storeId,
          action: "cache.clear",
          entityType: "Cache",
          entityId: "all",
          before: { entries: before },
          after: {
            cdn: outcome.cdn
              ? { ok: outcome.cdn.ok, mode: outcome.cdn.mode }
              : null,
            reason,
          },
        },
        { source: "admin-api", ...who.ctx },
      );
      return {
        cleared: outcome.cleared,
        cdn: outcome.cdn
          ? {
              ok: outcome.cdn.ok,
              mode: outcome.cdn.mode,
              ...(outcome.cdn.ok ? {} : { error: outcome.cdn.error }),
            }
          : null,
      };
    },

    /** What the Cache page shows (`system.read`). */
    async status(who: Who, day: string) {
      await requirePermission(
        deps.db as PrismaClient,
        who.actor,
        "system.read",
        { storeId: who.storeId },
      );
      const [values, shared, link, last] = await Promise.all([
        settingsOf(deps.settings),
        deps.bus ? deps.bus.counts(day) : Promise.resolve(null),
        deps.cdn().catch(() => null),
        deps.db.auditLog.findFirst({
          where: { action: "cache.clear", entityType: "Cache" },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, actorId: true },
        }),
      ]);
      const counts: Record<string, CacheCounts> = shared ?? deps.page.stats();
      return {
        values,
        version: versionOf(values),
        choices: CACHE_CHOICES,
        hitRate: {
          page: hitPercent(counts.page),
          stock: hitPercent(counts.stock),
        },
        counts,
        shared: shared !== null,
        entries: deps.page.sizes(),
        cdn: link ? { provider: link.provider, mode: link.mode } : null,
        lastCleared: last
          ? { at: last.createdAt.toISOString(), by: last.actorId }
          : null,
      };
    },

    /** Saves the times (`system.cache`); a stale screen is refused. Returns the new values. */
    async save(who: Who & { settings: SettingsWriter }, input: unknown) {
      await requirePermission(
        deps.db as PrismaClient,
        who.actor,
        "system.cache",
        { storeId: who.storeId },
      );
      const r = saveInput.safeParse(input ?? {});
      if (!r.success)
        throw new CacheError(
          "INVALID_INPUT",
          "the cache times are not valid",
          r.error.issues.map(
            (i) => `${i.path.join(".") || "(input)"}: ${i.message}`,
          ),
        );
      const before = await settingsOf(deps.settings);
      if (r.data.version !== undefined && r.data.version !== versionOf(before))
        throw new CacheError(
          "STALE",
          "the cache times were changed by someone else; reload them",
          ["version"],
          { version: versionOf(before) },
        );
      const next = {
        "cache.pages": r.data.pages ?? before["cache.pages"],
        "cache.stockDisplaySeconds":
          r.data.stockDisplaySeconds ?? before["cache.stockDisplaySeconds"],
        "cache.tuning": r.data.tuning ?? before["cache.tuning"],
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
        (k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]),
      );
      for (const k of changed)
        await who.settings.set(k, next[k] as never, INSTALLATION, {
          actorId: who.actor.staffUserId ?? null,
          reason: "Settings › System › Cache",
        });
      if (changed.length)
        await audit(
          deps.db as PrismaClient,
          who.actor,
          {
            storeId: who.storeId,
            action: "cache.settings",
            entityType: "Cache",
            entityId: "settings",
            before: Object.fromEntries(changed.map((k) => [k, before[k]])),
            after: Object.fromEntries(changed.map((k) => [k, next[k]])),
          },
          { source: "admin-api", ...who.ctx },
        );
      const values = await settingsOf(deps.settings);
      return { values, version: versionOf(values), changed };
    },
  };
}

export type CacheService = ReturnType<typeof createCacheService>;

const saveInput = z
  .object({
    pages: cachePagesSchema.optional(),
    stockDisplaySeconds: z
      .int()
      .refine(
        (v) => (CACHE_CHOICES.stockSeconds as readonly number[]).includes(v),
        "one of the offered times",
      )
      .optional(),
    tuning: cacheTuningSchema.optional(),
    version: z.string().min(1).max(64).optional(),
  })
  .strict();

async function settingsOf(s: SettingsReader) {
  const [pages, stock, tuning] = await Promise.all([
    s.value("cache.pages"),
    s.value("cache.stockDisplaySeconds"),
    s.value("cache.tuning"),
  ]);
  return {
    "cache.pages": pages,
    "cache.stockDisplaySeconds": stock,
    "cache.tuning": tuning,
  };
}

const versionOf = (v: unknown): string =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
