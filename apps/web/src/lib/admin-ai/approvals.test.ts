// S15 · PR 317 — the approval queue's one pure helper: `kindLabelOf`. Everything else here (`requestApproval`,
// `approvalsView`, `decideApproval`, `expireStaleApprovals`) touches Prisma, so it is proven in
// `approvals-api.db.test.ts` instead, the same split `calculator.ts`/`calculator.test.ts` already use.
import { describe, expect, it } from "vitest";
import { KNOWN_KINDS, kindLabelOf } from "./approvals";

describe("kindLabelOf", () => {
  it("returns the known catalogue's own label, in the language asked for", () => {
    expect(kindLabelOf("refund", "en")).toBe("Refund");
    expect(kindLabelOf("refund", "bn")).toBe("রিফান্ড");
    expect(kindLabelOf("adBudget", "en")).toBe("Ad budget increase");
    expect(kindLabelOf("adBudget", "bn")).toBe("বিজ্ঞাপনের বাজেট বাড়ানো");
  });

  it("falls back to the raw kind string for anything not in the catalogue — never a guessed translation", () => {
    expect(kindLabelOf("some-future-agent-kind", "en")).toBe("some-future-agent-kind");
    expect(kindLabelOf("some-future-agent-kind", "bn")).toBe("some-future-agent-kind");
  });

  it("every known kind has both an English and a Bengali name, and no duplicate key", () => {
    for (const k of KNOWN_KINDS) {
      expect(k.nameEn.length).toBeGreaterThan(0);
      expect(k.nameBn.length).toBeGreaterThan(0);
    }
    expect(new Set(KNOWN_KINDS.map((k) => k.key)).size).toBe(KNOWN_KINDS.length);
  });
});
