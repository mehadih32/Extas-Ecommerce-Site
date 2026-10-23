// PR 71 — public: this browser's wishlist (lib/shop/wishlist.ts).
import { wishApiDeps } from '@/lib/shop/wish-deps';
import { wishlistHandler } from '@/lib/shop/wishlist';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return wishlistHandler(request, wishApiDeps());
}

export function POST(request: Request) {
  return wishlistHandler(request, wishApiDeps());
}

export function DELETE(request: Request) {
  return wishlistHandler(request, wishApiDeps());
}
