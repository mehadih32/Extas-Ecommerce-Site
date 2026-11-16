// PR 961 (admin prototype v5, Stock › Running out soon, "Ask ERP to restock") — the restock request's admin API. Needs
// `inventory.sync` (the ERP actions on the Stock page); the store is `?storeId=`.
//
//   POST  /api/admin/inventory/restock   {productId}   →   {ok, productId, name}
//
// The request is saved in the audit log with the person's name (`inventory.restock.requested`). The ERP contract
// (docs/erp/site-changes-v6.md) has no restock document yet, so nothing is sent to the ERP from here and nothing is bought:
// the ERP's own reorder list picks the saved request up when that document exists (a mock until then, A1.3). Nothing goes
// to a buyer or a supplier.
import { audit } from "@extas/auth";
import { MOTHER_STORE_ID } from "@extas/db/client";
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from "./admin-auth";

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get("storeId");
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function stockRestockHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== "POST") return fail(405, "method-not-allowed");
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, "invalid-store-id");
  const g = await guardAdmin(request, deps, { permission: "inventory.sync", storeId });
  if (g instanceof Response) return g;
  try {
    const b = (await body(request)) as { productId?: unknown };
    if (typeof b.productId !== "string" || !b.productId) return fail(400, "INVALID_INPUT");
    const product = await deps!.db.product.findFirst({ where: { storeId, id: b.productId }, select: { id: true, nameEn: true } });
    if (!product) return fail(404, "NOT_FOUND");
    await audit(deps!.db, g.actor, { storeId, action: "inventory.restock.requested", entityType: "Product", entityId: product.id, before: null, after: { productId: product.id, name: product.nameEn } }, g.ctx);
    return json({ ok: true, productId: product.id, name: product.nameEn });
  } catch (e) {
    return errorResponse(e);
  }
}
