// The store the shop serves (PR 40): the mother store, or another one the server names (technical, like the DB
// address). Its own file so the proxy (src/proxy.ts, PR 235) can read it without the page context.
import { MOTHER_STORE_ID } from '@extas/db/client';

export function shopStoreId(): number {
  const n = Number.parseInt(process.env.SHOP_STORE_ID ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : MOTHER_STORE_ID;
}
