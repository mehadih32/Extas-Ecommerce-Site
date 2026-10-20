// PR 19 — sizes: list and add.
import { adminDeps } from '@/lib/admin-auth';
import { sizesHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return sizesHandler(request, adminDeps());
}

export function POST(request: Request) {
  return sizesHandler(request, adminDeps());
}
