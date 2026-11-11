// S15 · PR 314 (Blueprint C2.3's "what if" slider) — `cost-book-whatif.ts`'s own pure math: a missing section
// defaults to 1× (no change), a multiplier scales that section's own jobs only, and the store-currency total stays
// honestly null unless every job in the book has one (the same "no invented taka" rule the rest of the Cost Book
// follows).
import { describe, expect, it } from "vitest";
import {
  fullMultiplier,
  whatIfTotal,
  WHAT_IF_DEFAULT,
  WHAT_IF_MAX,
  WHAT_IF_MIN,
  type WhatIfJob,
} from "./cost-book-whatif";

const JOBS: WhatIfJob[] = [
  { section: "support", perMonthUsdMinor: 100, perMonthStoreMinor: 10_000 },
  { section: "support", perMonthUsdMinor: 50, perMonthStoreMinor: 5_000 },
  { section: "orders", perMonthUsdMinor: 200, perMonthStoreMinor: 20_000 },
];

describe("fullMultiplier", () => {
  it("defaults every section to 1× when nothing was moved", () => {
    const m = fullMultiplier({});
    expect(m.support).toBe(WHAT_IF_DEFAULT);
    expect(m.studio).toBe(WHAT_IF_DEFAULT);
  });

  it("keeps the one section actually set, defaulting the rest", () => {
    const m = fullMultiplier({ support: 2 });
    expect(m.support).toBe(2);
    expect(m.orders).toBe(WHAT_IF_DEFAULT);
  });
});

describe("whatIfTotal", () => {
  it("with no multiplier at all, equals the plain sum of every job's own monthly estimate", () => {
    const t = whatIfTotal(JOBS, {});
    expect(t.usdMinor).toBe(350);
    expect(t.storeMinor).toBe(35_000);
  });

  it("scales only the section it names, leaving the others at 1×", () => {
    const t = whatIfTotal(JOBS, { support: 3 });
    // support: (100+50)*3 = 450; orders: 200*1 = 200
    expect(t.usdMinor).toBe(650);
    expect(t.storeMinor).toBe(65_000);
  });

  it("scales every named section at once", () => {
    const t = whatIfTotal(JOBS, { support: 2, orders: 0.5 });
    expect(t.usdMinor).toBe(300 + 100); // (100+50)*2 + 200*0.5
  });

  it("the store-currency total is honestly null once a single job has none, even if the rest do", () => {
    const mixed: WhatIfJob[] = [...JOBS, { section: "studio", perMonthUsdMinor: 10, perMonthStoreMinor: null }];
    const t = whatIfTotal(mixed, {});
    expect(t.storeMinor).toBeNull();
    expect(t.usdMinor).toBe(360); // the USD total still adds up regardless
  });

  it("an empty job list totals to zero, never null (nothing to be honestly uncertain about)", () => {
    expect(whatIfTotal([], {})).toEqual({ usdMinor: 0, storeMinor: 0 });
  });

  it("the slider's own range covers a quarter to four times (the Blueprint's own examples fit inside it)", () => {
    expect(WHAT_IF_MIN).toBe(0.25);
    expect(WHAT_IF_MAX).toBe(4);
  });
});
