// PR 1070 — a word written as a flat "rev.chip.questions" key is never found by the nested lookup, and the screen then shows
// the key itself. Every word of Reviews & questions sits nested, in both languages; the delivery report loads the shared
// report words its period bar reads (reportsV5.common.*).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bn from "../../../messages/admin-reviews.bn.json";
import en from "../../../messages/admin-reviews.en.json";

const at = (o: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>(
      (a, k) =>
        a && typeof a === "object"
          ? (a as Record<string, unknown>)[k]
          : undefined,
      o,
    );

describe("Reviews & questions words", () => {
  for (const [lang, dict] of [
    ["en", en],
    ["bn", bn],
  ] as const) {
    it(`${lang}: no flat dotted key at the top, the chip and figure words are reachable`, () => {
      expect(Object.keys(dict).filter((k) => k.includes("."))).toEqual([]);
      for (const k of [
        "rev.chip.aria",
        "rev.chip.questions",
        "rev.chip.reviews",
        "rev.chip.hidden",
        "rev.chip.faqs",
        "rev.kpi.lowStar",
      ]) {
        expect(typeof at(dict, k), `${lang} ${k}`).toBe("string");
      }
    });
  }
});

describe("Delivery report words", () => {
  it("loads the shared report words for its period bar", () => {
    const src = readFileSync(
      new URL("../../app/admin/reports/delivery/page.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toContain("withReportsV5(withCourierReport(plain))");
  });
});
