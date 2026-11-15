// PR 797 — the Delivery & returns report's sums from the parcel rows: success, average days, by courier, zone, district and the grid.
import { describe, expect, it } from "vitest";
import { deliveryFromRows, returnCharges, type ParcelRow } from "./delivery";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const p = (id: string, over: Partial<ParcelRow> = {}): ParcelRow => ({
  id,
  number: id,
  courierId: "c1",
  courier: "Pathao",
  zoneKey: "dhaka",
  zoneEn: "Dhaka",
  zoneBn: null,
  promiseDays: 2,
  district: "Dhaka",
  status: "DELIVERED",
  placedAt: day(1),
  deliveredAt: day(3),
  totalMinor: 1000,
  ...over,
});

describe("Delivery report sums (PR 797)", () => {
  const rows = [
    p("a"),
    p("b"),
    p("c", { status: "RETURNED", deliveredAt: null }),
    p("d", {
      courierId: "c2",
      courier: "Steadfast",
      zoneKey: "out",
      zoneEn: "Outside",
      status: "DELIVERED",
      deliveredAt: day(6),
    }),
    p("e", { status: "IN_TRANSIT", deliveredAt: null }),
  ];
  const f = deliveryFromRows(rows);

  it("counts finished, delivered, returned and on the way apart", () => {
    expect(f).toMatchObject({
      sent: 5,
      finished: 4,
      delivered: 3,
      returned: 1,
      onTheWay: 1,
    });
    expect(f.success).toBeCloseTo(75);
    expect(f.avgDays).toBeCloseTo((2 + 2 + 5) / 3);
  });
  it("ranks couriers by success and averages days per zone", () => {
    expect(f.byCourier.map((x) => [x.name, Math.round(x.success)])).toEqual([
      ["Steadfast", 100],
      ["Pathao", 67],
    ]);
    expect(f.byZone.find((z) => z.key === "dhaka")).toMatchObject({
      n: 2,
      days: 2,
      promise: 2,
    });
  });
  it("builds the courier-and-zone grid and keeps small districts out of the list", () => {
    expect(f.grid).toHaveLength(2);
    expect(f.grid.find((g) => g.courierId === "c1")).toMatchObject({
      n: 3,
      d: 2,
      rt: 1,
    });
    // PR 854: each cell keeps its parcels for the row's drawer
    expect(
      f.grid
        .find((g) => g.courierId === "c1")!
        .orders.map((o) => o.number)
        .sort(),
    ).toEqual(["a", "b", "c"]);
    expect(
      f.grid
        .find((g) => g.courierId === "c1")!
        .orders.find((o) => o.number === "c"),
    ).toMatchObject({
      status: "RETURNED",
      totalMinor: 1000,
      district: "Dhaka",
    });
    expect(f.byDistrict).toEqual([
      { name: "Dhaka", finished: 4, returned: 1, rate: 25 },
    ]);
    expect(deliveryFromRows(rows.slice(0, 2)).byDistrict).toEqual([]);
  });
  it("says nothing when no parcel has finished", () => {
    expect(
      deliveryFromRows([p("x", { status: "IN_TRANSIT", deliveredAt: null })]),
    ).toMatchObject({ finished: 0, success: null, avgDays: null });
  });
});

describe("Return cost in the courier and zone grid (PR 863)", () => {
  const card = (over: Record<string, unknown> = {}) => ({
    courierId: "c1",
    zoneKey: "dhaka",
    returnChargeMinor: 6000,
    validFrom: day(1),
    validTo: null as Date | null,
    ...over,
  });
  const rows = [
    p("a"),
    p("r1", { status: "RETURNED", deliveredAt: null }),
    p("r2", { status: "RETURNED", deliveredAt: null }),
    p("r3", { courierId: "c2", courier: "Steadfast", status: "RETURNED", deliveredAt: null }),
  ];
  it("takes each returned parcel's charge from its courier and zone card of the day", () => {
    const m = returnCharges(rows, [card()]);
    expect([...m.entries()]).toEqual([
      ["r1", 6000],
      ["r2", 6000],
    ]);
  });
  it("uses the newest card in force and ignores a card that had ended or not yet begun", () => {
    const late = [p("r1", { status: "RETURNED", deliveredAt: null, placedAt: day(5) })];
    const m = returnCharges(late, [
      card({ returnChargeMinor: 5000 }),
      card({ returnChargeMinor: 7000, validFrom: day(3) }),
      card({ returnChargeMinor: 9000, validFrom: day(20) }),
      card({ returnChargeMinor: 4000, validFrom: day(1), validTo: new Date(Date.UTC(2026, 9, 1)) }),
    ]);
    expect(m.get("r1")).toBe(7000);
  });
  it("a parcel with no charge entered adds nothing, and the grid sums per cell", () => {
    const f = deliveryFromRows(rows, returnCharges(rows, [card()]));
    const cell = f.grid.find((g) => g.courierId === "c1")!;
    expect(cell.returnMinor).toBe(12000);
    expect(f.grid.find((g) => g.courierId === "c2")!.returnMinor).toBe(0);
    expect(deliveryFromRows(rows).grid.every((g) => g.returnMinor === 0)).toBe(true);
  });
});
