// PR 607 (CN-028) — which ERP contract a store speaks: the setting `erp.model`, empty (= `v5`) until the ERP's switch
// date, then `v6` (docs/erp/site-changes-v6.md). Everything of CN-028 asks this one function, so in `v5` nothing changes.
// The switch is one-way and the owner's (`requiresOwnerOk`): only PR 619's switch-over sets it, after the dry run; set
// back to v5, nothing retired is sent again (the RETIRED rows stay, and a retired return stays settled as never sent).
// - `v6` reads only the ERP's shop price: `retailPrice` and `avgCost` are never read again (owner answer Q7);
// - `v6` never sends the retired v5 calls (`retiredInV6`: customer payments, returns, ad spend, shipment events, a
//   delivered or returned status). A retired document is kept as a RETIRED row for the record, never sent and never
//   sent again by hand (nothing is deleted, CLAUDE.md rule 3).
import { retiredInV6, type ErpDocument, type ErpModel } from '@extas/adapters';
import type { InventoryDeps } from './context';

/** The store's ERP contract (`erp.model`). */
export async function erpModelOf(deps: Pick<InventoryDeps, 'settings'>, storeId: number): Promise<ErpModel> {
  return ((await deps.settings.value('erp.model', { storeId })) as ErpModel | null) ?? 'v5';
}

export const isV6 = async (deps: Pick<InventoryDeps, 'settings'>, storeId: number): Promise<boolean> => (await erpModelOf(deps, storeId)) === 'v6';

/**
 * PR 610 (CN-033): B-grade pieces (`ProductVariant.grade` B) are not sold while the store speaks v6 and the ERP takes no
 * B-grade line (`erp.orders.bGradeOpen` off). The bag refuses them (holdCart) and the shop counts them as 0 in stock
 * (the product page, the wishlist and back-in-stock: apps/web lib/shop/product.ts, sellable.ts), so no page offers one.
 */
export async function bGradeClosed(deps: Pick<InventoryDeps, 'settings'>, storeId: number): Promise<boolean> {
  return (await isV6(deps, storeId)) && !(await deps.settings.value('erp.orders.bGradeOpen', { storeId }));
}

/** The error text a retired document carries on its row. */
export const RETIRED_V6 = 'RETIRED_V6';

/** Is this document one the store must never send any more? */
export async function retiredFor(deps: InventoryDeps, storeId: number, doc: ErpDocument): Promise<boolean> {
  return retiredInV6(doc) && (await isV6(deps, storeId));
}
