// PR 32 — tags: list; add one.
import { adminDeps } from '@/lib/admin-auth';
import { tagsHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return tagsHandler(request, adminDeps());
}

export function POST(request: Request) {
  return tagsHandler(request, adminDeps());
}
