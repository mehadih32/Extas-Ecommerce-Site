// S21 · PR 417 (REP-07c) — Reports › Site health › Speed: the page's data (GET, `health.read`), how many months it shows
// (PUT) and "Measure now" (POST), both `settings.write`; lib/admin-health/speed-api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { speedHandler } from '@/lib/admin-health/speed-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return speedHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return speedHandler(request, adminDeps());
}

export function POST(request: Request) {
  return speedHandler(request, adminDeps());
}
