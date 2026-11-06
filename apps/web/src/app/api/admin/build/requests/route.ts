// S02 · PR 599 — Help & Build › Feature requests (GET the list or its Markdown `build.read`; POST a request or a status
// `build.report`); lib/build-api.ts, lib/feature-requests.ts.
import { adminDeps } from '@/lib/admin-auth';
import { buildRequestsHandler } from '@/lib/build-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return buildRequestsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return buildRequestsHandler(request, adminDeps());
}
