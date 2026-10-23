// PR 110 — public: the answer to the bag's "same product in two sizes" card.
import { sizeAnswerHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return sizeAnswerHandler(request, bagApiDeps());
}
