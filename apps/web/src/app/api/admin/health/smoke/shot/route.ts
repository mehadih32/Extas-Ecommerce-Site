// S21 · PR 418 (REP-07e) — one page's picture from a kept smoke run (GET ?run=&file=, `health.read`; an admin page's
// picture also `health.smoke.shots`); lib/admin-health/smoke-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { smokeShotHandler } from '@/lib/admin-health/smoke-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return smokeShotHandler(request, adminDeps());
}
