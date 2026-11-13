// S28 · PR 684 — is this product a demo (sample) one? Read-only and public; without a database (CI's build) or when it is
// slow: no, never a guess. A demo product's page is never indexed by search engines.
import { cache } from 'react';
import { getPrisma } from '@extas/db/client';
import { settingsTimeoutMs, withTimeout } from '../settings';

export async function isDemoProduct(storeId: number, productId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const row = await withTimeout(getPrisma().product.findFirst({ where: { id: productId, storeId }, select: { isDemo: true } }), settingsTimeoutMs());
    return row?.isDemo === true;
  } catch {
    return false;
  }
}

export const isDemoProductOnce = cache(isDemoProduct);
