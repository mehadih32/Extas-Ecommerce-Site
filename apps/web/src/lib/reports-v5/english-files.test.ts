// PR 800 — the English-word rule for what leaves the app: every CSV the v5 reports hand out has English headings and values built from the
// code (never a Bengali screen word), and the English word file of the report downloads and packs has no Bengali letter. The Bengali word
// file is the owner's choice of language for a PDF, and is not touched here.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import filesEn from "../../../messages/admin-reports-files.en.json";
import { wordsFor } from "../report-files";
import { EXPORT_KINDS } from "./export";

const BENGALI = /[ঀ-৿]/;
const strings = (o: unknown): string[] =>
  typeof o === "string"
    ? [o]
    : o && typeof o === "object"
      ? Object.values(o).flatMap(strings)
      : [];
const ROOT = join(__dirname, "..", "..");

describe("what the reports hand out is in English", () => {
  it("the v5 CSV exports are built from English headings (no Bengali letter in the export code)", () => {
    const src = readFileSync(join(ROOT, "lib/reports-v5/export.ts"), "utf8");
    expect(src).not.toMatch(BENGALI);
    expect(EXPORT_KINDS.length).toBeGreaterThan(0);
  });
  it("the English file words (PDF and Excel headings, packs) have no Bengali letter", () => {
    const all = strings(filesEn);
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) expect(s).not.toMatch(BENGALI);
    expect(wordsFor("en")("period", { from: "a", to: "b" })).not.toMatch(
      BENGALI,
    );
  });
});
