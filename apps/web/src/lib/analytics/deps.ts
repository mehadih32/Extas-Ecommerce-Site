// S15 · PR 338 — what the analytics beacon's API route runs on: the database, the settings resolver and the
// signed-in customer lookup (the same dependency shape wish-deps.ts already builds for the wishlist's own API).
import { getPrisma } from '@extas/db/client';
import { accountDeps } from '../shop/account';
import { shopStoreId } from '../shop/store-id';
import { settingsResolver } from '../settings';
import type { AnalyticsApiDeps } from './ingest';

export function analyticsApiDeps(): AnalyticsApiDeps | null {
  const resolver = settingsResolver();
  if (!resolver) return null;
  return { analytics: { db: getPrisma() }, accounts: accountDeps(), resolver, storeId: shopStoreId() };
}
