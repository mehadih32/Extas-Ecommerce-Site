// S28 · PR 686 — Products › Shop ranking › More options (days that count as new, healthy stock, the order by itself).
import { adminDeps } from '@/lib/admin-auth';
import { rankingOptionsHandler } from '@/lib/shop-ranking-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return rankingOptionsHandler(request, adminDeps());
}

export function PUT(request: Request) {
  return rankingOptionsHandler(request, adminDeps());
}
