// PR 799 — profit by product and by division from the orders: an order's profit is shared over its lines by value.
import { describe, expect, it } from "vitest";
import type { GeoOrder } from "./areas";
import {
  divOfOrder,
  filteredFigures,
  filterOrders,
  losingProducts,
  marginTone,
  profitGroups,
  salesShare,
} from "./profit";

const o = (id: string, over: Partial<GeoOrder> = {}): GeoOrder => ({
  id,
  number: id,
  day: "2026-11-10",
  status: "DELIVERED",
  source: "WEBSITE",
  customerId: "c1",
  customerName: "A",
  totalMinor: 1000,
  pieces: 3,
  mrpMinor: 1000,
  collectedMinor: 1000,
  profitMinor: 300,
  place: {
    division: "Dhaka",
    district: "Dhaka",
    thana: "Mirpur",
    area: "Mirpur 10",
  },
  lines: [
    { pid: "p1", name: "Polo", catId: "k1", qty: 2, valueMinor: 600 },
    { pid: "p2", name: "Cap", catId: "k2", qty: 1, valueMinor: 400 },
  ],
  ...over,
});

describe("profit groups", () => {
  it("shares an order profit over its lines by value and sums sales and pieces", () => {
    const g = profitGroups([o("a"), o("b")], (l) => l.pid);
    const polo = g.find((x) => x.key === "p1")!;
    expect(polo).toMatchObject({ sales: 1200, profit: 360, pieces: 4 });
    expect(polo.margin).toBeCloseTo(30, 5);
    expect(g.find((x) => x.key === "p2")).toMatchObject({
      sales: 800,
      profit: 240,
    });
  });
  it("leaves out orders that are not delivered and lines the filter drops", () => {
    const g = profitGroups(
      [o("a"), o("b", { status: "RETURNED" }), o("c", { status: "CANCELLED" })],
      (l) => l.pid,
      (l) => l.catId === "k1",
    );
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ key: "p1", sales: 600 });
  });
  it("groups by division, a place outside the 64 districts counting as Dhaka", () => {
    expect(
      divOfOrder(
        o("x", {
          place: {
            division: null,
            district: "Sylhet",
            thana: null,
            area: null,
          },
        }),
      ),
    ).toBe("Sylhet");
    expect(
      divOfOrder(
        o("y", {
          place: { division: null, district: null, thana: null, area: null },
        }),
      ),
    ).toBe("Dhaka");
  });
  it("counts losing products only from two pieces up", () => {
    const g = profitGroups([o("a", { profitMinor: -500 })], (l) => l.pid);
    expect(losingProducts(g)).toBe(1);
    expect(
      losingProducts([
        { key: "z", sales: 100, profit: -5, pieces: 1, orders: [], margin: -5 },
      ]),
    ).toBe(0);
  });
});

describe("filters", () => {
  const list = [
    o("a"),
    o("b", {
      place: {
        division: "Sylhet",
        district: "Sylhet",
        thana: null,
        area: null,
      },
    }),
  ];
  it("keeps whole orders of one division", () => {
    expect(
      filterOrders(list, { cat: "all", div: "Sylhet" }, null).map((x) => x.id),
    ).toEqual(["b"]);
  });
  it("keeps orders with a line in the category and its children", () => {
    expect(
      filterOrders(list, { cat: "k2", div: "all" }, new Set(["k2"])).length,
    ).toBe(2);
    expect(
      filterOrders(list, { cat: "k9", div: "all" }, new Set(["k9"])).length,
    ).toBe(0);
  });
  it("colours the margin like the prototype", () => {
    expect(marginTone(40, true)).toBe("good");
    expect(marginTone(25, true)).toBe("plain");
    expect(marginTone(10, true)).toBe("bad");
    expect(marginTone(0, false)).toBe("none");
  });
});

describe("PR 854: the top tiles follow the filter", () => {
  const all = [
    o("a"),
    o("b", {
      place: {
        division: "Sylhet",
        district: "Sylhet",
        thana: null,
        area: null,
      },
      profitMinor: 100,
    }),
    o("c", { status: "CANCELLED" }),
  ];
  const whole = {
    sales: 2000,
    contribution: 400,
    net: 300,
    ads: 60,
    returnLoss: 40,
  };
  it("shares the costs outside the orders by the filtered orders' share of delivered value", () => {
    const sylhet = filterOrders(all, { cat: "all", div: "Sylhet" }, null);
    expect(salesShare(sylhet, all)).toBe(0.5);
    const f = filteredFigures(sylhet, all, whole);
    // before ads 100; the 100 of shared costs (400 - 300) times half is taken off
    expect(f).toMatchObject({
      before: 100,
      net: 50,
      ads: 30,
      returns: 20,
      orders: 1,
      perOrder: 100,
    });
    expect(f.margin).toBeCloseTo(50 / 1000, 6);
  });
  it("keeps the whole shop when nothing is filtered, and no net while the ad spend is unknown", () => {
    expect(salesShare(all, all)).toBe(1);
    expect(filteredFigures(all, all, whole)).toMatchObject({
      before: 400,
      net: 300,
    });
    expect(
      filteredFigures(all, all, { ...whole, net: null, ads: null }),
    ).toMatchObject({ net: null, margin: null, ads: null });
  });
  it("has nothing to share when nothing was delivered", () => {
    expect(filteredFigures([], [], whole)).toMatchObject({
      before: 0,
      net: 0,
      perOrder: null,
      orders: 0,
    });
  });
});
