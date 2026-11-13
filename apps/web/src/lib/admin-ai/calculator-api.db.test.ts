// S15 · PR 316 — /api/admin/ai/cost-book/calculator on PostgreSQL: only `ai.control` (the same permission the book's
// own model picks and presets need) may price a plan or save one; a caller-input error (an unknown job, a negative
// quantity, an empty lines array) is refused with the pure engine's own error code; "Save as plan" persists one
// `AiCostPlan` row with the exact estimate and one audit entry; previewing without `save` writes nothing at all.
// A throwaway database (skipped without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
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
  INSTALLATION,
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
import { calculatorHandler } from "./calculator-api";

const HOST = "admin.example.test";
const OWNER_PW = "a long sentence for the tests";

function call(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {
    host: HOST,
    "user-agent": "SampleBrowser/1.0",
    "x-forwarded-for": "192.0.2.45",
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

interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  id?: string;
  plan?: {
    lines: { jobTypeKey: string; modelKey: string; totalUsdMinor: number }[];
    totalUsdMinor: number;
    totalStoreMinor: number | null;
    recommendationNote: string | null;
  };
}

describe.skipIf(!HAS_TEST_DB)("AI › Cost Book calculator on PostgreSQL (PR 316)", () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = "";
  let reader = "";
  let controller = "";
  const now = new Date("2026-11-11T10:00:00Z");

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(
      call("POST", "/api/admin/roles", {
        cookie: owner,
        body: { nameEn: email, nameBn: email, permissions: perms },
      } as never),
      deps,
    );
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(
      call("POST", "/api/admin/staff", {
        cookie: owner,
        body: { email, displayName: email, password: "first password from the owner" },
      } as never),
      deps,
    );
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(
      call("POST", "/api/admin/staff-roles", {
        cookie: owner,
        body: { action: "assign", roleId, storeId: MOTHER_STORE_ID },
      } as never),
      deps,
      staffId,
    );
    const first = cookiesOf(
      await loginHandler(
        call("POST", "/api/admin/login", { body: { email, password: "first password from the owner" } }),
        deps,
      ),
    );
    return cookiesOf(
      await passwordHandler(
        call("POST", "/api/admin/password", {
          cookie: first,
          body: { current: "first password from the owner", next: "my own words for this job" },
        }),
        deps,
      ),
    );
  };

  const ask = async (cookie: string, body?: unknown) => {
    const res = await calculatorHandler(
      call("POST", "/api/admin/ai/cost-book/calculator", { cookie, body }),
      deps,
    );
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
    owner = cookiesOf(
      await loginHandler(call("POST", "/api/admin/login", { body: { email: "owner@example.com", password: OWNER_PW } }), deps),
    );
    reader = await staff("reader@example.com", ["ai.read"]);
    controller = await staff("controller@example.com", ["ai.read", "ai.control"]);
    void INSTALLATION;
  });
  afterAll(async () => {
    await t?.drop();
  });

  it("refuses anyone without ai.control, even a reader who can see the book itself", async () => {
    expect((await ask("bad=cookie")).status).toBe(401);
    const r = await ask(reader, { lines: [{ jobTypeKey: "seoBlogArticle", quantity: 10 }] });
    expect(r.status).toBe(403);
  });

  it("prices a single-line plan at exactly the same per-run cost the book itself would show, and writes nothing", async () => {
    const before = await t.prisma.aiCostPlan.count();
    const { status, a } = await ask(controller, { lines: [{ jobTypeKey: "seoBlogArticle", quantity: 10 }] });
    expect(status).toBe(200);
    expect(a.ok).toBe(true);
    expect(a.plan!.lines).toHaveLength(1);
    expect(a.plan!.lines[0]!.jobTypeKey).toBe("seoBlogArticle");
    expect(a.plan!.totalUsdMinor).toBeGreaterThan(0);
    expect(await t.prisma.aiCostPlan.count()).toBe(before); // preview only — nothing saved
  });

  it("prices a composite multi-line plan as the sum of its own lines", async () => {
    const { a } = await ask(controller, {
      lines: [
        { jobTypeKey: "seoBlogArticle", quantity: 10 },
        { jobTypeKey: "studioGhostMannequin", quantity: 5 },
      ],
    });
    expect(a.plan!.lines).toHaveLength(2);
    const sum = a.plan!.lines.reduce((s, l) => s + l.totalUsdMinor, 0);
    expect(a.plan!.totalUsdMinor).toBe(sum);
  });

  it("refuses a caller-input error (unknown job, non-positive quantity, empty lines) and changes nothing", async () => {
    expect((await ask(controller, { lines: [{ jobTypeKey: "not-a-job", quantity: 1 }] })).a).toMatchObject({
      ok: false,
      error: "UNKNOWN_JOB",
    });
    expect((await ask(controller, { lines: [{ jobTypeKey: "seoBlogArticle", quantity: -1 }] })).a).toMatchObject({
      ok: false,
      error: "INVALID_QUANTITY",
    });
    expect((await ask(controller, { lines: [] })).a).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect((await ask(controller, {})).a).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });

  it("'Save as plan' persists one AiCostPlan row with the exact estimate and one audit entry", async () => {
    const auditBefore = await t.prisma.auditLog.count({ where: { action: "ai.calculator.plan" } });
    const { status, a } = await ask(controller, {
      lines: [{ jobTypeKey: "seoBlogArticle", quantity: 10 }],
      description: "10 blog posts, November",
      save: true,
    });
    expect(status).toBe(200);
    expect(a.ok).toBe(true);
    expect(a.id).toBeTruthy();

    const row = await t.prisma.aiCostPlan.findUniqueOrThrow({ where: { id: a.id! } });
    expect(row.description).toBe("10 blog posts, November");
    expect(row.jobTypeKey).toBe("seoBlogArticle"); // a single-line plan remembers which job it was for
    expect(row.savedAsPlan).toBe(true);
    expect(row.createdVia).toBe("admin");
    expect(row.estimateMicros).toBeGreaterThan(0n);
    expect(row.actualMicros).toBeNull(); // honest: no job dispatcher has run this yet

    expect(await t.prisma.auditLog.count({ where: { action: "ai.calculator.plan" } })).toBe(auditBefore + 1);
  });

  it("a composite plan's saved row carries no single jobTypeKey (it was never just one job)", async () => {
    const { a } = await ask(controller, {
      lines: [
        { jobTypeKey: "seoBlogArticle", quantity: 10 },
        { jobTypeKey: "studioGhostMannequin", quantity: 5 },
      ],
      description: "10 posts with photoshoots",
      save: true,
    });
    const row = await t.prisma.aiCostPlan.findUniqueOrThrow({ where: { id: a.id! } });
    expect(row.jobTypeKey).toBeNull();
  });

  it("refuses to save without a description, and saves nothing", async () => {
    const before = await t.prisma.aiCostPlan.count();
    const { a } = await ask(controller, { lines: [{ jobTypeKey: "seoBlogArticle", quantity: 1 }], save: true });
    expect(a).toMatchObject({ ok: false, error: "INVALID_INPUT", details: ["description"] });
    expect(await t.prisma.aiCostPlan.count()).toBe(before);
  });
});
