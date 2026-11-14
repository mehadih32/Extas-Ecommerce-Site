// PR 725 — practice products in the checkout. A product flagged `isPractice` is sample data the owner orders from to
// practise (CN-049, owner's decision of 15 Nov 2026). An order is all practice or all real: a bag that mixes the two is
// refused (CheckoutError PRACTICE_MIXED), because a practice order never leaves the system and a real one always does.
import type { PrismaClient } from '@extas/db/client';

export type PracticeKind = 'practice' | 'real' | 'mixed';

/** Is this bag's set of products all practice, all real, or mixed? A line with no product counts as real. */
export async function practiceKindOf(db: Pick<PrismaClient, 'product'>, storeId: number, productIds: readonly (string | null)[]): Promise<PracticeKind> {
  if (productIds.some((p) => p === null) && productIds.length > 0) {
    const known = productIds.filter((p): p is string => p !== null);
    if (!known.length) return 'real';
    const some = await db.product.count({ where: { storeId, id: { in: [...new Set(known)] }, isPractice: true } });
    return some > 0 ? 'mixed' : 'real';
  }
  const ids = [...new Set(productIds.filter((p): p is string => p !== null))];
  if (!ids.length) return 'real';
  const rows = await db.product.findMany({ where: { storeId, id: { in: ids } }, select: { isPractice: true } });
  const practice = rows.filter((r) => r.isPractice).length;
  if (practice === 0) return 'real';
  return practice === ids.length && rows.length === ids.length ? 'practice' : 'mixed';
}
