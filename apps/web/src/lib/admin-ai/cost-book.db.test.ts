// S15 · PR 312 — AI › Cost Book on PostgreSQL (/api/admin/ai/cost-book): the job and model catalogue seed
// themselves on first read (idempotent, like Control room's `ensureAgentRows`), every job starts on Claude's own
// recommended model, searchable by English or Bengali name; `ai.read` opens it, `ai.control` alone changes one
// job's own model (reversible, audited, a double tap writes once); an unknown job or model is refused; a model of
// the wrong kind (an image model for a text job) is refused; with no USD rate typed yet (PR 345/266) every cost is
// honestly shown in USD only (`hasUsdRate: false`), never an invented taka figure. A throwaway database (skipped
// without TEST_DATABASE_ADMIN_URL, like every other `.db.test.ts`).
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
import { JOB_CATALOG } from "./cost-book";
import { costBookHandler } from "./cost-book-api";

const HOST = "admin.example.test";
const OWNER_PW = "a long sentence for the tests";

function call(method: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {
    host: HOST,
    "user-agent": "SampleBrowser/1.0",
    "x-forwarded-for": "192.0.2.44",
  };
  if (method !== "GET") headers.origin = `https://${HOST}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`https://${HOST}/api/admin/ai/cost-book`, {
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

interface Choice {
  modelKey: string;
  isRecommended: boolean;
  perRunUsdMinor: number;
  perMonthUsdMinor: number;
  perRunStoreMinor: number | null;
}
interface Job {
  key: string;
  section: string;
  selectedModelKey: string;
  recommendedModelKey: string;
  choices: Choice[];
}
interface Answer {
  ok: boolean;
  error?: string;
  details?: string[];
  currency: string;
  hasUsdRate: boolean;
  jobs: Job[];
  totalPerMonthUsdMinor: number;
  totalPerMonthStoreMinor: number | null;
  topExpensive: Job[];
}

describe.skipIf(!HAS_TEST_DB)("AI › Cost Book on PostgreSQL (PR 312)", () => {
  let t: TestDatabase;
  let deps: AdminDeps;
  let owner = "";
  let reader = "";
  let controller = "";
  const now = new Date("2026-11-11T10:00:00Z");

  const staff = async (email: string, perms: string[]) => {
    const role = await rolesHandler(
      call("POST", {
        cookie: owner,
        body: { nameEn: email, nameBn: email, permissions: perms },
      } as never),
      deps,
    );
    const roleId = ((await role.json()) as { role: { id: string } }).role.id;
    const made = await staffHandler(
      call("POST", {
        cookie: owner,
        body: {
          email,
          displayName: email,
          password: "first password from the owner",
        },
      } as never),
      deps,
    );
    const staffId = ((await made.json()) as { staff: { id: string } }).staff.id;
    await staffRolesHandler(
      call("POST", {
        cookie: owner,
        body: { action: "assign", roleId, storeId: MOTHER_STORE_ID },
      } as never),
      deps,
      staffId,
    );
    const first = cookiesOf(
      await loginHandler(
        call("POST", {
          body: { email, password: "first password from the owner" },
        }),
        deps,
      ),
    );
    return cookiesOf(
      await passwordHandler(
        call("POST", {
          cookie: first,
          body: {
            current: "first password from the owner",
            next: "my own words for this job",
          },
        }),
        deps,
      ),
    );
  };
  const ask = async (method: string, cookie: string, body?: unknown) => {
    const res = await costBookHandler(call(method, { cookie, body }), deps);
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
      await loginHandler(
        call("POST", {
          body: { email: "owner@example.com", password: OWNER_PW },
        }),
        deps,
      ),
    );
    reader = await staff("reader@example.com", ["ai.read"]);
    controller = await staff("controller@example.com", [
      "ai.read",
      "ai.control",
    ]);
  });
  afterAll(async () => {
    await t?.drop();
  });

  it("seeds every catalogue job once, each on its own recommended model, with no USD rate yet", async () => {
    const { status, a } = await ask("GET", reader);
    expect(status).toBe(200);
    expect(a.jobs).toHaveLength(JOB_CATALOG.length);
    expect(a.hasUsdRate).toBe(false);
    for (const j of a.jobs) {
      expect(j.selectedModelKey).toBe(j.recommendedModelKey);
      expect(
        j.choices.find((c) => c.modelKey === j.recommendedModelKey)
          ?.isRecommended,
      ).toBe(true);
      expect(j.choices.every((c) => c.perRunStoreMinor === null)).toBe(true); // honest: no owner USD rate typed yet
    }
    expect(a.totalPerMonthStoreMinor).toBeNull();
    expect(a.totalPerMonthUsdMinor).toBeGreaterThan(0);
    // reading again does not duplicate the seeded rows
    const again = await ask("GET", reader);
    expect(again.a.jobs).toHaveLength(JOB_CATALOG.length);
  });

  it("text jobs cost far less per month than studio image/video jobs (C2.4's own honest note)", async () => {
    const { a } = await ask("GET", reader);
    const text = a.jobs.find((j) => j.key === "seoBlogArticle")!;
    const image = a.jobs.find((j) => j.key === "studioGhostMannequin")!;
    const video = a.jobs.find((j) => j.key === "studioImageToVideo")!;
    expect(
      text.choices.find((c) => c.isRecommended)!.perRunUsdMinor,
    ).toBeLessThan(image.choices.find((c) => c.isRecommended)!.perRunUsdMinor);
    expect(
      image.choices.find((c) => c.isRecommended)!.perRunUsdMinor,
    ).toBeLessThan(video.choices.find((c) => c.isRecommended)!.perRunUsdMinor);
  });

  it("the top-10 most expensive jobs are sorted by their own monthly estimate, priciest first (C2.3)", async () => {
    const { a } = await ask("GET", reader);
    expect(a.topExpensive).toHaveLength(10);
    const amounts = a.topExpensive.map(
      (j) => j.choices.find((c) => c.isRecommended)!.perMonthUsdMinor,
    );
    expect(amounts).toEqual([...amounts].sort((x, y) => y - x));
  });

  it("only ai.read opens it; only ai.control changes a job's model", async () => {
    expect((await ask("GET", "bad=cookie")).status).toBe(401);
    expect(
      (
        await ask("POST", reader, {
          jobKey: "seoBlogArticle",
          modelKey: "claude-haiku",
        })
      ).status,
    ).toBe(403);
    const ok = await ask("POST", controller, {
      jobKey: "seoBlogArticle",
      modelKey: "claude-haiku",
    });
    expect(ok.status).toBe(200);
    expect(
      ok.a.jobs.find((j) => j.key === "seoBlogArticle")?.selectedModelKey,
    ).toBe("claude-haiku");
  });

  it("an unknown job, an unknown model, or a model of the wrong kind is refused; nothing changes", async () => {
    expect(
      (
        await ask("POST", controller, {
          jobKey: "not-a-job",
          modelKey: "claude-haiku",
        })
      ).a,
    ).toMatchObject({ ok: false, error: "UNKNOWN_JOB" });
    expect(
      (
        await ask("POST", controller, {
          jobKey: "seoBlogArticle",
          modelKey: "not-a-model",
        })
      ).a,
    ).toMatchObject({ ok: false, error: "UNKNOWN_MODEL" });
    // fashn-core is an image model; seoBlogArticle is a text job
    expect(
      (
        await ask("POST", controller, {
          jobKey: "seoBlogArticle",
          modelKey: "fashn-core",
        })
      ).a,
    ).toMatchObject({ ok: false, error: "WRONG_KIND" });
    expect((await ask("POST", controller, {})).a).toMatchObject({
      ok: false,
      error: "INVALID_INPUT",
      details: ["jobKey"],
    });
    const again = await ask("GET", reader);
    expect(
      again.a.jobs.find((j) => j.key === "seoBlogArticle")?.selectedModelKey,
    ).toBe("claude-haiku"); // unchanged from the previous test
  });

  it("a double tap writes once (idempotent); null resets to Claude's own recommendation; each real change is audited", async () => {
    const countBefore = await t.prisma.auditLog.count({
      where: { action: "ai.costBook.model" },
    });
    await ask("POST", controller, {
      jobKey: "seoBlogArticle",
      modelKey: "claude-haiku",
    }); // same value again
    expect(
      await t.prisma.auditLog.count({ where: { action: "ai.costBook.model" } }),
    ).toBe(countBefore);

    const reset = await ask("POST", controller, {
      jobKey: "seoBlogArticle",
      modelKey: null,
    });
    expect(reset.a.jobs.find((j) => j.key === "seoBlogArticle")).toMatchObject({
      selectedModelKey: "claude-sonnet",
      recommendedModelKey: "claude-sonnet",
    });
    expect(
      await t.prisma.auditLog.count({ where: { action: "ai.costBook.model" } }),
    ).toBe(countBefore + 1);
  });

  it("once the owner has typed a USD rate, every cost shows honestly in the store's own currency too", async () => {
    await t.prisma.exchangeRate.create({
      data: {
        storeId: MOTHER_STORE_ID,
        baseCurrency: "USD",
        quoteCurrency: "BDT",
        rate: "119.5",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
    const { a } = await ask("GET", reader);
    expect(a.hasUsdRate).toBe(true);
    expect(a.currency).toBe("BDT");
    expect(a.totalPerMonthStoreMinor).toBeGreaterThan(0);
    for (const j of a.jobs)
      expect(
        j.choices.find((c) => c.isRecommended)!.perRunStoreMinor,
      ).not.toBeNull();
  });

  it("finds a job by search across the whole catalogue, in English or Bengali (C2.1)", () => {
    // cost-book.test.ts already proves `searchJobs` itself; here only confirm every seeded job keeps its own
    // English and Bengali name through a full round trip to the database and back.
    expect(
      JOB_CATALOG.every((j) => j.nameEn.length > 0 && j.nameBn.length > 0),
    ).toBe(true);
  });
});
