// PR 863 — Reports › Products, the rest of the page: the heat colours and what the page shows (maps, colours, looked-at-a-lot, returns,
// All products, the reorder button with its count).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import type { ProductsExtra } from "@/lib/reports-v5/products-extra";
import { ReportProductsMore, heatStyle } from "./ReportProductsMore";

const extra: ProductsExtra = {
  tops: [{ categoryId: "t", nameEn: "Tops", nameBn: "টপস", pieces: [0, 8, 3, 1, 0], total: 12 }],
  bottoms: [],
  colours: [{ name: "Black", pieces: 15 }],
  lookers: [{ productId: "b", name: "Denim", views: 500, sold: 1, conv: 0.2 }],
  returns: [{ productId: "a", name: "Polo", finished: 6, returned: 2, pct: 33.3 }],
  all: [{ productId: "a", name: "Polo", category: { en: "Tops", bn: null }, pieces: 6, salesMinor: 6000, marginPct: 40, returnPct: 33.3, stockDays: 12 }],
};
const f = { num: (n: number) => String(n), amount: (n: number) => `৳${n / 100}`, pctOf: (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`) };
const c = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${JSON.stringify(v)}` : k);
const reorder = { button: "Send {n}", title: "T", body: "B {n}", confirm: "Send", cancel: "Cancel", done: "D {n}", failed: "F" };
const base = { extra, lang: "en", f, c, tableTexts: { more: "more", less: "less", close: "close", empty: "none" }, rows: 20, reorder, restockTable: <p>table</p> };

describe("heatStyle", () => {
  it("is empty for none, grows with the share and turns the text light above 30%", () => {
    expect(heatStyle(0, 10)).toEqual({});
    expect(heatStyle(3, 0)).toEqual({});
    const small = heatStyle(1, 10);
    const big = heatStyle(8, 10);
    expect(small.background).toContain("16%");
    expect(small.color).toBeUndefined();
    expect(big.background).toContain("100%");
    expect(big.color).toBe("var(--lm-on-ac)");
    expect(heatStyle(8, 10).background).toContain("var(--lm-ac)");
  });
});

describe("ReportProductsMore", () => {
  it("shows the maps, colours, looked-at-a-lot, returns, all products and the reorder count", () => {
    const html = renderToStaticMarkup(<ReportProductsMore {...base} restock={[{ productId: "a", name: "Polo", stockDays: 3, sold30: 9, sizesInStock: 1, sizesTotal: 5 }]} />);
    for (const id of ["rp-heat", "rp-colours", "rp-lookers", "rp-restock", "rp-returns", "rp-all", "rp-reorder"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toContain("Send 1");
    expect(html).toContain("reorderBadge");
    expect(html.match(/data-testid="rp-heat-cell"/g)).toHaveLength(5);
  });
  it("without the reports key there is no restock or returns card; the page still shows the rest", () => {
    const html = renderToStaticMarkup(<ReportProductsMore {...base} restock={null} />);
    expect(html).not.toContain('data-testid="rp-restock"');
    expect(html).not.toContain('data-testid="rp-returns"');
    expect(html).toContain('data-testid="rp-all"');
  });
  it("Bengali names are used when the screen is in Bengali", () => {
    expect(renderToStaticMarkup(<ReportProductsMore {...base} lang="bn" restock={null} />)).toContain("টপস");
  });
  it("the button is off with nothing to reorder", () => {
    expect(renderToStaticMarkup(<ReportProductsMore {...base} restock={[]} />)).toMatch(/<button[^>]*disabled[^>]*data-testid="rp-reorder"|data-testid="rp-reorder"[^>]*disabled/);
  });
});
