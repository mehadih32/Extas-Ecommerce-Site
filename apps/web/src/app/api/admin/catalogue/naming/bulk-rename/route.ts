// PR 590 — bulk rename: preview first, then apply with the hash.
import { adminDeps } from '@/lib/admin-auth';
import { bulkRenameHandler } from '@/lib/catalogue-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return bulkRenameHandler(request, adminDeps());
}
