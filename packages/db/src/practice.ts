// S28 · PR 706 (CN-049) — the cheap "never leaves the system" check for practice records. A practice record is a row whose
// `isPractice` is true (orders, customers, shipments, payments, courier payouts and claims, incomplete orders, sample
// products). Every path that would send something outside — the ERP relay, a customer message, a courier booking, an
// ad or conversion feed — asks here first and skips the practice row. One small read, no setting needed: the flag
// itself is the truth.
import type { PrismaClient } from '@prisma/client';

/** The reason written on a row that was skipped because it is a practice record. */
export const PRACTICE_SKIPPED = 'PRACTICE_RECORD'; // hardcode-ok: a reason code, not a text

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Db = Pick<PrismaClient, 'order' | 'customer'>;

/** Which of these order ids are practice orders (ids that are not UUIDs are ignored). */
export async function practiceOrderIds(db: Pick<PrismaClient, 'order'>, ids: readonly (string | null | undefined)[]): Promise<Set<string>> {
  const clean = [...new Set(ids.filter((x): x is string => !!x && UUID.test(x)))];
  if (!clean.length) return new Set();
  const rows = await db.order.findMany({
    where: { id: { in: clean }, isPractice: true },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function isPracticeOrder(db: Pick<PrismaClient, 'order'>, id: string | null | undefined): Promise<boolean> {
  return (await practiceOrderIds(db, [id])).size > 0;
}

/** A message row, a parcel or a feed line belongs to practice when its order or its customer does. */
export async function isPracticeRef(db: Db, ref: { orderId?: string | null; customerId?: string | null }): Promise<boolean> {
  if (await isPracticeOrder(db, ref.orderId)) return true;
  if (ref.customerId && UUID.test(ref.customerId))
    return (
      (await db.customer.count({
        where: { id: ref.customerId, isPractice: true },
      })) > 0
    );
  return false;
}

/** The phone numbers practice customers get: 010 is not a mobile operator code, so nothing can ever reach a real person. */
export const PRACTICE_PHONE_PREFIX = '+88010'; // hardcode-ok: a reserved, unassigned prefix by design
