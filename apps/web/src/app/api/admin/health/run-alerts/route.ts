// S21 · PR 424 (B7.3) — Reports › Site health › Run history: "Telegram when a test fails" (GET `health.read`, PUT
// `settings.write`); lib/admin-health/run-alerts-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { runAlertsHandler } from '@/lib/admin-health/run-alerts-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return runAlertsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return runAlertsHandler(request, adminDeps());
}
