// Follow-up 155 (PR 58, 75) — public, read-only: what the site-wide size guide window needs (lib/shop/size-guide-api.ts).
import { shopStoreId } from '@/lib/shop/context';
import { sizeGuideHandler } from '@/lib/shop/size-guide-api';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return sizeGuideHandler(request, shopStoreId());
}
