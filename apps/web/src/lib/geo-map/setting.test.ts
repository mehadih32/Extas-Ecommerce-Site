// S29 · PR 758–761 — the lenses' reading of the Geography map setting: only the numbers (no on/off switch, owner's decision
// 16 Nov 2026); a missing or unusable number is the shipped number, and the retired keys of an older stored value are never read.
import { describe, expect, it } from "vitest";
import { GEO_MAP_DEFAULT } from "@extas/settings";
import { lensSettingOf, readLensSetting } from "./setting";

const STORED = { minOrders: 10, warnReturnPct: 25, topProducts: 5 };

describe("lensSettingOf", () => {
  it("reads the numbers", () => {
    expect(lensSettingOf(STORED)).toEqual(STORED);
  });
  it("an older stored value with the retired keys reads the same, whatever they say", () => {
    expect(
      lensSettingOf({
        ...STORED,
        on: false,
        lenses: { risk: false },
        slices: {},
        ai: false,
      }),
    ).toEqual(STORED);
  });
  it("anything missing or in the wrong shape is the shipped numbers, never an error", () => {
    const d = {
      minOrders: GEO_MAP_DEFAULT.minOrders,
      warnReturnPct: GEO_MAP_DEFAULT.warnReturnPct,
      topProducts: GEO_MAP_DEFAULT.topProducts,
    };
    expect(lensSettingOf(undefined)).toEqual(d);
    expect(lensSettingOf("on")).toEqual(d);
    expect(lensSettingOf({ ...STORED, minOrders: "10" }).minOrders).toBe(
      d.minOrders,
    );
    expect(
      lensSettingOf({ ...STORED, warnReturnPct: Number.NaN }).warnReturnPct,
    ).toBe(d.warnReturnPct);
  });
});

describe('readLensSetting', () => {
  it('reads the stored value for the store', async () => {
    const seen: unknown[] = [];
    const resolver = {
      value: async (key: string, at: unknown) => (seen.push([key, at]), STORED),
    };
    expect((await readLensSetting(resolver as never, 7)).minOrders).toBe(10);
    expect(seen).toEqual([["reports.geoMap", { storeId: 7 }]]);
  });
  it("a failing read is the shipped numbers", async () => {
    const got = await readLensSetting(
      {
        value: async () => {
          throw new Error("unknown setting");
        },
      } as never,
      1,
    );
    expect(got.minOrders).toBe(GEO_MAP_DEFAULT.minOrders);
  });
});
