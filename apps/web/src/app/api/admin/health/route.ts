// S21 · PR 413 — Reports › Site health: the hub's lines (GET, `health.read`) and when a line turns yellow (PUT,
// `settings.write`), lib/admin-health/api.ts. PR 414: when the saved journeys run (PUT) and "Run now" (POST), both
// `settings.write`.
import { adminDeps } from '@/lib/admin-auth';
import { healthHandler } from '@/lib/admin-health/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return healthHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return healthHandler(request, adminDeps());
}

export function POST(request: Request) {
  return healthHandler(request, adminDeps());
}
