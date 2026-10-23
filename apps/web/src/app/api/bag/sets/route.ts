// PR 91, 95 — public: put a set in the bag (POST), or change the colours and sizes of a set already in it (PATCH).
import { setHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return setHandler(request, bagApiDeps());
}

export function PATCH(request: Request) {
  return setHandler(request, bagApiDeps());
}
