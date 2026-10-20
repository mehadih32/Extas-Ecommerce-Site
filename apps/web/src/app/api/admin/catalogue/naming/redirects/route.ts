// PR 590 — old links that forward (301): list, and add one by hand.
import { adminDeps } from '@/lib/admin-auth';
import { redirectsHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return redirectsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return redirectsHandler(request, adminDeps());
}
