// S28 · PR 701 — the behaviour view on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): nothing is counted until the
// owner turns it on; then a beacon adds to the day's counts (clicks as cells, scroll marks, field names only); the view reads the
// heat, reach, drop-off and button counts; counts past the keep days are removed; the settings need the owner's PIN. Made-up data.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createFirstOwner,
  defaultSecurityPolicy,
  setOwnerPin,
  syncAuth,
} from "@extas/auth";
import {
  createTestDatabase,
  HAS_TEST_DB,
  seedSampleStores,
  type TestDatabase,
} from "@extas/auth/testing";
import { ymdIn } from "@extas/metrics";
import {
  messages,
  prismaBackend,
  registry,
  SettingsResolver,
  storeTarget,
  syncSettings,
} from "@extas/settings";
import { createVault } from "@extas/vault";
import type { AdminDeps } from "../admin-auth";
import { loginHandler } from "../admin-api";
import {
  behaviourIngestHandler,
  behaviourRoute,
  behaviourView,
} from "./behaviour";

const ORIGIN = "https://shop.example.test";
const HOST = "admin.example.test";
const OWNER_PW = "a long sentence for the tests";
const PIN = "4821";

function adminCall(
  method: string,
  path: string,
  opts: { body?: unknown; cookie?: string } = {},
) {
  const headers: Record<string, string> = {
    host: HOST,
    "user-agent": "SampleBrowser/1.0",
    "x-forwarded-for": "192.0.2.81",
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

describe.skipIf(!HAS_TEST_DB)(
  "the behaviour view on PostgreSQL (PR 701)",
  () => {
    let t: TestDatabase;
    let deps: AdminDeps;
    let A = 0;
    let owner = "";
    const send = (body: unknown, extra: Record<string, string> = {}) =>
      behaviourIngestHandler(
        new Request(`${ORIGIN}/api/shop/behaviour`, {
          method: "POST",
          headers: {
            host: "shop.example.test",
            "sec-fetch-site": "same-origin",
            "content-type": "text/plain",
            ...extra,
          },
          body: typeof body === "string" ? body : JSON.stringify(body),
        }),
        { db: t.prisma, resolver: deps.resolver, storeId: A },
      );
    const total = async () =>
      (
        await t.prisma.behaviourDay.aggregate({
          where: { storeId: A },
          _sum: { count: true },
        })
      )._sum.count ?? 0;

    beforeAll(async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      t = await createTestDatabase("behaviour701");
      [A] = await seedSampleStores(t.prisma);
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
        vault: createVault(t.prisma, "test-master-key-".padEnd(64, "k")),
      };
      await deps.resolver.set("store.timeZone", "Asia/Dhaka", storeTarget(A), {
        actorId: null,
        reason: "test",
      });
      owner = cookiesOf(
        await loginHandler(
          adminCall("POST", "/api/admin/auth/login", {
            body: { email: "owner@example.com", password: OWNER_PW },
          }),
          deps,
        ),
      );
      const row = await t.prisma.staffUser.findUniqueOrThrow({
        where: { email: "owner@example.com" },
      });
      await setOwnerPin(
        t.prisma,
        { staffUserId: row.id },
        { password: OWNER_PW, pin: PIN },
        { minLength: 4, maxLength: 12, maxAttempts: 9, lockMinutes: 15 },
        new Date(),
      );
    });
    afterAll(async () => {
      vi.restoreAllMocks();
      await t?.drop();
    });

    it("counts nothing while it is off", async () => {
      expect(
        (
          await send({
            page: "home",
            device: "mobile",
            events: [{ k: "click", x: 0.5, y: 0.5 }],
          })
        ).status,
      ).toBe(204);
      expect(await total()).toBe(0);
    });

    it("when on, adds to the day, answers 204 to everything, and ignores other sites, big or broken bodies", async () => {
      await deps.resolver.set(
        "analytics.behaviour",
        { collect: true, keepDays: 60, grid: 20 },
        storeTarget(A),
        { actorId: null, reason: "test" },
      );
      const ev = {
        page: "checkout",
        device: "mobile",
        events: [
          { k: "click", x: 0.1, y: 0.1 },
          { k: "scroll", pct: 80 },
          { k: "field", name: "phone" },
          { k: "field", name: "phone", empty: true },
          { k: "field", name: "01711223344" },
        ],
      };
      expect((await send(ev)).status).toBe(204);
      expect((await send(ev)).status).toBe(204);
      expect(await total()).toBe(8); // 4 counted events, twice (the phone-number "field" is dropped)
      const click = await t.prisma.behaviourDay.findFirstOrThrow({
        where: { storeId: A, kind: "CLICK" },
      });
      expect(click).toMatchObject({
        key: "2,2",
        count: 2,
        pageType: "checkout",
        device: "mobile",
      });
      expect(
        (
          await t.prisma.behaviourDay.findMany({
            where: { storeId: A, kind: { in: ["FIELD", "FIELD_EMPTY"] } },
          })
        ).map((r) => r.key),
      ).toEqual(["phone", "phone"]);
      expect(
        (
          await send(ev, {
            "sec-fetch-site": "cross-site",
            origin: "https://evil.example.test",
          })
        ).status,
      ).toBe(204);
      expect((await send("{not json")).status).toBe(204);
      expect((await send({ ...ev, pad: "x".repeat(5000) })).status).toBe(204);
      expect(await total()).toBe(8);
      expect(
        (
          await behaviourIngestHandler(
            new Request(`${ORIGIN}/api/shop/behaviour`, { method: "GET" }),
            null,
          )
        ).status,
      ).toBe(405);
    });

    it("the view reads heat, reach, field drop-off and the three button counts", async () => {
      await send({
        page: "checkout",
        device: "desktop",
        events: [
          { k: "scroll", pct: 0 },
          { k: "field", name: "name" },
        ],
      });
      await send({
        page: "checkout",
        device: "mobile",
        events: [{ k: "scroll", pct: 0 }],
      });
      for (const name of [
        "size_chart_click",
        "size_chart_click",
        "whatsapp_click",
      ])
        await t.prisma.analyticsEvent.create({
          data: {
            storeId: A,
            visitorId: "v".repeat(32),
            isLoggedIn: false,
            name,
            occurredAt: new Date(),
          },
        });
      const v = await behaviourView(deps, A, { page: "checkout" });
      expect(v.heat).toEqual([{ col: 2, row: 2, count: 2, level: 100 }]);
      expect(v.clicks).toBe(2);
      expect(v.reach.find((r) => r.mark === 75)!.count).toBe(2);
      expect(v.reach.find((r) => r.mark === 0)!.count).toBe(2);
      expect(v.fields.find((f) => f.name === "phone")).toMatchObject({
        touched: 2,
        empty: 2,
        pct: 100,
      });
      expect(v.buttons).toEqual([
        { name: "size_chart_click", count: 2 },
        { name: "all_colours_click", count: 0 },
        { name: "whatsapp_click", count: 1 },
      ]);
      const phones = await behaviourView(deps, A, {
        page: "checkout",
        device: "desktop",
      });
      expect(phones.clicks).toBe(0);
      expect(
        (await behaviourView(deps, A, { page: "nonsense", device: "nonsense" }))
          .page,
      ).toBe("home");
    });

    it("counts past the keep days are removed when the view is read", async () => {
      const old = new Date(Date.now() - 200 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await t.prisma.behaviourDay.create({
        data: {
          storeId: A,
          day: new Date(`${old}T00:00:00.000Z`),
          kind: "CLICK",
          pageType: "home",
          device: "mobile",
          key: "1,1",
          count: 5,
        },
      });
      await behaviourView(deps, A);
      expect(
        await t.prisma.behaviourDay.count({
          where: { storeId: A, day: new Date(`${old}T00:00:00.000Z`) },
        }),
      ).toBe(0);
      expect(
        await t.prisma.behaviourDay.count({
          where: {
            storeId: A,
            day: new Date(`${ymdIn(new Date(), "Asia/Dhaka")}T00:00:00.000Z`),
          },
        }),
      ).toBeGreaterThan(0);
    });

    it("the settings need the PIN and the numbers must fit; reading needs a signed-in person", async () => {
      const post = async (body: unknown) => {
        const res = await behaviourRoute(
          adminCall(
            "POST",
            `/api/admin/analytics-behaviour/settings?storeId=${A}`,
            { body, cookie: owner },
          ),
          deps,
          ["settings"],
        );
        return {
          status: res.status,
          body: (await res.json()) as Record<string, any>,
        };
      };
      const good = { collect: false, keepDays: 30, grid: 10 };
      expect((await post({ ...good, pin: "0000" })).body.error).toBe(
        "WRONG_PIN",
      );
      expect((await post({ ...good, grid: 2, pin: PIN })).body.error).toBe(
        "INVALID_INPUT",
      );
      expect((await post({ ...good, pin: PIN })).status).toBe(200);
      const res = await behaviourRoute(
        adminCall(
          "GET",
          `/api/admin/analytics-behaviour?storeId=${A}&days=7&page=checkout`,
          { cookie: owner },
        ),
        deps,
        [],
      );
      const body = (await res.json()) as Record<string, any>;
      expect(body.cfg).toMatchObject({
        collect: false,
        keepDays: 30,
        grid: 10,
      });
      expect(body.page).toBe("checkout");
      expect(
        await t.prisma.auditLog.count({
          where: { action: "analytics.behaviour.settings" },
        }),
      ).toBe(1);
      expect(
        (
          await behaviourRoute(
            adminCall("GET", `/api/admin/analytics-behaviour?storeId=${A}`),
            deps,
            [],
          )
        ).status,
      ).toBe(401);
    });
  },
);
