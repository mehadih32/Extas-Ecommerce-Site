// PR 670 (owner decision 13 Nov 2026) — Steadfast is the shop's default courier, always. A new or re-applied store gets a
// Steadfast courier account with the default pack, so the Couriers section and a booking have it from the first minute
// (the adapter runs on its practice world until the owner types the keys in, A1.3). This is the seed's copy of
// `ensureSteadfastCourier` in packages/shipping/src/accounts.ts (the shipping package cannot be imported here: it
// depends on this one); the two stay the same and `couriers.test.ts` holds the rules. Idempotent: nothing is added when
// the store already has a live Steadfast account (adapter key or name, any case); nothing is ever changed or removed.
import type { Prisma } from '@extas/db/client';

/** The adapter key of the default courier (the setting `delivery.couriers.defaultCourierId` can name another one later). */
export const DEFAULT_COURIER_PROVIDER = 'steadfast';

type Db = Pick<Prisma.TransactionClient, 'courierAccount'>;

export async function ensureSteadfastCourier(db: Db, storeId: number): Promise<{ id: string; created: boolean }> {
  const rows = await db.courierAccount.findMany({ where: { storeId, archivedAt: null }, select: { id: true, providerKey: true, name: true }, orderBy: { createdAt: 'asc' } });
  const id = rows.find((r) => r.providerKey.toLowerCase() === DEFAULT_COURIER_PROVIDER || r.name.toLowerCase().includes(DEFAULT_COURIER_PROVIDER))?.id;
  if (id) return { id, created: false };
  const r = await db.courierAccount.create({ data: { storeId, providerKey: DEFAULT_COURIER_PROVIDER, name: 'Steadfast', enabled: true }, select: { id: true } });
  return { id: r.id, created: true };
}
