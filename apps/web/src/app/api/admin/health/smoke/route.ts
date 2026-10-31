// S21 · PR 418 (REP-07e) — Reports › Site health › Smoke runs: the newest kept run after a deploy or on the schedule,
// page by page (GET, `health.read`); lib/admin-health/smoke-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { smokeHandler } from '@/lib/admin-health/smoke-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return smokeHandler(request, adminDeps());
}
