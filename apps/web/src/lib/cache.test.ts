// PR 602 — the web side of the cache: the purge's shop addresses match the routing table, Caddy never keeps what the
// proxy never keeps (both languages), a shop page's headers follow the settings and the visitor's cookies, and the
// Cache screen's words exist in English and Bengali alike.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SHOP_PATHS as PACKAGE_PATHS } from "@extas/cache";
import bn from "../../messages/admin-cache.bn.json";
import en from "../../messages/admin-cache.en.json";
import {
  CATEGORY_PREFIX,
  NEVER_CACHED,
  setProxyPolicy,
  shopCacheHeaders,
} from "./cache-policy";
import { BN_PREFIX } from "./shop/lang";
import { ROUTES } from "./shop/routes";

const CADDYFILE = fileURLToPath(
  new URL("../../../../infra/stack/caddy/Caddyfile", import.meta.url),
);
const G = globalThis as unknown as { __extasCachePolicy?: unknown };

function keys(o: unknown, at = ""): string[] {
  if (o === null || typeof o !== "object") return [at];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, at ? `${at}.${k}` : k),
  );
}

afterEach(() => {
  delete G.__extasCachePolicy;
});

describe("PR 602 · the cache on the web side", () => {
  it("the package's shop addresses are the routing table's", () => {
    expect(PACKAGE_PATHS.categoryPrefix).toBe(CATEGORY_PREFIX);
    expect(CATEGORY_PREFIX).toBe(ROUTES.category("x").replace(/\/x$/, ""));
    expect(PACKAGE_PATHS.langPrefixes).toEqual([BN_PREFIX]);
  });

  it("Caddy never keeps any page the proxy never keeps, in both languages", () => {
    const line = readFileSync(CADDYFILE, "utf8")
      .split("\n")
      .find((l) => l.includes("@never_cached path"));
    expect(line).toBeTruthy();
    const listed = new Set(line!.trim().split(/\s+/).slice(2));
    for (const p of NEVER_CACHED) {
      if (p === "/api") {
        expect(listed.has("/api/*")).toBe(true);
        continue;
      }
      for (const q of p === "/admin" ? [p] : [p, `${BN_PREFIX}${p}`]) {
        expect(listed.has(q), q).toBe(true);
        expect(listed.has(`${q}/*`), `${q}/*`).toBe(true);
      }
    }
  });

  it("before the server has read the settings, Cloudflare keeps no page", () => {
    expect(shopCacheHeaders("/collections/shirts", [])).toEqual({
      "cache-control": null,
      "cdn-cache-control": "no-store",
    });
  });

  it("a shop page follows the settings; a visitor with his own cookie never shares a page", () => {
    setProxyPolicy({
      server: true,
      cdn: true,
      categoryMinutes: 5,
      productMinutes: 10,
      productPrefix: "/products",
    });
    expect(shopCacheHeaders("/collections/shirts", ["extas_preview"])).toEqual({
      "cache-control": null,
      "cdn-cache-control": "public, max-age=300",
    });
    expect(shopCacheHeaders("/bn/products/oxford", [])).toEqual({
      "cache-control": null,
      "cdn-cache-control": "public, max-age=600",
    });
    expect(shopCacheHeaders("/collections/shirts", ["extas_bag"])).toEqual({
      "cache-control": null,
      "cdn-cache-control": "no-store",
    });
    expect(shopCacheHeaders("/checkout", [])).toEqual({
      "cache-control": "private, no-store",
      "cdn-cache-control": "no-store",
    });
    expect(shopCacheHeaders("/bn/account/orders", [])).toEqual({
      "cache-control": "private, no-store",
      "cdn-cache-control": "no-store",
    });
    setProxyPolicy({
      server: true,
      cdn: false,
      categoryMinutes: 5,
      productMinutes: 10,
      productPrefix: "/products",
    });
    expect(shopCacheHeaders("/collections/shirts", [])).toEqual({
      "cache-control": null,
      "cdn-cache-control": "no-store",
    });
  });

  it("the Cache screen's words exist in English and Bengali alike", () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    for (const k of keys(bn))
      expect(
        k
          .split(".")
          .reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], bn),
        k,
      ).not.toBe("");
  });
});
