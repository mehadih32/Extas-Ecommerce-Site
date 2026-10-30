// CN-028 · PR 618 — Money → Costs: the months' fixed costs, the open days' cost entries and the lines never had.
import { adminDeps } from '@/lib/admin-auth';
import { costsHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return costsHandler(request, adminDeps());
}
