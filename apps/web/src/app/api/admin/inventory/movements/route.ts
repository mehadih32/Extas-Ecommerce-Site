// PR 207 — the stock movement report (?from=&to=&sku=&locationId=).
import { adminDeps } from '@/lib/admin-auth';
import { movementsHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return movementsHandler(request, adminDeps());
}
