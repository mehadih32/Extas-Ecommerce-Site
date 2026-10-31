// S06 · PR 524 — false-positive protection, the good-customer override. While `risk.goodCustomer` is on and the owner has
// set the number, a customer whose number has at least `minDelivered` delivered orders and at most `maxRefused` refusals
// (counted as the phone history counts them: never the shop's fault, never a try-on) is a good customer. The engine
// never holds a good customer's new order by itself: the duplicate check's automatic hold and a risk level's hold are
// skipped, and so is a risk level's automatic advance request (the owner's auto option; the ask stays a proposal on the
// order for a person); the order gets a "Good customer" mark and a timeline line naming what was skipped. A review a rule opened
// still waits for a person; nothing here confirms, releases or changes an order's money (CLAUDE.md rule 6).
import { isOrdersError } from './errors';
import { historyOptions, phoneOrders } from './phone-history';
import { summarizeHistory } from './phone-summary';
import { setting, type OrdersDeps } from './context';
import { execute, type By } from './service';

/** The order flag of an order the good-customer override spared (the team's screens show it, never the customer). */
export const GOOD_CUSTOMER_FLAG = 'GOOD_CUSTOMER';
/** The timeline type of the override. */
export const GOOD_CUSTOMER_EVENT = 'order.goodCustomer';
/** What the override can skip. */
export const GOOD_CUSTOMER_SKIPS = ['duplicateHold', 'levelHold', 'levelAdvance'] as const;
export type GoodCustomerSkip = (typeof GOOD_CUSTOMER_SKIPS)[number];

export interface GoodCustomer {
  delivered: number;
  refused: number;
}

/** The order's customer is a good customer now (the switch on, the number set, the history enough); otherwise null. */
export async function goodCustomerOf(deps: OrdersDeps, ref: { storeId: number; orderId: string }): Promise<GoodCustomer | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.goodCustomer');
  if (!cfg.enabled || cfg.minDelivered === null) return null;
  const order = await deps.db.order.findFirst({ where: { storeId: ref.storeId, id: ref.orderId }, select: { phone: true, placedAt: true } });
  if (!order?.phone) return null;
  const opts = await historyOptions(deps, ref.storeId);
  const past = await phoneOrders(deps, ref.storeId, order.phone, { excludeOrderId: ref.orderId, before: order.placedAt, take: opts.take });
  const s = summarizeHistory(past, { ourFault: opts.ourFault });
  return s.delivered >= cfg.minDelivered && s.refused <= cfg.maxRefused ? { delivered: s.delivered, refused: s.refused } : null;
}

/** Writes the override on the order once per skip (a mark and a timeline line). A closed order is left as it is. */
export async function noteGoodCustomer(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, skipped: GoodCustomerSkip, good: GoodCustomer): Promise<void> {
  try {
    await execute(
      deps,
      ref,
      by,
      {
        command: 'goodCustomer',
        input: { skipped },
        effect: async (tx, o) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true } });
          const flags = row.flags.includes(GOOD_CUSTOMER_FLAG) ? row.flags : [...row.flags, GOOD_CUSTOMER_FLAG];
          return { data: { flags }, reasonCode: skipped, eventData: { skipped, ...good }, audit: { before: { flags: row.flags }, after: { flags } } };
        },
      },
      { idempotencyKey: `good-customer:${ref.orderId}:${skipped}` },
    );
  } catch (e) {
    if (!isOrdersError(e) || e.code !== 'ILLEGAL_TRANSITION') throw e;
  }
}
