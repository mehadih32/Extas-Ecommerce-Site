// S16 · PR 343 (B3.9, "core, must not be forgotten") — every paid message writes a cost row. When the engine marks a
// message SENT with a known cost (the provider's own price, else the owner's part price; a mock send costs nothing,
// PR 291), the same transaction writes one CostEntry: the service (the channel: SMS, WHATSAPP, EMAIL), the amount in the
// store's currency, what it was for (the message log row: `refType` 'notification', `refId` its id), the template and
// provider, and the time. A prepaid balance the owner keeps for that service (PrepaidBalance, topped up on Money → Cost
// ledger) is drawn down by the same amount, so the credit left is always in view. Nothing here moves money: these are
// the shop's own records of what it spent. A cost row never feeds the ERP's daily summary (no `summaryLine`): the
// summary's cost lines stay the ones entered on Money → Costs (PR 618).
import type { Prisma } from '@extas/db/client';

/** `refType` of a message's cost row: its `refId` is the NotificationLog id. */
export const SEND_COST_REF = 'notification';
/** `module` of a message's cost row. */
export const SEND_COST_MODULE = 'messages';

export interface SendCost {
  storeId: number;
  /** The channel the message went by (the cost row's service). */
  channel: string;
  /** Minor units; nothing is written for null, zero or less. */
  costMinor: number | null;
  currency: string;
  logId: string;
  template: string | null;
  provider: string | null;
  at: Date;
}

/** The cost row's short note: the template and the provider, as far as known. */
export function sendCostDetail(template: string | null, provider: string | null): string | null {
  const parts = [template, provider].map((v) => v?.trim()).filter((v): v is string => Boolean(v));
  return parts.length ? parts.join(' · ').slice(0, 200) : null;
}

/**
 * PR 343 — write the cost row of one sent message and draw the service's prepaid balance down, inside the caller's
 * transaction (the one that marks the message SENT, so a message is costed exactly once). Returns whether a row was
 * written.
 */
export async function recordSendCost(tx: Prisma.TransactionClient, x: SendCost): Promise<boolean> {
  if (x.costMinor === null || !Number.isInteger(x.costMinor) || x.costMinor <= 0) return false;
  await tx.costEntry.create({
    data: {
      storeId: x.storeId,
      service: x.channel,
      module: SEND_COST_MODULE,
      amountMinor: x.costMinor,
      currency: x.currency,
      refType: SEND_COST_REF,
      refId: x.logId,
      detail: sendCostDetail(x.template, x.provider),
      source: 'system',
      occurredAt: x.at,
    },
  });
  await tx.prepaidBalance.updateMany({ where: { storeId: x.storeId, service: x.channel }, data: { balanceMinor: { decrement: x.costMinor } } });
  return true;
}
