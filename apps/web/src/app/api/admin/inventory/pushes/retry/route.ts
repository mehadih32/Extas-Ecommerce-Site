// PR 206 — send failed, dead or skipped documents again (same idempotency key).
import { adminDeps } from '@/lib/admin-auth';
import { pushesRetryHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return pushesRetryHandler(request, adminDeps());
}
