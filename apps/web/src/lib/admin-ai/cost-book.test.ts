// S15 · PR 312 — the AI Cost Book's pure parts: the model and job catalogues are well-formed and in range (C2.2's
// "realistically 60–90 job types"), the cost math (text/image/video, never mixing kinds), alternatives are the
// same kind only and cheapest first, and search finds a job by its English or Bengali name, its section or its
// description.
// S15 · PR 313 — `actualOf`'s own pure math: null below `MIN_ACTUAL_SAMPLES` real runs, the right average and
// deviation once there are enough (the DB wiring — reading `AiUsageLedger`, persisting `actualPerRunMicros` — is
// `cost-book.db.test.ts`, the same split `control-room.ts`/`control-room.db.test.ts` already use).
import { describe, expect, it } from "vitest";
import {
  actualOf,
  ACTUAL_WINDOW_DAYS,
  alternativesFor,
  COST_BOOK_SECTIONS,
  estimateMicrosFor,
  isModelKey,
  JOB_CATALOG,
  MIN_ACTUAL_SAMPLES,
  modelOf,
  MODEL_CATALOG,
  microsToUsdMinor,
  monthlyMicrosFor,
  searchJobs,
} from "./cost-book";

const stubPricer = (minor: number) => ({ storeMinor: minor * 100, exchangeRateId: "rate-1" });

describe("AI Cost Book catalogue (PR 312)", () => {
  it("has between 60 and 90 job types, each a unique key in a known section", () => {
    expect(JOB_CATALOG.length).toBeGreaterThanOrEqual(60);
    expect(JOB_CATALOG.length).toBeLessThanOrEqual(90);
    expect(new Set(JOB_CATALOG.map((j) => j.key)).size).toBe(
      JOB_CATALOG.length,
    );
    for (const j of JOB_CATALOG) {
      expect(COST_BOOK_SECTIONS).toContain(j.section);
      expect(j.nameEn.length).toBeGreaterThan(0);
      expect(j.nameBn.length).toBeGreaterThan(0);
      expect(() => modelOf(j.recommendedModelKey)).not.toThrow();
    }
  });

  it("every section named by Blueprint C2.2 is used, plus studio for every photoshoot/video sub-job", () => {
    for (const s of [
      "support",
      "orders",
      "marketing",
      "social",
      "seo",
      "audit",
      "reports",
      "admin",
      "studio",
    ] as const) {
      expect(JOB_CATALOG.some((j) => j.section === s)).toBe(true);
    }
  });

  it("a recommended model always matches its job's own usage kind", () => {
    for (const j of JOB_CATALOG)
      expect(modelOf(j.recommendedModelKey).kind).toBe(j.usage.kind);
  });

  it("model keys are unique within the catalogue", () => {
    expect(new Set(MODEL_CATALOG.map((m) => m.modelKey)).size).toBe(
      MODEL_CATALOG.length,
    );
  });

  it("isModelKey recognises a catalogue key and rejects an unknown one", () => {
    expect(isModelKey("claude-sonnet")).toBe(true);
    expect(isModelKey("not-a-model")).toBe(false);
  });
});

describe("cost math (PR 312)", () => {
  it("prices a text job from its own input/output tokens, never touching an image/video model", () => {
    const sonnet = modelOf("claude-sonnet");
    const micros = estimateMicrosFor(
      { kind: "text", inputTokens: 1_000_000, outputTokens: 1_000_000 },
      sonnet,
    );
    expect(micros).toBe(3_000_000 + 15_000_000); // one million of each, at the model's own per-million price
    expect(estimateMicrosFor({ kind: "image", images: 5 }, sonnet)).toBe(0); // wrong kind: honestly zero, never invented
  });

  it("prices an image job per image, and a video job per second", () => {
    expect(
      estimateMicrosFor({ kind: "image", images: 3 }, modelOf("fashn-core")),
    ).toBe(3 * 80_000);
    expect(
      estimateMicrosFor({ kind: "video", seconds: 4 }, modelOf("runway-gen")),
    ).toBe(4 * 500_000);
  });

  it("a month is the per-run cost times the typical runs per day times 30", () => {
    expect(monthlyMicrosFor(1_000, 2)).toBe(1_000 * 2 * 30);
  });

  it("converts whole micros of USD to whole US cents", () => {
    expect(microsToUsdMinor(28_800)).toBe(3); // $0.0288 → 2.88 cents → 3 (rounded)
    expect(microsToUsdMinor(10_000)).toBe(1);
  });

  it("text generation is far cheaper per run than image or video generation (C2.4's honest intuition)", () => {
    const textMicros = estimateMicrosFor(
      { kind: "text", inputTokens: 600, outputTokens: 1800 },
      modelOf("claude-sonnet"),
    ); // one blog article
    const imageMicros = estimateMicrosFor(
      { kind: "image", images: 1 },
      modelOf("fashn-core"),
    );
    const videoMicros = estimateMicrosFor(
      { kind: "video", seconds: 4 },
      modelOf("runway-gen"),
    );
    expect(textMicros).toBeLessThan(imageMicros);
    expect(imageMicros).toBeLessThan(videoMicros);
  });
});

describe("alternatives (PR 312)", () => {
  it("only lists models of the same kind, cheapest first, excluding the one given", () => {
    const usage = {
      kind: "text" as const,
      inputTokens: 500,
      outputTokens: 500,
    };
    const alts = alternativesFor(usage, "claude-sonnet", 10);
    expect(alts.every((m) => m.kind === "text")).toBe(true);
    expect(alts.some((m) => m.modelKey === "claude-sonnet")).toBe(false);
    const costs = alts.map((m) => estimateMicrosFor(usage, m));
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it("never offers a video alternative for an image job, or vice versa", () => {
    const imageAlts = alternativesFor(
      { kind: "image", images: 1 },
      "fashn-core",
      10,
    );
    expect(imageAlts.every((m) => m.kind === "image")).toBe(true);
    const videoAlts = alternativesFor(
      { kind: "video", seconds: 4 },
      "runway-gen",
      10,
    );
    expect(videoAlts.every((m) => m.kind === "video")).toBe(true);
  });
});

describe("search (PR 312)", () => {
  it("an empty query returns every job, unfiltered", () => {
    expect(searchJobs(JOB_CATALOG, "")).toHaveLength(JOB_CATALOG.length);
    expect(searchJobs(JOB_CATALOG, "   ")).toHaveLength(JOB_CATALOG.length);
  });

  it("finds a job by an English word in its own name (C2.1's own example)", () => {
    const found = searchJobs(JOB_CATALOG, "support message");
    expect(found.some((j) => j.key === "supportReply")).toBe(true);
  });

  it("finds a job by a Bengali word, case-insensitively, and by its section name", () => {
    expect(
      searchJobs(JOB_CATALOG, "রিল").some((j) => j.key === "socialReelCaption"),
    ).toBe(true);
    expect(
      searchJobs(JOB_CATALOG, "STUDIO").every((j) => j.section === "studio"),
    ).toBe(true);
  });

  it("a query matching nothing returns an empty list, not every job", () => {
    expect(searchJobs(JOB_CATALOG, "xyz-nothing-like-this")).toHaveLength(0);
  });
});

describe("actualOf — estimate vs actual (PR 313, C2.3)", () => {
  it("stays null below MIN_ACTUAL_SAMPLES real runs, however cheap or expensive they were", () => {
    expect(MIN_ACTUAL_SAMPLES).toBeGreaterThan(0);
    expect(actualOf(MIN_ACTUAL_SAMPLES - 1, 1_000_000n, 100, stubPricer, "2026-11-11")).toBeNull();
    expect(actualOf(0, 0n, 100, stubPricer, "2026-11-11")).toBeNull();
  });

  it("once enough runs exist, averages the real spend and compares it with the estimate", () => {
    // 10 runs totalling 5,000,000 micros USD => 500,000 micros/run => 50 USD-minor/run (microsToUsdMinor divides by 10,000).
    const a = actualOf(10, 5_000_000n, 40, stubPricer, "2026-11-11");
    expect(a).not.toBeNull();
    expect(a!.runs).toBe(10);
    expect(a!.perRunUsdMinor).toBe(50);
    expect(a!.perMonthUsdMinor).toBe(500); // the whole window's own total, not re-multiplied by anything
    expect(a!.deviationPct).toBe(25); // (50 - 40) / 40 = +25%
    expect(a!.perRunStoreMinor).toBe(5000); // stubPricer: minor * 100
  });

  it("reads as cheaper than the estimate with a negative deviation, and as matching it at 0%", () => {
    const cheaper = actualOf(MIN_ACTUAL_SAMPLES, 400_000n, 100, stubPricer, "2026-11-11"); // 5 runs * 80,000 micros = 8 USD-minor/run
    expect(cheaper!.perRunUsdMinor).toBe(8);
    expect(cheaper!.deviationPct).toBe(-92);

    const same = actualOf(MIN_ACTUAL_SAMPLES, 5_000_000n, 100, stubPricer, "2026-11-11"); // 5 runs * 1,000,000 micros = 100 USD-minor/run
    expect(same!.perRunUsdMinor).toBe(100);
    expect(same!.deviationPct).toBe(0);
  });

  it("the measurement window is the same length as the book's own monthly estimate (C2.2/C2.3 answer the same question)", () => {
    expect(ACTUAL_WINDOW_DAYS).toBe(30);
  });
});
