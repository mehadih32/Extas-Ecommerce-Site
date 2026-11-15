// PR 796 — the Sales report's sums: live and delivered orders, pieces, hour and weekday value, day or week buckets, and the
// discount groups. Pure functions only (the database read is covered by the report's own page tests).
import { describe, expect, it } from "vitest";
import {
  discountGroups,
  hourWeekday,
  isSaleSource,
  saleBuckets,
  saleFacts,
  type SaleOrder,
} from "./sales";

const o = (
  id: string,
  day: string,
  over: Partial<SaleOrder> = {},
): SaleOrder => ({
  id,
  number: id,
  day,
  hour: 10,
  wd: 5,
  status: "PLACED",
  source: "WEBSITE",
  method: "COD",
  discountMinor: 0,
  coupon: null,
  totalMinor: 1000,
  pieces: 2,
  ...over,
});

describe("Sales report sums (PR 796)", () => {
  const rows = [
    o("a", "2026-11-01"),
    o("b", "2026-11-01", {
      status: "DELIVERED",
      totalMinor: 3000,
      pieces: 3,
      discountMinor: 150,
    }),
    o("c", "2026-11-02", { status: "CANCELLED" }),
    o("d", "2026-11-09", {
      status: "RETURNED",
      hour: 21,
      wd: 6,
      coupon: "EID",
      discountMinor: 200,
    }),
  ];

  it("counts live orders, delivered, returned and cancelled apart", () => {
    const k = saleFacts(rows);
    expect(k).toMatchObject({
      all: 4,
      orders: 3,
      orderValue: 5000,
      pieces: 7,
      aov: 1667,
      delivered: 1,
      deliveredValue: 3000,
      cancelled: 1,
      returned: 1,
      discount: 350,
    });
    expect(saleFacts([])).toMatchObject({ orders: 0, aov: 0 });
  });
  it("adds order value by hour and by weekday for live orders only", () => {
    const { hours, wds } = hourWeekday(saleFacts(rows).live);
    expect(hours[10]).toBe(4000);
    expect(hours[21]).toBe(1000);
    expect(wds[5]).toBe(4000);
    expect(wds[6]).toBe(1000);
  });
  it("buckets days, or weeks for a long span or when asked", () => {
    const d = saleBuckets(rows, "2026-11-01", "2026-11-10", "day");
    expect(d.grain).toBe("day");
    expect(d.list).toHaveLength(10);
    expect(d.list[0]!.rows).toHaveLength(2);
    const w = saleBuckets(rows, "2026-11-01", "2026-11-10", "week");
    expect(w.grain).toBe("week");
    expect(w.list.map((b) => [b.from, b.to, b.rows.length])).toEqual([
      ["2026-11-01", "2026-11-07", 3],
      ["2026-11-08", "2026-11-10", 1],
    ]);
    expect(saleBuckets(rows, "2026-08-01", "2026-11-10", "day").grain).toBe(
      "week",
    );
  });
  it("groups discounts by coupon code, else by how many pieces the order had", () => {
    const g = discountGroups(saleFacts(rows).live);
    expect(g.map((x) => [x.key, x.orders, x.off])).toEqual([
      ["EID", 1, 200],
      ["BUY3", 1, 150],
    ]);
  });
  it("knows an order source", () => {
    expect(isSaleSource("PHONE")).toBe(true);
    expect(isSaleSource("x")).toBe(false);
    expect(isSaleSource(undefined)).toBe(false);
  });
});
