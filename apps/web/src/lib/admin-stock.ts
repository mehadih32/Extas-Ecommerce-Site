// S09 · PR 202–207 — what the stock pages read on the server before they draw: the inventory services as the signed-in
// person in the mother store (the same checks the API makes). The text helpers they share with their buttons are in
// components/admin/stock/text.ts.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { PermissionKey } from '@extas/auth';
import type { InventoryDeps, Who } from '@extas/inventory';
import type { PageAccess } from './admin-page';
import { inventoryDeps } from './inventory-api';

type Ok = Extract<PageAccess, { kind: 'ok' }>;

export interface StockAccess {
  deps: InventoryDeps;
  who: Who;
  storeId: number;
  can: (p: PermissionKey) => boolean;
}

/** The inventory services' deps and "who" for this page's person (the mother store until store pickers come). */
export async function stockAccess(access: Ok): Promise<StockAccess> {
  const storeId = MOTHER_STORE_ID;
  return {
    deps: await inventoryDeps(access.deps),
    who: { actor: access.guard.actor, storeId, ctx: access.guard.ctx },
    storeId,
    can: (p) => access.guard.permissions?.has(p) ?? false,
  };
}
