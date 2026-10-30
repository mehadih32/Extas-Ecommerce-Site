// CN-029 · PR 619 — GET / POST /api/admin/erp-link?storeId=N: Settings → ERP link (one store's own ERP link, its
// switch-over to contract v6, a new link). Every check is in lib/erp-link-admin.ts.
import { adminDeps } from '@/lib/admin-auth';
import { erpLinkHandler } from '@/lib/erp-link-admin';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return erpLinkHandler(request, adminDeps());
}

export function POST(request: Request) {
  return erpLinkHandler(request, adminDeps());
}
