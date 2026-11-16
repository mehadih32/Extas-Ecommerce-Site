// PR 961 — Stock › "Ask ERP to restock": save a restock request for one product (`inventory.sync`; lib/stock-restock-api.ts).
import { adminDeps } from "@/lib/admin-auth";
import { stockRestockHandler } from "@/lib/stock-restock-api";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return stockRestockHandler(request, adminDeps());
}
