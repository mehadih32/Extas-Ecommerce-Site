// PR 112 — public: keep a discount code on the bag, or take it off.
import { codeHandler } from '@/lib/shop/bag-api';
import { bagApiDeps } from '@/lib/shop/bag-deps';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return codeHandler(request, bagApiDeps());
}

export function DELETE(request: Request) {
  return codeHandler(request, bagApiDeps());
}
