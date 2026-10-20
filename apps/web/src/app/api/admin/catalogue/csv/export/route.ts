// PR 34 — the catalogue as a CSV file (never cost prices or owner data).
import { adminDeps } from '@/lib/admin-auth';
import { csvExportHandler } from '@/lib/catalogue-merch-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return csvExportHandler(request, adminDeps());
}
