// PR 58 — public: Find My Size's answers for the size reports (lib/shop/size-finder-api.ts).
import { cartDeps } from '@/lib/shop/bag';
import { shopStoreId } from '@/lib/shop/context';
import { productData } from '@/lib/shop/product';
import { sizeFinderHandler, type FinderDeps } from '@/lib/shop/size-finder-api';

export const dynamic = 'force-dynamic';

function deps(): FinderDeps | null {
  const cart = cartDeps();
  return cart ? { db: cart.db, settings: cart.settings, storeId: shopStoreId(), product: productData } : null;
}

export function POST(request: Request) {
  return sizeFinderHandler(request, deps());
}

export function PATCH(request: Request) {
  return sizeFinderHandler(request, deps());
}
