// S15 · PR 317 — the single approval queue on PostgreSQL: `requestApproval` (called straight, the same pattern
// `usage-ledger.db.test.ts` calls `recordAiUsage` straight — no agent exists yet to call it through an HTTP route)
// creates a pending request, deduplicates a retried one by its own reference, and the admin API lists/decides it:
// only `ai.read` opens the queue, only `ai.control` decides one; approving or rejecting is audited and idempotent
// on a repeat of the same decision but refused on the other one; a request past its own `expiresAt` is flipped to
// EXPIRED on the very next read. A throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other
// `.db.test.ts`).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirstOwner, defaultSecurityPolicy, syncAuth } from "@extas/auth";
import {
  createTestDatabase,
  HAS_TEST_DB,
  seedSampleStores,
  type TestDatabase,
} from "@extas/auth/testing";
import { MOTHER_STORE_ID } from "@extas/db/client";
import {
  prismaBackend,
  registry,
  SettingsResolver,
  syncSettings,
  messages,
} from "@extas/settings";
import {
  loginHandler,
  passwordHandler,
  rolesHandler,
  staffHandler,
  staffRolesHandler,
} from "../admin-api";
import type { AdminDeps } from "../admin-auth";
import { SYSTEM } from "@extas/auth";
import { FIX_KIND, SKILL_KIND } from "../admin-health/fixes";
import { approvalsHandler } from "./approvals-api";
import { decideApproval, requestApproval } from "./approvals";

const HOST = "admin.example.test";
const OWNER_PW = "a long sentence for the tests";

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {
    host: HOST,
    "user-agent": "SampleBrowser/1.0",
    "x-forwarded-for": "192.0.2.46",
  };
  if (method !== "GET") headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://${HOST}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter((c) => c && !c.endsWith("="))
    .join("; ");

interface Row {
  id: string;
  kind: string;
  title: string;
  status: string;
  decidedById: string | null;
  decisionNote: string | null;
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  pending?: Row[];
  decided?: Row[];
}

describe.skipIf(!HAS_TEST_DB)("AI › approval queue on PostgreSQL (PR 317)", () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = "";
  let reader = "";
  let controller = "";
  let fixApprover = "";
  const now = new Date("2026-11-11T10:00:00Z");

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(
      call("POST", "/api/admin/roles", { cookie: owner, body: { nameEn: email, nameBn: email, permissions: perms } } as never),
      deps,
    );
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(
      call("POST", "/api/admin/staff", { cookie: owner, body: { email, displayName: email, password: "first password from the owner" } } as never),
      deps,
    );
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(
      call("POST", "/api/admin/staff-roles", { cookie: owner, body: { action: "assign", roleId, storeId: MOTHER_STORE_ID } } as never),
      deps,
      staffId,
    );
    const first = cookiesOf(
      await loginHandler(call("POST", "/api/admin/login", { body: { email, password: "first password from the owner" } }), deps),
    );
    return cookiesOf(
      await passwordHandler(
        call("POST", "/api/admin/password", { cookie: first, body: { current: "first password from the owner", next: "my own words for this job" } }),
        deps,
      ),
    );
  };

  const ask = async (method: string, cookie: string, reqBody?: unknown) => {
    const res = await approvalsHandler(call(method, "/api/admin/ai/approvals", { cookie, body: reqBody }), deps);
    return { status: res.status, a: (await res.json()) as Answer };
  };

  beforeAll(async () => {
    t = await createTestDatabase("web");
    await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    await syncSettings(t.prisma, { registry, messages });
    await createFirstOwner(t.prisma, defaultSecurityPolicy(), {
      email: "owner@example.com",
      displayName: "Sample owner",
      password: OWNER_PW,
      passwordChosenByOwner: true,
    });
    deps = {
      db: t.prisma,
      resolver: new SettingsResolver(prismaBackend(t.prisma), registry),
      vault: null,
      now: () => now,
    };
    owner = cookiesOf(await loginHandler(call("POST", "/api/admin/login", { body: { email: "owner@example.com", password: OWNER_PW } }), deps));
    reader = await staff("reader@example.com", ["ai.read"]);
    controller = await staff("controller@example.com", ["ai.read", "ai.control"]);
    fixApprover = await staff("fix-approver@example.com", ["ai.read", "health.fixes.approve"]);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it("starts with an honestly empty queue — no agent writes one yet", async () => {
    const { status, a } = await ask("GET", reader);
    expect(status).toBe(200);
    expect(a.pending).toEqual([]);
    expect(a.decided).toEqual([]);
  });

  it("refuses anyone without ai.read to even see the queue, and ai.control to decide", async () => {
    expect((await ask("GET", "bad=cookie")).status).toBe(401);
    const made = await requestApproval({ db: t.prisma, now: () => now }, {
      storeId: MOTHER_STORE_ID,
      agentKey: "tirondaj",
      kind: "adBudget",
      title: "Raise the Facebook campaign budget by 20%",
      payload: { campaignId: "camp-1", fromMinor: 500000, toMinor: 600000 },
    });
    expect((await ask("POST", reader, { id: made.id, decision: "approve" })).status).toBe(403);
  });

  it("lists a pending request the reader can see but not decide", async () => {
    const { a } = await ask("GET", reader);
    expect(a.pending).toHaveLength(1);
    expect(a.pending![0]).toMatchObject({ kind: "adBudget", title: "Raise the Facebook campaign budget by 20%", status: "PENDING" });
  });

  it("deduplicates a retried request by its own reference instead of queuing it twice", async () => {
    const before = await t.prisma.aiApprovalRequest.count();
    const first = await requestApproval({ db: t.prisma, now: () => now }, {
      kind: "refund", title: "Refund order #1042", payload: { orderId: 1042 }, refType: "Order", refId: "1042",
    });
    expect(first.created).toBe(true);
    const retried = await requestApproval({ db: t.prisma, now: () => now }, {
      kind: "refund", title: "Refund order #1042 (re-delivered)", payload: { orderId: 1042 }, refType: "Order", refId: "1042",
    });
    expect(retried.created).toBe(false);
    expect(retried.id).toBe(first.id);
    expect(await t.prisma.aiApprovalRequest.count()).toBe(before + 1);
  });

  it("refuses a caller-input error — an empty kind or title", async () => {
    await expect(requestApproval({ db: t.prisma, now: () => now }, { kind: "", title: "x", payload: {} })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(requestApproval({ db: t.prisma, now: () => now }, { kind: "fix", title: "  ", payload: {} })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("approving is audited, and a repeat tap with the same decision is a no-op, but the other decision is refused", async () => {
    const { a: before } = await ask("GET", controller);
    const target = before.pending!.find((p) => p.kind === "adBudget")!;
    const auditBefore = await t.prisma.auditLog.count({ where: { action: "ai.approval.approved" } });

    const ok = await ask("POST", controller, { id: target.id, decision: "approve", note: "Within this month's budget" });
    expect(ok.status).toBe(200);
    expect(ok.a.decided!.find((d) => d.id === target.id)).toMatchObject({ status: "APPROVED", decisionNote: "Within this month's budget" });
    expect(await t.prisma.auditLog.count({ where: { action: "ai.approval.approved" } })).toBe(auditBefore + 1);

    // the same decision again writes no new audit entry — the common double-click, not an error.
    const again = await ask("POST", controller, { id: target.id, decision: "approve" });
    expect(again.status).toBe(200);
    expect(await t.prisma.auditLog.count({ where: { action: "ai.approval.approved" } })).toBe(auditBefore + 1);

    // the *other* decision on an already-decided request is refused, naming the status it actually carries.
    const flip = await ask("POST", controller, { id: target.id, decision: "reject" });
    expect(flip.a).toMatchObject({ ok: false, error: "ALREADY_DECIDED", details: ["APPROVED"] });
  });

  it("rejecting writes its own audit entry; an unknown id is refused 404; a bad decision value is refused 400", async () => {
    const made = await requestApproval({ db: t.prisma, now: () => now }, { kind: "block", title: "Block customer +8801…", payload: {} });
    const auditBefore = await t.prisma.auditLog.count({ where: { action: "ai.approval.rejected" } });
    const ok = await ask("POST", controller, { id: made.id, decision: "reject" });
    expect(ok.a.decided!.find((d) => d.id === made.id)?.status).toBe("REJECTED");
    expect(await t.prisma.auditLog.count({ where: { action: "ai.approval.rejected" } })).toBe(auditBefore + 1);

    expect((await ask("POST", controller, { id: "00000000-0000-7000-8000-000000000000", decision: "approve" })).a).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect((await ask("POST", controller, { id: made.id, decision: "maybe" })).a).toMatchObject({ ok: false, error: "INVALID_INPUT", details: ["decision"] });
  });

  it("flips a request past its own expiresAt to EXPIRED on the very next read", async () => {
    // The request's own expiresAt is set in the past (relative to the fixed `now` every session was created under)
    // rather than moving the clock forward, which would also age out every test session's own idle timeout.
    const made = await requestApproval({ db: t.prisma, now: () => now }, {
      kind: "discount", title: "Give a loyalty discount code", payload: {}, expiresAt: new Date("2026-11-11T09:00:00Z"),
    });
    const { a } = await ask("GET", reader);
    expect(a.pending!.find((p) => p.id === made.id)).toBeUndefined();
    expect(a.decided!.find((d) => d.id === made.id)).toMatchObject({ status: "EXPIRED" });
  });

  it("refuses to create a health.fix/ai.skill request directly — only fixes.ts's own proposeFix/proposeSkill may", async () => {
    await expect(requestApproval({ db: t.prisma, now: () => now }, { kind: FIX_KIND, title: "x", payload: {} })).rejects.toMatchObject({ code: "USE_FIX_GATE" });
    await expect(requestApproval({ db: t.prisma, now: () => now }, { kind: SKILL_KIND, title: "x", payload: {} })).rejects.toMatchObject({ code: "USE_FIX_GATE" });
  });

  it("lists a health.fix/ai.skill request (made the way fixes.ts itself would) in the same unified queue", async () => {
    // Built directly on the table, the way `fixes.proposeFix`/`proposeSkill` build it, since this file's own
    // `requestApproval` now refuses those two kinds (previous test) — this is PR 420's own data shape, read here
    // only to prove the unifying list shows it, never to re-test `fixes.ts`'s own business rules.
    // refId is a well-formed (but non-existent) uuid: fixes.ts's own decideProposal always builds a uuid-typed
    // `where` from it, which Postgres refuses to even compare against an empty string.
    const fix = await t.prisma.aiApprovalRequest.create({ data: { storeId: MOTHER_STORE_ID, kind: FIX_KIND, title: "Checkout button overlaps on 360px", summary: "Shrink the padding", payload: {}, refType: "SiteAuditFinding", refId: "00000000-0000-7000-8000-000000000001" } });
    const skill = await t.prisma.aiApprovalRequest.create({ data: { storeId: null, kind: SKILL_KIND, title: "New SEO meta-description writer", payload: {} } });
    const { a } = await ask("GET", reader);
    expect(a.pending!.find((p) => p.id === fix.id)).toMatchObject({ kind: FIX_KIND, title: "Checkout button overlaps on 360px" });
    expect(a.pending!.find((p) => p.id === skill.id)).toMatchObject({ kind: SKILL_KIND, title: "New SEO meta-description writer" });
  });

  it("a controller with only ai.control cannot decide a health.fix/ai.skill row — that needs health.fixes.approve", async () => {
    const { a: before } = await ask("GET", controller);
    const fix = before.pending!.find((p) => p.kind === FIX_KIND)!;
    const denied = await ask("POST", controller, { id: fix.id, decision: "approve" });
    expect(denied.status).toBe(403);
    // this file's own decideApproval also refuses it outright, as a safety net, were it ever called directly
    await expect(decideApproval({ db: t.prisma, now: () => now }, { actor: SYSTEM }, fix.id, "approve")).rejects.toMatchObject({ code: "USE_FIX_GATE" });
  });

  it("a fix approver (health.fixes.approve, no ai.control) decides a health.fix row through this same unified API", async () => {
    const { a: before } = await ask("GET", fixApprover);
    const fix = before.pending!.find((p) => p.kind === FIX_KIND)!;
    const ok = await ask("POST", fixApprover, { id: fix.id, decision: "approve", note: "Looks safe to apply" });
    expect(ok.status).toBe(200);
    expect(ok.a.decided!.find((d) => d.id === fix.id)).toMatchObject({ status: "APPROVED", decisionNote: "Looks safe to apply" });

    const skill = before.pending!.find((p) => p.kind === SKILL_KIND)!;
    const rejected = await ask("POST", fixApprover, { id: skill.id, decision: "reject" });
    expect(rejected.a.decided!.find((d) => d.id === skill.id)?.status).toBe("REJECTED");
  });
});
