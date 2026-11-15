// Parity round 3, lane F6 · PR 866 — Marketing › Shopping feed's two buttons (lib/marketing/shopping-feed.ts).
import { adminDeps } from '@/lib/admin-auth';
import { shoppingFeedHandler } from '@/lib/marketing/shopping-feed';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return shoppingFeedHandler(request, adminDeps());
}
