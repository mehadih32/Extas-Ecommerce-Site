// PR 602 — the pure parts: the event bus, which address may be kept where, the purge rules, the page cache.
import { describe, expect, it } from "vitest";
import {
  cacheListenerCount,
  emitCacheEvent,
  onCacheEvent,
  type CacheEvent,
} from "./events";
import {
  cacheHeaders,
  classify,
  isPersonal,
  pageSeconds,
  type PagePolicy,
  type PathTable,
} from "./policy";
import { planFor, tags, type PurgeFacts } from "./rules";
import { hitPercent, PageCache } from "./store";

const TABLE: PathTable = {
  never: ["/bag", "/checkout", "/account", "/admin", "/api"],
  productPrefix: "/p",
  categoryPrefix: "/collections",
  langPrefixes: ["/bn"],
};
const ON: PagePolicy = {
  server: true,
  cdn: true,
  categoryMinutes: 5,
  productMinutes: 10,
};

describe("events (PR 602)", () => {
  it("every listener hears an event; a listener that throws or rejects never reaches the change; stopping works", async () => {
    const heard: CacheEvent[] = [];
    const before = cacheListenerCount();
    const offA = onCacheEvent((e) => void heard.push(e));
    const offB = onCacheEvent(() => {
      throw new Error("boom");
    });
    const offC = onCacheEvent(async () => {
      throw new Error("later boom");
    });
    expect(cacheListenerCount()).toBe(before + 3);
    expect(() =>
      emitCacheEvent({
        kind: "product",
        storeId: 1,
        productIds: ["a"],
        reason: "price",
      }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    offA();
    offB();
    offC();
    emitCacheEvent({ kind: "all", storeId: null });
    expect(heard).toEqual([
      { kind: "product", storeId: 1, productIds: ["a"], reason: "price" },
    ]);
    expect(cacheListenerCount()).toBe(before);
  });
});

describe("policy (PR 602)", () => {
  it("the bag, the checkout, the account, the admin and the API are never kept, in both languages and everything under them", () => {
    for (const p of [
      "/bag",
      "/bag/try",
      "/checkout",
      "/checkout/pay/E-1",
      "/bn/checkout",
      "/account",
      "/bn/account/orders",
      "/admin",
      "/api/cart",
      "/checkout/",
    ])
      expect(classify(p, TABLE), p).toBe("never");
    for (const p of ["/bagpack", "/checkouts"])
      expect(classify(p, TABLE), p).toBe("page");
  });

  it("product and category pages by their prefixes; the bare prefix and every other page is an ordinary page", () => {
    expect(classify("/p/linen-shirt", TABLE)).toBe("product");
    expect(classify("/bn/p/linen-shirt/navy", TABLE)).toBe("product");
    expect(classify("/collections/polos", TABLE)).toBe("category");
    expect(classify("/bn/collections/polos", TABLE)).toBe("category");
    expect(classify("/collections", TABLE)).toBe("page");
    expect(classify("/", TABLE)).toBe("page");
    expect(classify("/bn", TABLE)).toBe("page");
    expect(pageSeconds("product", ON)).toBe(600);
    expect(pageSeconds("category", ON)).toBe(300);
    expect(pageSeconds("page", ON)).toBe(0);
  });

  it("Cloudflare keeps a category or product page only while switched on and only for a visitor with no cookie of his own", () => {
    expect(cacheHeaders("never", ON, false)).toEqual({
      "cache-control": "private, no-store",
      "cdn-cache-control": "no-store",
    });
    expect(cacheHeaders("product", ON, false)).toEqual({
      "cache-control": null,
      "cdn-cache-control": "public, max-age=600",
    });
    expect(cacheHeaders("category", ON, true)["cdn-cache-control"]).toBe(
      "no-store",
    );
    expect(
      cacheHeaders("category", { ...ON, cdn: false }, false)[
        "cdn-cache-control"
      ],
    ).toBe("no-store");
    expect(cacheHeaders("page", ON, false)["cdn-cache-control"]).toBe(
      "no-store",
    );
    expect(
      isPersonal(["theme", "extas_bag_n"], ["extas_", "__Host-extas"]),
    ).toBe(true);
    expect(isPersonal(["theme", "_ga"], ["extas_", "__Host-extas"])).toBe(
      false,
    );
    expect(isPersonal(["extas_preview"], ["extas_"], ["extas_preview"])).toBe(
      false,
    );
  });
});

describe("purge rules (PR 602)", () => {
  const facts: PurgeFacts = {
    productSlugs: ["linen-shirt"],
    categorySlugs: ["shirts", "men"],
    productPrefix: "/p",
    categoryPrefix: "/collections",
    langPrefixes: ["/bn"],
    sitemap: "/sitemap.xml",
  };

  it("a price or stock change clears that product, the lists that show it, and its pages and categories at Cloudflare", () => {
    for (const reason of ["price", "stock", "content"] as const) {
      const plan = planFor(
        { kind: "product", storeId: 1, productIds: ["P1"], reason },
        facts,
      );
      expect(plan.tags).toEqual([tags.product(1, "P1")]);
      expect(plan.everything).toBe(false);
      expect(plan.paths).toEqual([
        "/p/linen-shirt",
        "/bn/p/linen-shirt",
        "/collections/shirts",
        "/bn/collections/shirts",
        "/collections/men",
        "/bn/collections/men",
      ]);
      expect(plan.cdnEverything).toBe(false);
    }
  });

  it("a new or hidden product also clears every category list and the sitemap", () => {
    const plan = planFor(
      { kind: "product", storeId: 1, productIds: ["P1"], reason: "publish" },
      facts,
    );
    expect(plan.tags).toEqual([tags.product(1, "P1"), tags.listing(1)]);
    expect(plan.paths).toContain("/sitemap.xml");
  });

  it("a category clears the lists; a setting every page of its store (or all) and Cloudflare entirely; clear all everything", () => {
    expect(
      planFor({ kind: "category", storeId: 2, categoryIds: ["c"] }, facts),
    ).toMatchObject({
      tags: [tags.listing(2)],
      paths: expect.arrayContaining(["/collections/shirts"]),
    });
    expect(
      planFor({ kind: "settings", storeId: 1, keys: ["x"] }, facts),
    ).toEqual({
      tags: [tags.store(1)],
      everything: false,
      paths: [],
      cdnEverything: true,
    });
    expect(
      planFor({ kind: "settings", storeId: null, keys: ["x"] }, facts),
    ).toEqual({ tags: [], everything: true, paths: [], cdnEverything: true });
    expect(planFor({ kind: "all", storeId: null }, facts)).toEqual({
      tags: [],
      everything: true,
      paths: [],
      cdnEverything: true,
    });
  });
});

describe("page cache (PR 602)", () => {
  const make = (max = 10) => {
    let clock = 0;
    const counted: string[] = [];
    const c = new PageCache({
      maxEntries: () => max,
      now: () => clock,
      onCount: (l, hit) => counted.push(`${l}:${hit ? "hit" : "miss"}`),
    });
    return { c, counted, tick: (ms: number) => (clock += ms) };
  };

  it("keeps an entry for its time, counts hits and misses, never keeps null", async () => {
    const { c, counted, tick } = make();
    let loads = 0;
    const load = async () => ({
      value: { n: ++loads },
      tags: ["s:1", "p:1:a"],
    });
    expect(await c.get("page", "k", 1_000, load)).toEqual({ n: 1 });
    expect(await c.get("page", "k", 1_000, load)).toEqual({ n: 1 });
    tick(1_000);
    expect(await c.get("page", "k", 1_000, load)).toEqual({ n: 2 });
    expect(await c.get("page", "none", 1_000, async () => null)).toBeNull();
    expect(await c.get("page", "none", 1_000, async () => null)).toBeNull();
    expect(c.stats().page).toEqual({ hits: 1, misses: 4 });
    expect(counted).toEqual([
      "page:miss",
      "page:hit",
      "page:miss",
      "page:miss",
      "page:miss",
    ]);
    expect(hitPercent(c.stats().page)).toBe(20);
    expect(hitPercent(undefined)).toBeNull();
    expect(await c.get("page", "off", 0, load)).toEqual({ n: 3 });
    expect(c.sizes()).toEqual({ page: 1 });
  });

  it("a tag clears exactly the entries carrying it; clear() everything", async () => {
    const { c } = make();
    const v = (tagsOf: string[]) => async () => ({
      value: tagsOf.join(),
      tags: tagsOf,
    });
    await c.get("page", "a", 9e9, v(["s:1", "p:1:a"]));
    await c.get("page", "b", 9e9, v(["s:1", "p:1:b"]));
    await c.get("page", "list", 9e9, v(["s:1", "l:1", "p:1:a", "p:1:b"]));
    await c.get("page", "other", 9e9, v(["s:2", "p:2:a"]));
    expect(c.purgeTags(["p:1:a"])).toBe(2);
    expect(c.sizes()).toEqual({ page: 2 });
    expect(c.purgeTags(["s:1"])).toBe(1);
    expect(c.purgeTags(["nothing"])).toBe(0);
    expect(c.clear()).toBe(1);
    expect(c.sizes()).toEqual({});
  });

  it("one load for many callers at once; a purge during the load hands the result out but does not keep it", async () => {
    const { c } = make();
    let loads = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load = async () => {
      loads++;
      await gate;
      return { value: loads, tags: ["p:1:a"] };
    };
    const all = Promise.all([
      c.get("page", "k", 9e9, load),
      c.get("page", "k", 9e9, load),
      c.get("page", "k", 9e9, load),
    ]);
    c.purgeTags(["p:1:a"]);
    release();
    expect(await all).toEqual([1, 1, 1]);
    expect(loads).toBe(1);
    expect(c.sizes()).toEqual({});
  });

  it("drops the least recently used entry when full", async () => {
    const { c } = make(2);
    const v = (x: string) => async () => ({ value: x, tags: [] });
    await c.get("page", "a", 9e9, v("a"));
    await c.get("page", "b", 9e9, v("b"));
    await c.get("page", "a", 9e9, v("a2"));
    await c.get("page", "c", 9e9, v("c"));
    expect(await c.get("page", "a", 9e9, v("a3"))).toBe("a");
    expect(await c.get("page", "b", 9e9, v("b2"))).toBe("b2");
  });
});
