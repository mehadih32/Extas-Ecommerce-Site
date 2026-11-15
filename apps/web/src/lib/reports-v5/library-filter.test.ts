// PR 863 — Report library: the channel, category and area filters. The cards that come from orders follow them; the rest stay for the whole shop.
import { describe, expect, it } from "vitest";
import type { GeoLine, GeoOrder } from "./areas";
import {
  LIB_FILTER_OFF,
  filterLibInput,
  libFilterOn,
  libOrders,
  type LibInput,
} from "./library";

const line = (
  pid: string,
  catId: string | null,
  valueMinor: number,
  qty = 1,
): GeoLine => ({ pid, name: pid.toUpperCase(), catId, qty, valueMinor });
const order = (
  id: string,
  source: string,
  district: string,
  status: string,
  profitMinor: number,
  lines: GeoLine[],
): GeoOrder =>
  ({
    id,
    number: id,
    day: "2026-11-10",
    status,
    source,
    customerId: null,
    customerName: null,
    totalMinor: lines.reduce((n, l) => n + l.valueMinor, 0),
    pieces: lines.reduce((n, l) => n + l.qty, 0),
    mrpMinor: 0,
    collectedMinor: 0,
    profitMinor,
    place: { district, division: null },
    lines,
  }) as unknown as GeoOrder;

const span = {
  orders: 99,
  pieces: 99,
  orderValue: 99,
  aov: 99,
  netProfit: 99,
  margin: 9,
};
const base = {
  cur: span,
  prev: span,
  restock: 3,
  repeat: 30,
  returns: { rate: 1, was: 1, n: 1 },
  top: null,
  topArea: null,
  badArea: null,
} as unknown as LibInput;
const whole = {
  sales: 1000,
  contribution: 400,
  net: 300,
  ads: 60,
  returnLoss: 40,
};

const geo = [
  order("a", "WEBSITE", "Dhaka", "DELIVERED", 100, [
    line("p1", "tops", 300, 3),
  ]),
  order("b", "PHONE", "Sylhet", "DELIVERED", 60, [
    line("p2", "pants", 200, 2),
    line("p1", "tops", 100, 1),
  ]),
  order("c", "WEBSITE", "Sylhet", "RETURNED", 0, [line("p1", "tops", 150, 1)]),
  order("d", "WEBSITE", "Dhaka", "CANCELLED", 0, [line("p1", "tops", 500, 5)]),
];

describe("libFilterOn", () => {
  it("is off for all three on 'all'", () => {
    expect(libFilterOn(LIB_FILTER_OFF)).toBe(false);
    expect(libFilterOn({ ...LIB_FILTER_OFF, cat: "tops" })).toBe(true);
  });
});

describe("libOrders", () => {
  it("a channel keeps its orders; a category keeps orders with a line in it and cuts the other lines", () => {
    expect(
      libOrders(geo, { ...LIB_FILTER_OFF, ch: "PHONE" }, null).map((o) => o.id),
    ).toEqual(["b"]);
    const cut = libOrders(
      geo,
      { ...LIB_FILTER_OFF, cat: "pants" },
      new Set(["pants"]),
    );
    expect(cut.map((o) => o.id)).toEqual(["b"]);
    expect(cut[0]!.lines.map((l) => l.pid)).toEqual(["p2"]);
  });
});

describe("filterLibInput", () => {
  it("changes nothing with no filter", () => {
    expect(
      filterLibInput(base, geo, geo, LIB_FILTER_OFF, null, {
        cur: whole,
        prev: whole,
      }),
    ).toBe(base);
  });
  it("sales, orders, top product, areas and returns follow a channel; stock and customers stay", () => {
    const out = filterLibInput(
      base,
      geo,
      [],
      { ...LIB_FILTER_OFF, ch: "WEBSITE" },
      null,
      { cur: whole, prev: whole },
    );
    // WEBSITE live orders: a (300) and c (150); the cancelled d is not counted
    expect(out.cur).toMatchObject({
      orders: 2,
      pieces: 4,
      orderValue: 450,
      aov: 225,
    });
    expect(out.top).toMatchObject({ name: "P1", qty: 4 });
    expect(out.returns).toMatchObject({ n: 1, rate: 50, was: null });
    expect(out.topArea).toMatchObject({ name: "Dhaka" });
    expect(out.restock).toBe(3);
    expect(out.repeat).toBe(30);
  });
  it("a category counts only its lines and shares the costs by sales", () => {
    const out = filterLibInput(
      base,
      geo,
      [],
      { ...LIB_FILTER_OFF, cat: "pants" },
      new Set(["pants"]),
      { cur: whole, prev: whole },
    );
    expect(out.cur).toMatchObject({ orders: 1, pieces: 2, orderValue: 200 });
    expect(out.cur.netProfit).not.toBeNull();
    expect(out.top).toMatchObject({ name: "P2", qty: 2 });
  });
  it("with nothing matched the cards are empty, not the whole shop's", () => {
    const out = filterLibInput(
      base,
      geo,
      [],
      { ...LIB_FILTER_OFF, ch: "TELEGRAM" },
      null,
      { cur: whole, prev: whole },
    );
    expect(out.cur).toMatchObject({ orders: 0, orderValue: 0, aov: 0 });
    expect(out.top).toBeNull();
    expect(out.topArea).toBeNull();
  });
});
