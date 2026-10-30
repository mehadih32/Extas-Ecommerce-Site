// PR 609 — "seen": the admin has looked at these changed buying prices.
import { adminDeps } from '@/lib/admin-auth';
import { shopPricesSeenHandler } from '@/lib/inventory-api';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return shopPricesSeenHandler(request, adminDeps());
}
