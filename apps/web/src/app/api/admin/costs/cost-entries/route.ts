// CN-028 · PR 618 — one cost on a daily summary line (packaging, accessories, payment and COD fees …).
import { adminDeps } from '@/lib/admin-auth';
import { costEntriesHandler } from '@/lib/costs-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return costEntriesHandler(request, adminDeps());
}
