// S28 · PR 701 (admin prototype v5, GAP-MAP part 3 W6 / N8) — Website → Analytics → Behaviour: a click heat map (a grid laid
// over the page), how far visitors scroll, which form fields they touch and leave empty, and the counts of a few shop buttons
// (size chart, all colours, WhatsApp) from the events PR 338 already records. Everything is counted per day into
// `BehaviourDay`, only while `analytics.behaviour` collect is on (off by default); never an IP, a name, a value typed or what was
// clicked. Days older than `keepDays` are removed (this table only). Needs `reports.read`; the settings need `settings.write`
// and the owner's PIN.
import { z } from "zod";
import {
  audit,
  requirePermission,
  type Actor,
  type RequestContext,
} from "@extas/auth";
import { MOTHER_STORE_ID, type PrismaClient } from "@extas/db/client";
import { dayStart, nextDay, ymdIn } from "@extas/metrics";
import {
  storeTarget,
  type AnalyticsBehaviourSettings,
  type Key,
  type Value,
} from "@extas/settings";
import {
  body,
  errorResponse,
  fail,
  guardAdmin,
  json,
  sameOrigin,
  type AdminDeps,
} from "../admin-auth";
import { requireOwnerPin } from "../owner-pin";
import { readCapped } from "../read-capped";
import {
  dropOffOf,
  heatOf,
  reachOf,
  shapeBeacon,
  BEHAVIOUR_PAGES,
  BEHAVIOUR_DEVICES,
  type HeatCell,
} from "./behaviour-pure";

export * from "./behaviour-pure";

type Db = PrismaClient;
export const BEHAVIOUR_BODY_MAX = 4_096; // hardcode-ok: a body-size guard, not a business number
const BUTTONS = [
  "size_chart_click",
  "all_colours_click",
  "whatsapp_click",
] as const;

export interface BehaviourReader {
  value<K extends Key>(key: K, opts?: { storeId?: number }): Promise<Value<K>>;
}
export interface BehaviourApiDeps {
  db: Db;
  resolver: BehaviourReader;
  storeId: number;
  now?: () => Date;
}

const quiet = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/** POST /api/shop/behaviour: public, same-site only, capped; always 204 (a missed count is fine; the shop never waits). */
export async function behaviourIngestHandler(
  request: Request,
  deps: BehaviourApiDeps | null,
): Promise<Response> {
  if (request.method.toUpperCase() !== "POST")
    return new Response(null, { status: 405 });
  if (!deps || !sameOrigin(request)) return quiet();
  try {
    const cfg = await deps.resolver.value("analytics.behaviour", {
      storeId: deps.storeId,
    });
    if (!cfg.collect) return quiet();
    const text = await readCapped(request, BEHAVIOUR_BODY_MAX);
    if (!text) return quiet();
    const shaped = shapeBeacon(JSON.parse(text) as unknown, cfg.grid);
    if (!shaped || !shaped.counts.length) return quiet();
    const tz = await deps.resolver.value("store.timeZone", {
      storeId: deps.storeId,
    });
    const day = new Date(
      `${ymdIn(deps.now ? deps.now() : new Date(), tz)}T00:00:00.000Z`,
    );
    for (const c of shaped.counts) {
      const where = {
        storeId_day_kind_pageType_device_key: {
          storeId: deps.storeId,
          day,
          kind: c.kind,
          pageType: shaped.pageType,
          device: shaped.device,
          key: c.key,
        },
      };
      await deps.db.behaviourDay.upsert({
        where,
        create: {
          storeId: deps.storeId,
          day,
          kind: c.kind,
          pageType: shaped.pageType,
          device: shaped.device,
          key: c.key,
          count: c.count,
        },
        update: { count: { increment: c.count } },
      });
    }
  } catch {
    // counting can fail, the shop cannot
  }
  return quiet();
}

export interface BehaviourView {
  cfg: AnalyticsBehaviourSettings;
  from: string;
  to: string;
  page: string;
  device: string;
  pages: readonly string[];
  devices: readonly string[];
  heat: HeatCell[];
  clicks: number;
  reach: { mark: number; count: number; pct: number }[];
  fields: { name: string; touched: number; empty: number; pct: number }[];
  buttons: { name: string; count: number }[];
}

const addDays = (ymd: string, n: number): string =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10);

export async function behaviourView(
  deps: Pick<AdminDeps, "db" | "resolver" | "now">,
  storeId: number,
  o: { span?: number; page?: string; device?: string } = {},
): Promise<BehaviourView> {
  const cfg = await deps.resolver.value("analytics.behaviour", { storeId });
  const tz = await deps.resolver.value("store.timeZone", { storeId });
  const now = deps.now ? deps.now() : new Date();
  const today = ymdIn(now, tz);
  await deps.db.behaviourDay.deleteMany({
    where: {
      storeId,
      day: { lt: new Date(`${addDays(today, -cfg.keepDays)}T00:00:00.000Z`) },
    },
  });
  const days = Math.max(1, Math.min(o.span ?? 30, cfg.keepDays)); // hardcode-ok: the screen's default window
  const from = addDays(today, -(days - 1));
  const page = (BEHAVIOUR_PAGES as readonly string[]).includes(o.page ?? "")
    ? o.page!
    : "home";
  const device = (BEHAVIOUR_DEVICES as readonly string[]).includes(
    o.device ?? "",
  )
    ? o.device!
    : "all";
  const rows = await deps.db.behaviourDay.findMany({
    where: {
      storeId,
      day: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${today}T00:00:00.000Z`),
      },
      ...(device === "all" ? {} : { device }),
    },
    select: { kind: true, pageType: true, key: true, count: true },
  });
  const of = (kind: string, onPage = true) =>
    rows.filter((r) => r.kind === kind && (!onPage || r.pageType === page));
  const heat = heatOf(of("CLICK"), cfg.grid);
  const events = await deps.db.analyticsEvent.groupBy({
    by: ["name"],
    where: {
      storeId,
      name: { in: [...BUTTONS] },
      occurredAt: { gte: dayStart(from, tz), lt: dayStart(nextDay(today), tz) },
    },
    _count: { _all: true },
  });
  return {
    cfg,
    from,
    to: today,
    page,
    device,
    pages: BEHAVIOUR_PAGES,
    devices: BEHAVIOUR_DEVICES,
    heat,
    clicks: heat.reduce((n, c) => n + c.count, 0),
    reach: reachOf(of("SCROLL")),
    fields: dropOffOf(of("FIELD", false), of("FIELD_EMPTY", false)),
    buttons: BUTTONS.map((name) => ({
      name,
      count: events.find((e) => e.name === name)?._count._all ?? 0,
    })),
  };
}

const settingsInput = z
  .object({
    collect: z.boolean(),
    keepDays: z.number().int().min(7).max(365),
    grid: z.number().int().min(5).max(40),
    pin: z.string(),
  })
  .strict();

/** Turning the counting on or off, and its numbers: `settings.write` and the owner's PIN. */
export async function saveBehaviourSettings(
  deps: AdminDeps,
  actor: Actor,
  ctx: RequestContext,
  storeId: number,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string; details?: string[] }> {
  await requirePermission(deps.db, actor, "settings.write", { storeId });
  const p = settingsInput.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      error: "INVALID_INPUT",
      details: p.error.issues.map((i) => i.path.join(".")),
    };
  await requireOwnerPin(
    deps,
    actor,
    ctx,
    p.data.pin,
    "analytics.behaviour.settings",
    storeId,
  );
  const before = await deps.resolver.value("analytics.behaviour", { storeId });
  const { pin: _pin, ...next } = p.data;
  void _pin;
  await deps.resolver.set("analytics.behaviour", next, storeTarget(storeId), {
    actorId: actor.staffUserId ?? null,
    reason: "Website › Analytics › Behaviour",
  });
  await audit(
    deps.db,
    actor,
    {
      action: "analytics.behaviour.settings",
      entityType: "Setting",
      entityId: "analytics.behaviour",
      before,
      after: next,
      storeId,
    },
    ctx,
  );
  return { ok: true };
}

/** GET /api/admin/analytics-behaviour?days=&page=&device= (reports.read) · POST settings (settings.write + PIN). */
export async function behaviourRoute(
  request: Request,
  deps: AdminDeps | null,
  path: string[],
): Promise<Response> {
  const url = new URL(request.url);
  const m = request.method.toUpperCase();
  const raw = url.searchParams.get("storeId");
  const storeId =
    raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, "invalid-store-id");
  try {
    if (!path.length && m === "GET") {
      const g = await guardAdmin(request, deps, {
        permission: "reports.read",
        storeId,
      });
      if (g instanceof Response) return g;
      const days = /^\d{1,3}$/.test(url.searchParams.get("days") ?? "")
        ? Number(url.searchParams.get("days"))
        : 30; // hardcode-ok: the default window the screen opens on
      return json({
        ok: true,
        ...(await behaviourView(deps!, storeId, {
          span: days,
          page: url.searchParams.get("page") ?? undefined,
          device: url.searchParams.get("device") ?? undefined,
        })),
      });
    }
    if (path[0] === "settings" && path.length === 1 && m === "POST") {
      const g = await guardAdmin(request, deps, {
        permission: "settings.write",
        storeId,
      });
      if (g instanceof Response) return g;
      const r = await saveBehaviourSettings(
        deps!,
        g.actor,
        g.ctx,
        storeId,
        await body(request),
      );
      return r.ok ? json({ ok: true }) : fail(422, r.error, r.details);
    }
    return fail(
      path.length ? 404 : 405,
      path.length ? "not-found" : "method-not-allowed",
    );
  } catch (e) {
    return errorResponse(e);
  }
}
