// PR 204 — ERP styles the shop does not have yet.
import { adminDeps } from '@/lib/admin-auth';
import { erpStylesHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return erpStylesHandler(request, adminDeps());
}
