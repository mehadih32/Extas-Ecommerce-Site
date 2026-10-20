// PR 201 — warehouses: list (?includeArchived=1) and add (with the default locations and the damaged bin).
import { adminDeps } from '@/lib/admin-auth';
import { warehousesHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return warehousesHandler(request, adminDeps());
}

export function POST(request: Request) {
  return warehousesHandler(request, adminDeps());
}
