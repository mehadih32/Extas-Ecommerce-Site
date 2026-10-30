// CN-028 · PR 618 — a month's fixed costs (a new version when changed; sent by PUT /fixed-costs/{month}).
import { adminDeps } from '@/lib/admin-auth';
import { fixedCostsHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return fixedCostsHandler(request, adminDeps());
}
