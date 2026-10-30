// CN-028 · PR 619 (follow-up 530) — a confirmed order whose v5 document never reached the ERP before its store switched to
// ERP contract v6. The switch-over (@extas/inventory erp-switchover.ts) takes such a document out of the v5 relay (kept
// FAILED `SWITCH_V5_ORDER`, never sent, never deleted); this queues the order again as its next revision, which on a v6
// store is the v6 document (one line per piece with its own line id and whole-taka customer prices, PR 610) — the same
// path as any order edit sent again (PR 127). Called by the switch itself (`erp.switchOver.queuedV5Orders` = resend) or
// by a person from the ERP link page (`hold`). Only the store's own order, only once the store speaks v6; pressed again,
// it answers the revision already queued.
import type { ErpDocument } from '@extas/adapters';
import { isV6, isV6OrderDoc, revisionOfKey } from '@extas/inventory';
import { TX, type OrdersDeps } from './context';
import { OrdersError } from './errors';
import { inventoryOf, lockOrder, queueErpOrder } from './service';

/** Queues the order again as a v6 order (its next revision); returns the ErpPush id. */
export async function resendOrderAsV6(deps: OrdersDeps, storeId: number, orderId: string): Promise<string> {
  const own = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { id: true } });
  if (!own) throw new OrdersError('NOT_FOUND', 'no such order in this store', ['orderId']);
  if (!(await isV6(inventoryOf(deps), storeId))) throw new OrdersError('ERP_MODEL', 'the store does not speak ERP contract v6 yet', ['erp.model']);
  return deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, storeId, orderId);
    const rows = await tx.erpPush.findMany({ where: { storeId, documentType: 'order.create', referenceId: orderId }, select: { id: true, idempotencyKey: true, status: true, requestBody: true } });
    const latest = rows.reduce<(typeof rows)[number] | null>((best, r) => (!best || revisionOfKey(r.idempotencyKey) > revisionOfKey(best.idempotencyKey) ? r : best), null);
    // Already queued (or sent) as a v6 order: that revision stands.
    if (latest && latest.status !== 'FAILED' && isV6OrderDoc(latest.requestBody as unknown as ErpDocument)) return latest.id;
    const next = latest ? revisionOfKey(latest.idempotencyKey) + 1 : 0;
    const id = await queueErpOrder(deps, tx, o, next || undefined);
    if (!id) throw new OrdersError('ERP_MODEL', 'an exchange order is not sent as a sale', ['orderId']);
    return id;
  }, TX);
}
