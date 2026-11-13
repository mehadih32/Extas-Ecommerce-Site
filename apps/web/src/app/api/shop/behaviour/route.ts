// S28 · PR 701 — the shop's public behaviour beacon: same-site only, size-capped, always 204 (lib/analytics/behaviour.ts).
import { getPrisma } from '@extas/db/client';
import { behaviourIngestHandler } from '@/lib/analytics/behaviour';
import { settingsResolver } from '@/lib/settings';
import { shopStoreId } from '@/lib/shop/store-id';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  const resolver = settingsResolver();
  return behaviourIngestHandler(request, resolver ? { db: getPrisma(), resolver, storeId: shopStoreId() } : null);
}
