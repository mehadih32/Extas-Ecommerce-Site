// S18 · PR 380 — SET-04d Sign-in & security: the page's data (GET, `security.read`) and one card saved (PUT,
// `security.write`), lib/admin-security/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { securityHandler } from '@/lib/admin-security/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return securityHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return securityHandler(request, adminDeps());
}
