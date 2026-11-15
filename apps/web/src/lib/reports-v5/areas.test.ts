// PR 798 — the Areas drill-down's sums and the place names (tree first, typed address second).
import { describe, expect, it } from "vitest";
import {
  areaStats,
  inPath,
  tileHeat,
  topProducts,
  whereItSells,
  type GeoOrder,
} from "./areas";
import { divisionOf, placeFromAddress, placeFromTree } from "./geo";

const o = (id: string, over: Partial<GeoOrder> = {}): GeoOrder => ({
  id,
  number: id,
  day: "2026-11-10",
  status: "DELIVERED",
  source: "WEBSITE",
  customerId: "c1",
  customerName: "A",
  totalMinor: 1000,
  pieces: 2,
  mrpMinor: 1100,
  collectedMinor: 1000,
  profitMinor: 300,
  place: {
    division: "Dhaka",
    district: "Dhaka",
    thana: "Mirpur",
    area: "Mirpur 10",
  },
  lines: [{ pid: "p1", name: "Polo", catId: "k1", qty: 2, valueMinor: 1000 }],
  ...over,
});

describe("place names", () => {
  it("takes the last two parts of a typed address and the division from the district", () => {
    expect(placeFromAddress("House 5, Road 3, Mirpur 10, Dhaka")).toEqual({
      division: "Dhaka",
      district: "Dhaka",
      thana: "Mirpur 10",
      area: "Mirpur 10",
    });
    expect(placeFromAddress("Somewhere, Sylhet").division).toBe("Sylhet");
    expect(placeFromAddress("no place here").district).toBeNull();
    expect(divisionOf("Cox's Bazar")).toBe("Chattogram");
  });
  it("reads a place from the tree by level, a thana level being an upazila or a thana", () => {
    const n = (
      level: "DIVISION" | "DISTRICT" | "UPAZILA" | "AREA",
      nameEn: string,
    ) => ({ id: nameEn, level, nameEn, nameBn: null });
    expect(
      placeFromTree(n("AREA", "Gabtali"), [
        n("DIVISION", "Rajshahi"),
        n("DISTRICT", "Bogura"),
        n("UPAZILA", "Gabtali Upazila"),
      ]),
    ).toEqual({
      division: "Rajshahi",
      district: "Bogura",
      thana: "Gabtali Upazila",
      area: "Gabtali",
    });
  });
});

describe("area sums", () => {
  const orders = [
    o("a"),
    o("b"),
    o("c", { status: "RETURNED", profitMinor: 0 }),
    o("d", { status: "CANCELLED", profitMinor: 0 }),
    o("e", {
      place: {
        division: "Sylhet",
        district: "Sylhet",
        thana: "Kotwali",
        area: "Zindabazar",
      },
      status: "RETURNED",
    }),
  ];
  it("counts live, delivered and returned apart and works the return rate on finished parcels", () => {
    const [dhaka] = areaStats(
      orders.filter((x) => inPath(x, ["Dhaka"])),
      (x) => x.place.district ?? "—",
    );
    expect(dhaka).toMatchObject({
      n: 3,
      d: 2,
      rt: 1,
      pr: 600,
      col: 2000,
      v: 3000,
      aov: 1000,
    });
    expect(dhaka!.rr).toBeCloseTo(33.33, 1);
  });
  it("keeps an order in a path only when every level matches", () => {
    expect(inPath(orders[4]!, ["Dhaka"])).toBe(false);
    expect(inPath(orders[4]!, ["Sylhet", "Sylhet", "Kotwali"])).toBe(true);
  });
  it("lists top products by pieces and the places that sell a product or a category", () => {
    expect(topProducts(orders, 3)).toEqual([
      { pid: "p1", name: "Polo", qty: 8, value: 4000 },
    ]);
    expect(whereItSells(orders, "p:p1", "district", 5, () => [])).toEqual([
      { name: "Dhaka", qty: 6 },
      { name: "Sylhet", qty: 2 },
    ]);
    expect(
      whereItSells(orders, "cat:k1", "division", 5, (id) => [id])[0],
    ).toEqual({ name: "Dhaka", qty: 6 });
  });
  it("heats a tile from 8 to 88", () => {
    expect([tileHeat(0, 10), tileHeat(10, 10), tileHeat(5, 10)]).toEqual([
      8, 88, 48,
    ]);
  });
});
