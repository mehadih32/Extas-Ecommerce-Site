// S14 · PR 296 — the customer turns his points into wallet credit (My account › Rewards; lib/shop/points-api.ts).
import { accountApiDeps } from '@/lib/shop/account';
import { pointsHandler } from '@/lib/shop/points-api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return pointsHandler(request, accountApiDeps());
}
