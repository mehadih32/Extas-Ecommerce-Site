// PR 854 — Reports › Schedule on one report: read (GET) and save (POST) its schedule.
import { adminDeps } from "@/lib/admin-auth";
import { reportScheduleHandler } from "@/lib/report-schedule-api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return reportScheduleHandler(request, adminDeps());
}

export function POST(request: Request) {
  return reportScheduleHandler(request, adminDeps());
}
