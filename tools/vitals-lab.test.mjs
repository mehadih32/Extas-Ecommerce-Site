// S11 · PR 234 — the monthly lab tool's numbers: what one loaded page said becomes whole milliseconds, layout shift to
// three places and kilobytes; a missing or broken reading is null, never 0 (0 would look like a perfect page).
import { describe, expect, it } from "vitest";
import { LAB_PAGES, PHONE_4G, pageNumbers } from "./vitals-lab.mjs";

describe("vitals-lab", () => {
  it("turns what the page said into the numbers the admin reads", () => {
    expect(pageNumbers({ lcp: 2101.6, cls: 0.04567, nav: { responseStart: 412.2, loadEventEnd: 3333.4 } }, 820_000)).toEqual({ lcpMs: 2102, cls: 0.046, ttfbMs: 412, loadMs: 3333, kb: 801 });
  });

  it("a missing reading is null, not a perfect zero", () => {
    expect(pageNumbers({ lcp: 0, cls: Number.NaN, nav: null }, 0)).toEqual({ lcpMs: null, cls: null, ttfbMs: null, loadMs: null, kb: null });
    expect(pageNumbers({}, -1)).toEqual({ lcpMs: null, cls: null, ttfbMs: null, loadMs: null, kb: null });
  });

  it("measures the home and a category on a phone over slow 4G", () => {
    expect(LAB_PAGES.map((p) => p.kind)).toEqual(["home", "category"]);
    expect(PHONE_4G).toMatchObject({ width: 412, latencyMs: 150, downKbps: 1600, cpu: 4 });
  });
});
