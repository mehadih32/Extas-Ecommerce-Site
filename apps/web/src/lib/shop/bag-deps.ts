// PR 105 — what the bag's API routes run on: the engines' dependencies and the store the shop serves.
import type { BagApiDeps } from './bag-api';
import { cartDeps } from './bag';
import { shopStoreId } from './context';

export function bagApiDeps(): BagApiDeps | null {
  const cart = cartDeps();
  return cart ? { cart, storeId: shopStoreId() } : null;
}
