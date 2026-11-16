// PR 973 (prototype v5, Orders › Returns & exchanges): the three reminders that come from the courier side, beside the
// exchange ones in lens.ts. Counts only, read-only, never changes anything:
//   partial: orders the courier says were partly delivered and that nobody has settled yet;
//   short:   open claims for a returned parcel that came back short, not yet sent to the courier;
//   money:   Cash on Delivery orders the courier says were delivered, with no money in after the courier's own days to pay
//            (the owner's "delivery.courier.claimTerms" days; with that switch off there is no rule, so 0).
import type { Prisma } from '@extas/db/client';

export interface CourierReminders {
  partial: number;
  short: number;
  money: number;
}

type Db = Pick<Prisma.TransactionClient, 'order' | 'courierClaim'>;

/** `terms`: the owner's `delivery.courier.claimTerms` setting (read by the page). */
export async function courierReminders(db: Db, terms: { deadlineEnabled: boolean; days: number }, storeId: number, now: Date): Promise<CourierReminders> {
  const overdueBefore = new Date(now.getTime() - terms.days * 86_400_000);
  const [partial, short, money] = await Promise.all([
    db.order.count({ where: { storeId, status: 'PARTIALLY_DELIVERED' } }),
    db.courierClaim.count({ where: { storeId, kind: 'RETURN_SHORT', status: 'OPEN', sentAt: null } }),
    terms.deadlineEnabled ? db.order.count({ where: { storeId, status: 'DELIVERED', paymentMethod: 'COD', paidMinor: { lt: 1 }, deliveredAt: { lt: overdueBefore } } }) : Promise.resolve(0),
  ]);
  return { partial, short, money };
}
