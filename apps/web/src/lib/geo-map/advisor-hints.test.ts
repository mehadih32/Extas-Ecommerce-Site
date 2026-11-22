import { describe, expect, it } from "vitest";
import type { CourierLensResponse } from "@extas/metrics";
import { courierHints, coverageGaps } from "./advisor-hints";
import { suggestionsFrom } from "./advisor-model";

const lens: CourierLensResponse = {
  lens: "courier",
  level: "district",
  days: { from: "2026-11-01", to: "2026-11-15" },
  thresholds: {
    minParcels: 5,
    lowSuccessPct: 60,
    lateWarnPct: 30,
    gapLimit: 10,
  },
  rows: [
    {
      areaId: "a1",
      figures: { parcels: 12, courierSuccessRate: 0.5 },
      flags: ["betterCourier"],
    },
    { areaId: "a2", figures: { parcels: 9 }, flags: ["late"] },
    { areaId: "a3", figures: { parcels: 7 }, flags: ["betterCourier"] },
  ],
  details: {
    a1: {
      mostUsedCourierId: "c1",
      couriers: [
        {
          courierId: "c1",
          delivered: 4,
          returned: 4,
          successRate: 0.5,
          avgHours: 30,
        },
        {
          courierId: "c2",
          delivered: 4,
          returned: 0,
          successRate: 1,
          avgHours: 24,
        },
      ],
      best: { courierId: "c2", successRate: 1, parcels: 4 },
    },
    a2: { mostUsedCourierId: "c1", couriers: [], best: null },
    a3: { mostUsedCourierId: null, couriers: [], best: null },
  },
  couriers: [
    { id: "c1", name: "Pathao" },
    { id: "c2", name: "Steadfast" },
  ],
  places: { a1: { nameEn: "Bogura", nameBn: "বগুড়া" } },
  gaps: [
    {
      areaId: "g1",
      level: "DISTRICT",
      nameEn: "Bandarban",
      nameBn: null,
      orders: 6,
    },
  ],
  unknownOrders: 0,
};

describe("advisor hints from the courier lens", () => {
  it('takes only the places the lens flagged "better courier" and that have a best courier', () => {
    const h = courierHints(lens);
    expect(h).toHaveLength(1);
    expect(h[0]).toEqual({
      areaId: "a1",
      nameEn: "Bogura",
      nameBn: "বগুড়া",
      bestCourier: "Steadfast",
      bestRate: 1,
      currentRate: 0.5,
      settled: 12,
    });
  });
  it("lists the coverage gaps with their orders", () => {
    expect(coverageGaps(lens)).toEqual([
      { areaId: "g1", nameEn: "Bandarban", nameBn: null, orders: 6 },
    ]);
  });
  it("turns into the advisor's own courier and coverage suggestions", () => {
    const out = suggestionsFrom({
      minOrders: 5,
      guide: { minOrders: 5, goodReturnPct: 10, badReturnPct: 25 },
      districts: null,
      risk: null,
      money: null,
      demand: null,
      courier: courierHints(lens),
      coverage: coverageGaps(lens),
    });
    expect(out.map((s) => s.kind).sort()).toEqual(["courier", "coverage"]);
  });
});
