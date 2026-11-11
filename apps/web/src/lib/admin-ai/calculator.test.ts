// S15 · PR 316 (Blueprint C2.5's free-form cost calculator) — `calculateLine`/`calculatePlan`'s own pure math: a
// line's cost is computed exactly the way the Cost Book's own estimate is (same `estimateMicrosFor`), a composite
// (multi-line) plan totals every line without guessing a single-job recommendation, a "scale" bigger/smaller than
// usual run is applied honestly, and the store-currency total stays null the moment a single line's does (the
// "no invented taka" rule the rest of the Cost Book already follows).
import { describe, expect, it } from "vitest";
import { isAiError } from "./errors";
import {
  calculateLine,
  calculatePlan,
  type CalculatorLineInput,
} from "./calculator";

const stubPricer = (minor: number) => ({ storeMinor: minor * 100, exchangeRateId: "rate-1" });
const noRatePricer = () => null;
const DAY = "2026-11-11";

describe("calculateLine", () => {
  it("prices a text job exactly the way estimateMicrosFor would, on its own recommended model by default", () => {
    const r = calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 10 }, stubPricer, DAY);
    expect(r.modelKey).toBe("claude-sonnet");
    expect(r.isRecommended).toBe(true);
    // 600 in + 1,800 out tokens on claude-sonnet: (600/1e6)*3,000,000 + (1,800/1e6)*15,000,000 = 1,800 + 27,000 = 28,800 micros/run
    expect(r.perRunUsdMinor).toBe(3); // round(28,800/10,000)
    expect(r.totalUsdMicros).toBe(288_000n); // 28,800 * 10
    expect(r.totalUsdMinor).toBe(29); // round(288,000/10,000)
    expect(r.totalStoreMinor).toBe(29 * 100); // stubPricer: minor * 100
  });

  it("prices an image job the same way, and scales with quantity", () => {
    const r = calculateLine({ jobTypeKey: "studioGhostMannequin", quantity: 5 }, stubPricer, DAY);
    expect(r.modelKey).toBe("fashn-core");
    expect(r.perRunUsdMinor).toBe(8); // 80,000 micros/run -> round(80,000/10,000)
    expect(r.totalUsdMinor).toBe(40); // 5 runs
  });

  it("gives up to 3 same-kind alternatives, cheapest first, never the chosen model itself", () => {
    const r = calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1 }, stubPricer, DAY);
    expect(r.alternatives).toHaveLength(3);
    expect(r.alternatives.some((a) => a.modelKey === "claude-sonnet")).toBe(false);
    const amounts = r.alternatives.map((a) => a.totalUsdMinor);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it("scale bigger or smaller than the job's own usual run changes the cost proportionally", () => {
    const normal = calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1 }, stubPricer, DAY);
    const doubled = calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1, scale: 2 }, stubPricer, DAY);
    expect(doubled.totalUsdMicros).toBe(normal.totalUsdMicros * 2n);
  });

  it("an explicit model overrides the recommendation, as long as it is the same kind", () => {
    const r = calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1, modelKey: "claude-haiku" }, stubPricer, DAY);
    expect(r.modelKey).toBe("claude-haiku");
    expect(r.isRecommended).toBe(false);
  });

  it("is honestly null in the store's own currency while no USD rate is typed yet, but the USD figure still stands", () => {
    const r = calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 10 }, noRatePricer, DAY);
    expect(r.totalStoreMinor).toBeNull();
    expect(r.totalUsdMinor).toBe(29);
  });

  it("throws for a caller bug: an unknown job, a non-positive quantity or scale, an unknown model, or a model of the wrong kind", () => {
    expect(() => calculateLine({ jobTypeKey: "not-a-job", quantity: 1 }, stubPricer, DAY)).toThrowError();
    try {
      calculateLine({ jobTypeKey: "not-a-job", quantity: 1 }, stubPricer, DAY);
    } catch (e) {
      expect(isAiError(e) && e.code).toBe("UNKNOWN_JOB");
    }
    expect(() => calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 0 }, stubPricer, DAY)).toThrowError(/INVALID_QUANTITY/);
    expect(() => calculateLine({ jobTypeKey: "seoBlogArticle", quantity: -1 }, stubPricer, DAY)).toThrowError(/INVALID_QUANTITY/);
    expect(() => calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1, scale: 0 }, stubPricer, DAY)).toThrowError(/INVALID_SCALE/);
    expect(() => calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1, modelKey: "not-a-model" }, stubPricer, DAY)).toThrowError(/UNKNOWN_MODEL/);
    expect(() => calculateLine({ jobTypeKey: "seoBlogArticle", quantity: 1, modelKey: "fashn-core" }, stubPricer, DAY)).toThrowError(/WRONG_KIND/);
  });
});

describe("calculatePlan", () => {
  it("refuses an empty plan rather than answering a meaningless zero", () => {
    expect(() => calculatePlan([], stubPricer, DAY)).toThrowError(/EMPTY_PLAN/);
  });

  it("totals a single-line plan exactly as calculateLine would, with a recommendation note when a pricier model was chosen", () => {
    const lines: CalculatorLineInput[] = [{ jobTypeKey: "seoBlogArticle", quantity: 10, modelKey: "claude-opus" }];
    const p = calculatePlan(lines, stubPricer, DAY);
    expect(p.lines).toHaveLength(1);
    expect(p.totalUsdMinor).toBe(p.lines[0]!.totalUsdMinor);
    expect(p.recommendationNote).not.toBeNull();
    expect(p.recommendationNote).toContain("Claude Sonnet");
  });

  it("gives no recommendation note when already on the recommended model", () => {
    const p = calculatePlan([{ jobTypeKey: "seoBlogArticle", quantity: 10 }], stubPricer, DAY);
    expect(p.recommendationNote).toBeNull();
  });

  it("a composite plan (e.g. 10 blog posts plus their images) sums every line and stays silent on a single recommendation", () => {
    const lines: CalculatorLineInput[] = [
      { jobTypeKey: "seoBlogArticle", quantity: 10 }, // 29 USD-minor (see calculateLine's own test)
      { jobTypeKey: "studioGhostMannequin", quantity: 30 }, // 30 * 80,000 micros = 2,400,000 micros -> 240 USD-minor
    ];
    const p = calculatePlan(lines, stubPricer, DAY);
    expect(p.lines).toHaveLength(2);
    expect(p.totalUsdMinor).toBe(29 + 240);
    expect(p.totalStoreMinor).toBe((29 + 240) * 100);
    expect(p.recommendationNote).toBeNull(); // never guesses which of several lines to flag
  });

  it("the plan's store-currency total is honestly null the moment a single line's is, even once the rest price fine", () => {
    // seoBlogArticle qty=1 totals 3 USD-minor; studioGhostMannequin qty=1 totals 8 — refuse only that one amount,
    // so this line's own total is the single null among several otherwise-priced figures.
    const picky = (minor: number) => (minor === 8 ? null : stubPricer(minor));
    const p = calculatePlan(
      [
        { jobTypeKey: "seoBlogArticle", quantity: 1 },
        { jobTypeKey: "studioGhostMannequin", quantity: 1 },
      ],
      picky,
      DAY,
    );
    expect(p.lines[1]!.totalStoreMinor).toBeNull();
    expect(p.totalStoreMinor).toBeNull();
    expect(p.totalUsdMinor).toBeGreaterThan(0); // the USD total never depends on the store rate existing
  });
});
