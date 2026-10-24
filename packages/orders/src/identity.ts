// S05 · PR 541 (SIM-F-015) — the identity check beyond the phone number: earlier orders under ANOTHER number that look
// like the same person — the same name (letter case and outer spaces aside) and an address at least as alike as the
// owner's `risk.signals.identityMatch.addressSimilarity` (pg_trgm similarity on the stored text, PR 603's trigram
// index). The order-35 refuser with a new number is found by his name and address, and his earlier refusal is named.
// A read only, for the risk score (PR 156): nothing here changes an order or blocks anyone.
import { Prisma } from '@extas/db/client';
import type { OrdersDeps } from './context';
import { pastOrdersOf, phoneForms } from './phone-history';
import type { PastOrder } from './pure';

const DAY = 86_400_000;

/** The order fields the identity check reads. */
export const IDENTITY_SELECT = { id: true, phone: true, customerName: true, shippingAddressText: true, placedAt: true } as const;

export interface IdentityOrder {
  id: string;
  phone: string | null;
  customerName: string | null;
  shippingAddressText: string | null;
  placedAt: Date;
}

/** The earlier orders of other numbers with this order's name and an alike address (newest first, at most `take`). */
export async function identityOrders(deps: OrdersDeps, storeId: number, o: IdentityOrder, cfg: { windowDays: number; addressSimilarity: number }, take: number): Promise<PastOrder[]> {
  const name = o.customerName?.trim();
  const address = o.shippingAddressText?.trim();
  if (!name || !address || take <= 0) return [];
  const forms = phoneForms(o.phone);
  const since = cfg.windowDays > 0 ? new Date(o.placedAt.getTime() - cfg.windowDays * DAY) : new Date(0);
  const others = forms.length ? Prisma.sql`AND NOT ("phone" = ANY(${forms}::text[]))` : Prisma.empty;
  const ids = await deps.db.$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS id FROM "Order"
    WHERE "storeId" = ${storeId} AND "id" <> ${o.id}::uuid AND "status"::text <> 'DRAFT' AND "archivedAt" IS NULL
      AND "placedAt" < ${o.placedAt} AND "placedAt" >= ${since}
      AND "phone" IS NOT NULL ${others}
      AND lower(btrim("customerName")) = lower(${name})
      AND similarity(lower("shippingAddressText"), lower(${address})) >= ${cfg.addressSimilarity}::real
    ORDER BY "placedAt" DESC, "id" DESC
    LIMIT ${take}`;
  if (!ids.length) return [];
  const rows = await deps.db.order.findMany({
    where: { storeId, id: { in: ids.map((r) => r.id) } },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, number: true, placedAt: true, status: true, totalMinor: true, cancelReasonCode: true, areaId: true },
  });
  return pastOrdersOf(deps, storeId, rows);
}
