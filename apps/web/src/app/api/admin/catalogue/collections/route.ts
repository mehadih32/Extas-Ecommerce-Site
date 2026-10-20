// PR 32 — collections: list; add one.
import { adminDeps } from '@/lib/admin-auth';
import { collectionsHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return collectionsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return collectionsHandler(request, adminDeps());
}
