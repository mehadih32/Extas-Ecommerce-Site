// Follow-up (PR 281 / 214, lane B) — the customer's delivery band when the shop already knows his place, so the
// festive cut-off line on the bag and the home page can name his own last order time (festive.ts openSlot): the
// signed-in customer's saved address (the default one first), else the place of the checkout he started in this
// browser (its draft). A place settles the band only when everything under it sits in one charged band (as the
// checkout's own resolver reads it: Bogura yes, Dhaka district no). Unknown → null, and the line names every band.
// Read-only; it changes no charge, rule or Cash on Delivery setting.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { loadBandMap } from '@extas/delivery';
import { signedIn } from './account';
import { BAG_COOKIE } from './bag-model';
import { visitorOf } from './wishlist';
import { settingsResolver, settingsTimeoutMs, withTimeout } from '../settings';

/** What `bandKeyOfArea` needs from the store's band map. */
export interface BandLookup<E> {
  gazetteer: { get(id: string | null | undefined): E | undefined };
  spanOf(entry: E): ReadonlySet<string>;
  bandOf(entry: E): { charged: { key: string } } | null;
}

/** The charged band key of a place, or null when the place is unknown or spans more than one charged band. */
export function bandKeyOfArea<E>(map: BandLookup<E>, areaId: string | null | undefined): string | null {
  const entry = map.gazetteer.get(areaId);
  if (!entry || map.spanOf(entry).size !== 1) return null;
  return map.bandOf(entry)?.charged.key ?? null;
}

/** The place the shop knows for this visitor: his saved address (default first), else his started checkout's. */
async function knownAreaId(storeId: number): Promise<string | null> {
  const db = getPrisma();
  const me = await signedIn();
  if (me) {
    const a = await db.customerAddress.findFirst({
      where: { storeId, customerId: me.customer.id, archivedAt: null, areaId: { not: null } },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: { areaId: true },
    });
    if (a?.areaId) return a.areaId;
  }
  const visitor = visitorOf((await cookies()).get(BAG_COOKIE)?.value);
  if (!visitor) return null;
  const d = await db.checkoutDraft.findFirst({
    where: { storeId, visitorId: visitor, convertedOrderId: null, areaId: { not: null } },
    orderBy: { lastActivityAt: 'desc' },
    select: { areaId: true },
  });
  return d?.areaId ?? null;
}

/** The visitor's charged band key, or null (not known, no database, or too slow): once per request. */
export const knownBand = cache(async (storeId: number): Promise<string | null> => {
  const resolver = settingsResolver();
  if (!resolver) return null;
  try {
    return await withTimeout(
      (async () => {
        const areaId = await knownAreaId(storeId);
        if (!areaId) return null;
        return bandKeyOfArea(await loadBandMap({ db: getPrisma(), settings: resolver }, storeId), areaId);
      })(),
      settingsTimeoutMs(),
    );
  } catch {
    return null;
  }
});
