// S28 · PR 686 — Products › Shop ranking: the order as it would be now (GET) and "Save this order" / pin (POST).
import { adminDeps } from '@/lib/admin-auth';
import { rankingHandler } from '@/lib/shop-ranking-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return rankingHandler(request, adminDeps());
}

export function POST(request: Request) {
  return rankingHandler(request, adminDeps());
}
