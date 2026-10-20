// PR 34 — CSV import: preview first, then apply with the preview's hash.
import { adminDeps } from '@/lib/admin-auth';
import { csvImportHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return csvImportHandler(request, adminDeps());
}
