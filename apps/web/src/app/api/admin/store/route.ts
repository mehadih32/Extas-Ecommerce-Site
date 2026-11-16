// S18 · PR 383 — SET-01 Store details: the page's data (GET, `settings.read`) and the legal numbers saved (PUT,
// `settings.write`), lib/admin-store/api.ts.
import { adminDeps } from '@/lib/admin-auth';
import { storeHandler } from '@/lib/admin-store/api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return storeHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return storeHandler(request, adminDeps());
}

// PR 991: POST {domain, pin} changes the web address (owner's PIN).
export function POST(request: Request) {
  return storeHandler(request, adminDeps());
}
