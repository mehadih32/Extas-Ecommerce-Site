// PR 863 — Reports › Profit: the week chart follows the category and area filters (per-day figures from the orders' own lines, blocks of seven days).
import { describe, expect, it } from "vitest";
import type { GeoLine, GeoOrder } from "./areas";
import { dayFigures, weekMargins } from "./profit";

const line = (pid: string, valueMinor: number): GeoLine => ({
  pid,
  name: pid,
  catId: null,
  qty: 1,
  valueMinor,
});
const order = (
  id: string,
  day: string,
  profitMinor: number,
  lines: GeoLine[],
  status = "DELIVERED",
): GeoOrder =>
  ({
    id,
    number: id,
    day,
    status,
    source: "WEBSITE",
    customerId: null,
    customerName: null,
    totalMinor: lines.reduce((n, l) => n + l.valueMinor, 0),
    pieces: lines.length,
    mrpMinor: 0,
    collectedMinor: 0,
    profitMinor,
    place: { district: null, division: null },
    lines,
  }) as unknown as GeoOrder;

describe("dayFigures", () => {
  it("adds delivered sales and profit per day; a cancelled or open order adds nothing", () => {
    const m = dayFigures([
      order("a", "d1", 40, [line("p", 100)]),
      order("b", "d1", 10, [line("q", 100)]),
      order("c", "d2", 5, [line("p", 50)], "CANCELLED"),
      order("d", "d2", 0, [line("p", 50)], "PLACED"),
    ]);
    expect(m.get("d1")).toEqual({ sales: 200, contribution: 50 });
    expect(m.has("d2")).toBe(false);
  });
  it("the line filter keeps only the lines it allows, with the order's profit shared by value", () => {
    const m = dayFigures(
      [order("a", "d1", 40, [line("p", 100), line("q", 300)])],
      (l) => l.pid === "p",
    );
    expect(m.get("d1")).toEqual({ sales: 100, contribution: 10 });
  });
});

describe("weekMargins", () => {
  const days = Array.from(
    { length: 9 },
    (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`,
  );
  it("makes blocks of seven days in date order, margin in percent with one decimal", () => {
    const figs = new Map(
      days.map((d) => [d, { sales: 100, contribution: 25 }]),
    );
    const w = weekMargins([...days].reverse(), figs);
    expect(w).toEqual([
      { first: "2026-11-01", value: 25 },
      { first: "2026-11-08", value: 25 },
    ]);
  });
  it("a block with no sales has no margin", () => {
    expect(
      weekMargins(
        days,
        new Map([["2026-11-01", { sales: 300, contribution: 100 }]]),
      ),
    ).toEqual([
      { first: "2026-11-01", value: 33.3 },
      { first: "2026-11-08", value: null },
    ]);
  });
  it("no days, no points", () => {
    expect(weekMargins([], new Map())).toEqual([]);
  });
});
