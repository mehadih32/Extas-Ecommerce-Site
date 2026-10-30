// CN-028 · PR 618 — "More options" of Money → Costs: the cost lines this store never has (erp.summary.noCostLines).
import { adminDeps } from '@/lib/admin-auth';
import { noCostLinesHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return noCostLinesHandler(request, adminDeps());
}
