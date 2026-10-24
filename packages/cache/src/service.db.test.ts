// PR 602 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): a price change clears that product's page,
// the category lists that show it and — only while Cloudflare keeps pages — its addresses at Cloudflare (the mock);
// a new product clears every list and the sitemap; the purge is done once more after the repeat time; "Clear all" and
// saving the times need `system.cache`, are audited, and a stale screen is refused. Every value is a made-up test value.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRole, SYSTEM, syncAuth, type Actor } from "@extas/auth";
import {
  createTestDatabase,
  HAS_TEST_DB,
  seedSampleStores,
  type TestDatabase,
} from "@extas/auth/testing";
import { cloudflareAdapter, mockCdnLog } from "@extas/adapters";
import { registry, type Key, type Value } from "@extas/settings";
import { createCacheService, type CacheServiceDeps } from "./service";
import { tags } from "./rules";
import { PageCache } from "./store";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

describe.skipIf(!HAS_TEST_DB)("PR 602 · the cache service (PostgreSQL)", () => {
  let t: TestDatabase;
  let S = 0;
  let productId = "";
  let keeper: Actor;
  let reader: Actor;
  const overrides = new Map<string, unknown>();
  const settings = {
    value: async <K extends Key>(k: K): Promise<Value<K>> =>
      (overrides.has(k) ? overrides.get(k) : registry[k].default) as Value<K>,
    set: async (k: Key, v: unknown) => void overrides.set(k, v),
  };
  const timers: (() => void)[] = [];
  let page: PageCache;

  const deps = (): CacheServiceDeps => ({
    db: t.prisma,
    settings,
    page,
    bus: null,
    cdn: async () => ({
      api: await cloudflareAdapter.mock({
        mode: "MOCK",
        config: {} as never,
        storeId: null,
        secret: async () => null,
      }),
      provider: "cloudflare",
      mode: "MOCK",
    }),
    paths: {
      categoryPrefix: "/collections",
      langPrefixes: ["/bn"],
      sitemap: "/sitemap.xml",
    },
    later: (fn) => void timers.push(fn),
  });

  beforeAll(async () => {
    t = await createTestDatabase("cache_service");
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const p = t.prisma;
    const men = await p.category.create({
      data: { storeId: S, slug: "men", nameEn: "Men", isVisible: true },
    });
    const shirts = await p.category.create({
      data: {
        storeId: S,
        slug: "shirts",
        nameEn: "Shirts",
        parentId: men.id,
        isVisible: true,
      },
    });
    const sale = await p.category.create({
      data: { storeId: S, slug: "sale", nameEn: "Sale", isVisible: true },
    });
    const prod = await p.product.create({
      data: {
        storeId: S,
        slug: "linen-shirt",
        nameEn: "Linen shirt",
        categoryId: shirts.id,
      },
    });
    productId = prod.id;
    await p.categoryProduct.create({
      data: { storeId: S, categoryId: sale.id, productId },
    });
    const all = await createRole(p, SYSTEM, {
      key: "test-cache",
      nameEn: "cache",
      nameBn: "cache",
      permissions: ["system.read", "system.cache"],
    });
    const read = await createRole(p, SYSTEM, {
      key: "test-cache-read",
      nameEn: "reader",
      nameBn: "reader",
      permissions: ["system.read"],
    });
    const u = await p.staffUser.create({
      data: {
        email: "cache@example.com",
        displayName: "Cache Staff",
        passwordHash: "not-a-login",
      },
    });
    const r = await p.staffUser.create({
      data: {
        email: "cache-reader@example.com",
        displayName: "Reader",
        passwordHash: "not-a-login",
      },
    });
    await p.staffRoleAssignment.create({
      data: { staffUserId: u.id, roleId: all.id, storeId: S },
    });
    await p.staffRoleAssignment.create({
      data: { staffUserId: r.id, roleId: read.id, storeId: S },
    });
    keeper = { staffUserId: u.id };
    reader = { staffUserId: r.id };
  });
  afterAll(async () => {
    await t?.drop();
  });

  const fill = async () => {
    page = new PageCache({ maxEntries: () => 100 });
    const v = (tg: string[]) => async () => ({ value: 1, tags: tg });
    await page.get(
      "page",
      "pdp",
      9e9,
      v([tags.store(S), tags.product(S, productId)]),
    );
    await page.get(
      "page",
      "list",
      9e9,
      v([tags.store(S), tags.listing(S), tags.product(S, productId)]),
    );
    await page.get(
      "page",
      "other-list",
      9e9,
      v([tags.store(S), tags.listing(S)]),
    );
    await page.get("page", "home", 9e9, v([tags.store(S)]));
  };

  it("a price change clears that product and the lists showing it; Cloudflare is not asked while it keeps no pages", async () => {
    await fill();
    mockCdnLog.clear();
    const svc = createCacheService(deps());
    const r = await svc.handle({
      kind: "product",
      storeId: S,
      productIds: [productId],
      reason: "price",
    });
    expect(r.cleared).toBe(2);
    expect(page.sizes()).toEqual({ page: 2 });
    expect(r.plan.paths).toEqual(
      expect.arrayContaining([
        "/p/linen-shirt",
        "/bn/p/linen-shirt",
        "/collections/shirts",
        "/collections/men",
        "/collections/sale",
        "/bn/collections/men",
      ]),
    );
    expect(r.cdn).toBeNull();
    expect(mockCdnLog.all()).toHaveLength(0);
  });

  it("with Cloudflare page caching on, the same change drops its addresses there too, and once more after the repeat time", async () => {
    await fill();
    mockCdnLog.clear();
    timers.length = 0;
    overrides.set("cache.pages", {
      ...registry["cache.pages"].default,
      cdn: true,
    });
    overrides.set("naming.productPathPrefix", "/shop");
    const svc = createCacheService(deps());
    const r = await svc.handle({
      kind: "product",
      storeId: S,
      productIds: [productId],
      reason: "stock",
    });
    expect(r.cdn).toMatchObject({ ok: true, mode: "MOCK" });
    expect(mockCdnLog.all()[0]!.paths).toEqual(
      expect.arrayContaining(["/shop/linen-shirt", "/collections/sale"]),
    );
    expect(timers).toHaveLength(1);
    await page.get("page", "pdp", 9e9, async () => ({
      value: 2,
      tags: [tags.product(S, productId)],
    }));
    timers[0]!();
    await new Promise((res) => setTimeout(res, 10));
    expect(page.sizes()).toEqual({ page: 2 });
    expect(mockCdnLog.all()).toHaveLength(2);
    overrides.delete("naming.productPathPrefix");
  });

  it("a new product clears every list and the sitemap; a setting clears every page of its store", async () => {
    await fill();
    const svc = createCacheService(deps());
    const r = await svc.handle({
      kind: "product",
      storeId: S,
      productIds: [productId],
      reason: "publish",
    });
    expect(r.cleared).toBe(3);
    expect(r.plan.paths).toContain("/sitemap.xml");
    await fill();
    expect(
      (
        await createCacheService(deps()).handle({
          kind: "settings",
          storeId: S,
          keys: ["store.name"],
        })
      ).cleared,
    ).toBe(4);
  });

  it('"Clear all" needs system.cache, clears every layer, and is audited; the status shows the last clear', async () => {
    await fill();
    mockCdnLog.clear();
    overrides.delete("cache.pages");
    const svc = createCacheService(deps());
    expect(await code(svc.clearAll({ actor: reader, storeId: S }))).toBe(
      "FORBIDDEN",
    );
    expect(page.sizes()).toEqual({ page: 4 });
    const r = await svc.clearAll(
      { actor: keeper, storeId: S },
      "prices looked old",
    );
    expect(r).toEqual({ cleared: 4, cdn: { ok: true, mode: "MOCK" } });
    expect(mockCdnLog.all()[0]!.everything).toBe(true);
    const row = await t.prisma.auditLog.findFirst({
      where: { action: "cache.clear" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toMatchObject({
      actorId: keeper.staffUserId,
      entityType: "Cache",
      storeId: S,
    });
    expect(row!.after).toMatchObject({ reason: "prices looked old" });
    const st = await svc.status({ actor: reader, storeId: S }, "2026-10-24");
    expect(st.lastCleared?.by).toBe(keeper.staffUserId);
    expect(st.cdn).toEqual({ provider: "cloudflare", mode: "MOCK" });
    expect(st.values["cache.pages"]).toEqual(registry["cache.pages"].default);
  });

  it("saving the times needs system.cache, writes only what changed, audits it, and refuses a stale screen", async () => {
    const svc = createCacheService(deps());
    const st = await svc.status({ actor: keeper, storeId: S }, "2026-10-24");
    expect(
      await code(
        svc.save(
          { actor: reader, storeId: S, settings },
          { stockDisplaySeconds: 30 },
        ),
      ),
    ).toBe("FORBIDDEN");
    expect(
      await code(
        svc.save(
          { actor: keeper, storeId: S, settings },
          { stockDisplaySeconds: 20 },
        ),
      ),
    ).toBe("INVALID_INPUT");
    const saved = await svc.save(
      { actor: keeper, storeId: S, settings },
      {
        version: st.version,
        stockDisplaySeconds: 30,
        pages: { ...st.values["cache.pages"], categoryMinutes: 10 },
      },
    );
    expect(saved.changed.sort()).toEqual([
      "cache.pages",
      "cache.stockDisplaySeconds",
    ]);
    expect(overrides.get("cache.stockDisplaySeconds")).toBe(30);
    expect(
      await code(
        svc.save(
          { actor: keeper, storeId: S, settings },
          { version: st.version, stockDisplaySeconds: 10 },
        ),
      ),
    ).toBe("STALE");
    const row = await t.prisma.auditLog.findFirst({
      where: { action: "cache.settings" },
      orderBy: { createdAt: "desc" },
    });
    expect(row!.after).toMatchObject({ "cache.stockDisplaySeconds": 30 });
  });
});
