// PR 854 — Reports › Marketing & ads: delivered sales from ads, day by day, worked out from the orders by the shop's own channel rules.
import { describe, expect, it } from "vitest";
import { adSalesDaily, type AdSalesRow } from "./marketing";

const rules = {
  paidMediums: ["cpc", "paid"],
  platforms: [
    { platform: "META" as const, sources: ["facebook", "fb"] },
    { platform: "GOOGLE" as const, sources: ["google"] },
  ],
};
const row = (
  day: string,
  valueMinor: number,
  over: Partial<AdSalesRow> = {},
): AdSalesRow => ({
  day,
  source: "WEBSITE",
  adPlatform: null,
  campaignPlatform: null,
  utmSource: null,
  utmMedium: null,
  valueMinor,
  ...over,
});

describe("ad sales by day", () => {
  const rows = [
    row("2026-11-02", 1000, { adPlatform: "META" }),
    row("2026-11-02", 500, { campaignPlatform: "GOOGLE" }),
    row("2026-11-01", 300, { utmSource: "facebook", utmMedium: "cpc" }),
    row("2026-11-02", 9999), // organic: not from ads
    row("2026-11-03", 400, { source: "PHONE" }), // another channel
  ];
  it("adds the orders of the ad channels to their day, oldest day first, and leaves organic and other channels out", () => {
    expect(adSalesDaily(rows, rules, "all")).toEqual([
      { day: "2026-11-01", salesMinor: 300 },
      { day: "2026-11-02", salesMinor: 1500 },
    ]);
  });
  it("keeps only the picked ad platform under the filter", () => {
    expect(adSalesDaily(rows, rules, "META")).toEqual([
      { day: "2026-11-01", salesMinor: 300 },
      { day: "2026-11-02", salesMinor: 1000 },
    ]);
    expect(adSalesDaily(rows, rules, "GOOGLE")).toEqual([
      { day: "2026-11-02", salesMinor: 500 },
    ]);
    expect(adSalesDaily(rows, rules, "TIKTOK")).toEqual([]);
  });
});
