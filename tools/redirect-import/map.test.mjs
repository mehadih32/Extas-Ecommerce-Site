import { describe, expect, it } from "vitest";
import { isOwnAddress as appOwn } from "../../apps/web/src/lib/seo/suggest";
import { redirectKey as appKey } from "../../apps/web/src/lib/seo/redirect-table";
import { isOwnAddress, isSitemapFile, mapAddresses, oldAddresses, redirectKey, reportMarkdown, sitemapLocs, tally } from "./map.mjs";

// Sample data only (an invented old shop), never the owner's.
const HOST = "old-shop.test";
const INDEX = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://old-shop.test/wp-sitemap-posts-product-1.xml</loc></sitemap><sitemap><loc>https://old-shop.test/wp-sitemap-posts-page-1.xml</loc></sitemap><sitemap><loc>https://other.test/wp-sitemap-x.xml</loc></sitemap></sitemapindex>`;
const PRODUCTS = `<urlset><url><loc>https://old-shop.test/product/linen-shirt-white/</loc></url><url><loc>https://old-shop.test/product/polo-shirts-red-color/</loc></url><url><loc>https://www.old-shop.test/product/linen-shirt-white</loc></url><url><loc>https://other.test/product/x/</loc></url></urlset>`;
const PAGES = `<urlset><url><loc>https://old-shop.test/</loc></url><url><loc>https://old-shop.test/shop/</loc></url><url><loc>https://old-shop.test/cart/</loc></url><url><loc>https://old-shop.test/checkout/</loc></url><url><loc>https://old-shop.test/my-account/</loc></url><url><loc>https://old-shop.test/step/store-checkout/</loc></url><url><loc>https://old-shop.test/step/thank-you-2/</loc></url><url><loc>https://old-shop.test/elementor-12/</loc></url><url><loc>https://old-shop.test/product-category/shirts/linen/</loc></url><url><loc>https://old-shop.test/product-category/shirts/silk/</loc></url><url><loc>https://old-shop.test/product-category/uncategorized/</loc></url><url><loc>https://old-shop.test/product-tag/polo/</loc></url><url><loc>https://old-shop.test/product-tag/polo-shirt-sale/</loc></url><url><loc>https://old-shop.test/author/admin/</loc></url></urlset>`;
const CATALOG = { prefix: "/p", products: ["linen-shirt-white", "plain-polo"], categories: [{ slug: "shirts" }, { slug: "linen" }, { slug: "polo-shirts" }], minPercent: 50 };

describe("redirect import from the old public sitemap (PR 653)", () => {
  it("reads the locs and fetches only the old host's sitemap files", () => {
    expect(sitemapLocs(INDEX)).toHaveLength(3);
    expect(isSitemapFile("https://old-shop.test/wp-sitemap-posts-product-1.xml", HOST)).toBe(true);
    expect(isSitemapFile("https://www.old-shop.test/sitemap.xml", HOST)).toBe(true);
    expect(isSitemapFile("https://other.test/wp-sitemap-x.xml", HOST)).toBe(false);
    expect(isSitemapFile("http://old-shop.test/sitemap.xml", HOST)).toBe(false);
    expect(isSitemapFile("https://old-shop.test/wp-admin/sitemap.xml", HOST)).toBe(false);
    expect(isSitemapFile("https://old-shop.test/sitemap.xml?x=1", HOST)).toBe(false);
    expect(isSitemapFile("https://old-shop.test/wp-login.php", HOST)).toBe(false);
  });

  it("keeps each page address of the old host once, without the sitemap files", () => {
    const a = oldAddresses([INDEX, PRODUCTS, PAGES], HOST).map((x) => x.path);
    expect(a).toContain("/product/linen-shirt-white");
    expect(a.filter((p) => p === "/product/linen-shirt-white")).toHaveLength(1);
    expect(a.some((p) => p.endsWith(".xml"))).toBe(false);
    expect(a).not.toContain("/product/x");
    expect(a).toHaveLength(16);
  });

  it("matches products, categories, tags and the shop's pages; never a 404 plan", () => {
    const rows = mapAddresses(oldAddresses([PRODUCTS, PAGES], HOST), CATALOG);
    const by = Object.fromEntries(rows.map((r) => [r.from, r]));
    expect(by["/product/linen-shirt-white"]).toMatchObject({ to: "/p/linen-shirt-white", how: "product", twin: true });
    expect(by["/product/polo-shirts-red-color"]).toMatchObject({ to: "/collections/polo-shirts", how: "nearest category", twin: false });
    expect(by["/product-category/shirts/linen"]).toMatchObject({ to: "/collections/linen", how: "category", twin: true });
    expect(by["/product-category/shirts/silk"]).toMatchObject({ to: "/collections/shirts", how: "parent category", twin: true });
    expect(by["/product-category/uncategorized"]).toMatchObject({ to: "/", how: "home page", twin: false });
    expect(by["/product-tag/polo"]).toMatchObject({ to: "/collections/polo-shirts", twin: false });
    expect(by["/shop"]).toMatchObject({ to: "/", twin: true });
    expect(by["/cart"]).toMatchObject({ to: "/bag", twin: true });
    expect(by["/my-account"]).toMatchObject({ to: "/account/login", twin: true });
    expect(by["/step/store-checkout"]).toMatchObject({ to: "/bag", twin: true });
    expect(by["/step/thank-you-2"]).toMatchObject({ to: "/", twin: true });
    expect(by["/elementor-12"]).toMatchObject({ to: "/", twin: false });
    expect(by["/author/admin"]).toMatchObject({ to: "/", twin: false });
    // already pages of the new shop: no row
    expect(by["/"]).toMatchObject({ to: null, how: "same" });
    expect(by["/checkout"]).toMatchObject({ to: null, how: "same" });
    // every address has a page: a row, or the address itself is one
    expect(rows.every((r) => r.to || r.how === "same")).toBe(true);
    const t = tally(rows);
    expect(t).toMatchObject({ addresses: 16, same: 2, own: 0 });
    expect(t.twins + t.listed).toBe(t.rows);
    expect(t.rows + t.same).toBe(16);
  });

  it("finds the nearest category of an old product by any shared word, plurals and t-shirt spellings alike", () => {
    const cat = { prefix: "/p", products: [], categories: [{ slug: "t-shirts" }, { slug: "trousers" }, { slug: "everyday", words: ["Polo Shirts"] }], combosHub: true, minPercent: 50 };
    const rows = mapAddresses([{ path: "/product/boss-tshirt" }, { path: "/product-category/trouser/mash-trouser" }, { path: "/product/brand-polo-black" }, { path: "/product/2-pcs-combo-navy-black" }, { path: "/about-us-old" }], cat);
    expect(rows.map((r) => r.to)).toEqual(["/collections/t-shirts", "/collections/trousers", "/collections/everyday", "/combos", "/"]);
    expect(rows.every((r) => r.twin === false)).toBe(true);
  });

  it("needs no row when the old address is a live page of the new shop", () => {
    const rows = mapAddresses([{ path: "/product/plain-polo" }, { path: "/collections/linen" }, { path: "/bn/x" }], { ...CATALOG, prefix: "/product" });
    expect(rows.map((r) => r.how)).toEqual(["same", "same", "own page"]);
  });

  it("keeps the redirect manager's own rules (same key, same own pages as the web app)", () => {
    for (const p of ["/Product/X/", "https://a.test/p/x?y=1#z", "//evil.test/x", "/%D0%B0", "", "/bag/", "/bn", "/journal/a", "/pay/t", "/bulk-order", "/combos", "/search", "/account/x", "/shop", "/p/x"]) {
      expect(redirectKey(p)).toBe(appKey(p));
      expect(isOwnAddress(p)).toBe(appOwn(p));
    }
  });

  it("writes a report with the Bengali summary and every address", () => {
    const rows = mapAddresses(oldAddresses([PRODUCTS, PAGES], HOST), CATALOG);
    const md = reportMarkdown({ at: "2026-11-06", sha: "abc", oldSite: HOST, committed: false, rows, tally: tally(rows), problems: [] });
    expect(md).toContain("সারকথা");
    expect(md).toContain("`/product-category/uncategorized` → `/`");
    expect(md).toContain("dry run");
  });
});
