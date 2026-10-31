// S21 · PR 419 (B7.3) — Reports › Site health › Run history: every smoke test and journeys run with its findings (GET,
// `health.read`); lib/admin-health/history-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { historyHandler } from '@/lib/admin-health/history-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return historyHandler(request, adminDeps());
}
