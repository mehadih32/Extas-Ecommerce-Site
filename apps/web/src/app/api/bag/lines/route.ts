// PR 105 — public: put an item in the bag (the bag is made on the first add; the visitor's cookie names it).
import { addLineHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return addLineHandler(request, bagApiDeps());
}
