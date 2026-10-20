// PR 202 — the open low-stock alerts on the shared number.
import { adminDeps } from '@/lib/admin-auth';
import { lowStockHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return lowStockHandler(request, adminDeps());
}
