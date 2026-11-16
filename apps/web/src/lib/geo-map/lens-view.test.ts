import { describe, expect, it } from "vitest";
import type { LensResult } from "@extas/metrics";
import { columnsShown, lensCell, LENS_COLUMNS } from "./lens-view";

const fmt = {
  number: (n: number) => String(n),
  money: (m: number) => `T${m / 100}`,
};
const row = (figures: Record<string, number | null>) => ({
  areaId: "a",
  nameEn: "A",
  nameBn: null,
  parentAreaId: null,
  parentNameEn: null,
  parentNameBn: null,
  figures,
  flags: [] as string[],
});

describe("lens view", () => {
  it("draws only the columns somebody has a figure for", () => {
    const data = {
      rows: [row({ delivered: 4, returned: 1, returnRate: 0.2, claims: null })],
      total: { delivered: 4, returned: 1, returnRate: 0.2, claims: null },
    } as unknown as Pick<LensResult, "rows" | "total">;
    expect(columnsShown("risk", data).map((c) => c.key)).toEqual([
      "delivered",
      "returned",
      "returnRate",
    ]);
  });
  it("a column that is 0 is still drawn (0 is a figure, null is not)", () => {
    const data = {
      rows: [row({ claims: 0 })],
      total: { claims: 0 },
    } as unknown as Pick<LensResult, "rows" | "total">;
    expect(columnsShown("risk", data).map((c) => c.key)).toEqual(["claims"]);
  });
  it("writes each kind of figure", () => {
    expect(lensCell("count", 12, fmt)).toBe("12");
    expect(lensCell("money", 150000, fmt)).toBe("T1500");
    expect(lensCell("share", 0.1234, fmt)).toBe("12.3%");
    expect(lensCell("percent", 42, fmt)).toBe("42%");
    expect(lensCell("count", null, fmt)).toBe("—");
    expect(lensCell("money", undefined, fmt)).toBe("—");
  });
  it("every lens has columns and no duplicates", () => {
    for (const cols of Object.values(LENS_COLUMNS))
      expect(new Set(cols.map((c) => c.key)).size).toBe(cols.length);
  });
});
