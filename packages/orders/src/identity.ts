// S05 · PR 541 (SIM-F-015) — the identity check beyond the phone number: earlier orders under ANOTHER number that look
// like the same person — the same name (letter case and outer spaces aside) and an address at least as alike as the
// owner's `risk.signals.identityMatch.addressSimilarity` (pg_trgm similarity on the stored text, PR 603's trigram
// index). The order-35 refuser with a new number is found by his name and address, and his earlier refusal is named.
// A read only, for the risk score (PR 156): nothing here changes an order or blocks anyone.
// PR 159: the same for the device (the shop's own random device id) and the connection (IP) the checkout kept
// (`risk.capture`); once the purge job has cleared them after the owner's days, nothing matches any more.
import { Prisma } from '@extas/db/client';
import type { OrdersDeps } from './context';
import { pastOrdersOf, phoneForms } from './phone-history';
import type { PastOrder } from './pure';

const DAY = 86_400_000;

/** The order fields the identity check reads. */
export const IDENTITY_SELECT = { id: true, phone: true, customerName: true, shippingAddressText: true, placedAt: true, deviceId: true, ip: true } as const;

export interface IdentityOrder {
  id: string;
  phone: string | null;
  customerName: string | null;
  shippingAddressText: string | null;
  placedAt: Date;
  deviceId?: string | null;
  ip?: string | null;
}

const HOUR = 3_600_000;

/** PR 159: the earlier orders from this order's device under another number (newest first, at most `take`). */
export async function deviceOrders(deps: OrdersDeps, storeId: number, o: IdentityOrder, cfg: { windowDays: number }, take: number): Promise<PastOrder[]> {
  if (!o.deviceId || take <= 0) return [];
  const forms = phoneForms(o.phone);
  const since = cfg.windowDays > 0 ? new Date(o.placedAt.getTime() - cfg.windowDays * DAY) : undefined;
  const rows = await deps.db.order.findMany({
    where: {
      storeId,
      id: { not: o.id },
      deviceId: o.deviceId,
      status: { not: 'DRAFT' },
      archivedAt: null,
      placedAt: { lt: o.placedAt, ...(since ? { gte: since } : {}) },
      phone: { not: null, ...(forms.length ? { notIn: forms } : {}) },
    },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take,
    select: { id: true, number: true, placedAt: true, status: true, totalMinor: true, cancelReasonCode: true, areaId: true },
  });
  return rows.length ? pastOrdersOf(deps, storeId, rows) : [];
}

/** PR 159: how many OTHER numbers ordered from this order's connection in the hours before it, and the latest such order. */
export async function ipPhoneCount(deps: OrdersDeps, storeId: number, o: IdentityOrder, cfg: { withinHours: number }): Promise<{ phones: number; latest: string | null }> {
  if (!o.ip) return { phones: 0, latest: null };
  const forms = phoneForms(o.phone);
  const where = {
    storeId,
    id: { not: o.id },
    ip: o.ip,
    status: { not: 'DRAFT' as const },
    archivedAt: null,
    placedAt: { lte: o.placedAt, gte: new Date(o.placedAt.getTime() - cfg.withinHours * HOUR) },
    phone: { not: null, ...(forms.length ? { notIn: forms } : {}) },
  };
  const [phones, latest] = await Promise.all([
    deps.db.order.findMany({ where, distinct: ['phone'], select: { phone: true } }),
    deps.db.order.findFirst({ where, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], select: { number: true } }),
  ]);
  return { phones: phones.length, latest: latest?.number ?? null };
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
