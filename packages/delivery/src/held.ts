// PR 561 (S04) — the address the shop already holds for a phone number, for the silent backfill at checkout. Never
// shown to the person typing and never prefilled: the checkout uses its place only to settle the band of a line that
// names none, and attaches the full line to the order in the backend for packing.
// - From the customer with that number (not erased or archived): his default saved address with a place, else his
//   latest one. Without one, and when the owner allows it, the latest earlier order of that number that had a place
//   and was not "address unclear" — delivered only, or any order not cancelled or returned.
// - Each look-up counts against the phone-first limit per IP (delivery.phoneFirst.rateLimit in
//   delivery.phoneFirst.rateWindowSeconds), as distinct numbers: asking about the same number again is free, a new
//   number past the limit gets nothing (and the customer is simply asked, as without the backfill). The SecurityEvent
//   keeps the IP and a hash of the number, never the number.
import { createHash } from 'node:crypto';
import type { DeliveryDeps } from './context';
import { phoneNormalizeBD } from './phone';

export const BACKFILL_LOOKUP_EVENT = 'checkout.backfill.lookup';

export type HeldOrders = 'off' | 'delivered' | 'placed';

export interface HeldAddress {
  /** The gazetteer place the held address was read as (the resolver's `savedAreaId`). */
  areaId: string;
  /** The full line as the shop holds it. */
  line: string;
  from: 'saved' | 'order';
}

const clock = (deps: DeliveryDeps) => (deps.now ? deps.now() : new Date());
const hashOf = (e164: string) => createHash('sha256').update(e164).digest('hex');

/** True while this IP may look up this number (a number already asked about in the window is not counted again). */
async function allowLookup(deps: DeliveryDeps, storeId: number, ip: string | null, e164: string): Promise<boolean> {
  const [limit, windowSeconds] = await Promise.all([deps.settings.value('delivery.phoneFirst.rateLimit'), deps.settings.value('delivery.phoneFirst.rateWindowSeconds')]);
  const now = clock(deps);
  const at = ip ?? 'unknown';
  const key = hashOf(e164);
  const rows = await deps.db.securityEvent.findMany({
    where: { kind: BACKFILL_LOOKUP_EVENT, createdAt: { gt: new Date(now.getTime() - windowSeconds * 1000) }, details: { path: ['ip'], equals: at } },
    select: { details: true },
    take: limit + 1,
  });
  const keys = new Set(rows.map((r) => (r.details as { key?: unknown } | null)?.key));
  if (keys.has(key)) return true;
  if (keys.size >= limit) return false;
  await deps.db.securityEvent.create({ data: { storeId, kind: BACKFILL_LOOKUP_EVENT, severity: 'info', details: { ip: at, key }, createdAt: now } });
  return true;
}

const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;
const NOT_PLACED = ['DRAFT', 'CANCELLED', 'RETURNED'] as const;

/** The full address the shop holds for this number, or null (none, not allowed, or past the per-IP limit). */
export async function heldAddress(deps: DeliveryDeps, storeId: number, phone: string, opts: { orders: HeldOrders; ip?: string | null }): Promise<HeldAddress | null> {
  const p = phoneNormalizeBD(phone);
  if (!p.ok) return null;
  if (!(await allowLookup(deps, storeId, opts.ip ?? null, p.e164))) return null;
  const c = await deps.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: p.e164 } }, select: { id: true, erasedAt: true, archivedAt: true } });
  if (c?.erasedAt) return null;
  if (c && !c.archivedAt) {
    const saved = await deps.db.customerAddress.findFirst({
      where: { storeId, customerId: c.id, archivedAt: null, areaId: { not: null } },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      select: { areaId: true, addressLine: true },
    });
    if (saved?.areaId && saved.addressLine.trim()) return { areaId: saved.areaId, line: saved.addressLine.trim(), from: 'saved' };
  }
  if (opts.orders === 'off') return null;
  const o = await deps.db.order.findFirst({
    where: {
      storeId,
      phone: p.e164,
      areaId: { not: null },
      addressUnclear: false,
      status: opts.orders === 'delivered' ? { in: [...DELIVERED] } : { notIn: [...NOT_PLACED] },
    },
    orderBy: { placedAt: 'desc' },
    select: { areaId: true, backfilledAddress: true, shippingAddressText: true },
  });
  const line = (o?.backfilledAddress ?? o?.shippingAddressText ?? '').trim();
  return o?.areaId && line ? { areaId: o.areaId, line, from: 'order' } : null;
}
