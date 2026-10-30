// PR 609 — the buying prices that changed and were not seen yet.
import { adminDeps } from '@/lib/admin-auth';
import { shopPricesHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return shopPricesHandler(request, adminDeps());
}
