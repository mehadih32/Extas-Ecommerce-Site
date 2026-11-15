// PR 863 (admin prototype v5, Reports › Products "Send N to ERP reorder list") — the reorder request's admin API. Needs `inventory.erp`
// (the ERP actions); the store is `?storeId=`.
//
//   POST  /api/admin/reports/reorder   {productIds?: string[]}  →  {ok, queued, lines: [{productId, name, suggested}]}
//
// The request is made from the Report library's own "restock now" list (never from what the page sends): every id the page sends is
// checked against that list, each line suggests 30 days of sales as the pieces to buy (the prototype's rule), and the request is saved
// in the audit log with the person's name (`reports.reorder.requested`). The ERP contract (docs/erp/site-changes-v6.md) has no reorder
// document yet, so nothing is sent to the ERP from here and nothing is bought: the ERP's own reorder list picks the saved request up
// when that document exists (a mock until then, A1.3). Nothing goes to a buyer or a supplier.
import { audit } from "@extas/auth";
import { MOTHER_STORE_ID } from "@extas/db/client";
import * as cat from "@extas/catalogue";
import * as inv from "@extas/inventory";
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from "./admin-auth";
import { sellableReader } from "./shop/sellable";

export interface ReorderLine {
  productId: string;
  name: string;
  /** Pieces to buy: the product's last 30 days of sales. */
  suggested: number;
}

/** The lines of a request: the asked ids that are on the restock list (all of the list when none were asked), each with its 30-day sales. */
export function reorderLines(asked: readonly string[] | null, restock: readonly { productId: string; name: string; sold30: number }[]): ReorderLine[] {
  const want = asked ? new Set(asked) : null;
  return restock.filter((r) => !want || want.has(r.productId)).map((r) => ({ productId: r.productId, name: r.name, suggested: r.sold30 }));
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get("storeId");
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function reportReorderHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") return fail(405, "method-not-allowed");
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, "invalid-store-id");
  const g = await guardAdmin(request, deps, { permission: "inventory.erp", storeId });
  if (g instanceof Response) return g;
  try {
    const b = (await body(request)) as { productIds?: unknown };
    const asked = Array.isArray(b.productIds) && b.productIds.every((x) => typeof x === "string") ? (b.productIds as string[]) : b.productIds === undefined ? null : undefined;
    if (asked === undefined) return fail(400, "INVALID_INPUT");
    const who: inv.Who = { actor: g.actor, storeId, ctx: g.ctx };
    const cdep: cat.CatalogueDeps = { db: deps!.db, settings: deps!.resolver, now: deps!.now, sellable: sellableReader(deps!.db, deps!.resolver, storeId) };
    const list = await cat.restockReport(cdep, who as unknown as Parameters<typeof cat.restockReport>[1], { limit: 200 }); // hardcode-ok: the library's own list cap
    const lines = reorderLines(asked, list.restock);
    if (!lines.length) return json({ ok: true, queued: 0, lines });
    await audit(deps!.db, g.actor, { storeId, action: "reports.reorder.requested", entityType: "Report", entityId: "products", before: null, after: { lines } }, g.ctx);
    return json({ ok: true, queued: lines.length, lines });
  } catch (e) {
    return errorResponse(e);
  }
}
