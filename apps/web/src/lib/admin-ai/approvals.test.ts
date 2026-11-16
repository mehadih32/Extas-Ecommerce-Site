// S15 · PR 317 — the approval queue's one pure helper: `kindLabelOf`. Everything else here (`requestApproval`,
// `approvalsView`, `decideApproval`, `expireStaleApprovals`) touches Prisma, so it is proven in
// `approvals-api.db.test.ts` instead, the same split `calculator.ts`/`calculator.test.ts` already use.
import { describe, expect, it } from "vitest";
import { approvalExtras, KNOWN_KINDS, kindLabelOf } from "./approvals";

describe("approvalExtras (PR 934)", () => {
  it("reads the effect line, the open link and the draft from payload.ownerView", () => {
    const x = approvalExtras({ other: 1, ownerView: { impact: " About +9 orders ", openHref: "/admin/marketing/campaigns", draft: "Hello" } });
    expect(x).toEqual({ impact: "About +9 orders", openHref: "/admin/marketing/campaigns", draft: "Hello" });
  });
  it("is all null for any other payload and refuses a link that leaves the admin", () => {
    expect(approvalExtras(null)).toEqual({ impact: null, openHref: null, draft: null });
    expect(approvalExtras([1])).toEqual({ impact: null, openHref: null, draft: null });
    expect(approvalExtras({ ownerView: { openHref: "https://evil.example/admin/x" } }).openHref).toBeNull();
    expect(approvalExtras({ ownerView: { openHref: "/admin//evil" } }).openHref).toBeNull();
    expect(approvalExtras({ ownerView: { openHref: "/orders" } }).openHref).toBeNull();
  });
});

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
