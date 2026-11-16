// PR 1040 (final round D14) — the history of the changes of a salary or monthly cost (who, when, why), read-only.
import { adminDeps } from '@/lib/admin-auth';
import { staffHistoryHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return staffHistoryHandler(request, adminDeps());
}
