// S18 · PR 384 — SET-03 Policies & texts: the page's data (GET, `settings.read`) and one help page saved (PUT,
// `settings.write`), lib/admin-policies/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { policiesHandler } from '@/lib/admin-policies/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return policiesHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return policiesHandler(request, adminDeps());
}
