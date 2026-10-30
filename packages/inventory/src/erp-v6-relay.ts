// PR 610, 611 (CN-028) — what the document relay (erp-push.ts, PR 199/200) does in addition for a v6 document: the
// ERP's answer kept where the books and the order page read it, and the refusals that mean "not now" held. One small
// table, so the relay itself stays as PR 199 and 200 built it for v5. PR 612–614 add their own answers here
// (`AFTER_SENT`: a return list's parcels, an exchange's id and risk).
import { afterV6OrderSent, cancelledBeforeSent, holdV6Refusal, type PushRow } from './erp-orders-v6';
import { afterDeliverySent, afterShipmentSent } from './erp-shipments-v6';
import { errorText } from './sync';
import type { InventoryDeps } from './context';

type AfterSent = (deps: InventoryDeps, row: PushRow, answer: unknown) => Promise<void>;

/** Per document type: what is kept from the ERP's answer. */
export const AFTER_SENT: Partial<Record<string, AfterSent>> = {
  'order.create': afterV6OrderSent,
  'order.line': afterV6OrderSent,
  'shipment.create': afterShipmentSent,
  'order.delivery': afterDeliverySent,
};

/** The v6 documents that wait for their order to be at the ERP first (the order must exist there). */
export const WAITS_FOR_ORDER: ReadonlySet<string> = new Set(['shipment.create', 'order.delivery', 'order.line']);

/** After a send: the answer kept (a broken answer is noted on the row, never undoes the send). */
export async function afterSent(deps: InventoryDeps, row: PushRow, answer: unknown): Promise<void> {
  const fn = AFTER_SENT[row.documentType];
  if (!fn) return;
  try {
    await fn(deps, row, answer);
  } catch (e) {
    await deps.db.erpPush.update({ where: { id: row.id }, data: { lastError: `ANSWER_UNREAD: ${errorText(e)}`.slice(0, 500) } });
  }
}

export { cancelledBeforeSent, holdV6Refusal };
