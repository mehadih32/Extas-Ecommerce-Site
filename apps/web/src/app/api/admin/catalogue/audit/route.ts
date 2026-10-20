// PR 39 — the product audit report.
import { adminDeps } from '@/lib/admin-auth';
import { productAuditHandler } from '@/lib/catalogue-tools-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return productAuditHandler(request, adminDeps());
}
