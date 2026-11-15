// PR 863 — Reports › Products: save a reorder request for the ERP (`inventory.erp`; lib/report-reorder-api.ts).
import { adminDeps } from "@/lib/admin-auth";
import { reportReorderHandler } from "@/lib/report-reorder-api";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return reportReorderHandler(request, adminDeps());
}
