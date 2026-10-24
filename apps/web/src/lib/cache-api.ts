// S02 · PR 602 — the Cache admin API (SET-08b, docs/BACKEND-ARCHITECTURE.md). `path` is what comes after
// /api/admin/cache:
//   GET   /api/admin/cache          the times each layer keeps a page (with the offered choices), the hit rate today,
//                                   what this process keeps now, the CDN connection's mode, the last clear (system.read)
//   PUT   /api/admin/cache          {pages?, stockDisplaySeconds?, tuning?, version?} saves the times; a stale version is
//                                   409 STALE; audited (system.cache)
//   POST  /api/admin/cache/clear    {reason?} clears every layer: every process's page cache, the settings memory and
//                                   Cloudflare; audited (system.cache)
// And for the deploy (infra/deploy/deploy.sh, never the browser):
//   POST  /api/internal/cache/deployed   with the server's CACHE_HOOK_TOKEN in `x-extas-cache-hook`: a new version is
//                                   live, so Cloudflare drops the pages it keeps (only while it keeps pages). Caddy
//                                   answers 404 to /api/internal/ from outside.
// Clearing a cache loses nothing: orders, products and settings are not touched.
import { timingSafeEqual } from "node:crypto";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { isCacheError } from "@extas/cache";
import {
  body,
  errorResponse,
  fail,
  guardAdmin,
  json,
  type AdminDeps,
} from "./admin-auth";
import { cacheDay, cacheRuntime } from "./cache";

const notAllowed = () => fail(405, "method-not-allowed");

function cacheFail(e: unknown): Response {
  if (isCacheError(e))
    return json(
      {
        ok: false,
        error: e.code,
        ...(e.details.length ? { details: e.details } : {}),
        ...(e.data ? { data: e.data } : {}),
      },
      { status: e.status },
    );
  return errorResponse(e);
}

/** Every Cache admin route. */
export async function cacheRoute(
  request: Request,
  deps: AdminDeps | null,
  path: string[],
): Promise<Response> {
  const m = request.method.toUpperCase();
  const where = path.join("/");
  if (where !== "" && where !== "clear") return fail(404, "not-found");
  if (where === "clear" && m !== "POST") return notAllowed();
  if (where === "" && m !== "GET" && m !== "PUT") return notAllowed();
  const g = await guardAdmin(request, deps, {
    permission: m === "GET" ? "system.read" : "system.cache",
    storeId: MOTHER_STORE_ID,
  });
  if (g instanceof Response) return g;
  const rt = cacheRuntime();
  if (!rt || !deps) return fail(503, "database-not-configured");
  const who = { actor: g.actor, storeId: MOTHER_STORE_ID, ctx: g.ctx };
  try {
    if (where === "clear") {
      const b = await body(request);
      const reason =
        typeof b.reason === "string" && b.reason.trim()
          ? b.reason.trim().slice(0, 500)
          : null;
      return json({ ok: true, ...(await rt.service.clearAll(who, reason)) });
    }
    if (m === "PUT")
      return json({
        ok: true,
        ...(await rt.service.save(
          { ...who, settings: deps.resolver },
          await body(request),
        )),
      });
    return json({ ok: true, ...(await rt.service.status(who, cacheDay())) });
  } catch (e) {
    return cacheFail(e);
  }
}

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The deploy's hook: a new version is live. Without the server's token (or with none set) it is "not found". */
export async function deployedHook(request: Request): Promise<Response> {
  const token = process.env.CACHE_HOOK_TOKEN ?? "";
  const sent = request.headers.get("x-extas-cache-hook") ?? "";
  if (
    request.method.toUpperCase() !== "POST" ||
    token.length < 32 ||
    !same(sent, token)
  )
    return fail(404, "not-found");
  const rt = cacheRuntime();
  if (!rt) return fail(503, "database-not-configured");
  try {
    const r = await rt.service.handle({ kind: "all", storeId: null });
    return json({
      ok: true,
      cleared: r.cleared,
      cdn: r.cdn ? { ok: r.cdn.ok, mode: r.cdn.mode } : null,
    });
  } catch (e) {
    return cacheFail(e);
  }
}
