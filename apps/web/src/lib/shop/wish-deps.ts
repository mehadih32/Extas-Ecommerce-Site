// PR 71 — what the wishlist's API routes run on: the database, the settings and the store the shop serves; follow-up 71:
// the signed-in customer of the request (his account's list).
import { accountDeps, customerOfRequest } from './account';
import { cartDeps } from './bag';
import { shopStoreId } from './context';
import type { WishDeps } from './wishlist';

export function wishApiDeps(): WishDeps | null {
  const cart = cartDeps();
  if (!cart) return null;
  const storeId = shopStoreId();
  const accounts = accountDeps();
  return { db: cart.db, settings: cart.settings, storeId, customerOf: async (request) => (await customerOfRequest(request, accounts, storeId))?.customer.id ?? null };
}
