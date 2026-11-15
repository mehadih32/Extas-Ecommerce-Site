// PR 854 — the Products report's category filter keeps a style and the groups above it.
import { describe, expect, it } from "vitest";
import { styleRowsFor } from "./products-filter";

const rows = [
  { id: "polo", parentId: null },
  { id: "rl", parentId: "polo" },
  { id: "rl-solid", parentId: "rl" },
  { id: "rl-stripe", parentId: "rl" },
  { id: "cap", parentId: null },
  { id: null, parentId: null },
];

describe("style rows of a category", () => {
  it("keeps the style and every group above it, in order", () => {
    expect(styleRowsFor(rows, new Set(["rl-solid"])).map((r) => r.id)).toEqual([
      "polo",
      "rl",
      "rl-solid",
    ]);
  });
  it('keeps two styles once, and drops the rest and the "no style" row', () => {
    expect(
      styleRowsFor(rows, new Set(["rl-solid", "cap"])).map((r) => r.id),
    ).toEqual(["polo", "rl", "rl-solid", "cap"]);
  });
  it("keeps nothing for a category with no styles, and ignores an unknown style id", () => {
    expect(styleRowsFor(rows, new Set())).toEqual([]);
    expect(styleRowsFor(rows, new Set(["gone"]))).toEqual([]);
  });
});
