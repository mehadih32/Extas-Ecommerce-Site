// PR 98, 100 — public: put a set the customer built ("Build your own set") in the bag.
import { builtSetHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return builtSetHandler(request, bagApiDeps());
}
