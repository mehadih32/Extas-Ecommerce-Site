// S21 · PR 423 (CN-015) — Reports › Site health › Customer problems: the list for a day or a span (GET, `health.read`)
// and the recorder's numbers (PUT, `settings.write`), lib/admin-problems/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { problemsListHandler } from '@/lib/admin-problems/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return problemsListHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return problemsListHandler(request, adminDeps());
}
