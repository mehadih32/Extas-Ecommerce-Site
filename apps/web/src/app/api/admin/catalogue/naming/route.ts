// PR 590 — the naming table: every product with its name, link and titles.
import { adminDeps } from '@/lib/admin-auth';
import { namingListHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return namingListHandler(request, adminDeps());
}
