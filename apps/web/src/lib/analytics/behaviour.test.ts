// S28 · PR 701 — the pure side of the behaviour view: a click is only a grid cell, a scroll one of five marks, a form field only
// its name; the heat, the scroll reach and the field drop-off are worked out from the counts.
import { describe, expect, it } from "vitest";
import {
  cellKey,
  dropOffOf,
  fieldName,
  heatOf,
  reachOf,
  scrollMark,
  shapeBeacon,
} from "./behaviour-pure";

describe("what one beacon may say", () => {
  it("a click becomes a cell of the grid, never what was clicked", () => {
    expect(cellKey(0, 0, 20)).toBe("0,0");
    expect(cellKey(0.51, 0.99, 20)).toBe("10,19");
    expect(cellKey(1, 1, 20)).toBe("19,19");
  });

  it("scroll rounds down to one of five marks", () => {
    expect([0, 24, 25, 60, 99, 100].map(scrollMark)).toEqual([
      0, 0, 25, 50, 75, 100,
    ]);
  });

  it("a field is only a plain name; an address, a phone or a long text is dropped", () => {
    expect(fieldName(" Phone ")).toBe("phone");
    expect(fieldName("01711223344")).toBe("");
    expect(fieldName("a@b.com")).toBe("");
    expect(fieldName("x".repeat(41))).toBe("");
    expect(fieldName(42)).toBe("");
  });

  it("shapes a body into counts, skipping bad events and unknown pages", () => {
    const s = shapeBeacon(
      {
        page: "checkout",
        device: "mobile",
        events: [
          { k: "click", x: 0.1, y: 0.1 },
          { k: "click", x: 0.12, y: 0.11 },
          { k: "click", x: 2, y: 0 },
          { k: "scroll", pct: 60 },
          { k: "field", name: "phone" },
          { k: "field", name: "phone", empty: true },
          { k: "field", name: "01711", empty: true },
          { k: "zzz" },
          null,
        ],
        ip: "203.0.113.9",
      },
      20,
    );
    expect(s).toEqual({
      pageType: "checkout",
      device: "mobile",
      counts: [
        { kind: "CLICK", key: "2,2", count: 2 },
        { kind: "SCROLL", key: "50", count: 1 },
        { kind: "FIELD", key: "phone", count: 1 },
        { kind: "FIELD_EMPTY", key: "phone", count: 1 },
      ],
    });
    expect(
      shapeBeacon({ page: "weird", device: "desktop", events: [] }, 20)
        ?.pageType,
    ).toBe("other");
    expect(
      shapeBeacon({ page: "home", device: "watch", events: [] }, 20),
    ).toBeNull();
    expect(shapeBeacon({ page: "home", device: "mobile" }, 20)).toBeNull();
    expect(shapeBeacon("x", 20)).toBeNull();
  });

  it("only the first 40 events count", () => {
    const events = Array.from({ length: 100 }, () => ({
      k: "click",
      x: 0.5,
      y: 0.5,
    }));
    expect(
      shapeBeacon({ page: "home", device: "mobile", events }, 20)!.counts[0]!
        .count,
    ).toBe(40);
  });
});

describe("the figures", () => {
  it("heat levels are of the hottest cell and cells outside the grid are ignored", () => {
    const h = heatOf(
      [
        { key: "1,1", count: 10 },
        { key: "2,2", count: 5 },
        { key: "1,1", count: 10 },
        { key: "30,1", count: 99 },
        { key: "x", count: 9 },
      ],
      20,
    );
    expect(h).toEqual([
      { col: 1, row: 1, count: 20, level: 100 },
      { col: 2, row: 2, count: 5, level: 25 },
    ]);
  });

  it("scroll reach is the share of those who reached each mark", () => {
    expect(
      reachOf([
        { key: "0", count: 10 },
        { key: "50", count: 5 },
        { key: "100", count: 1 },
      ]).map((r) => r.pct),
    ).toEqual([100, 0, 50, 0, 10]);
    expect(reachOf([]).every((r) => r.pct === 0)).toBe(true);
  });

  it("field drop-off ranks the worst field first", () => {
    const d = dropOffOf(
      [
        { key: "name", count: 10 },
        { key: "phone", count: 10 },
      ],
      [
        { key: "phone", count: 6 },
        { key: "name", count: 1 },
      ],
    );
    expect(d.map((x) => [x.name, x.pct])).toEqual([
      ["phone", 60],
      ["name", 10],
    ]);
  });
});
