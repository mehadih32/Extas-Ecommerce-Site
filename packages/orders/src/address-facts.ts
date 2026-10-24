// S06 · PR 158 — the facts the address and zone checks (address-checks.ts) read, from the database: the place the
// checkout stored for the order (`areaId`, `addressResolution`, `addressUnclear`, the ADDRESS_CHECK flag; the text is
// never read again, SIM-F-003) placed in the gazetteer with every place above it and its district; the place its
// number is known by — the customer's saved address (default first), else his latest delivered order (phone-first,
// PR 555); and the parcels to the same place that came back, with why. A read only: nothing changes an order.
import { gazetteerOf, phoneNormalizeBD, type Gazetteer, type GeoEntry } from '@extas/delivery';
import type { Prisma } from '@extas/db/client';
import type { OrdersDeps } from './context';
import { refusalKeys } from './phone-history';
import type { AddressFacts, KnownPlace, NamedPlace, OrderState, PastOrder, PlaceRefusal } from './pure';

const DELIVERED: readonly OrderState[] = ['DELIVERED', 'PARTIALLY_DELIVERED'];
/** How many refused parcels to one place are read (newest first): far more than any threshold the owner can set. */
const PLACE_REFUSALS_READ = 500;

/** The order's fields the address facts are read from. */
export const ADDRESS_FACTS_SELECT = { id: true, phone: true, placedAt: true, fulfillmentType: true, areaId: true, addressResolution: true, addressUnclear: true, flags: true } as const;
export type AddressOrder = Prisma.OrderGetPayload<{ select: typeof ADDRESS_FACTS_SELECT }>;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const nameOf = (e: GeoEntry) => ({ en: e.nameEn, bn: e.nameBn });

/** A gazetteer place with every place above it (nearest first) and its district; null for an unknown id. */
export function placeOf(g: Gazetteer, id: string | null | undefined): { area: NamedPlace; lineage: string[]; district: NamedPlace | null } | null {
  const e = g.get(id);
  if (!e) return null;
  const d = g.district(e);
  return { area: { id: e.id, name: nameOf(e) }, lineage: g.ancestors(e).map((x) => x.id), district: d ? { id: d.id, name: nameOf(d) } : null };
}

/** The order's address as the checkout stored it, placed in the gazetteer. */
export function addressFactsOf(g: Gazetteer, o: AddressOrder): AddressFacts {
  const res = obj(o.addressResolution);
  const here = placeOf(g, o.areaId);
  return {
    delivery: o.fulfillmentType === 'DELIVERY',
    resolved: typeof res.status === 'string' ? res.status === 'resolved' && !o.addressUnclear : o.areaId !== null && !o.addressUnclear,
    placeSure: typeof res.placeSure === 'boolean' ? res.placeSure : null,
    detail: typeof res.detail === 'boolean' ? res.detail : o.flags.includes('ADDRESS_CHECK') ? false : null,
    area: here?.area ?? null,
    lineage: here?.lineage ?? [],
    district: here?.district ?? null,
  };
}

/** The place this number is known by: the customer's saved address (default first), else his latest delivered order's. */
export async function knownPlace(deps: OrdersDeps, g: Gazetteer, storeId: number, phone: string | null, past: readonly PastOrder[]): Promise<KnownPlace | null> {
  const p = phone ? phoneNormalizeBD(phone) : null;
  if (p?.ok) {
    const c = await deps.db.customer.findUnique({ where: { storeId_phone: { storeId, phone: p.e164 } }, select: { id: true, erasedAt: true, archivedAt: true } });
    if (c && !c.erasedAt && !c.archivedAt) {
      const saved = await deps.db.customerAddress.findFirst({ where: { storeId, customerId: c.id, archivedAt: null, areaId: { not: null } }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }], select: { areaId: true } });
      const at = placeOf(g, saved?.areaId);
      if (at) return { from: 'saved', ...at };
    }
  }
  const last = past.find((o) => DELIVERED.includes(o.status) && o.areaId && g.get(o.areaId));
  const at = placeOf(g, last?.areaId);
  return at ? { from: 'order', ...at } : null;
}

/** The parcels to the order's place, placed before it, that came back (any number), with when and why. */
export async function placeRefusalsOf(deps: OrdersDeps, storeId: number, o: { id: string; areaId: string | null; placedAt: Date }): Promise<PlaceRefusal[]> {
  if (!o.areaId) return [];
  const rows = await deps.db.order.findMany({
    where: { storeId, areaId: o.areaId, status: 'RETURNED', id: { not: o.id }, placedAt: { lt: o.placedAt } },
    orderBy: { placedAt: 'desc' },
    take: PLACE_REFUSALS_READ,
    select: { id: true, placedAt: true },
  });
  const keys = await refusalKeys(deps, storeId, rows.map((r) => r.id));
  return rows.map((r) => ({ at: r.placedAt, refusalKey: keys.get(r.id) ?? null }));
}

/** Everything the address and zone checks read for one order (`refusals`: read the same place's refused parcels too). */
export async function placeFactsOf(deps: OrdersDeps, storeId: number, o: AddressOrder, past: readonly PastOrder[], opts: { refusals: boolean }): Promise<{ address: AddressFacts; known: KnownPlace | null; placeRefusals: PlaceRefusal[] }> {
  const g = await gazetteerOf({ db: deps.db, settings: deps.settings, now: deps.now });
  const [known, placeRefusals] = await Promise.all([knownPlace(deps, g, storeId, o.phone, past), opts.refusals ? placeRefusalsOf(deps, storeId, o) : Promise.resolve([])]);
  return { address: addressFactsOf(g, o), known, placeRefusals };
}
