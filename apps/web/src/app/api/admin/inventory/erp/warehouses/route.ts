// PR 196 — the ERP warehouses this store can link its warehouses to.
import { adminDeps } from '@/lib/admin-auth';
import { erpWarehousesHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return erpWarehousesHandler(request, adminDeps());
}
