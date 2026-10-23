// PR 71 — what the wishlist's API routes run on: the database, the settings and the store the shop serves.
import { cartDeps } from './bag';
import { shopStoreId } from './context';
import type { WishDeps } from './wishlist';

export function wishApiDeps(): WishDeps | null {
  const cart = cartDeps();
  return cart ? { db: cart.db, settings: cart.settings, storeId: shopStoreId() } : null;
}
