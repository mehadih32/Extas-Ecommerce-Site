// PR 854 (admin prototype v5, Reports › the "Schedule" box on every report) — the one-report schedule's admin API. Needs `reports.read`
// (the store in `?storeId=`); @extas/catalogue checks it again.
//
//   GET   /api/admin/reports/schedule?report=<tab>   {ok, schedule: {report, enabled, frequency, time, channels, lastSentAt}, email}
//                                                    (`email` = the owner's own address the report would go to, or null until typed)
//   POST  /api/admin/reports/schedule                {report, frequency: daily|weekly|monthly, time: "HH:MM", channels: [telegram, email], enabled}
// Off as shipped. A schedule only sends the owner a short summary (Telegram or his own e-mail); never a buyer or a supplier.
import { MOTHER_STORE_ID } from "@extas/db/client";
import * as cat from "@extas/catalogue";
import * as inv from "@extas/inventory";
import {
  body,
  errorResponse,
  fail,
  guardAdmin,
  json,
  type AdminDeps,
} from "./admin-auth";
import { sellableReader } from "./shop/sellable";

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get("storeId");
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function reportScheduleHandler(
  request: Request,
  deps: AdminDeps | null,
): Promise<Response> {
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "POST") return fail(405, "method-not-allowed");
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, "invalid-store-id");
  const g = await guardAdmin(request, deps, {
    permission: "reports.read",
    storeId,
  });
  if (g instanceof Response) return g;
  try {
    const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const cdep: cat.CatalogueDeps = {
      db: deps!.db,
      settings: deps!.resolver,
      now: deps!.now,
      sellable: sellableReader(deps!.db, deps!.resolver, storeId),
    };
    const email = async () =>
      ((await deps!.resolver.value("reports.digest.ownerEmail", {
        storeId,
      })) as string | null) || null;
    if (m === "GET") {
      const report = url.searchParams.get("report") ?? "";
      return json({
        ok: true,
        schedule: await cat.reportSchedule(cdep, who, report),
        email: await email(),
      });
    }
    const b = (await body(request)) as cat.SaveReportScheduleInput;
    return json({
      ok: true,
      schedule: await cat.saveReportSchedule(cdep, who, b),
      email: await email(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
