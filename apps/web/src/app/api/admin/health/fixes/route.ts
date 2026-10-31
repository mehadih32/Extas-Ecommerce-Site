// S21 · PR 420 (B7.3) — Reports › Site health › Fixes to approve: the page's data (GET, `health.read`), the gate's
// switches (PUT, `settings.write`), proposals, decisions and re-test outcomes (POST); lib/admin-health/fixes-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { fixesHandler } from '@/lib/admin-health/fixes-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return fixesHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return fixesHandler(request, adminDeps());
}

export function POST(request: Request) {
  return fixesHandler(request, adminDeps());
}
