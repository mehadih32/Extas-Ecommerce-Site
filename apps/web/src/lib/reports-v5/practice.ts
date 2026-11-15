// PR 798 (CN-049): the v5 report loaders read orders and customers straight from the tables, so they apply the practice switch themselves —
// a practice record counts only while practice mode (`practice.enabled`) is on, exactly like every figure built on `basisWhere`.
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { AdminDeps } from '../admin-auth';

/** The extra `where` for orders, customers and the like: nothing while practice mode is on, else "not a practice record". */
export type PracticeScope = { isPractice?: false };

export async function practiceScope(deps: Pick<AdminDeps, 'resolver'>): Promise<PracticeScope> {
  const v = (await deps.resolver.value('practice.enabled', { storeId: MOTHER_STORE_ID })) as { on?: boolean } | null;
  return v?.on ? {} : { isPractice: false };
}
