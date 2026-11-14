// PR 718 — Website › Policies: the tab's data (GET, `website.read`) and a save / publish / restore (PUT, `settings.write`),
// lib/website-policies/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { websitePoliciesHandler } from '@/lib/website-policies/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return websitePoliciesHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return websitePoliciesHandler(request, adminDeps());
}
